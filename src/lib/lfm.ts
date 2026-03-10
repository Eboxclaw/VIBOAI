/**
 * LFM Unified Chat Client
 * Routes to local LFM (LEAP) or cloud providers based on active config.
 */

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

interface LlmDeltaEvent {
  request_id: string;
  delta: string;
}

interface LlmDoneEvent {
  request_id: string;
}

interface LlmErrorEvent {
  request_id: string;
  error: string;
}

const SYSTEM_PROMPT: LfmMessage = {
  role: "system",
  content: `You are ViBo Assistant, a private AI running locally via LFM. You help users organize notes, create tasks, and think through ideas. You are concise, helpful, and respect user privacy — all data stays on-device. If the user says "new note: <title>" or "new task: <title>", acknowledge it and confirm creation.`,
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
  if (provider === "local") {
    return getActiveLocalModel();
  }
  return DEFAULT_MODELS[provider];
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
  const found = CLOUD_PROVIDERS.find(p => p.id === provider);
  return found?.name || provider;
}

/**
 * Stream a chat completion from the configured provider.
 */
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
}) {
  if (signal?.aborted) {
    onDone();
    return;
  }

  const provider = getActiveProvider();
  const model = getModelForProvider(provider);
  const apiKeyName = API_KEY_NAMES[provider];

  const unlisteners: Array<() => void> = [];
  let requestId = "";
  let settled = false;

  const cleanup = () => {
    while (unlisteners.length > 0) {
      const unlisten = unlisteners.pop();
      unlisten?.();
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
  if (signal) {
    signal.addEventListener("abort", abortHandler);
  }

  try {
    unlisteners.push(
      await listen<LlmDeltaEvent>("llm-delta", (event) => {
        if (event.payload.request_id !== requestId || settled) return;
        if (event.payload.delta) {
          onDelta(event.payload.delta);
        }
      }),
    );

    unlisteners.push(
      await listen<LlmDoneEvent>("llm-done", (event) => {
        if (event.payload.request_id !== requestId || settled) return;
        settleDone();
      }),
    );

    unlisteners.push(
      await listen<LlmErrorEvent>("llm-error", (event) => {
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
  } catch (err) {
    settleError(err instanceof Error ? err.message : `Cannot reach ${getActiveProviderLabel()}. Is it running?`);
  }
}
