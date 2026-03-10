// src/lib/lfm.ts
// Routes to Rust providers.rs — no API keys in frontend.
// Streaming via Tauri "llm-delta" events.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getActiveProvider,
  getActiveLocalModel,
  CLOUD_PROVIDERS,
  getDownloadedModels,
  type ActiveProvider,
} from "@/lib/models";

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

const SYSTEM_PROMPT: LfmMessage = {
  role: "system",
  content: [
    "You are ViBo Assistant, a private AI running locally on-device.",
    "You help users organise notes, create tasks, and think through ideas.",
    "You are concise, helpful, and respect user privacy — all data stays on-device.",
    "If the user says 'new note: <title>' or 'new task: <title>', acknowledge and confirm creation.",
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
  switch (provider) {
    case "local":
      return "leap";
    case "openrouter":
      return "open_router";
    default:
      return provider;
  }
}

function getModelForProvider(provider: ActiveProvider): string {
  return provider === "local" ? getActiveLocalModel() : DEFAULT_MODELS[provider];
}

export function isLfmConfigured(): boolean {
  const provider = getActiveProvider();
  if (provider === "local") {
    return getDownloadedModels().length > 0;
  }
  return true;
}

export function getActiveProviderLabel(): string {
  const provider = getActiveProvider();
  if (provider === "local") return "LFM Local";
  const found = CLOUD_PROVIDERS.find((p) => p.id === provider);
  return found?.name || provider;
}

export async function listProviders(): Promise<ProviderInfo[]> {
  return invoke<ProviderInfo[]>("providers_list");
}

export async function torStatus(): Promise<boolean> {
  return invoke<boolean>("providers_tor_status");
}

export async function setTor(enabled: boolean): Promise<void> {
  await invoke("providers_tor_set", { enabled });
}

let streamCounter = 0;

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
  if (signal?.aborted) {
    onDone();
    return;
  }

  const provider = getActiveProvider();
  const model = getModelForProvider(provider);
  const apiKeyName = API_KEY_NAMES[provider];

  streamCounter += 1;
  let requestId = "";
  let settled = false;
  const unlisteners: Array<() => void> = [];

  const cleanup = () => {
    while (unlisteners.length > 0) {
      unlisteners.pop()?.();
    }
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  };

  const settleDone = () => {
    if (settled) return;
    settled = true;
    cleanup();
    onDone();
  };

  const settleError = (error: string) => {
    if (settled) return;
    settled = true;
    cleanup();
    onError(error);
  };

  const abortHandler = () => settleDone();
  signal?.addEventListener("abort", abortHandler);

  try {
    unlisteners.push(
      await listen<{ request_id: string; delta: string }>("llm-delta", (event) => {
        if (event.payload.request_id !== requestId || settled) return;
        onDelta(event.payload.delta || "");
      }),
    );

    unlisteners.push(
      await listen<{ request_id: string }>("llm-done", (event) => {
        if (event.payload.request_id !== requestId || settled) return;
        settleDone();
      }),
    );

    unlisteners.push(
      await listen<{ request_id: string; error: string }>("llm-error", (event) => {
        if (event.payload.request_id !== requestId || settled) return;
        settleError(event.payload.error || `${getActiveProviderLabel()} error`);
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

    if (signal?.aborted) {
      settleDone();
    }
  } catch (err: unknown) {
    settleError(err instanceof Error ? err.message : `Cannot reach ${getActiveProviderLabel()}. Is it running?`);
  }
}
