/// kanban.rs — ViBo Kanban System
///
/// Each card = a task .md file stored in `tasks/` (hidden from notes UI).
/// Each board = a `boards/<name>.md` in Obsidian Kanban plugin format (extended).
/// Fully compatible with Obsidian Kanban plugin if vault is opened in Obsidian.
///
/// Card .md format (task file):
/// ---
/// id: uuid
/// title: "Card title"
/// description: "Markdown body"
/// column: "In Progress"
/// board: "boards/project.md"
/// priority: high | medium | low
/// due: 2025-06-01
/// calendar_event_id: <google event id if linked>
/// tags: [tag1, tag2]
/// linked_notes: ["[[Note A]]", "[[Note B]]"]
/// subtasks:
///   - [ ] Sub-task 1
///   - [x] Sub-task 2
/// created: 2025-01-01T00:00:00Z
/// modified: 2025-01-01T00:00:00Z
/// archived: false
/// ---
///
/// Board .md format (Obsidian Kanban compatible + extended):
/// ---
/// kanban-plugin: board
/// ---
/// ## Backlog
/// - [ ] [[tasks/uuid1.md|Card title]] @due(2025-06-01) #high
///
/// ## In Progress
/// - [ ] [[tasks/uuid2.md|Card title]] @due(2025-06-02) #medium
///
/// ## Done
/// - [x] [[tasks/uuid3.md|Card title]]
///
/// %% kanban:settings
/// {"key":"value"}
/// %%

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use chrono::{DateTime, NaiveDate, Utc};
use uuid::Uuid;
use regex::Regex;

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    High,
    Medium,
    Low,
}

impl Default for Priority {
    fn default() -> Self { Priority::Medium }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubTask {
    pub title: String,
    pub completed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Card {
    pub id: String,                          // UUID
    pub title: String,
    pub description: String,                 // Markdown body
    pub column: String,                      // Current column name
    pub board: String,                       // Relative path to board .md
    pub priority: Priority,
    pub due: Option<NaiveDate>,
    pub calendar_event_id: Option<String>,   // Linked Google Calendar event
    pub tags: Vec<String>,
    pub linked_notes: Vec<String>,           // [[wikilinks]] to notes
    pub subtasks: Vec<SubTask>,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
    pub archived: bool,
    pub path: String,                        // Absolute path to task .md
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CardStub {
    pub id: String,
    pub title: String,
    pub column: String,
    pub board: String,
    pub priority: Priority,
    pub due: Option<NaiveDate>,
    pub tags: Vec<String>,
    pub subtask_total: usize,
    pub subtask_done: usize,
    pub has_calendar_event: bool,
    pub archived: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Column {
    pub name: String,
    pub cards: Vec<CardStub>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Board {
    pub id: String,                          // relative path e.g. "boards/project.md"
    pub title: String,
    pub columns: Vec<Column>,
    pub settings: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveCardResult {
    pub card_id: String,
    pub from_column: String,
    pub to_column: String,
    pub calendar_event_updated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateFromCalendarArgs {
    pub event_id: String,
    pub event_title: String,
    pub event_date: NaiveDate,
    pub board: String,
    pub column: String,
    pub description: Option<String>,
    pub linked_notes: Option<Vec<String>>,
}

pub struct KanbanState {
    pub vault_path: PathBuf,
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

fn tasks_dir(vault_path: &Path) -> PathBuf {
    vault_path.join("tasks")
}

fn card_path(vault_path: &Path, id: &str) -> PathBuf {
    tasks_dir(vault_path).join(format!("{}.md", id))
}

fn card_to_frontmatter(card: &Card) -> String {
    let subtasks_yaml = card.subtasks.iter()
        .map(|s| format!("  - [{}] {}", if s.completed { "x" } else { " " }, s.title))
        .collect::<Vec<_>>()
        .join("\n");
    let linked = card.linked_notes.iter()
        .map(|n| format!("  - \"{}\"", n))
        .collect::<Vec<_>>()
        .join("\n");
    let tags = card.tags.iter()
        .map(|t| format!("  - {}", t))
        .collect::<Vec<_>>()
        .join("\n");
    let due_str = card.due
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default();
    let cal_str = card.calendar_event_id.clone().unwrap_or_default();
    let priority = serde_json::to_value(&card.priority)
        .unwrap()
        .as_str()
        .unwrap_or("medium")
        .to_string();

    format!(
        "---\nid: {}\ntitle: \"{}\"\ncolumn: \"{}\"\nboard: \"{}\"\npriority: {}\ndue: {}\ncalendar_event_id: {}\ntags:\n{}\nlinked_notes:\n{}\nsubtasks:\n{}\ncreated: {}\nmodified: {}\narchived: {}\n---\n\n{}",
        card.id,
        card.title,
        card.column,
        card.board,
        priority,
        due_str,
        cal_str,
        tags,
        linked,
        subtasks_yaml,
        card.created.to_rfc3339(),
        card.modified.to_rfc3339(),
        card.archived,
        card.description,
    )
}

fn parse_card(path: &Path, vault_path: &Path) -> Option<Card> {
    let content = fs::read_to_string(path).ok()?;
    if !content.starts_with("---") { return None; }
    let rest = &content[3..];
    let end = rest.find("\n---")?;
    let yaml = &rest[..end];
    let body = rest[end + 4..].trim_start_matches('\n').to_string();

    let val: serde_yaml::Value = serde_yaml::from_str(yaml).ok()?;

    let subtasks = val["subtasks"].as_sequence().unwrap_or(&vec![]).iter()
        .filter_map(|s| {
            let line = s.as_str()?;
            let completed = line.contains("[x]") || line.contains("[X]");
            let title = Regex::new(r"\[.\] ").unwrap()
                .replace(line.trim(), "").to_string();
            Some(SubTask { title, completed })
        })
        .collect();

    let linked_notes = val["linked_notes"].as_sequence().unwrap_or(&vec![]).iter()
        .filter_map(|s| s.as_str().map(String::from))
        .collect();

    let tags = val["tags"].as_sequence().unwrap_or(&vec![]).iter()
        .filter_map(|s| s.as_str().map(String::from))
        .collect();

    let due = val["due"].as_str()
        .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

    let priority: Priority = serde_json::from_value(
        serde_json::Value::String(
            val["priority"].as_str().unwrap_or("medium").to_string()
        )
    ).unwrap_or_default();

    Some(Card {
        id: val["id"].as_str().unwrap_or("").to_string(),
        title: val["title"].as_str().unwrap_or("").to_string(),
        description: body,
        column: val["column"].as_str().unwrap_or("").to_string(),
        board: val["board"].as_str().unwrap_or("").to_string(),
        priority,
        due,
        calendar_event_id: val["calendar_event_id"].as_str()
            .filter(|s| !s.is_empty())
            .map(String::from),
        tags,
        linked_notes,
        subtasks,
        created: val["created"].as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(Utc::now),
        modified: val["modified"].as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(Utc::now),
        archived: val["archived"].as_bool().unwrap_or(false),
        path: path.to_string_lossy().to_string(),
    })
}

fn card_to_stub(card: &Card) -> CardStub {
    let subtask_total = card.subtasks.len();
    let subtask_done = card.subtasks.iter().filter(|s| s.completed).count();
    CardStub {
        id: card.id.clone(),
        title: card.title.clone(),
        column: card.column.clone(),
        board: card.board.clone(),
        priority: card.priority.clone(),
        due: card.due,
        tags: card.tags.clone(),
        subtask_total,
        subtask_done,
        has_calendar_event: card.calendar_event_id.is_some(),
        archived: card.archived,
    }
}

fn load_all_cards(vault_path: &Path) -> Vec<Card> {
    let tasks_path = tasks_dir(vault_path);
    if !tasks_path.exists() { return vec![]; }
    fs::read_dir(&tasks_path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|x| x == "md").unwrap_or(false))
        .filter_map(|e| parse_card(&e.path(), vault_path))
        .collect()
}

fn write_board_md(vault_path: &Path, board_id: &str, cards: &[Card]) {
    let board_path = vault_path.join(board_id);
    if let Ok(existing) = fs::read_to_string(&board_path) {
        // Parse existing columns order from board .md
        let col_re = Regex::new(r"^## (.+)$").unwrap();
        let mut columns: Vec<String> = col_re.captures_iter(&existing)
            .filter(|c| {
                let name = &c[1];
                name != "Archive" && !name.starts_with('%')
            })
            .map(|c| c[1].to_string())
            .collect();
        if columns.is_empty() {
            columns = vec!["Backlog".to_string(), "In Progress".to_string(), "Done".to_string()];
        }
        rebuild_board_md(vault_path, board_id, &columns, cards);
    }
}

fn rebuild_board_md(vault_path: &Path, board_id: &str, columns: &[String], cards: &[Card]) {
    let board_path = vault_path.join(board_id);
    let mut md = String::from("---\nkanban-plugin: board\n---\n\n");

    for col in columns {
        md.push_str(&format!("## {}\n\n", col));
        let col_cards: Vec<&Card> = cards.iter()
            .filter(|c| &c.column == col && c.board == board_id && !c.archived)
            .collect();
        for card in col_cards {
            let done = col.to_lowercase() == "done";
            let check = if done { "x" } else { " " };
            let due_str = card.due
                .map(|d| format!(" @due({})", d.format("%Y-%m-%d")))
                .unwrap_or_default();
            let priority_str = match card.priority {
                Priority::High   => " #high",
                Priority::Medium => "",
                Priority::Low    => " #low",
            };
            md.push_str(&format!(
                "- [{}] [[tasks/{}.md|{}]]{}{}\n",
                check, card.id, card.title, due_str, priority_str
            ));
        }
        md.push('\n');
    }

    // Archive column
    let archived: Vec<&Card> = cards.iter()
        .filter(|c| c.board == board_id && c.archived)
        .collect();
    if !archived.is_empty() {
        md.push_str("## Archive\n\n");
        for card in archived {
            md.push_str(&format!("- [x] [[tasks/{}.md|{}]]\n", card.id, card.title));
        }
        md.push('\n');
    }

    md.push_str("%% kanban:settings\n{\"key\":\"value\"}\n%%\n");
    let _ = fs::write(&board_path, md);
}

// ─────────────────────────────────────────
// TAURI COMMANDS
// ─────────────────────────────────────────

/// Create a new board
#[tauri::command]
pub fn kanban_create_board(
    state: State<KanbanState>,
    id: String,             // e.g. "boards/project.md"
    title: String,
    columns: Option<Vec<String>>,
) -> Result<Board, String> {
    let vault_path = &state.vault_path;
    let board_path = vault_path.join(&id);
    if let Some(parent) = board_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let cols = columns.unwrap_or_else(|| vec![
        "Backlog".to_string(),
        "In Progress".to_string(),
        "Review".to_string(),
        "Done".to_string(),
    ]);
    rebuild_board_md(vault_path, &id, &cols, &[]);
    Ok(Board {
        id,
        title,
        columns: cols.into_iter().map(|name| Column { name, cards: vec![] }).collect(),
        settings: HashMap::new(),
    })
}

/// Get full board with all cards populated
#[tauri::command]
pub fn kanban_get_board(
    state: State<KanbanState>,
    id: String,
) -> Result<Board, String> {
    let vault_path = &state.vault_path;
    let board_path = vault_path.join(&id);
    let content = fs::read_to_string(&board_path).map_err(|e| e.to_string())?;

    let col_re = Regex::new(r"^## (.+)$").unwrap();
    let columns_names: Vec<String> = col_re.captures_iter(&content)
        .map(|c| c[1].to_string())
        .collect();

    let all_cards = load_all_cards(vault_path);
    let board_cards: Vec<&Card> = all_cards.iter()
        .filter(|c| c.board == id)
        .collect();

    let title = Path::new(&id)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let columns = columns_names.iter().map(|col_name| {
        let cards = board_cards.iter()
            .filter(|c| &c.column == col_name)
            .map(|c| card_to_stub(c))
            .collect();
        Column { name: col_name.clone(), cards }
    }).collect();

    Ok(Board { id, title, columns, settings: HashMap::new() })
}

/// List all boards
#[tauri::command]
pub fn kanban_list_boards(state: State<KanbanState>) -> Result<Vec<String>, String> {
    let boards_path = state.vault_path.join("boards");
    if !boards_path.exists() { return Ok(vec![]); }
    let boards = fs::read_dir(&boards_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|x| x == "md").unwrap_or(false))
        .map(|e| format!("boards/{}", e.file_name().to_string_lossy()))
        .collect();
    Ok(boards)
}

/// Add a column to a board
#[tauri::command]
pub fn kanban_add_column(
    state: State<KanbanState>,
    board: String,
    column_name: String,
    position: Option<usize>,
) -> Result<Board, String> {
    let vault_path = &state.vault_path;
    let board_path = vault_path.join(&board);
    let content = fs::read_to_string(&board_path).map_err(|e| e.to_string())?;
    let col_re = Regex::new(r"^## (.+)$").unwrap();
    let mut cols: Vec<String> = col_re.captures_iter(&content)
        .map(|c| c[1].to_string())
        .collect();
    let pos = position.unwrap_or(cols.len());
    cols.insert(pos.min(cols.len()), column_name);
    let all_cards = load_all_cards(vault_path);
    rebuild_board_md(vault_path, &board, &cols, &all_cards);
    kanban_get_board(state, board)
}

/// Create a card
#[tauri::command]
pub fn kanban_create_card(
    state: State<KanbanState>,
    board: String,
    column: String,
    title: String,
    description: Option<String>,
    priority: Option<Priority>,
    due: Option<String>,           // "YYYY-MM-DD"
    tags: Option<Vec<String>>,
    linked_notes: Option<Vec<String>>,
    subtasks: Option<Vec<String>>, // Just titles, all uncompleted
) -> Result<Card, String> {
    let vault_path = &state.vault_path;
    fs::create_dir_all(tasks_dir(vault_path)).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let due_date = due.as_deref()
        .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

    let card = Card {
        id: id.clone(),
        title,
        description: description.unwrap_or_default(),
        column: column.clone(),
        board: board.clone(),
        priority: priority.unwrap_or_default(),
        due: due_date,
        calendar_event_id: None,
        tags: tags.unwrap_or_default(),
        linked_notes: linked_notes.unwrap_or_default(),
        subtasks: subtasks.unwrap_or_default().into_iter()
            .map(|t| SubTask { title: t, completed: false })
            .collect(),
        created: now,
        modified: now,
        archived: false,
        path: card_path(vault_path, &id).to_string_lossy().to_string(),
    };

    let content = card_to_frontmatter(&card);
    fs::write(card_path(vault_path, &id), content).map_err(|e| e.to_string())?;

    // Update board .md
    let all_cards = load_all_cards(vault_path);
    write_board_md(vault_path, &board, &all_cards);

    Ok(card)
}

/// Get a single card
#[tauri::command]
pub fn kanban_get_card(
    state: State<KanbanState>,
    card_id: String,
) -> Result<Card, String> {
    let path = card_path(&state.vault_path, &card_id);
    parse_card(&path, &state.vault_path)
        .ok_or_else(|| format!("Card not found: {}", card_id))
}

/// Update a card (partial update)
#[tauri::command]
pub fn kanban_update_card(
    state: State<KanbanState>,
    card_id: String,
    title: Option<String>,
    description: Option<String>,
    priority: Option<Priority>,
    due: Option<String>,
    tags: Option<Vec<String>>,
    linked_notes: Option<Vec<String>>,
    subtasks: Option<Vec<SubTask>>,
    calendar_event_id: Option<String>,
) -> Result<Card, String> {
    let vault_path = &state.vault_path;
    let path = card_path(vault_path, &card_id);
    let mut card = parse_card(&path, vault_path)
        .ok_or_else(|| format!("Card not found: {}", card_id))?;

    if let Some(t) = title { card.title = t; }
    if let Some(d) = description { card.description = d; }
    if let Some(p) = priority { card.priority = p; }
    if let Some(due_str) = due {
        card.due = NaiveDate::parse_from_str(&due_str, "%Y-%m-%d").ok();
    }
    if let Some(t) = tags { card.tags = t; }
    if let Some(ln) = linked_notes { card.linked_notes = ln; }
    if let Some(st) = subtasks { card.subtasks = st; }
    if let Some(cal) = calendar_event_id { card.calendar_event_id = Some(cal); }
    card.modified = Utc::now();

    let content = card_to_frontmatter(&card);
    fs::write(&path, content).map_err(|e| e.to_string())?;

    let all_cards = load_all_cards(vault_path);
    write_board_md(vault_path, &card.board, &all_cards);

    Ok(card)
}

/// Move a card to a different column (or board)
#[tauri::command]
pub fn kanban_move_card(
    state: State<KanbanState>,
    card_id: String,
    to_column: String,
    to_board: Option<String>,
) -> Result<MoveCardResult, String> {
    let vault_path = &state.vault_path;
    let path = card_path(vault_path, &card_id);
    let mut card = parse_card(&path, vault_path)
        .ok_or_else(|| format!("Card not found: {}", card_id))?;

    let from_column = card.column.clone();
    let old_board = card.board.clone();
    card.column = to_column.clone();
    if let Some(ref b) = to_board { card.board = b.clone(); }
    card.modified = Utc::now();

    let content = card_to_frontmatter(&card);
    fs::write(&path, content).map_err(|e| e.to_string())?;

    let all_cards = load_all_cards(vault_path);
    write_board_md(vault_path, &old_board, &all_cards);
    if let Some(ref nb) = to_board {
        if nb != &old_board {
            write_board_md(vault_path, nb, &all_cards);
        }
    }

    Ok(MoveCardResult {
        card_id,
        from_column,
        to_column,
        calendar_event_updated: false, // set to true after google.rs integration
    })
}

/// Complete a subtask within a card
#[tauri::command]
pub fn kanban_complete_subtask(
    state: State<KanbanState>,
    card_id: String,
    subtask_index: usize,
    completed: bool,
) -> Result<Card, String> {
    let vault_path = &state.vault_path;
    let path = card_path(vault_path, &card_id);
    let mut card = parse_card(&path, vault_path)
        .ok_or_else(|| format!("Card not found: {}", card_id))?;

    card.subtasks.get_mut(subtask_index)
        .ok_or_else(|| format!("Subtask index {} out of range", subtask_index))?
        .completed = completed;

    card.modified = Utc::now();
    let content = card_to_frontmatter(&card);
    fs::write(&path, content).map_err(|e| e.to_string())?;

    let all_cards = load_all_cards(vault_path);
    write_board_md(vault_path, &card.board, &all_cards);
    Ok(card)
}

/// Archive a card
#[tauri::command]
pub fn kanban_archive_card(
    state: State<KanbanState>,
    card_id: String,
) -> Result<(), String> {
    let vault_path = &state.vault_path;
    let path = card_path(vault_path, &card_id);
    let mut card = parse_card(&path, vault_path)
        .ok_or_else(|| format!("Card not found: {}", card_id))?;

    let board = card.board.clone();
    card.archived = true;
    card.modified = Utc::now();
    let content = card_to_frontmatter(&card);
    fs::write(&path, content).map_err(|e| e.to_string())?;

    let all_cards = load_all_cards(vault_path);
    write_board_md(vault_path, &board, &all_cards);
    Ok(())
}

/// Delete a card permanently
#[tauri::command]
pub fn kanban_delete_card(
    state: State<KanbanState>,
    card_id: String,
) -> Result<(), String> {
    let vault_path = &state.vault_path;
    let path = card_path(vault_path, &card_id);
    let card = parse_card(&path, vault_path)
        .ok_or_else(|| format!("Card not found: {}", card_id))?;

    // Move to .trash
    let trash = vault_path.join(".trash").join("tasks").join(format!("{}.md", card_id));
    if let Some(parent) = trash.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&path, &trash).map_err(|e| e.to_string())?;

    let all_cards = load_all_cards(vault_path);
    write_board_md(vault_path, &card.board, &all_cards);
    Ok(())
}

/// Create card from Google Calendar event (agent use)
#[tauri::command]
pub fn kanban_create_from_calendar(
    state: State<KanbanState>,
    args: CreateFromCalendarArgs,
) -> Result<Card, String> {
    let vault_path = &state.vault_path;
    fs::create_dir_all(tasks_dir(vault_path)).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    let card = Card {
        id: id.clone(),
        title: args.event_title,
        description: args.description.unwrap_or_default(),
        column: args.column,
        board: args.board.clone(),
        priority: Priority::Medium,
        due: Some(args.event_date),
        calendar_event_id: Some(args.event_id),
        tags: vec!["calendar".to_string()],
        linked_notes: args.linked_notes.unwrap_or_default(),
        subtasks: vec![],
        created: now,
        modified: now,
        archived: false,
        path: card_path(vault_path, &id).to_string_lossy().to_string(),
    };

    let content = card_to_frontmatter(&card);
    fs::write(card_path(vault_path, &id), content).map_err(|e| e.to_string())?;

    let all_cards = load_all_cards(vault_path);
    write_board_md(vault_path, &args.board, &all_cards);

    Ok(card)
}

/// Get all cards due on a specific date (agent use)
#[tauri::command]
pub fn kanban_get_due(
    state: State<KanbanState>,
    date: String,               // "YYYY-MM-DD"
) -> Result<Vec<CardStub>, String> {
    let due = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| e.to_string())?;
    let cards = load_all_cards(&state.vault_path);
    Ok(cards.iter()
        .filter(|c| c.due == Some(due) && !c.archived)
        .map(card_to_stub)
        .collect())
}

/// Get overdue cards (agent use)
#[tauri::command]
pub fn kanban_get_overdue(state: State<KanbanState>) -> Result<Vec<CardStub>, String> {
    let today = chrono::Local::now().date_naive();
    let cards = load_all_cards(&state.vault_path);
    Ok(cards.iter()
        .filter(|c| {
            c.due.map(|d| d < today).unwrap_or(false)
                && !c.archived
                && c.column.to_lowercase() != "done"
        })
        .map(card_to_stub)
        .collect())
}

/// Get cards linked to a calendar event (agent use)
#[tauri::command]
pub fn kanban_get_by_event(
    state: State<KanbanState>,
    event_id: String,
) -> Result<Vec<CardStub>, String> {
    let cards = load_all_cards(&state.vault_path);
    Ok(cards.iter()
        .filter(|c| c.calendar_event_id.as_deref() == Some(&event_id))
        .map(card_to_stub)
        .collect())
}

/// Search cards by title or description
#[tauri::command]
pub fn kanban_search(
    state: State<KanbanState>,
    query: String,
) -> Result<Vec<CardStub>, String> {
    let q = query.to_lowercase();
    let cards = load_all_cards(&state.vault_path);
    Ok(cards.iter()
        .filter(|c| {
            c.title.to_lowercase().contains(&q)
                || c.description.to_lowercase().contains(&q)
        })
        .map(card_to_stub)
        .collect())
}

// ─────────────────────────────────────────
// REGISTER ALL COMMANDS in main.rs:
//
// .invoke_handler(tauri::generate_handler![
//     kanban::kanban_create_board,
//     kanban::kanban_get_board,
//     kanban::kanban_list_boards,
//     kanban::kanban_add_column,
//     kanban::kanban_create_card,
//     kanban::kanban_get_card,
//     kanban::kanban_update_card,
//     kanban::kanban_move_card,
//     kanban::kanban_complete_subtask,
//     kanban::kanban_archive_card,
//     kanban::kanban_delete_card,
//     kanban::kanban_create_from_calendar,
//     kanban::kanban_get_due,
//     kanban::kanban_get_overdue,
//     kanban::kanban_get_by_event,
//     kanban::kanban_search,
// ])
// ─────────────────────────────────────────
