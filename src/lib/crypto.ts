type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

type VaultStatus = {
  is_locked: boolean;
  has_pin: boolean;
  biometric_enabled: boolean;
};

type EncryptedBlob = {
  nonce: string;
  ciphertext: string;
};

const hasTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let invokeFnPromise: Promise<InvokeFn> | null = null;

async function getInvoke(): Promise<InvokeFn> {
  if (!invokeFnPromise) {
    invokeFnPromise = import("@tauri-apps/api/core").then((mod) => mod.invoke as InvokeFn);
  }

  return invokeFnPromise;
}

async function invokeCrypto<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasTauriRuntime()) {
    throw new Error(`Tauri runtime unavailable for ${cmd}`);
  }

  const invoke = await getInvoke();
  return invoke<T>(cmd, args);
}

export async function setupPin(pin: string): Promise<void> {
  await invokeCrypto("crypto_set_pin", { pin });
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    await invokeCrypto<VaultStatus>("crypto_unlock", { pin });
    return true;
  } catch {
    return false;
  }
}

export async function lockCrypto(): Promise<void> {
  await invokeCrypto("crypto_lock");
}

export async function cryptoStatus(): Promise<VaultStatus> {
  return invokeCrypto<VaultStatus>("crypto_status");
}

export async function isPinSetup(): Promise<boolean> {
  try {
    const status = await cryptoStatus();
    return status.has_pin;
  } catch {
    return false;
  }
}

export async function encryptData(data: string, _pin?: string): Promise<string> {
  const blob = await invokeCrypto<EncryptedBlob>("crypto_encrypt_note", { content: data });
  return JSON.stringify(blob);
}

export async function decryptData(encryptedStr: string, _pin?: string): Promise<string> {
  const blob = JSON.parse(encryptedStr) as EncryptedBlob;
  return invokeCrypto<string>("crypto_decrypt_note", { blob });
}

// Legacy compatibility: note blobs are now managed by Rust capabilities.
export function getEncryptedNotes(): string | null {
  return null;
}

// Legacy compatibility: note blobs are now managed by Rust capabilities.
export function saveEncryptedNotes(_encrypted: string): void {
  // no-op
}

const AGENT_NOTES_KEY = "zettel-agent-notes";

export function loadAgentNotes(): string {
  return localStorage.getItem(AGENT_NOTES_KEY) || "[]";
}

export function saveAgentNotes(data: string): void {
  localStorage.setItem(AGENT_NOTES_KEY, data);
}
