use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use chrono::{DateTime, Local, Utc};
use regex::Regex;

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,              // relative path from vault root, e.g. "folder/note.md"
    pub filename: String,        // "note.md"
    pub title: String,           // first H1 or filename without .md
    pub content: String,         // raw markdown
    pub frontmatter: Frontmatter,
    pub wikilinks: Vec<WikiLink>,
    pub backlinks: Vec<Backlink>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub word_count: usize,
    pub path: String,            // absolute path on disk
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Frontmatter {
    pub title: Option<String>,
    pub tags: Vec<String>,
    pub aliases: Vec<String>,
    pub created: Option<String>,
    pub modified: Option<String>,
    pub custom: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WikiLink {
    pub target: String,         // "Other Note" or "folder/Other Note"
    pub alias: Option<String>,  // [[Target|Alias]] → alias = "Alias"
    pub heading: Option<String>,// [[Note#Heading]]
    pub resolved: bool,         // does the target note exist?
    pub resolved_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Backlink {
    pub source_id: String,      // note that links to this one
    pub source_title: String,
    pub context: String,        // snippet of surrounding text
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteStub {
    pub id: String,
    pub title: String,
    pub path: String,
    pub tags: Vec<String>,
    pub modified_at: DateTime<Utc>,
    pub word_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub note: NoteStub,
    pub matches: Vec<SearchMatch>,
    pub score: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMatch {
    pub line: usize,
    pub text: String,           // line content with match
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveResult {
    pub new_id: String,
    pub updated_notes: Vec<String>, // IDs of notes whose wikilinks were updated
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub link_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub resolved: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultStats {
    pub total_notes: usize,
    pub total_words: usize,
    pub total_links: usize,
    pub unresolved_links: usize,
    pub orphan_count: usize,
    pub tag_count: usize,
    pub vault_size_bytes: u64,
}

pub struct NotesState {
    pub vault_path: PathBuf,
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

fn parse_frontmatter(content: &str) -> (Frontmatter, &str) {
    if !content.starts_with("---") {
        return (Frontmatter::default(), content);
    }
    let rest = &content[3..];
    if let Some(end) = rest.find("\n---") {
        let yaml = &rest[..end];
        let body = &rest[end + 4..];
        let fm: Frontmatter = serde_yaml::from_str(yaml).unwrap_or_default();
        return (fm, body.trim_start_matches('\n'));
    }
    (Frontmatter::default(), content)
}

fn write_frontmatter(fm: &Frontmatter, body: &str) -> String {
    let yaml = serde_yaml::to_string(fm).unwrap_or_default();
    format!("---\n{}---\n\n{}", yaml, body)
}

fn extract_wikilinks(content: &str, all_notes: &[NoteStub], vault_path: &Path) -> Vec<WikiLink> {
    // Matches [[Target]], [[Target|Alias]], [[Target#Heading]], [[Target#Heading|Alias]]
    let re = Regex::new(r"\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]+)?\]\]").unwrap();
    re.captures_iter(content)
        .map(|cap| {
            let target = cap[1].trim().to_string();
            let heading = cap.get(2).map(|h| h.as_str()[1..].to_string());
            let alias = cap.get(3).map(|a| a.as_str()[1..].to_string());
            let (resolved, resolved_path) = resolve_link(&target, all_notes, vault_path);
            WikiLink { target, alias, heading, resolved, resolved_path }
        })
        .collect()
}

fn resolve_link(target: &str, all_notes: &[NoteStub], _vault_path: &Path) -> (bool, Option<String>) {
    // Obsidian shortest-path resolution: matches by filename or relative path
    let target_lower = target.to_lowercase();
    for note in all_notes {
        let note_name = Path::new(&note.id)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if note_name == target_lower || note.id.to_lowercase() == target_lower {
            return (true, Some(note.id.clone()));
        }
    }
    (false, None)
}

fn extract_title(content: &str, filename: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return trimmed[2..].to_string();
        }
    }
    Path::new(filename)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

fn extract_tags_inline(content: &str) -> Vec<String> {
    let re = Regex::new(r"(?:^|\s)#([a-zA-Z][a-zA-Z0-9/_-]*)").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect()
}

fn note_id_from_path(path: &Path, vault_path: &Path) -> String {
    path.strip_prefix(vault_path)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

fn list_all_md_files(dir: &Path) -> Vec<PathBuf> {
    let mut result = vec![];
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                result.extend(list_all_md_files(&path));
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                result.push(path);
            }
        }
    }
    result
}

fn load_all_stubs(vault_path: &Path) -> Vec<NoteStub> {
    list_all_md_files(vault_path)
        .iter()
        .filter_map(|path| {
            let content = fs::read_to_string(path).ok()?;
            let id = note_id_from_path(path, vault_path);
            let filename = path.file_name()?.to_string_lossy().to_string();
            let (fm, body) = parse_frontmatter(&content);
            let title = fm.title.clone().unwrap_or_else(|| extract_title(body, &filename));
            let mut tags = fm.tags.clone();
            tags.extend(extract_tags_inline(body));
            tags.dedup();
            let meta = fs::metadata(path).ok()?;
            let modified_at: DateTime<Utc> = meta.modified().ok()?.into();
            let word_count = body.split_whitespace().count();
            Some(NoteStub {
                id,
                title,
                path: path.to_string_lossy().to_string(),
                tags,
                modified_at,
                word_count,
            })
        })
        .collect()
}

fn build_note_from_path(path: &PathBuf, vault_path: &Path, all_stubs: &[NoteStub]) -> Option<Note> {
    let content = fs::read_to_string(path).ok()?;
    let id = note_id_from_path(path, vault_path);
    let filename = path.file_name()?.to_string_lossy().to_string();
    let (mut fm, body) = parse_frontmatter(&content);
    let title = fm.title.clone().unwrap_or_else(|| extract_title(body, &filename));
    let mut tags = fm.tags.clone();
    tags.extend(extract_tags_inline(body));
    tags.dedup();
    fm.tags = tags.clone();
    let wikilinks = extract_wikilinks(body, all_stubs, vault_path);
    let meta = fs::metadata(path).ok()?;
    let created_at: DateTime<Utc> = meta.created().ok()?.into();
    let modified_at: DateTime<Utc> = meta.modified().ok()?.into();
    let word_count = body.split_whitespace().count();
    Some(Note {
        id,
        filename,
        title,
        content,
        frontmatter: fm,
        wikilinks,
        backlinks: vec![], // populated by note_get_backlinks
        tags,
        created_at,
        modified_at,
        word_count,
        path: path.to_string_lossy().to_string(),
    })
}

// ─────────────────────────────────────────
// TAURI COMMANDS
// ─────────────────────────────────────────

// CREATE
#[tauri::command]
pub fn note_create(
    state: State<NotesState>,
    id: String,              // e.g. "folder/My Note.md"
    content: Option<String>,
    frontmatter: Option<Frontmatter>,
) -> Result<Note, String> {
    let vault_path = &state.vault_path;
    let abs_path = vault_path.join(&id);

    if abs_path.exists() {
        return Err(format!("Note already exists: {}", id));
    }

    if let Some(parent) = abs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let fm = frontmatter.unwrap_or_default();
    let body = content.unwrap_or_default();
    let full_content = if fm != Frontmatter::default() {
        write_frontmatter(&fm, &body)
    } else {
        body
    };

    fs::write(&abs_path, &full_content).map_err(|e| e.to_string())?;

    let stubs = load_all_stubs(vault_path);
    build_note_from_path(&abs_path, vault_path, &stubs)
        .ok_or_else(|| "Failed to read created note".to_string())
}

// READ
#[tauri::command]
pub fn note_read(state: State<NotesState>, id: String) -> Result<Note, String> {
    let vault_path = &state.vault_path;
    let abs_path = vault_path.join(&id);

    if !abs_path.exists() {
        return Err(format!("Note not found: {}", id));
    }

    let stubs = load_all_stubs(vault_path);
    build_note_from_path(&abs_path, vault_path, &stubs)
        .ok_or_else(|| "Failed to parse note".to_string())
}

// WRITE (full overwrite)
#[tauri::command]
pub fn note_write(
    state: State<NotesState>,
    id: String,
    content: String,
) -> Result<Note, String> {
    let vault_path = &state.vault_path;
    let abs_path = vault_path.join(&id);

    if let Some(parent) = abs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&abs_path, &content).map_err(|e| e.to_string())?;

    let stubs = load_all_stubs(vault_path);
    build_note_from_path(&abs_path, vault_path, &stubs)
        .ok_or_else(|| "Failed to read written note".to_string())
}

// PATCH (update only body, keep frontmatter)
#[tauri::command]
pub fn note_patch(
    state: State<NotesState>,
    id: String,
    body: String,
) -> Result<Note, String> {
    let vault_path = &state.vault_path;
    let abs_path = vault_path.join(&id);
    let existing = fs::read_to_string(&abs_path).map_err(|e| e.to_string())?;
    let (fm, _) = parse_frontmatter(&existing);
    let new_content = write_frontmatter(&fm, &body);
    fs::write(&abs_path, &new_content).map_err(|e| e.to_string())?;
    let stubs = load_all_stubs(vault_path);
    build_note_from_path(&abs_path, vault_path, &stubs)
        .ok_or_else(|| "Failed to read patched note".to_string())
}

// DELETE
#[tauri::command]
pub fn note_delete(state: State<NotesState>, id: String) -> Result<(), String> {
    let vault_path = &state.vault_path;
    let abs_path = vault_path.join(&id);
    if !abs_path.exists() {
        return Err(format!("Note not found: {}", id));
    }
    // Move to .trash folder inside vault (Obsidian behaviour)
    let trash_path = vault_path.join(".trash").join(&id);
    if let Some(parent) = trash_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&abs_path, &trash_path).map_err(|e| e.to_string())?;
    Ok(())
}

// MOVE — updates all wikilinks pointing to this note
#[tauri::command]
pub fn note_move(
    state: State<NotesState>,
    id: String,
    new_id: String,
) -> Result<MoveResult, String> {
    let vault_path = &state.vault_path;
    let src = vault_path.join(&id);
    let dst = vault_path.join(&new_id);

    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;

    // Update all wikilinks in vault that pointed to old id
    let old_stem = Path::new(&id).file_stem().unwrap_or_default().to_string_lossy().to_string();
    let new_stem = Path::new(&new_id).file_stem().unwrap_or_default().to_string_lossy().to_string();
    let updated_notes = update_wikilinks_in_vault(vault_path, &old_stem, &new_stem);

    Ok(MoveResult { new_id, updated_notes })
}

// RENAME (same as move but stays in same folder)
#[tauri::command]
pub fn note_rename(
    state: State<NotesState>,
    id: String,
    new_name: String,           // just filename, e.g. "New Name.md"
) -> Result<MoveResult, String> {
    let vault_path = &state.vault_path;
    let src = vault_path.join(&id);
    let parent = src.parent().unwrap_or(vault_path);
    let new_id = note_id_from_path(&parent.join(&new_name), vault_path);
    note_move(state, id, new_id)
}

fn update_wikilinks_in_vault(vault_path: &Path, old_stem: &str, new_stem: &str) -> Vec<String> {
    let mut updated = vec![];
    let re = Regex::new(&format!(r"\[\[{}(#[^\]|]*)?(|[^\]])?\]\]", regex::escape(old_stem))).unwrap();
    for path in list_all_md_files(vault_path) {
        if let Ok(content) = fs::read_to_string(&path) {
            if re.is_match(&content) {
                let new_content = re.replace_all(&content, |caps: &regex::Captures| {
                    let heading = caps.get(1).map(|h| h.as_str()).unwrap_or("");
                    let alias = caps.get(2).map(|a| a.as_str()).unwrap_or("");
                    format!("[[{}{}{}]]", new_stem, heading, alias)
                }).to_string();
                let _ = fs::write(&path, new_content);
                updated.push(note_id_from_path(&path, vault_path));
            }
        }
    }
    updated
}

// LIST — all notes as stubs
#[tauri::command]
pub fn note_list(state: State<NotesState>) -> Result<Vec<NoteStub>, String> {
    Ok(load_all_stubs(&state.vault_path))
}

// LIST FOLDER
#[tauri::command]
pub fn note_list_folder(
    state: State<NotesState>,
    folder: String,
) -> Result<Vec<NoteStub>, String> {
    let vault_path = &state.vault_path;
    let folder_path = vault_path.join(&folder);
    let all = load_all_stubs(vault_path);
    Ok(all.into_iter().filter(|n| n.id.starts_with(&folder)).collect())
}

// SEARCH — fulltext
#[tauri::command]
pub fn note_search(
    state: State<NotesState>,
    query: String,
    case_sensitive: Option<bool>,
) -> Result<Vec<SearchResult>, String> {
    let vault_path = &state.vault_path;
    let cs = case_sensitive.unwrap_or(false);
    let q = if cs { query.clone() } else { query.to_lowercase() };
    let stubs = load_all_stubs(vault_path);
    let mut results = vec![];

    for stub in &stubs {
        let content = fs::read_to_string(&stub.path).unwrap_or_default();
        let search_content = if cs { content.clone() } else { content.to_lowercase() };
        let mut matches = vec![];
        for (i, line) in search_content.lines().enumerate() {
            if let Some(pos) = line.find(&q) {
                matches.push(SearchMatch {
                    line: i + 1,
                    text: content.lines().nth(i).unwrap_or("").to_string(),
                    match_start: pos,
                    match_end: pos + q.len(),
                });
            }
        }
        if !matches.is_empty() {
            let score = matches.len() as f32;
            results.push(SearchResult { note: stub.clone(), matches, score });
        }
    }
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    Ok(results)
}

// SEARCH BY TAG
#[tauri::command]
pub fn note_search_tags(
    state: State<NotesState>,
    tags: Vec<String>,
) -> Result<Vec<NoteStub>, String> {
    let stubs = load_all_stubs(&state.vault_path);
    Ok(stubs.into_iter().filter(|n| {
        tags.iter().any(|t| n.tags.contains(t))
    }).collect())
}

// FRONTMATTER — get
#[tauri::command]
pub fn note_get_frontmatter(
    state: State<NotesState>,
    id: String,
) -> Result<Frontmatter, String> {
    let content = fs::read_to_string(state.vault_path.join(&id)).map_err(|e| e.to_string())?;
    let (fm, _) = parse_frontmatter(&content);
    Ok(fm)
}

// FRONTMATTER — set
#[tauri::command]
pub fn note_set_frontmatter(
    state: State<NotesState>,
    id: String,
    frontmatter: Frontmatter,
) -> Result<Note, String> {
    let vault_path = &state.vault_path;
    let abs_path = vault_path.join(&id);
    let existing = fs::read_to_string(&abs_path).map_err(|e| e.to_string())?;
    let (_, body) = parse_frontmatter(&existing);
    let new_content = write_frontmatter(&frontmatter, body);
    fs::write(&abs_path, &new_content).map_err(|e| e.to_string())?;
    let stubs = load_all_stubs(vault_path);
    build_note_from_path(&abs_path, vault_path, &stubs)
        .ok_or_else(|| "Failed to read note after frontmatter update".to_string())
}

// WIKILINKS — outgoing from a note
#[tauri::command]
pub fn note_get_links(
    state: State<NotesState>,
    id: String,
) -> Result<Vec<WikiLink>, String> {
    let vault_path = &state.vault_path;
    let content = fs::read_to_string(vault_path.join(&id)).map_err(|e| e.to_string())?;
    let stubs = load_all_stubs(vault_path);
    let (_, body) = parse_frontmatter(&content);
    Ok(extract_wikilinks(body, &stubs, vault_path))
}

// BACKLINKS — all notes that link to this one
#[tauri::command]
pub fn note_get_backlinks(
    state: State<NotesState>,
    id: String,
) -> Result<Vec<Backlink>, String> {
    let vault_path = &state.vault_path;
    let target_stem = Path::new(&id).file_stem().unwrap_or_default().to_string_lossy().to_string();
    let re = Regex::new(&format!(r"\[\[{}(#[^\]|]*)?(|[^\]])?\]\]", regex::escape(&target_stem))).unwrap();
    let stubs = load_all_stubs(vault_path);
    let mut backlinks = vec![];

    for stub in &stubs {
        if stub.id == id { continue; }
        let content = fs::read_to_string(&stub.path).unwrap_or_default();
        for line in content.lines() {
            if re.is_match(line) {
                backlinks.push(Backlink {
                    source_id: stub.id.clone(),
                    source_title: stub.title.clone(),
                    context: line.trim().to_string(),
                });
                break; // one context snippet per note
            }
        }
    }
    Ok(backlinks)
}

// ORPHANS — notes with no inbound or outbound links
#[tauri::command]
pub fn note_get_orphans(state: State<NotesState>) -> Result<Vec<NoteStub>, String> {
    let vault_path = &state.vault_path;
    let stubs = load_all_stubs(vault_path);
    let mut linked_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    for stub in &stubs {
        let content = fs::read_to_string(&stub.path).unwrap_or_default();
        let (_, body) = parse_frontmatter(&content);
        let links = extract_wikilinks(body, &stubs, vault_path);
        for link in links {
            if let Some(resolved) = link.resolved_path {
                linked_ids.insert(resolved);
                linked_ids.insert(stub.id.clone());
            }
        }
    }
    Ok(stubs.into_iter().filter(|n| !linked_ids.contains(&n.id)).collect())
}

// GRAPH DATA — for D3 / Cytoscape
#[tauri::command]
pub fn note_get_graph(state: State<NotesState>) -> Result<GraphData, String> {
    let vault_path = &state.vault_path;
    let stubs = load_all_stubs(vault_path);
    let mut nodes = vec![];
    let mut edges = vec![];

    for stub in &stubs {
        let content = fs::read_to_string(&stub.path).unwrap_or_default();
        let (_, body) = parse_frontmatter(&content);
        let links = extract_wikilinks(body, &stubs, vault_path);
        let link_count = links.len();
        nodes.push(GraphNode {
            id: stub.id.clone(),
            title: stub.title.clone(),
            tags: stub.tags.clone(),
            link_count,
        });
        for link in links {
            edges.push(GraphEdge {
                source: stub.id.clone(),
                target: link.resolved_path.clone().unwrap_or(link.target),
                resolved: link.resolved,
            });
        }
    }
    Ok(GraphData { nodes, edges })
}

// DAILY NOTE — get or create
#[tauri::command]
pub fn note_daily_get(state: State<NotesState>) -> Result<Note, String> {
    let date = Local::now().format("%Y-%m-%d").to_string();
    let id = format!("daily/{}.md", date);
    let vault_path = &state.vault_path;
    let abs_path = vault_path.join(&id);

    if abs_path.exists() {
        let stubs = load_all_stubs(vault_path);
        return build_note_from_path(&abs_path, vault_path, &stubs)
            .ok_or_else(|| "Failed to read daily note".to_string());
    }

    let content = format!("# {}\n\n", date);
    note_create(state, id, Some(content), None)
}

// SNAPSHOT — save a version to .snapshots/
#[tauri::command]
pub fn note_snapshot(state: State<NotesState>, id: String) -> Result<String, String> {
    let vault_path = &state.vault_path;
    let abs_path = vault_path.join(&id);
    let content = fs::read_to_string(&abs_path).map_err(|e| e.to_string())?;
    let ts = Utc::now().format("%Y%m%d%H%M%S").to_string();
    let snapshot_id = format!(".snapshots/{}/{}", id, ts);
    let snapshot_path = vault_path.join(&snapshot_id);
    if let Some(parent) = snapshot_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&snapshot_path, content).map_err(|e| e.to_string())?;
    Ok(snapshot_id)
}

// RESTORE — restore from snapshot
#[tauri::command]
pub fn note_restore(
    state: State<NotesState>,
    id: String,
    snapshot_id: String,
) -> Result<Note, String> {
    let vault_path = &state.vault_path;
    let snapshot_path = vault_path.join(&snapshot_id);
    let content = fs::read_to_string(&snapshot_path).map_err(|e| e.to_string())?;
    note_write(state, id, content)
}

// LIST SNAPSHOTS for a note
#[tauri::command]
pub fn note_list_snapshots(
    state: State<NotesState>,
    id: String,
) -> Result<Vec<String>, String> {
    let vault_path = &state.vault_path;
    let snapshot_dir = vault_path.join(".snapshots").join(&id);
    if !snapshot_dir.exists() {
        return Ok(vec![]);
    }
    let mut snapshots: Vec<String> = fs::read_dir(&snapshot_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| format!(".snapshots/{}/{}", id, e.file_name().to_string_lossy()))
        .collect();
    snapshots.sort_by(|a, b| b.cmp(a)); // newest first
    Ok(snapshots)
}

// STATS
#[tauri::command]
pub fn note_stats(state: State<NotesState>) -> Result<VaultStats, String> {
    let vault_path = &state.vault_path;
    let stubs = load_all_stubs(vault_path);
    let total_notes = stubs.len();
    let total_words: usize = stubs.iter().map(|n| n.word_count).sum();
    let mut total_links = 0;
    let mut unresolved_links = 0;

    for stub in &stubs {
        let content = fs::read_to_string(&stub.path).unwrap_or_default();
        let (_, body) = parse_frontmatter(&content);
        let links = extract_wikilinks(body, &stubs, vault_path);
        total_links += links.len();
        unresolved_links += links.iter().filter(|l| !l.resolved).count();
    }

    let orphans = note_get_orphans(state)?.len();
    let all_tags: std::collections::HashSet<_> = stubs.iter().flat_map(|n| n.tags.iter().cloned()).collect();
    let vault_size_bytes = list_all_md_files(vault_path)
        .iter()
        .filter_map(|p| fs::metadata(p).ok())
        .map(|m| m.len())
        .sum();

    Ok(VaultStats {
        total_notes,
        total_words,
        total_links,
        unresolved_links,
        orphan_count: orphans,
        tag_count: all_tags.len(),
        vault_size_bytes,
    })
}

// ─────────────────────────────────────────
// REGISTER ALL COMMANDS in main.rs:
//
// .invoke_handler(tauri::generate_handler![
//     notes::note_create,
//     notes::note_read,
//     notes::note_write,
//     notes::note_patch,
//     notes::note_delete,
//     notes::note_move,
//     notes::note_rename,
//     notes::note_list,
//     notes::note_list_folder,
//     notes::note_search,
//     notes::note_search_tags,
//     notes::note_get_frontmatter,
//     notes::note_set_frontmatter,
//     notes::note_get_links,
//     notes::note_get_backlinks,
//     notes::note_get_orphans,
//     notes::note_get_graph,
//     notes::note_daily_get,
//     notes::note_snapshot,
//     notes::note_restore,
//     notes::note_list_snapshots,
//     notes::note_stats,
// ])
// ─────────────────────────────────────────
