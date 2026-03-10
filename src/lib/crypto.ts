type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export interface VaultStatus {
  is_locked: boolean;
  has_pin: boolean;
  biometric_enabled: boolean;
}

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

function mapCryptoError(error: unknown, command: string): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.toLowerCase();

  if (message.includes("wrong pin")) return "Incorrect PIN.";
  if (message.includes("no pin set")) return "No PIN is configured yet.";
  if (message.includes("vault is locked")) return "Vault is locked. Unlock with your PIN first.";
  if (message.includes("decryption failed")) return "Unable to decrypt note data.";
  if (message.includes("biometric")) return "Biometric unlock failed. Please use your PIN.";
  if (message.includes("invalid key length")) return "Biometric key was invalid.";

  if (command === "crypto_set_pin") return "Unable to set PIN. Please try again.";
  if (command === "crypto_unlock") return "Unable to unlock vault. Please try again.";
  if (command === "crypto_encrypt_note") return "Unable to encrypt note.";
  if (command === "crypto_decrypt_note") return "Unable to decrypt note.";

  return "A secure vault operation failed. Please try again.";
}

async function invokeCrypto<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasTauriRuntime()) {
    throw new Error("Secure vault operations require the Tauri runtime.");
  }

  try {
    const invoke = await getInvoke();
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(mapCryptoError(error, command));
  }
}

export async function setupPin(pin: string): Promise<void> {
  await invokeCrypto("crypto_set_pin", { pin });
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    await invokeCrypto<VaultStatus>("crypto_unlock", { pin });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Incorrect PIN.") {
      return false;
    }
    throw error;
  }
}

export async function isPinSetup(): Promise<boolean> {
  const status = await invokeCrypto<VaultStatus>("crypto_status");
  return status.has_pin;
}

export async function lockVault(): Promise<void> {
  await invokeCrypto("crypto_lock");
}

export async function vaultStatus(): Promise<VaultStatus> {
  return invokeCrypto<VaultStatus>("crypto_status");
}

export async function encryptData(data: string, _pin: string): Promise<string> {
  const encrypted = await invokeCrypto<EncryptedBlob>("crypto_encrypt_note", { content: data });
  return JSON.stringify(encrypted);
}

export async function decryptData(encryptedStr: string, _pin: string): Promise<string> {
  const blob = JSON.parse(encryptedStr) as EncryptedBlob;
  return invokeCrypto<string>("crypto_decrypt_note", { blob });
}

export function getEncryptedNotes(): string | null {
  return null;
}

export function saveEncryptedNotes(_encrypted: string): void {
  // Intentionally no-op: encrypted payloads are persisted in Rust only.
}

const AGENT_NOTES_KEY = "zettel-agent-notes";

export function loadAgentNotes(): string {
  return localStorage.getItem(AGENT_NOTES_KEY) || "[]";
}

export function saveAgentNotes(data: string): void {
  localStorage.setItem(AGENT_NOTES_KEY, data);
}

export async function enableBiometric(enabled: boolean): Promise<void> {
  await invokeCrypto("crypto_enable_biometric", { enabled });
}

export async function unlockWithBiometric(keyBytes: number[]): Promise<VaultStatus> {
  return invokeCrypto<VaultStatus>("crypto_unlock_biometric", { keyBytes });
}

export async function keystoreSet(keyName: string, secret: string): Promise<void> {
  await invokeCrypto("keystore_set", { keyName, secret });
}

export async function keystoreHas(keyName: string): Promise<boolean> {
  return invokeCrypto<boolean>("keystore_has", { keyName });
}

export async function keystoreDelete(keyName: string): Promise<void> {
  await invokeCrypto("keystore_delete", { keyName });
}

export async function keystoreList(): Promise<string[]> {
  return invokeCrypto<string[]>("keystore_list");
}
