// src/lib/crypto.ts
// All crypto operations go via Rust crypto.rs — no frontend AES.
// Keys never touch the frontend. PIN never stored in JS.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface CryptoStatus {
  is_locked: boolean;
  has_pin: boolean;
  biometric_enabled: boolean;
}

export async function cryptoStatus(): Promise<CryptoStatus> {
  return invoke<CryptoStatus>("crypto_status");
}

export async function cryptoSetPin(pin: string): Promise<void> {
  await invoke("crypto_set_pin", { pin });
}

export async function cryptoUnlock(pin: string): Promise<boolean> {
  try {
    await invoke("crypto_unlock", { pin });
    return true;
  } catch {
    return false;
  }
}

export async function cryptoLock(): Promise<void> {
  await invoke("crypto_lock");
}

export async function cryptoEnableBiometric(enabled: boolean): Promise<void> {
  await invoke("crypto_enable_biometric", { enabled });
}

export async function unlockWithBiometric(keyBytes: number[]): Promise<CryptoStatus> {
  return invoke<CryptoStatus>("crypto_unlock_biometric", { keyBytes });
}

export async function vaultCreate(id: string, content: string): Promise<void> {
  await invoke("vault_create", { id, content });
}

export async function vaultRead(id: string): Promise<string> {
  return invoke<string>("vault_read", { id });
}

export async function vaultWrite(id: string, content: string): Promise<void> {
  await invoke("vault_write", { id, content });
}

export async function vaultDelete(id: string): Promise<void> {
  await invoke("vault_delete", { id });
}

export async function vaultList(): Promise<string[]> {
  return invoke<string[]>("vault_list");
}

export async function vaultSearch(query: string): Promise<string[]> {
  return invoke<string[]>("vault_search", { query });
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

// Backward-compatible aliases used by existing components
export const setupPin = cryptoSetPin;
export const verifyPin = cryptoUnlock;
export const lockCrypto = cryptoLock;
export const enableBiometric = cryptoEnableBiometric;

export async function isPinSetup(): Promise<boolean> {
  const status = await cryptoStatus().catch(() => null);
  return Boolean(status?.has_pin);
}
