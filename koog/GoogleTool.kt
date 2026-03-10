// GoogleTool.kt — Koog Local Tool for google.rs
// All calls via Tauri IPC → Rust google.rs → Google API
// OAuth tokens stored encrypted in Rust — agent never sees them
//
// Permissions:
//   Calendar: READ + WRITE
//   Gmail:    READ ONLY — agent cannot send or delete emails

package com.vibo.agent.tools

import ai.koog.agents.core.tools.Tool
import ai.koog.agents.core.tools.ToolResult
import com.vibo.ipc.TauriIpc
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

// ─────────────────────────────────────────
// ARG TYPES
// ─────────────────────────────────────────

@Serializable data class CalendarEventsArgs(
    val calendarId: String = "primary",
    val timeMin: String? = null,    // ISO 8601
    val timeMax: String? = null,
    val maxResults: Int = 20
)

@Serializable data class CalendarCreateArgs(
    val title: String,
    val start: String,              // ISO 8601 datetime
    val end: String,
    val description: String? = null,
    val calendarId: String = "primary"
)

@Serializable data class CalendarUpdateArgs(
    val eventId: String,
    val title: String? = null,
    val start: String? = null,
    val end: String? = null,
    val description: String? = null,
    val calendarId: String = "primary"
)

@Serializable data class CalendarDeleteArgs(
    val eventId: String,
    val calendarId: String = "primary"
)

@Serializable data class GmailListArgs(
    val maxResults: Int = 20,
    val query: String? = null       // Gmail search syntax e.g. "is:unread from:boss"
)

@Serializable data class GmailReadArgs(val messageId: String)

// ─────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────

class GoogleTool(private val ipc: TauriIpc) {

    // ── Auth status ──────────────────────────────────────────────────

    val authStatus = Tool.function(
        name = "google_auth_status",
        description = """
            Check if Google account is connected and token is valid.
            ALWAYS call this before any calendar or gmail operation.
            If not authenticated, inform user to connect Google account in Settings.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("google_auth_status", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    // ── Calendar ─────────────────────────────────────────────────────

    val listCalendars = Tool.function(
        name = "google_calendar_list",
        description = """
            List all Google Calendars available to the user.
            Use to find the correct calendarId before creating events.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("google_calendar_list", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val getEvents = Tool.function(
        name = "google_calendar_events",
        description = """
            Get calendar events in a time range.
            timeMin/timeMax format: ISO 8601 e.g. "2025-06-01T00:00:00Z"
            Use to understand user's schedule before creating tasks or events.
        """.trimIndent(),
    ) { args: CalendarEventsArgs ->
        val result = ipc.invoke("google_calendar_events", buildJsonObject {
            put("calendarId", args.calendarId)
            args.timeMin?.let { put("timeMin", it) }
            args.timeMax?.let { put("timeMax", it) }
            put("maxResults", args.maxResults)
        })
        ToolResult.Text(result.toString())
    }

    val getTodayEvents = Tool.function(
        name = "google_calendar_today",
        description = """
            Get all events for today. Shortcut — no date params needed.
            Use when user asks "what do I have today" or for daily briefing.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("google_calendar_today", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val createEvent = Tool.function(
        name = "google_calendar_create",
        description = """
            Create a new Google Calendar event.
            Rules:
              - Always confirm title and time with user before creating
              - start and end must be ISO 8601 datetime strings
              - Use description to include relevant context or note links
              - After creating, consider creating a linked kanban card via kanban_create_from_calendar
        """.trimIndent(),
    ) { args: CalendarCreateArgs ->
        val result = ipc.invoke("google_calendar_create", buildJsonObject {
            put("title", args.title)
            put("start", args.start)
            put("end", args.end)
            args.description?.let { put("description", it) }
            put("calendarId", args.calendarId)
        })
        ToolResult.Text(result.toString())
    }

    val updateEvent = Tool.function(
        name = "google_calendar_update",
        description = """
            Update an existing calendar event — title, time, or description.
            Only provide fields that change.
            Rules:
              - Confirm changes with user before updating
              - After updating time, check if linked kanban card due date needs updating too
        """.trimIndent(),
    ) { args: CalendarUpdateArgs ->
        val result = ipc.invoke("google_calendar_update", buildJsonObject {
            put("eventId", args.eventId)
            args.title?.let { put("title", it) }
            args.start?.let { put("start", it) }
            args.end?.let { put("end", it) }
            args.description?.let { put("description", it) }
            put("calendarId", args.calendarId)
        })
        ToolResult.Text(result.toString())
    }

    val deleteEvent = Tool.function(
        name = "google_calendar_delete",
        description = """
            Delete a calendar event.
            Rules:
              - Always confirm with user before deleting
              - If a kanban card is linked to this event, inform user and ask if card should also be deleted
        """.trimIndent(),
    ) { args: CalendarDeleteArgs ->
        ipc.invoke("google_calendar_delete", buildJsonObject {
            put("eventId", args.eventId)
            put("calendarId", args.calendarId)
        })
        ToolResult.Text("Event deleted: ${args.eventId}")
    }

    // ── Gmail — READ ONLY ────────────────────────────────────────────

    val listEmails = Tool.function(
        name = "google_gmail_list",
        description = """
            List Gmail messages. READ ONLY — cannot send or delete.
            Optional query uses Gmail search syntax: "is:unread", "from:boss@co.com", "subject:invoice"
            Use to surface relevant emails when user asks about communication.
        """.trimIndent(),
    ) { args: GmailListArgs ->
        val result = ipc.invoke("google_gmail_list", buildJsonObject {
            put("maxResults", args.maxResults)
            args.query?.let { put("query", it) }
        })
        ToolResult.Text(result.toString())
    }

    val readEmail = Tool.function(
        name = "google_gmail_read",
        description = """
            Read the full content of a Gmail message. READ ONLY.
            Use to understand email context before creating tasks or events from it.
            messageId comes from google_gmail_list results.
        """.trimIndent(),
    ) { args: GmailReadArgs ->
        val result = ipc.invoke("google_gmail_read", buildJsonObject {
            put("messageId", args.messageId)
        })
        ToolResult.Text(result.toString())
    }

    val getUnreadCount = Tool.function(
        name = "google_gmail_unread_count",
        description = """
            Get count of unread emails.
            Use for daily briefing or when user asks about inbox status.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("google_gmail_unread_count", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    fun all() = listOf(
        authStatus,
        listCalendars, getEvents, getTodayEvents,
        createEvent, updateEvent, deleteEvent,
        listEmails, readEmail, getUnreadCount
    )
}
