// src/lib/lfm.ts
// Routes to Rust providers.rs — no API keys in frontend.
// Streaming via Tauri "llm-delta" events instead of SSE.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface LfmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  type: "local" | "cloud";
  configured: boolean;
  reachable: boolean;
}

export interface TorStatus {
  enabled: boolean;
  proxy: string;
}

// ─────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────

const SYSTEM_PROMPT: LfmMessage = {
  role: "system",
  content: [
    "You are ViBo Assistant, a private AI running locally on-device.",
    "You help users organise notes, create tasks, and think through ideas.",
    "You are concise, helpful, and respect user privacy — all data stays on-device.",
    "If the user says 'new note: <title>' or 'new task: <title>', acknowledge and confirm creation.",
  ].join(" "),
};

// ─────────────────────────────────────────
// PROVIDER INFO
// ─────────────────────────────────────────

export async function listProviders(): Promise<ProviderInfo[]> {
  return invoke<ProviderInfo[]>("providers_list");
}

export async function isLfmConfigured(): Promise<boolean> {
  const providers = await listProviders().catch(() => [] as ProviderInfo[]);
  return providers.some(function(p) { return p.configured && p.reachable; });
}

export async function torStatus(): Promise<TorStatus> {
  return invoke<TorStatus>("providers_tor_status");
}

export async function setTor(enabled: boolean): Promise<void> {
  await invoke("providers_tor_set", { enabled });
}

// ─────────────────────────────────────────
// STREAMING CHAT
// ─────────────────────────────────────────

let streamCounter = 0;

export async function streamLfmChat({
  messages,
  provider,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: LfmMessage[];
  provider?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  streamCounter = streamCounter + 1;
  const requestId = "stream-" + Date.now() + "-" + streamCounter;

  const allMessages = [SYSTEM_PROMPT].concat(messages);
  const selectedProvider = provider !== undefined ? provider : "local";

  let unlistenDelta: (() => void) | null = null;
  let unlistenDone: (() => void) | null = null;
  let unlistenError: (() => void) | null = null;

  function cleanup() {
    if (unlistenDelta) { unlistenDelta(); unlistenDelta = null; }
    if (unlistenDone) { unlistenDone(); unlistenDone = null; }
    if (unlistenError) { unlistenError(); unlistenError = null; }
  }

  if (signal) {
    signal.addEventListener("abort", function() {
      cleanup();
      onDone();
    });
  }

  try {
    // Listen for streaming events before invoking
    unlistenDelta = await listen<{ requestId: string; delta: string }>(
      "llm-delta",
      function(event) {
        if (event.payload.requestId !== requestId) { return; }
        onDelta(event.payload.delta);
      }
    );

    unlistenDone = await listen<{ requestId: string; fullResponse: string }>(
      "llm-done",
      function(event) {
        if (event.payload.requestId !== requestId) { return; }
        cleanup();
        onDone();
      }
    );

    unlistenError = await listen<{ requestId: string; error: string }>(
      "llm-error",
      function(event) {
        if (event.payload.requestId !== requestId) { return; }
        cleanup();
        onError(event.payload.error);
      }
    );

    // Start stream — Rust handles provider selection, keys, Tor
    await invoke("providers_stream", {
      provider: selectedProvider,
      messages: allMessages,
      requestId,
      reason: "user_chat",
    });

  } catch (err: unknown) {
    cleanup();
    const msg = err instanceof Error ? err.message : String(err);
    onError("Stream failed: " + msg);
  }
}

// ─────────────────────────────────────────
// COMPLETE (non-streaming)
// ─────────────────────────────────────────

export async function completeLfmChat({
  messages,
  provider,
  maxTokens,
}: {
  messages: LfmMessage[];
  provider?: string;
  maxTokens?: number;
}): Promise<string> {
  const allMessages = [SYSTEM_PROMPT].concat(messages);
  const result = await invoke<{ content: string }>("providers_complete", {
    provider: provider !== undefined ? provider : "local",
    messages: allMessages,
    maxTokens: maxTokens !== undefined ? maxTokens : 1000,
    reason: "user_complete",
  });
  return result.content;
}
