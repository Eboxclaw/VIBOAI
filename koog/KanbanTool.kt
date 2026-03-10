// KanbanTool.kt — Koog Local Tool for kanban.rs
// All calls via Tauri IPC → Rust kanban.rs

package com.vibo.agent.tools

import ai.koog.agents.core.tools.Tool
import ai.koog.agents.core.tools.ToolResult
import com.vibo.ipc.TauriIpc
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

// ─────────────────────────────────────────
// ARG TYPES
// ─────────────────────────────────────────

@Serializable data class KanbanCreateCardArgs(
    val board: String,                      // e.g. "boards/project.md"
    val column: String,                     // e.g. "Backlog"
    val title: String,
    val description: String? = null,
    val priority: String? = null,           // "high" | "medium" | "low"
    val due: String? = null,                // "YYYY-MM-DD"
    val tags: List<String> = emptyList(),
    val linkedNotes: List<String> = emptyList(),  // [[wikilinks]]
    val subtasks: List<String> = emptyList()
)

@Serializable data class KanbanMoveCardArgs(
    val cardId: String,
    val toColumn: String,
    val toBoard: String? = null
)

@Serializable data class KanbanUpdateCardArgs(
    val cardId: String,
    val title: String? = null,
    val description: String? = null,
    val priority: String? = null,
    val due: String? = null,
    val tags: List<String>? = null,
    val linkedNotes: List<String>? = null,
    val calendarEventId: String? = null
)

@Serializable data class KanbanCardIdArgs(val cardId: String)

@Serializable data class KanbanSubtaskArgs(
    val cardId: String,
    val subtaskIndex: Int,
    val completed: Boolean
)

@Serializable data class KanbanDateArgs(val date: String) // "YYYY-MM-DD"

@Serializable data class KanbanSearchArgs(val query: String)

@Serializable data class KanbanFromCalendarArgs(
    val eventId: String,
    val eventTitle: String,
    val eventDate: String,          // "YYYY-MM-DD"
    val board: String,
    val column: String,
    val description: String? = null,
    val linkedNotes: List<String> = emptyList()
)

// ─────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────

class KanbanTool(private val ipc: TauriIpc) {

    val createCard = Tool.function(
        name = "kanban_create_card",
        description = """
            Create a new card (task) on a kanban board.
            Each card is also a task.md file — compatible with Obsidian Kanban plugin.
            Use when a new task, action item, or follow-up is needed.
            Rules:
              - Always assign a board and column
              - Set due date if a deadline is mentioned or implied
              - Link to relevant notes via linkedNotes (as [[wikilinks]])
              - Break complex tasks into subtasks
        """.trimIndent(),
    ) { args: KanbanCreateCardArgs ->
        val result = ipc.invoke("kanban_create_card", buildJsonObject {
            put("board", args.board)
            put("column", args.column)
            put("title", args.title)
            args.description?.let { put("description", it) }
            args.priority?.let { put("priority", it) }
            args.due?.let { put("due", it) }
            put("tags", JsonArray(args.tags.map { JsonPrimitive(it) }))
            put("linkedNotes", JsonArray(args.linkedNotes.map { JsonPrimitive(it) }))
            put("subtasks", JsonArray(args.subtasks.map { JsonPrimitive(it) }))
        })
        ToolResult.Text(result.toString())
    }

    val moveCard = Tool.function(
        name = "kanban_move_card",
        description = """
            Move a card to a different column or board.
            Use when task status changes: Backlog → In Progress → Done.
            Rules:
              - Moving to "Done" column marks the task complete
              - Can move across boards if toBoard is specified
        """.trimIndent(),
    ) { args: KanbanMoveCardArgs ->
        val result = ipc.invoke("kanban_move_card", buildJsonObject {
            put("cardId", args.cardId)
            put("toColumn", args.toColumn)
            args.toBoard?.let { put("toBoard", it) }
        })
        ToolResult.Text(result.toString())
    }

    val updateCard = Tool.function(
        name = "kanban_update_card",
        description = """
            Update card fields — title, description, priority, due date, linked notes.
            Use for partial updates — only provide fields that change.
            Also used to link a card to a Google Calendar event via calendarEventId.
        """.trimIndent(),
    ) { args: KanbanUpdateCardArgs ->
        val result = ipc.invoke("kanban_update_card", buildJsonObject {
            put("cardId", args.cardId)
            args.title?.let { put("title", it) }
            args.description?.let { put("description", it) }
            args.priority?.let { put("priority", it) }
            args.due?.let { put("due", it) }
            args.tags?.let { put("tags", JsonArray(it.map { t -> JsonPrimitive(t) })) }
            args.linkedNotes?.let { put("linkedNotes", JsonArray(it.map { n -> JsonPrimitive(n) })) }
            args.calendarEventId?.let { put("calendarEventId", it) }
        })
        ToolResult.Text(result.toString())
    }

    val completeSubtask = Tool.function(
        name = "kanban_complete_subtask",
        description = """
            Mark a subtask within a card as complete or incomplete.
            Use when user confirms a sub-step is done.
        """.trimIndent(),
    ) { args: KanbanSubtaskArgs ->
        val result = ipc.invoke("kanban_complete_subtask", buildJsonObject {
            put("cardId", args.cardId)
            put("subtaskIndex", args.subtaskIndex)
            put("completed", args.completed)
        })
        ToolResult.Text(result.toString())
    }

    val getCard = Tool.function(
        name = "kanban_get_card",
        description = """
            Get full card details including subtasks, linked notes, and calendar event.
            Use before updating a card to understand its current state.
        """.trimIndent(),
    ) { args: KanbanCardIdArgs ->
        val result = ipc.invoke("kanban_get_card", buildJsonObject {
            put("cardId", args.cardId)
        })
        ToolResult.Text(result.toString())
    }

    val getOverdue = Tool.function(
        name = "kanban_get_overdue",
        description = """
            Get all cards past their due date that are not in Done/Archive.
            Use proactively to surface overdue tasks and suggest action.
            Call this on session start or when user asks about pending work.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("kanban_get_overdue", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val getDue = Tool.function(
        name = "kanban_get_due",
        description = """
            Get all cards due on a specific date.
            Use when user asks "what do I have today/tomorrow/this week".
            date format: "YYYY-MM-DD"
        """.trimIndent(),
    ) { args: KanbanDateArgs ->
        val result = ipc.invoke("kanban_get_due", buildJsonObject {
            put("date", args.date)
        })
        ToolResult.Text(result.toString())
    }

    val createFromCalendar = Tool.function(
        name = "kanban_create_from_calendar",
        description = """
            Create a kanban card directly from a Google Calendar event.
            Use when a calendar event implies an action or deliverable.
            Links card to event via eventId for bidirectional sync.
        """.trimIndent(),
    ) { args: KanbanFromCalendarArgs ->
        val result = ipc.invoke("kanban_create_from_calendar", buildJsonObject {
            put("eventId", args.eventId)
            put("eventTitle", args.eventTitle)
            put("eventDate", args.eventDate)
            put("board", args.board)
            put("column", args.column)
            args.description?.let { put("description", it) }
            put("linkedNotes", JsonArray(args.linkedNotes.map { JsonPrimitive(it) }))
        })
        ToolResult.Text(result.toString())
    }

    val searchCards = Tool.function(
        name = "kanban_search",
        description = """
            Search cards by title or description.
            Use when user asks about a specific task by name or topic.
        """.trimIndent(),
    ) { args: KanbanSearchArgs ->
        val result = ipc.invoke("kanban_search", buildJsonObject {
            put("query", args.query)
        })
        ToolResult.Text(result.toString())
    }

    val getBoard = Tool.function(
        name = "kanban_get_board",
        description = """
            Get a full board with all columns and card stubs.
            Use to understand the current state of a project.
        """.trimIndent(),
    ) { args: NoteLinksArgs ->
        val result = ipc.invoke("kanban_get_board", buildJsonObject {
            put("id", args.id)
        })
        ToolResult.Text(result.toString())
    }

    val archiveCard = Tool.function(
        name = "kanban_archive_card",
        description = """
            Archive a completed card — removes from active board view, keeps the file.
            Use when user confirms a task is fully done and no longer relevant.
        """.trimIndent(),
    ) { args: KanbanCardIdArgs ->
        ipc.invoke("kanban_archive_card", buildJsonObject { put("cardId", args.cardId) })
        ToolResult.Text("Archived: ${args.cardId}")
    }

    fun all() = listOf(
        createCard, moveCard, updateCard, completeSubtask,
        getCard, getOverdue, getDue, createFromCalendar,
        searchCards, getBoard, archiveCard
    )
}
