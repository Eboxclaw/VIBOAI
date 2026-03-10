// ProviderTool.kt — Koog Local Tool for providers.rs
// Cloud escalation with explicit rules.
// Agent calls this when local LFM is insufficient.
// Rust handles: API keys, Tor routing, streaming events.
// Agent never sees API keys or provider credentials.

package com.vibo.agent.tools

import ai.koog.agents.core.tools.Tool
import ai.koog.agents.core.tools.ToolResult
import com.vibo.ipc.TauriIpc
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

// ─────────────────────────────────────────
// ARG TYPES
// ─────────────────────────────────────────

@Serializable data class ProviderCompleteArgs(
    val provider: String,               // "anthropic" | "openrouter" | "kimi" | "ollama" | "local"
    val messages: List<ProviderMessage>,
    val maxTokens: Int = 1000,
    val reason: String                  // WHY escalating — logged for audit
)

@Serializable data class ProviderMessage(
    val role: String,                   // "user" | "assistant" | "system"
    val content: String
)

@Serializable data class ProviderStreamArgs(
    val provider: String,
    val messages: List<ProviderMessage>,
    val requestId: String,              // used to match llm-delta events
    val reason: String
)

// ─────────────────────────────────────────
// ESCALATION RULES
// These are enforced in the tool descriptions so the LFM learns when to escalate
// ─────────────────────────────────────────

private const val ESCALATION_RULES = """
ESCALATION RULES — only call cloud provider when ALL conditions are met:
  1. Task requires reasoning beyond local LFM capability (complex analysis, long generation)
  2. User has cloud provider configured (check keystore_has first)
  3. SRI confidence was < 0.5 OR task is explicitly complex
  4. User has not disabled cloud in settings

NEVER escalate for:
  - Simple note read/write/search
  - Kanban card updates
  - Calendar lookups
  - Any task local LFM can handle

Provider selection priority:
  1. "local"       — always try first (LFM on-device)
  2. "ollama"      — desktop local fallback
  3. "anthropic"   — best quality cloud
  4. "openrouter"  — cost-efficient cloud
  5. "kimi"        — long context tasks
"""

// ─────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────

class ProviderTool(private val ipc: TauriIpc) {

    val listProviders = Tool.function(
        name = "providers_list",
        description = """
            List available inference providers and their status (configured, reachable).
            Call before escalating to understand what's available.
            Returns: provider name, type (local/cloud), configured (bool), tor_active (bool).
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("providers_list", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val torStatus = Tool.function(
        name = "providers_tor_status",
        description = """
            Check if Tor routing is active for cloud calls.
            Use to inform user about privacy status when escalating to cloud.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("providers_tor_status", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val complete = Tool.function(
        name = "providers_complete",
        description = """
            Send messages to an inference provider and get a complete response.
            Use for non-streaming tasks: classification, extraction, structured output.
            
            $ESCALATION_RULES
            
            Always provide 'reason' — why local LFM was insufficient for this task.
            This is logged for audit and helps improve local model training.
        """.trimIndent(),
    ) { args: ProviderCompleteArgs ->
        val messagesJson = JsonArray(args.messages.map { msg ->
            buildJsonObject {
                put("role", msg.role)
                put("content", msg.content)
            }
        })
        val result = ipc.invoke("providers_complete", buildJsonObject {
            put("provider", args.provider)
            put("messages", messagesJson)
            put("maxTokens", args.maxTokens)
            put("reason", args.reason)
        })
        ToolResult.Text(result.toString())
    }

    val stream = Tool.function(
        name = "providers_stream",
        description = """
            Stream a response from an inference provider token by token.
            Rust emits "llm-delta" events → UI shows live typing.
            Use for: long generation, creative writing, detailed analysis.
            
            $ESCALATION_RULES
            
            requestId must be unique per call — used to match streaming events.
            Always provide 'reason' — logged for audit.
        """.trimIndent(),
    ) { args: ProviderStreamArgs ->
        val messagesJson = JsonArray(args.messages.map { msg ->
            buildJsonObject {
                put("role", msg.role)
                put("content", msg.content)
            }
        })
        // Rust streams via Tauri events — this invoke starts the stream
        // UI listens to "llm-delta" { requestId, delta } events
        ipc.invoke("providers_stream", buildJsonObject {
            put("provider", args.provider)
            put("messages", messagesJson)
            put("requestId", args.requestId)
            put("reason", args.reason)
        })
        ToolResult.Text("Streaming started — requestId: ${args.requestId}")
    }

    fun all() = listOf(
        listProviders, torStatus, complete, stream
    )
}
