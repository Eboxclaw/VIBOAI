/**
 * LFM Unified Chat Client
 * Routes to local LFM (LEAP) or cloud providers based on active config.
 */

import {
  getActiveProvider,
  getActiveLocalModel,
  getCloudKeys,
  CLOUD_PROVIDERS,
  getDownloadedModels,
  type ActiveProvider,
} from "@/lib/models";

export interface LfmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT: LfmMessage = {
  role: "system",
  content: `You are ViBo Assistant, a private AI running locally via LFM. You help users organize notes, create tasks, and think through ideas. You are concise, helpful, and respect user privacy — all data stays on-device. If the user says "new note: <title>" or "new task: <title>", acknowledge it and confirm creation.`,
};

export function isLfmConfigured(): boolean {
  const provider = getActiveProvider();
  if (provider === "local") {
    return getDownloadedModels().length > 0;
  }
  const keys = getCloudKeys();
  return !!keys[provider];
}

export function getActiveProviderLabel(): string {
  const provider = getActiveProvider();
  if (provider === "local") return "LFM Local";
  const found = CLOUD_PROVIDERS.find(p => p.id === provider);
  return found?.name || provider;
}

type ProviderKind = "leap" | "ollama" | "anthropic" | "open_router" | "kimi" | "minimax";

type StreamDeltaPayload = { requestId: string; delta: string };
type StreamDonePayload = { requestId: string };
type StreamErrorPayload = { requestId: string; error: string };

const DEFAULT_MODELS: Record<ActiveProvider, string> = {
  local: "lfm2.5-1.2b-instruct",
  ollama: "llama3",
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "meta-llama/llama-3.1-8b-instruct",
  kimi: "moonshot-v1-8k",
  minimax: "abab6.5s-chat",
};

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function providerToKind(provider: ActiveProvider): ProviderKind {
  if (provider === "local") return "leap";
  if (provider === "openrouter") return "open_router";
  return provider;
}

function providerApiKeyName(provider: ActiveProvider): string | null {
  if (provider === "local" || provider === "ollama") return null;
  return `${provider}_api_key`;
}

function getProviderModel(provider: ActiveProvider): string {
  if (provider === "local") return getActiveLocalModel();
  return DEFAULT_MODELS[provider];
}

function normalizeRequestId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const maybePayload = payload as { request_id?: unknown; requestId?: unknown };
  if (typeof maybePayload.requestId === "string") return maybePayload.requestId;
  if (typeof maybePayload.request_id === "string") return maybePayload.request_id;
  return "";
}

async function subscribeStreamEvents(
  requestId: string,
  handlers: {
    onDelta: (payload: StreamDeltaPayload) => void;
    onDone: (payload: StreamDonePayload) => void;
    onError: (payload: StreamErrorPayload) => void;
  },
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlistenFns = await Promise.all([
    listen("llm-delta", (event) => {
      const id = normalizeRequestId(event.payload);
      if (id !== requestId) return;
      const delta = typeof (event.payload as { delta?: unknown })?.delta === "string"
        ? (event.payload as { delta: string }).delta
        : "";
      handlers.onDelta({ requestId: id, delta });
    }),
    listen("llm-done", (event) => {
      const id = normalizeRequestId(event.payload);
      if (id !== requestId) return;
      handlers.onDone({ requestId: id });
    }),
    listen("llm-error", (event) => {
      const id = normalizeRequestId(event.payload);
      if (id !== requestId) return;
      const error = typeof (event.payload as { error?: unknown })?.error === "string"
        ? (event.payload as { error: string }).error
        : "Unknown streaming error";
      handlers.onError({ requestId: id, error });
    }),
  ]);

  return () => {
    for (const unlisten of unlistenFns) {
      unlisten();
    }
  };
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
  const provider = getActiveProvider();

  if (!hasTauriRuntime()) {
    onError("Tauri runtime not available.");
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    const request = {
      provider: providerToKind(provider),
      model: getProviderModel(provider),
      messages,
      system: SYSTEM_PROMPT.content,
      max_tokens: 1024,
      temperature: 0.7,
      api_key_name: providerApiKeyName(provider),
    };

    const requestId = await invoke<string>("providers_stream", { request });

    let finished = false;
    let cleanup = () => {};

    const finalize = (cb: () => void) => {
      if (finished) return;
      finished = true;
      cleanup();
      cb();
    };

    cleanup = await subscribeStreamEvents(requestId, {
      onDelta: ({ delta }) => {
        if (finished || !delta) return;
        onDelta(delta);
      },
      onDone: () => finalize(onDone),
      onError: ({ error }) => finalize(() => onError(error || `Cannot reach ${getActiveProviderLabel()}.`)),
    });

    if (signal) {
      const abortHandler = () => finalize(onDone);
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener("abort", abortHandler, { once: true });
        const previousCleanup = cleanup;
        cleanup = () => {
          signal.removeEventListener("abort", abortHandler);
          previousCleanup();
        };
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      onDone();
      return;
    }
    onError(`Cannot reach ${getActiveProviderLabel()}. Is it running?`);
  }
}
