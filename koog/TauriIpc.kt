// TauriIpc.kt — Tauri IPC Bridge
// Single class that wraps all invoke() calls from Kotlin → Rust.
// All tools use this — never call Tauri directly from tool files.

package com.vibo.ipc

import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class TauriIpc(private val webView: WebView) {

    // Pending invoke() calls waiting for response
    private val pending = ConcurrentHashMap<String, (Result<JsonElement>) -> Unit>()

    // ── JS bridge — receives responses from Rust via Tauri ───────────

    @JavascriptInterface
    fun onInvokeResult(callId: String, resultJson: String) {
        val callback = pending.remove(callId) ?: return
        try {
            val parsed = kotlinx.serialization.json.Json.parseToJsonElement(resultJson)
            callback(Result.success(parsed))
        } catch (e: Exception) {
            callback(Result.failure(e))
        }
    }

    @JavascriptInterface
    fun onInvokeError(callId: String, error: String) {
        pending.remove(callId)?.invoke(Result.failure(RuntimeException(error)))
    }

    // ── Main invoke() — suspends until Rust responds ─────────────────

    suspend fun invoke(command: String, args: JsonObject = JsonObject(emptyMap())): JsonElement {
        val callId = UUID.randomUUID().toString()

        return suspendCancellableCoroutine { cont ->
            pending[callId] = { result ->
                result.fold(
                    onSuccess = { cont.resume(it) },
                    onFailure = { cont.resumeWithException(it) }
                )
            }

            cont.invokeOnCancellation { pending.remove(callId) }

            // Execute JS in WebView to call Tauri invoke()
            val js = """
                window.__TAURI__.core.invoke('$command', ${args})
                    .then(r => window.TauriIpc.onInvokeResult('$callId', JSON.stringify(r)))
                    .catch(e => window.TauriIpc.onInvokeError('$callId', e.toString()));
            """.trimIndent()

            webView.post {
                webView.evaluateJavascript(js, null)
            }
        }
    }

    // ── Event listener — for streaming llm-delta events ─────────────

    fun listenToEvent(event: String, onEvent: (JsonElement) -> Unit): () -> Unit {
        val listenerId = UUID.randomUUID().toString()

        val js = """
            window.__TAURI__.event.listen('$event', (e) => {
                window.TauriIpc.onEvent('$listenerId', JSON.stringify(e.payload));
            }).then(unlisten => {
                window._viboUnlisteners = window._viboUnlisteners || {};
                window._viboUnlisteners['$listenerId'] = unlisten;
            });
        """.trimIndent()

        eventListeners[listenerId] = onEvent
        webView.post { webView.evaluateJavascript(js, null) }

        // Returns unlisten function
        return {
            eventListeners.remove(listenerId)
            webView.post {
                webView.evaluateJavascript(
                    "window._viboUnlisteners?.['$listenerId']?.();", null
                )
            }
        }
    }

    @JavascriptInterface
    fun onEvent(listenerId: String, payloadJson: String) {
        val listener = eventListeners[listenerId] ?: return
        try {
            val parsed = kotlinx.serialization.json.Json.parseToJsonElement(payloadJson)
            listener(parsed)
        } catch (_: Exception) {}
    }

    private val eventListeners = ConcurrentHashMap<String, (JsonElement) -> Unit>()

    // ── Register JS bridge in WebView ────────────────────────────────

    fun register() {
        webView.addJavascriptInterface(this, "TauriIpc")
    }
}
