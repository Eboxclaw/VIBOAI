// src/lib/crypto.ts
// All crypto operations go via Rust commands.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface VaultStatus {
  is_locked: boolean;
  has_pin: boolean;
  biometric_enabled: boolean;
}

export interface EncryptedBlob {
  nonce: string;
  ciphertext: string;
}

const AGENT_NOTES_KEY = "zettel-agent-notes";

export async function cryptoStatus(): Promise<VaultStatus> {
  return invoke<VaultStatus>("crypto_status");
}

export async function setupPin(pin: string): Promise<void> {
  await invoke("crypto_set_pin", { pin });
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    await invoke("crypto_unlock", { pin });
    return true;
  } catch {
    return false;
  }
}

export async function lockCrypto(): Promise<void> {
  await invoke("crypto_lock");
}

export async function isPinSetup(): Promise<boolean> {
  const status = await cryptoStatus().catch(() => null);
  return Boolean(status?.has_pin);
}

export async function encryptData(data: string): Promise<string> {
  const blob = await invoke<EncryptedBlob>("crypto_encrypt_note", { content: data });
  return JSON.stringify(blob);
}

export async function decryptData(encryptedStr: string): Promise<string> {
  const blob = JSON.parse(encryptedStr) as EncryptedBlob;
  return invoke<string>("crypto_decrypt_note", { blob });
}

export function loadAgentNotes(): string {
  return localStorage.getItem(AGENT_NOTES_KEY) || "[]";
}

export function saveAgentNotes(data: string): void {
  localStorage.setItem(AGENT_NOTES_KEY, data);
}

export async function enableBiometric(enabled: boolean): Promise<void> {
  await invoke("crypto_enable_biometric", { enabled });
}

export async function unlockWithBiometric(keyBytes: number[]): Promise<VaultStatus> {
  return invoke<VaultStatus>("crypto_unlock_biometric", { keyBytes });
}

export async function keystoreSet(keyName: string, secret: string): Promise<void> {
  await invoke("keystore_set", { keyName, secret });
}

export async function keystoreHas(keyName: string): Promise<boolean> {
  return invoke<boolean>("keystore_has", { keyName });
}

export async function keystoreDelete(keyName: string): Promise<void> {
  await invoke("keystore_delete", { keyName });
}

export async function keystoreList(): Promise<string[]> {
  return invoke<string[]>("keystore_list");
}

export async function onVaultLocked(cb: () => void): Promise<() => void> {
  return listen("vault-locked", cb);
}
