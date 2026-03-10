// VaultCryptoTool.kt — Koog Local Tool for vault.rs + crypto.rs
//
// Vault = encrypted notes. Requires unlock before any read/write.
// Agent can check status, request unlock prompt, and read/write encrypted notes.
// Agent NEVER handles keys, PINs, or raw crypto — those stay in Rust.

package com.vibo.agent.tools

import ai.koog.agents.core.tools.Tool
import ai.koog.agents.core.tools.ToolResult
import com.vibo.ipc.TauriIpc
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

// ─────────────────────────────────────────
// ARG TYPES
// ─────────────────────────────────────────

@Serializable data class VaultCreateArgs(
    val id: String,         // e.g. "vault/secret-note.md"
    val content: String
)

@Serializable data class VaultIdArgs(val id: String)

@Serializable data class VaultSearchArgs(val query: String)

// ─────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────

class VaultCryptoTool(private val ipc: TauriIpc) {

    // ── Vault status ─────────────────────────────────────────────────

    val getStatus = Tool.function(
        name = "vault_status",
        description = """
            Check vault lock status: is_locked, has_pin, biometric_enabled.
            ALWAYS call this before attempting to read or write vault notes.
            If is_locked=true, inform user and request unlock before proceeding.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("crypto_status", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val lockVault = Tool.function(
        name = "vault_lock",
        description = """
            Lock the vault — clears the master key from memory.
            Use when user explicitly requests to lock, or on session end.
            After locking, vault notes cannot be read or written until unlocked.
        """.trimIndent(),
    ) { _: Unit ->
        ipc.invoke("crypto_lock", JsonObject(emptyMap()))
        ToolResult.Text("Vault locked.")
    }

    // Note: vault unlock via PIN is done by the UI (LockScreen.tsx), not the agent.
    // Agent can check status and request UI to show lock screen.
    // Biometric unlock is also handled by BiometricPlugin.kt → crypto_unlock_biometric.

    // ── Encrypted note CRUD ──────────────────────────────────────────

    val createVaultNote = Tool.function(
        name = "vault_create",
        description = """
            Create a new encrypted note in the vault.
            Vault must be unlocked — check vault_status first.
            Content is encrypted by Rust before writing to disk.
            id format: "vault/title.md"
            Use for sensitive information: passwords, private thoughts, confidential data.
        """.trimIndent(),
    ) { args: VaultCreateArgs ->
        val result = ipc.invoke("vault_create", buildJsonObject {
            put("id", args.id)
            put("content", args.content)
        })
        ToolResult.Text(result.toString())
    }

    val readVaultNote = Tool.function(
        name = "vault_read",
        description = """
            Read and decrypt a vault note.
            Vault must be unlocked — check vault_status first.
            Returns decrypted content — handle with care, do not log or repeat unnecessarily.
        """.trimIndent(),
    ) { args: VaultIdArgs ->
        val result = ipc.invoke("vault_read", buildJsonObject {
            put("id", args.id)
        })
        ToolResult.Text(result.toString())
    }

    val writeVaultNote = Tool.function(
        name = "vault_write",
        description = """
            Overwrite an encrypted vault note with new content.
            Vault must be unlocked.
            Content is re-encrypted by Rust on write.
        """.trimIndent(),
    ) { args: VaultCreateArgs ->
        val result = ipc.invoke("vault_write", buildJsonObject {
            put("id", args.id)
            put("content", args.content)
        })
        ToolResult.Text(result.toString())
    }

    val deleteVaultNote = Tool.function(
        name = "vault_delete",
        description = """
            Move an encrypted vault note to .trash.
            Vault must be unlocked.
            Requires explicit user confirmation — never delete without clear intent.
        """.trimIndent(),
    ) { args: VaultIdArgs ->
        ipc.invoke("vault_delete", buildJsonObject { put("id", args.id) })
        ToolResult.Text("Vault note deleted: ${args.id}")
    }

    val listVaultNotes = Tool.function(
        name = "vault_list",
        description = """
            List all encrypted vault notes (titles only, no content).
            Vault must be unlocked.
            Use to understand what sensitive notes exist before reading.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("vault_list", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    val searchVault = Tool.function(
        name = "vault_search",
        description = """
            Search encrypted vault notes by decrypted content.
            Vault must be unlocked. Search happens entirely in Rust — content never exposed to network.
            Use when user asks to find something specific in their private notes.
        """.trimIndent(),
    ) { args: VaultSearchArgs ->
        val result = ipc.invoke("vault_search", buildJsonObject {
            put("query", args.query)
        })
        ToolResult.Text(result.toString())
    }

    // ── Keystore (API keys) ──────────────────────────────────────────

    val checkKeyExists = Tool.function(
        name = "keystore_has",
        description = """
            Check if an API key or token is stored in the keystore.
            Returns true/false only — never returns the key value.
            Use before asking user to configure a provider.
            key_name examples: "anthropic", "openrouter", "google_refresh_token"
        """.trimIndent(),
    ) { args: VaultIdArgs ->  // reuse — only needs a name string
        val result = ipc.invoke("keystore_has", buildJsonObject {
            put("keyName", args.id)
        })
        ToolResult.Text(result.toString())
    }

    val listKeys = Tool.function(
        name = "keystore_list",
        description = """
            List names of all stored API keys and tokens.
            Returns names only — never values.
            Use to inform user which providers are configured.
        """.trimIndent(),
    ) { _: Unit ->
        val result = ipc.invoke("keystore_list", JsonObject(emptyMap()))
        ToolResult.Text(result.toString())
    }

    fun all() = listOf(
        getStatus, lockVault,
        createVaultNote, readVaultNote, writeVaultNote,
        deleteVaultNote, listVaultNotes, searchVault,
        checkKeyExists, listKeys
    )
}
