/**
 * Model Registry & Provider Configuration
 * Local LFM models + Cloud providers for deep reasoning
 */

// ── Local LFM Models (LEAP Edge SDK) ──────────────────────────

export interface LocalModel {
  id: string;
  name: string;
  family: string;
  params: string;
  modality: ("text" | "image" | "audio")[];
  description: string;
  recommended?: boolean;
  size_mb: number; // approximate download size
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: "lfm2.5-1.2b-instruct",
    name: "LFM 2.5 Instruct",
    family: "LFM 2.5",
    params: "1.2B",
    modality: ["text"],
    description: "General-purpose text model for on-device deployment. Fast and efficient.",
    recommended: true,
    size_mb: 720,
  },
  {
    id: "lfm2.5-1.2b-thinking",
    name: "LFM 2.5 Thinking",
    family: "LFM 2.5",
    params: "1.2B",
    modality: ["text"],
    description: "Excels at instruction following, tool-use, math, agentic tasks and RAG.",
    recommended: true,
    size_mb: 720,
  },
  {
    id: "lfm2.5-vl-1.6b",
    name: "LFM 2.5 Vision",
    family: "LFM 2.5",
    params: "1.6B",
    modality: ["text", "image"],
    description: "Vision-language model for on-device image understanding and text generation.",
    size_mb: 960,
  },
  {
    id: "lfm2.5-audio-1.5b",
    name: "LFM 2.5 Audio",
    family: "LFM 2.5",
    params: "1.5B",
    modality: ["text", "audio"],
    description: "End-to-end speech + text model for real-time low-latency conversation.",
    size_mb: 900,
  },
  {
    id: "lfm2.5-1.2b-jp",
    name: "LFM 2.5 Japanese",
    family: "LFM 2.5",
    params: "1.2B",
    modality: ["text"],
    description: "Optimized for Japanese language — cultural and linguistic nuance.",
    size_mb: 720,
  },
];

// ── Cloud Providers ───────────────────────────────────────────

export type CloudProviderType = "ollama" | "openrouter" | "anthropic" | "kimi" | "minimax";

export interface CloudProvider {
  id: CloudProviderType;
  name: string;
  type: "host" | "apikey";
  placeholder: string;
  description: string;
  baseUrl?: string; // for API key providers, the fixed API base
}

export const CLOUD_PROVIDERS: CloudProvider[] = [
  {
    id: "ollama",
    name: "Ollama",
    type: "host",
    placeholder: "http://localhost:11434",
    description: "Run cloud-class models locally via Ollama. Set your host URL.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "apikey",
    placeholder: "sk-or-...",
    description: "Access 200+ models via OpenRouter API.",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "apikey",
    placeholder: "sk-ant-...",
    description: "Claude models for deep reasoning and analysis.",
    baseUrl: "https://api.anthropic.com/v1",
  },
  {
    id: "kimi",
    name: "Kimi",
    type: "apikey",
    placeholder: "sk-...",
    description: "Moonshot AI's Kimi for long-context reasoning.",
    baseUrl: "https://api.moonshot.cn/v1",
  },
  {
    id: "minimax",
    name: "MiniMax",
    type: "apikey",
    placeholder: "eyJ...",
    description: "MiniMax models for multi-modal generation.",
    baseUrl: "https://api.minimax.chat/v1",
  },
];

// ── Persistence ───────────────────────────────────────────────

const STORAGE_KEYS = {
  activeLocalModel: "vibo-active-local-model",
  downloadedModels: "vibo-downloaded-models",
  cloudKeys: "vibo-cloud-keys",
  activeProvider: "vibo-active-provider", // "local" | CloudProviderType
  lfmEndpoint: "vibo-lfm-endpoint",
} as const;

export function getActiveLocalModel(): string {
  return localStorage.getItem(STORAGE_KEYS.activeLocalModel) || "lfm2.5-1.2b-instruct";
}
export function setActiveLocalModel(id: string) {
  localStorage.setItem(STORAGE_KEYS.activeLocalModel, id);
}

export function getDownloadedModels(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.downloadedModels) || "[]");
  } catch { return []; }
}
export function addDownloadedModel(id: string) {
  const models = getDownloadedModels();
  if (!models.includes(id)) {
    models.push(id);
    localStorage.setItem(STORAGE_KEYS.downloadedModels, JSON.stringify(models));
  }
}
export function removeDownloadedModel(id: string) {
  const models = getDownloadedModels().filter(m => m !== id);
  localStorage.setItem(STORAGE_KEYS.downloadedModels, JSON.stringify(models));
}

export function getCloudKeys(): Record<CloudProviderType, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.cloudKeys) || "{}") as any;
  } catch { return {} as any; }
}
export function setCloudKey(provider: CloudProviderType, value: string) {
  const keys = getCloudKeys();
  keys[provider] = value;
  localStorage.setItem(STORAGE_KEYS.cloudKeys, JSON.stringify(keys));
}

export type ActiveProvider = "local" | CloudProviderType;
export function getActiveProvider(): ActiveProvider {
  return (localStorage.getItem(STORAGE_KEYS.activeProvider) || "local") as ActiveProvider;
}
export function setActiveProvider(p: ActiveProvider) {
  localStorage.setItem(STORAGE_KEYS.activeProvider, p);
}

export function getLfmEndpoint(): string {
  return localStorage.getItem(STORAGE_KEYS.lfmEndpoint) || "";
}
export function setLfmEndpoint(url: string) {
  localStorage.setItem(STORAGE_KEYS.lfmEndpoint, url);
}
