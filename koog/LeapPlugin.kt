// LeapPlugin.kt — Leap SDK LFM2 On-Device Inference
// Tauri Android plugin wrapping Leap SDK.
// LFM2-1.2B Q5_K_M — downloaded during onboarding, stored in app files dir.
// Streams tokens via Tauri "llm-delta" events — same interface as cloud providers.

package com.vibo.plugins

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import app.tauri.plugin.JSObject
import com.liquid.ai.leap.LeapEngine
import com.liquid.ai.leap.LeapConfig
import com.liquid.ai.leap.StreamCallback
import kotlinx.coroutines.*
import java.io.File

@TauriPlugin
class LeapPlugin(private val activity: Activity) : Plugin(activity) {

    private var engine: LeapEngine? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // ── Model paths ──────────────────────────────────────────────────

    private fun modelsDir(): File =
        File(activity.filesDir, "models")

    private fun defaultModelPath(): File =
        File(modelsDir(), "lfm2-1.2b-q5_k_m.gguf")

    private fun adapterDir(): File =
        File(modelsDir(), "adapters")

    // ── Init / load model ────────────────────────────────────────────

    @Command
    fun leap_load(invoke: Invoke) {
        val modelPath = invoke.getString("modelPath") ?: defaultModelPath().absolutePath
        val adapterPath = invoke.getString("adapterPath") // optional QLoRA adapter

        scope.launch {
            try {
                val config = LeapConfig.Builder()
                    .modelPath(modelPath)
                    .apply { adapterPath?.let { adapterPath(it) } }
                    .contextSize(4096)
                    .threads(4)
                    .build()

                engine = LeapEngine(config)
                engine!!.load()

                invoke.resolve(JSObject().apply {
                    put("loaded", true)
                    put("modelPath", modelPath)
                    put("adapterActive", adapterPath != null)
                })
            } catch (e: Exception) {
                invoke.reject("Failed to load model: ${e.message}")
            }
        }
    }

    @Command
    fun leap_unload(invoke: Invoke) {
        engine?.unload()
        engine = null
        invoke.resolve(JSObject().apply { put("unloaded", true) })
    }

    @Command
    fun leap_status(invoke: Invoke) {
        invoke.resolve(JSObject().apply {
            put("loaded", engine != null)
            put("modelPath", defaultModelPath().absolutePath)
            put("modelExists", defaultModelPath().exists())
            put("modelSizeMb", if (defaultModelPath().exists())
                defaultModelPath().length() / 1_048_576 else 0)
            put("adaptersDir", adapterDir().absolutePath)
        })
    }

    // ── Inference — streaming ────────────────────────────────────────

    @Command
    fun leap_stream(invoke: Invoke) {
        val requestId = invoke.getString("requestId")
            ?: return invoke.reject("requestId required")
        val messagesJson = invoke.getArray("messages")
            ?: return invoke.reject("messages required")
        val maxTokens = invoke.getInt("maxTokens") ?: 1000

        val eng = engine ?: return invoke.reject("Model not loaded — call leap_load first")

        // Build prompt from messages array
        val prompt = buildPrompt(messagesJson)

        scope.launch {
            try {
                val fullResponse = StringBuilder()

                eng.stream(
                    prompt = prompt,
                    maxTokens = maxTokens,
                    callback = object : StreamCallback {
                        override fun onToken(token: String) {
                            fullResponse.append(token)
                            // Emit Tauri event — same format as providers.rs cloud streaming
                            trigger("llm-delta", JSObject().apply {
                                put("requestId", requestId)
                                put("delta", token)
                            })
                        }

                        override fun onComplete() {
                            trigger("llm-done", JSObject().apply {
                                put("requestId", requestId)
                                put("fullResponse", fullResponse.toString())
                            })
                        }

                        override fun onError(error: String) {
                            trigger("llm-error", JSObject().apply {
                                put("requestId", requestId)
                                put("error", error)
                            })
                        }
                    }
                )

                invoke.resolve(JSObject().apply {
                    put("requestId", requestId)
                    put("streaming", true)
                })
            } catch (e: Exception) {
                invoke.reject("Inference failed: ${e.message}")
            }
        }
    }

    // ── Inference — complete (non-streaming) ─────────────────────────

    @Command
    fun leap_complete(invoke: Invoke) {
        val messagesJson = invoke.getArray("messages")
            ?: return invoke.reject("messages required")
        val maxTokens = invoke.getInt("maxTokens") ?: 1000

        val eng = engine ?: return invoke.reject("Model not loaded")

        scope.launch {
            try {
                val prompt = buildPrompt(messagesJson)
                val result = eng.complete(prompt = prompt, maxTokens = maxTokens)
                invoke.resolve(JSObject().apply {
                    put("content", result)
                })
            } catch (e: Exception) {
                invoke.reject("Inference failed: ${e.message}")
            }
        }
    }

    // ── Embeddings — for SRI (all-MiniLM-L6-v2 bundled) ─────────────

    @Command
    fun leap_embed(invoke: Invoke) {
        val text = invoke.getString("text")
            ?: return invoke.reject("text required")

        // all-MiniLM-L6-v2 bundled at 22MB — always available, no download needed
        val eng = engine ?: return invoke.reject("Model not loaded")

        scope.launch {
            try {
                val embedding = eng.embed(text)   // returns FloatArray of 384 dims
                invoke.resolve(JSObject().apply {
                    put("embedding", embedding.toList())
                    put("dimensions", embedding.size)
                })
            } catch (e: Exception) {
                invoke.reject("Embedding failed: ${e.message}")
            }
        }
    }

    // ── Adapter management ───────────────────────────────────────────

    @Command
    fun leap_load_adapter(invoke: Invoke) {
        val adapterPath = invoke.getString("adapterPath")
            ?: return invoke.reject("adapterPath required")

        scope.launch {
            try {
                engine?.loadAdapter(adapterPath)
                invoke.resolve(JSObject().apply {
                    put("adapterLoaded", true)
                    put("adapterPath", adapterPath)
                })
            } catch (e: Exception) {
                invoke.reject("Failed to load adapter: ${e.message}")
            }
        }
    }

    @Command
    fun leap_list_adapters(invoke: Invoke) {
        val adapters = adapterDir()
            .listFiles { f -> f.extension == "gguf" || f.extension == "bin" }
            ?.map { it.name } ?: emptyList()
        invoke.resolve(JSObject().apply {
            put("adapters", adapters)
        })
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun buildPrompt(messagesJson: Any): String {
        // Convert messages array to ChatML format for LFM2
        val sb = StringBuilder()
        val messages = messagesJson as? List<*> ?: return ""
        for (msg in messages) {
            val obj = msg as? Map<*, *> ?: continue
            val role = obj["role"]?.toString() ?: continue
            val content = obj["content"]?.toString() ?: continue
            when (role) {
                "system"    -> sb.append("<|system|>\n$content\n")
                "user"      -> sb.append("<|user|>\n$content\n")
                "assistant" -> sb.append("<|assistant|>\n$content\n")
            }
        }
        sb.append("<|assistant|>\n")
        return sb.toString()
    }
}
