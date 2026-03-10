// src/lib/lfm.ts
// Routes inference through Rust providers.rs.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getActiveProvider, CLOUD_PROVIDERS, getActiveLocalModel, type ActiveProvider } from "@/lib/models";

export interface LfmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT: LfmMessage = {
  role: "system",
  content: [
    "You are ViBo Assistant, a private AI running locally on-device.",
    "You help users organise notes, create tasks, and think through ideas.",
    "You are concise, helpful, and respect user privacy — all data stays on-device.",
  ].join(" "),
};

const DEFAULT_MODELS: Record<ActiveProvider, string> = {
  local: "lfm2.5-1.2b-instruct",
  ollama: "llama3",
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "meta-llama/llama-3.1-8b-instruct",
  kimi: "moonshot-v1-8k",
  minimax: "abab6.5s-chat",
};

const API_KEY_NAMES: Partial<Record<ActiveProvider, string>> = {
  anthropic: "anthropic_api_key",
  openrouter: "openrouter_api_key",
  kimi: "kimi_api_key",
  minimax: "minimax_api_key",
};

function toProviderKind(provider: ActiveProvider): "leap" | "ollama" | "anthropic" | "open_router" | "kimi" | "minimax" {
  if (provider === "local") return "leap";
  if (provider === "openrouter") return "open_router";
  return provider;
}

export function isLfmConfigured(): boolean {
  return true;
}

export function getActiveProviderLabel(): string {
  const provider = getActiveProvider();
  if (provider === "local") return "LFM Local";
  const found = CLOUD_PROVIDERS.find((p) => p.id === provider);
  return found?.name ?? provider;
}

export async function streamLfmChat({
  messages,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: LfmMessage[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const provider = getActiveProvider();
  const model = provider === "local" ? getActiveLocalModel() : DEFAULT_MODELS[provider];
  const apiKeyName = API_KEY_NAMES[provider];

  let requestId = "";
  const unlisteners: Array<() => void> = [];

  const cleanup = () => {
    while (unlisteners.length) {
      unlisteners.pop()?.();
    }
  };

  try {
    unlisteners.push(
      await listen<{ request_id: string; delta: string }>("llm-delta", (event) => {
        if (event.payload.request_id === requestId) onDelta(event.payload.delta);
      }),
    );
    unlisteners.push(
      await listen<{ request_id: string }>("llm-done", (event) => {
        if (event.payload.request_id === requestId) {
          cleanup();
          onDone();
        }
      }),
    );
    unlisteners.push(
      await listen<{ request_id: string; error: string }>("llm-error", (event) => {
        if (event.payload.request_id === requestId) {
          cleanup();
          onError(event.payload.error);
        }
      }),
    );

    requestId = await invoke<string>("providers_stream", {
      request: {
        provider: toProviderKind(provider),
        model,
        messages,
        system: SYSTEM_PROMPT.content,
        max_tokens: 1024,
        temperature: 0.7,
        api_key_name: apiKeyName,
      },
    });

    if (signal) {
      signal.addEventListener("abort", () => {
        cleanup();
        onDone();
      });
    }
  } catch (err) {
    cleanup();
    onError(err instanceof Error ? err.message : "stream failed");
  }
}
