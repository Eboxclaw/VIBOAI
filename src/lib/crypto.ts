// AES-GCM encryption using Web Crypto API with PBKDF2 key derivation from PIN

const SALT_KEY = "zettel-crypto-salt";
const PIN_HASH_KEY = "zettel-pin-hash";
const PIN_VERIFIER_META_KEY = "zettel-pin-verifier-meta";
const PIN_VERIFIER_SALT_KEY = "zettel-pin-verifier-salt";
const ENCRYPTED_DATA_KEY = "zettel-encrypted-notes";

type PinVerifierMeta = {
  version: 1;
  kdf: "pbkdf2";
  iterations: number;
  digest: "SHA-256";
  derivedBits: number;
  verifier: string;
  saltKey: typeof PIN_VERIFIER_SALT_KEY;
};

function getOrCreateSalt(): Uint8Array {
  const stored = localStorage.getItem(SALT_KEY);
  if (stored) return new Uint8Array(JSON.parse(stored));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, JSON.stringify(Array.from(salt)));
  return salt;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(pin);
  const keyMaterial = await crypto.subtle.importKey(
    "raw", rawKey.buffer as ArrayBuffer, "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(pin + "zettel-verify"));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isPinVerifierMeta(value: unknown): value is PinVerifierMeta {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PinVerifierMeta>;
  return (
    candidate.version === 1 &&
    candidate.kdf === "pbkdf2" &&
    typeof candidate.iterations === "number" &&
    candidate.digest === "SHA-256" &&
    typeof candidate.derivedBits === "number" &&
    typeof candidate.verifier === "string" &&
    candidate.saltKey === PIN_VERIFIER_SALT_KEY
  );
}

async function derivePinVerifier(pin: string, salt: Uint8Array, iterations: number, digest: "SHA-256", derivedBits: number): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: digest },
    keyMaterial,
    derivedBits
  );
  return Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getVerifierSalt(meta: PinVerifierMeta): Uint8Array | null {
  const storedSalt = localStorage.getItem(meta.saltKey);
  if (!storedSalt) {
    return null;
  }

  try {
    return new Uint8Array(JSON.parse(storedSalt));
  } catch {
    return null;
  }
}

export async function setupPin(pin: string): Promise<void> {
  const verifierSalt = crypto.getRandomValues(new Uint8Array(16));
  const meta: PinVerifierMeta = {
    version: 1,
    kdf: "pbkdf2",
    iterations: 210000,
    digest: "SHA-256",
    derivedBits: 256,
    verifier: await derivePinVerifier(pin, verifierSalt, 210000, "SHA-256", 256),
    saltKey: PIN_VERIFIER_SALT_KEY,
  };

  localStorage.setItem(PIN_VERIFIER_SALT_KEY, JSON.stringify(Array.from(verifierSalt)));
  localStorage.setItem(PIN_VERIFIER_META_KEY, JSON.stringify(meta));
  localStorage.removeItem(PIN_HASH_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedMeta = localStorage.getItem(PIN_VERIFIER_META_KEY);
  if (storedMeta) {
    try {
      const parsed = JSON.parse(storedMeta);
      if (isPinVerifierMeta(parsed)) {
        const salt = getVerifierSalt(parsed);
        if (!salt) {
          return false;
        }

        const derivedVerifier = await derivePinVerifier(pin, salt, parsed.iterations, parsed.digest, parsed.derivedBits);
        return derivedVerifier === parsed.verifier;
      }
    } catch {
      // Fallback to legacy verifier format if metadata is malformed.
    }
  }

  const legacyHash = localStorage.getItem(PIN_HASH_KEY);
  if (!legacyHash) {
    return false;
  }

  const legacyDerived = await hashPin(pin);
  const isLegacyValid = legacyDerived === legacyHash;
  if (isLegacyValid) {
    await setupPin(pin);
  }
  return isLegacyValid;
}

export function isPinSetup(): boolean {
  return !!localStorage.getItem(PIN_VERIFIER_META_KEY) || !!localStorage.getItem(PIN_HASH_KEY);
}

export async function encryptData(data: string, pin: string): Promise<string> {
  const salt = getOrCreateSalt();
  const key = await deriveKey(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(data)
  );
  const payload = {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
  return JSON.stringify(payload);
}

export async function decryptData(encryptedStr: string, pin: string): Promise<string> {
  const salt = getOrCreateSalt();
  const key = await deriveKey(pin, salt);
  const { iv, data } = JSON.parse(encryptedStr);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(data)
  );
  return new TextDecoder().decode(decrypted);
}

export function getEncryptedNotes(): string | null {
  return localStorage.getItem(ENCRYPTED_DATA_KEY);
}

export function saveEncryptedNotes(encrypted: string): void {
  localStorage.setItem(ENCRYPTED_DATA_KEY, encrypted);
}

// Agent notes are stored separately, unencrypted (agents always have access)
const AGENT_NOTES_KEY = "zettel-agent-notes";

export function loadAgentNotes(): string {
  return localStorage.getItem(AGENT_NOTES_KEY) || "[]";
}

export function saveAgentNotes(data: string): void {
  localStorage.setItem(AGENT_NOTES_KEY, data);
}
