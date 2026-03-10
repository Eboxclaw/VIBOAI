// NoteTool.kt — Koog Local Tool for notes.rs
// All calls go via Tauri IPC invoke() → Rust notes.rs
// Agent never touches the filesystem directly

package com.vibo.agent.tools

import ai.koog.agents.core.tools.Tool
import ai.koog.agents.core.tools.ToolResult
import com.vibo.ipc.TauriIpc
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

// ─────────────────────────────────────────
// ARG TYPES
// ─────────────────────────────────────────

@Serializable data class NoteCreateArgs(
    val id: String,                     // e.g. "folder/My Note.md"
    val content: String? = null,
    val tags: List<String> = emptyList()
)

@Serializable data class NoteWriteArgs(
    val id: String,
    val content: String
)

@Serializable data class NotePatchArgs(
    val id: String,
    val body: String                    // keeps existing frontmatter
)

@Serializable data class NoteSearchArgs(
    val query: String,
    val caseSensitive: Boolean = false
)

@Serializable data class NoteLinksArgs(
    val id: String
)

@Serializable data class NoteMoveArgs(
    val id: String,
    val newId: String
)

// ─────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────

class NoteTool(private val ipc: TauriIpc) {

    val createNote = Tool.function(
        name = "note_create",
        description = """
            Create a new note in the vault.
            Use for: capturing ideas, meeting notes, research, any new content.
            id format: 'folder/Title.md' or 'Title.md' for root.
            Returns the created note with wikilinks and frontmatter parsed.
        """.trimIndent(),
    ) { args: NoteCreateArgs ->
        val result = ipc.invoke("note_create", buildJsonObject {
            put("id", args.id)
            args.content?.let { put("content", it) }
            put("frontmatter", buildJsonObject {
                put("tags", JsonArray(args.tags.map { JsonPrimitive(it) }))
            })
        })
        ToolResult.Text(result.toString())
    }

    val readNote = Tool.function(
        name = "note_read",
        description = """
            Read a note's full content including frontmatter, wikilinks, and backlinks.
            Use when you need to understand what a note contains before editing.
            id format: 'folder/Title.md'
        """.trimIndent(),
    ) { args: NoteLinksArgs ->
        val result = ipc.invoke("note_read", buildJsonObject {
            put("id", args.id)
        })
        ToolResult.Text(result.toString())
    }

    val writeNote = Tool.function(
        name = "note_write",
        description = """
            Overwrite a note's entire content (frontmatter + body).
            Use for full rewrites. For partial edits, prefer note_patch.
        """.trimIndent(),
    ) { args: NoteWriteArgs ->
        val result = ipc.invoke("note_write", buildJsonObject {
            put("id", args.id)
            put("content", args.content)
        })
        ToolResult.Text(result.toString())
    }

    val patchNote = Tool.function(
        name = "note_patch",
        description = """
            Update only the body of a note — preserves existing frontmatter.
            Preferred for editing content without touching tags or metadata.
        """.trimIndent(),
    ) { args: NotePatchArgs ->
        val result = ipc.invoke("note_patch", buildJsonObject {
            put("id", args.id)
            put("body", args.body)
        })
        ToolResult.Text(result.toString())
    }

    val deleteNote = Tool.function(
        name = "note_delete",
        description = """
            Move a note to .trash (recoverable). Does NOT permanently delete.
            Always confirm intent before deleting — this requires explicit user request.
        """.trimIndent(),
    ) { args: NoteLinksArgs ->
        val result = ipc.invoke("note_delete", buildJsonObject {
            put("id", args.id)
        })
        ToolResult.Text("Deleted: ${args.id}")
    }

    val moveNote = Tool.function(
        name = "note_move",
        description = """
            Move or rename a note. Automatically updates all [[wikilinks]] in the vault.
            Use when reorganising notes or correcting titles.
        """.trimIndent(),
    ) { args: NoteMoveArgs ->
        val result = ipc.invoke("note_move", buildJsonObject {
            put("id", args.id)
            put("newId", args.newId)
        })
        ToolResult.Text(result.toString())
    }

    val listNotes = Tool.function(
        name = "note_list",
        description = """
            List all notes as stubs (id, title, tags, modified_at, word_count).
            Use to understand what exists in the vault before searching or creating.
            Does not return full content — use note_read for that.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("note_list", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val searchNotes = Tool.function(
        name = "note_search",
        description = """
            Full-text search across all notes.
            Returns matching notes with line-level context.
            Use for finding notes by topic, keyword, or phrase.
        """.trimIndent(),
    ) { args: NoteSearchArgs ->
        val result = ipc.invoke("note_search", buildJsonObject {
            put("query", args.query)
            put("caseSensitive", args.caseSensitive)
        })
        ToolResult.Text(result.toString())
    }

    val getBacklinks = Tool.function(
        name = "note_get_backlinks",
        description = """
            Get all notes that link to this note via [[wikilinks]].
            Use to understand context and connections around a note.
        """.trimIndent(),
    ) { args: NoteLinksArgs ->
        val result = ipc.invoke("note_get_backlinks", buildJsonObject {
            put("id", args.id)
        })
        ToolResult.Text(result.toString())
    }

    val getLinks = Tool.function(
        name = "note_get_links",
        description = """
            Get all [[wikilinks]] this note points to, with resolution status.
            Use to find related notes or detect broken links.
        """.trimIndent(),
    ) { args: NoteLinksArgs ->
        val result = ipc.invoke("note_get_links", buildJsonObject {
            put("id", args.id)
        })
        ToolResult.Text(result.toString())
    }

    val getDailyNote = Tool.function(
        name = "note_daily_get",
        description = """
            Get or create today's daily note (stored in daily/YYYY-MM-DD.md).
            Use as a starting point for daily context, tasks, or journaling.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("note_daily_get", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val getOrphans = Tool.function(
        name = "note_get_orphans",
        description = """
            Find notes with no inbound or outbound [[wikilinks]].
            Use to suggest connections or identify isolated knowledge.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("note_get_orphans", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    /** Register all note tools with a Koog agent */
    fun all() = listOf(
        createNote, readNote, writeNote, patchNote,
        deleteNote, moveNote, listNotes, searchNotes,
        getBacklinks, getLinks, getDailyNote, getOrphans
    )
}
