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
  return found && found.name ? found.name : provider;
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

  if (provider === "anthropic") {
    return {
      url: `${providerConfig && providerConfig.baseUrl ? providerConfig.baseUrl : ""}/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": keys.anthropic || "",
        "anthropic-version": "2023-06-01",
      },
    };
  }

  // OpenRouter, Kimi, MiniMax — all OpenAI-compatible
  return {
    url: `${providerConfig && providerConfig.baseUrl ? providerConfig.baseUrl : ""}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${keys[provider] || ""}`,
    },
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

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          // Handle both OpenAI and Anthropic streaming formats
          const choices = parsed && parsed.choices;
          const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
          const delta = firstChoice && firstChoice.delta ? firstChoice.delta : undefined;
          const deltaContent = delta && delta.content ? delta.content : "";
          const parsedDelta = parsed && parsed.delta ? parsed.delta : undefined;
          const deltaText = parsedDelta && parsedDelta.text ? parsedDelta.text : "";
          const content = deltaContent || deltaText || "";
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
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
