// AgentService.kt — ViBo Koog Agent
// Wires all tools into a single agent.
// SRI decision (from storage_sri_route) informs which tools are prioritised.
// Leap SDK (LFM on-device) is the default model — cloud via ProviderTool only when needed.

package com.vibo.agent

import ai.koog.agents.core.agent.AIAgent
import ai.koog.agents.core.agent.config.AIAgentConfig
import ai.koog.agents.ext.agent.simpleSingleRunAgent
import com.vibo.agent.tools.*
import com.vibo.ipc.TauriIpc
import kotlinx.serialization.json.JsonObject

class AgentService(private val ipc: TauriIpc) {

    // ── Tools ────────────────────────────────────────────────────────

    private val noteTool         = NoteTool(ipc)
    private val kanbanTool       = KanbanTool(ipc)
    private val vaultCryptoTool  = VaultCryptoTool(ipc)
    private val googleTool       = GoogleTool(ipc)
    private val providerTool     = ProviderTool(ipc)

    private val allTools = listOf(
        noteTool.all(),
        kanbanTool.all(),
        vaultCryptoTool.all(),
        googleTool.all(),
        providerTool.all()
    ).flatten()

    // ── System prompt ────────────────────────────────────────────────

    private val systemPrompt = """
        You are ViBo, a sovereign AI assistant running locally on the user's device.
        You help manage notes, tasks, calendar, and encrypted private information.

        CORE RULES:
        1. Privacy first — never send user data to cloud unless explicitly needed and user has cloud enabled
        2. Always check vault_status before accessing encrypted notes
        3. Always check google_auth_status before calendar or gmail operations
        4. Never delete notes or events without explicit user confirmation
        5. Prefer local tools — only escalate to cloud via providers_complete/stream when local is insufficient
        6. When creating calendar events, consider creating linked kanban cards
        7. When creating kanban cards from calendar, use kanban_create_from_calendar

        TOOL SELECTION:
        - Finding/reading notes    → note_search, note_read
        - Creating/editing notes   → note_create, note_patch, note_write
        - Tasks and projects       → kanban_* tools
        - Calendar                 → google_calendar_* tools
        - Email context            → google_gmail_* tools (READ ONLY)
        - Sensitive notes          → vault_* tools (check vault_status first)
        - Complex reasoning needed → providers_complete or providers_stream

        BIDIRECTIONAL SYNC:
        When a calendar event implies a task → create kanban card via kanban_create_from_calendar
        When a kanban card has a due date   → suggest creating a calendar reminder
        When moving card to Done             → offer to update linked calendar event
    """.trimIndent()

    // ── Agent builder ────────────────────────────────────────────────

    fun buildAgent(): AIAgent = simpleSingleRunAgent(
        systemPrompt = systemPrompt,
        tools = allTools,
        // LFM model via Leap SDK — configured in LeapPlugin.kt
        // Falls back to ProviderTool for cloud escalation
    )

    // ── Main entry point ─────────────────────────────────────────────

    suspend fun run(
        userMessage: String,
        sriDecision: SriDecision? = null,
    ): String {
        // Enrich system prompt with SRI context if available
        val contextualPrompt = if (sriDecision != null) {
            buildString {
                append(systemPrompt)
                append("\n\nSRI ROUTING CONTEXT:\n")
                append("- Intent detected: ${sriDecision.intent}\n")
                append("- Confidence: ${sriDecision.confidence}\n")
                append("- Suggested action: ${sriDecision.action}\n")
                if (sriDecision.matchedNotes.isNotEmpty()) {
                    append("- Relevant notes found: ${sriDecision.matchedNotes.take(3).joinToString { it.noteTitle }}\n")
                }
                if (sriDecision.canParallelize) {
                    append("- Multiple parallel actions may be needed\n")
                }
            }
        } else systemPrompt

        val agent = simpleSingleRunAgent(
            systemPrompt = contextualPrompt,
            tools = allTools,
        )

        return agent.run(userMessage)
    }
}

// ─────────────────────────────────────────
// SRI DECISION — mirrors storage.rs SriDecision
// ─────────────────────────────────────────

data class SriDecision(
    val intent: String,
    val confidence: Float,
    val source: String,
    val action: String,
    val cacheHit: Boolean,
    val cachedResult: String?,
    val matchedNotes: List<MatchedNote>,
    val shouldEscalateCloud: Boolean,
    val canParallelize: Boolean
)

data class MatchedNote(
    val noteId: String,
    val noteTitle: String,
    val similarity: Float
)
