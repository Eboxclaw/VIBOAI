/// crypto.rs — ViBo Encryption Layer
///
/// Encryption: AES-256-GCM (authenticated)
/// KDF:        Argon2id (PIN → 32-byte key)
/// Biometrics: Android KeyStore unwraps key → passed to crypto_unlock_biometric
/// Keystore:   Encrypted SQLite at .vibo/keys.db
///
/// PIN unlock flow:
///   crypto_set_pin(pin) → Argon2id(pin+salt) → master_key in memory
///   crypto_unlock(pin)  → same derivation → verify against stored blob → key in memory
///   crypto_lock()       → wipes key from memory
///
/// API key flow:
///   keystore_set("anthropic", key) → AES(key, master_key) → stored in keys.db
///   keystore_get_internal(...)     → decrypts → used ONLY inside Rust (providers.rs, oauth.rs)
///   Frontend never receives a secret value

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use aes_gcm::aead::rand_core::RngCore;
use argon2::Argon2;
use argon2::password_hash::SaltString;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use tauri::State;
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EncryptedBlob {
    pub nonce: String,       // base64 — 12 bytes
    pub ciphertext: String,  // base64 — encrypted + GCM tag
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultStatus {
    pub is_locked: bool,
    pub has_pin: bool,
    pub biometric_enabled: bool,
}

pub struct CryptoState {
    pub vault_path: PathBuf,
    pub master_key: std::sync::Mutex<Option<[u8; 32]>>,
}

// ─────────────────────────────────────────
// AES-256-GCM
// ─────────────────────────────────────────

fn aes_encrypt(plaintext: &[u8], key: &[u8; 32]) -> Result<EncryptedBlob, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext)
        .map_err(|e| format!("Encrypt failed: {}", e))?;
    Ok(EncryptedBlob {
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    })
}

fn aes_decrypt(blob: &EncryptedBlob, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce_bytes = B64.decode(&blob.nonce).map_err(|e| e.to_string())?;
    let ciphertext  = B64.decode(&blob.ciphertext).map_err(|e| e.to_string())?;
    cipher.decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
        .map_err(|_| "Decryption failed — wrong key or corrupted data".to_string())
}

// ─────────────────────────────────────────
// ARGON2id KEY DERIVATION
// ─────────────────────────────────────────

fn derive_key(pin: &str, salt: &SaltString) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(pin.as_bytes(), salt.as_str().as_bytes(), &mut key)
        .map_err(|e| format!("KDF failed: {}", e))?;
    Ok(key)
}

// ─────────────────────────────────────────
// KEYSTORE DB
// ─────────────────────────────────────────

fn keys_db_path(vault_path: &Path) -> PathBuf {
    vault_path.join(".vibo").join("keys.db")
}

fn open_keys_db(vault_path: &Path) -> Result<Connection, String> {
    let path = keys_db_path(vault_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute_batch(r#"
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS pin_config (
            id           INTEGER PRIMARY KEY CHECK (id = 1),
            salt         TEXT NOT NULL,
            verify_blob  TEXT NOT NULL,
            biometric    INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS keystore (
            key_name     TEXT PRIMARY KEY,
            nonce        TEXT NOT NULL,
            ciphertext   TEXT NOT NULL,
            created_at   TEXT NOT NULL
        );
    "#).map_err(|e| e.to_string())?;
    Ok(conn)
}

// ─────────────────────────────────────────
// PIN + VAULT LOCK / UNLOCK
// ─────────────────────────────────────────

#[tauri::command]
pub fn crypto_set_pin(
    state: State<CryptoState>,
    pin: String,
) -> Result<(), String> {
    let salt = SaltString::generate(&mut OsRng);
    let key  = derive_key(&pin, &salt)?;

    // Store verification blob so we can check the PIN on future unlocks
    let verify_blob = aes_encrypt(b"VIBO_VERIFY_OK", &key)?;
    let verify_json = serde_json::to_string(&verify_blob).map_err(|e| e.to_string())?;

    let conn = open_keys_db(&state.vault_path)?;
    conn.execute(
        "INSERT INTO pin_config (id, salt, verify_blob, biometric) VALUES (1,?1,?2,0)
         ON CONFLICT(id) DO UPDATE SET salt=excluded.salt, verify_blob=excluded.verify_blob",
        params![salt.as_str(), verify_json],
    ).map_err(|e| e.to_string())?;

    let mut master = state.master_key.lock().map_err(|e| e.to_string())?;
    *master = Some(key);
    Ok(())
}

#[tauri::command]
pub fn crypto_unlock(
    state: State<CryptoState>,
    pin: String,
) -> Result<VaultStatus, String> {
    let conn = open_keys_db(&state.vault_path)?;
    let (salt_str, verify_json, biometric): (String, String, i32) = conn.query_row(
        "SELECT salt, verify_blob, biometric FROM pin_config WHERE id = 1",
        [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "No PIN set — call crypto_set_pin first".to_string())?;

    let salt = SaltString::from_b64(&salt_str)
        .map_err(|e| format!("Invalid salt: {}", e))?;
    let key = derive_key(&pin, &salt)?;

    let verify_blob: EncryptedBlob = serde_json::from_str(&verify_json)
        .map_err(|e| e.to_string())?;
    aes_decrypt(&verify_blob, &key)
        .map_err(|_| "Wrong PIN".to_string())?;

    let mut master = state.master_key.lock().map_err(|e| e.to_string())?;
    *master = Some(key);

    Ok(VaultStatus { is_locked: false, has_pin: true, biometric_enabled: biometric == 1 })
}

#[tauri::command]
pub fn crypto_lock(state: State<CryptoState>) -> Result<(), String> {
    let mut master = state.master_key.lock().map_err(|e| e.to_string())?;
    *master = None;
    Ok(())
}

#[tauri::command]
pub fn crypto_status(state: State<CryptoState>) -> Result<VaultStatus, String> {
    let master  = state.master_key.lock().map_err(|e| e.to_string())?;
    let locked  = master.is_none();
    drop(master);
    let conn = open_keys_db(&state.vault_path)?;
    match conn.query_row(
        "SELECT biometric FROM pin_config WHERE id = 1",
        [], |row| row.get::<_, i32>(0),
    ) {
        Ok(bio) => Ok(VaultStatus { is_locked: locked, has_pin: true, biometric_enabled: bio == 1 }),
        Err(_)  => Ok(VaultStatus { is_locked: true,   has_pin: false, biometric_enabled: false }),
    }
}

#[tauri::command]
pub fn crypto_enable_biometric(
    state: State<CryptoState>,
    enabled: bool,
) -> Result<(), String> {
    open_keys_db(&state.vault_path)?
        .execute(
            "UPDATE pin_config SET biometric = ?1 WHERE id = 1",
            params![enabled as i32],
        ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Called by BiometricPlugin.kt after successful Android KeyStore auth.
/// Kotlin passes the unwrapped 32-byte key — we verify and hold in memory.
#[tauri::command]
pub fn crypto_unlock_biometric(
    state: State<CryptoState>,
    key_bytes: Vec<u8>,
) -> Result<VaultStatus, String> {
    if key_bytes.len() != 32 {
        return Err("Invalid key length from biometric".to_string());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);

    let conn = open_keys_db(&state.vault_path)?;
    let verify_json: String = conn.query_row(
        "SELECT verify_blob FROM pin_config WHERE id = 1",
        [], |row| row.get(0),
    ).map_err(|_| "No PIN config found".to_string())?;

    let verify_blob: EncryptedBlob = serde_json::from_str(&verify_json)
        .map_err(|e| e.to_string())?;
    aes_decrypt(&verify_blob, &key)
        .map_err(|_| "Biometric key verification failed".to_string())?;

    let mut master = state.master_key.lock().map_err(|e| e.to_string())?;
    *master = Some(key);
    Ok(VaultStatus { is_locked: false, has_pin: true, biometric_enabled: true })
}

// ─────────────────────────────────────────
// NOTE ENCRYPTION
// ─────────────────────────────────────────

#[tauri::command]
pub fn crypto_encrypt_note(
    state: State<CryptoState>,
    content: String,
) -> Result<EncryptedBlob, String> {
    let master = state.master_key.lock().map_err(|e| e.to_string())?;
    let key = master.as_ref().ok_or("Vault is locked")?;
    aes_encrypt(content.as_bytes(), key)
}

#[tauri::command]
pub fn crypto_decrypt_note(
    state: State<CryptoState>,
    blob: EncryptedBlob,
) -> Result<String, String> {
    let master = state.master_key.lock().map_err(|e| e.to_string())?;
    let key = master.as_ref().ok_or("Vault is locked")?;
    String::from_utf8(aes_decrypt(&blob, key)?).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────
// KEYSTORE — API keys, OAuth tokens
// ─────────────────────────────────────────

/// Store a secret — encrypted at rest, never returned to frontend
#[tauri::command]
pub fn keystore_set(
    state: State<CryptoState>,
    key_name: String,
    secret: String,
) -> Result<(), String> {
    let master = state.master_key.lock().map_err(|e| e.to_string())?;
    let key = master.as_ref().ok_or("Vault is locked")?;
    let blob = aes_encrypt(secret.as_bytes(), key)?;
    drop(master);

    open_keys_db(&state.vault_path)?.execute(
        "INSERT INTO keystore (key_name, nonce, ciphertext, created_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(key_name) DO UPDATE SET
           nonce=excluded.nonce, ciphertext=excluded.ciphertext, created_at=excluded.created_at",
        params![key_name, blob.nonce, blob.ciphertext],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Internal only — used by providers.rs and oauth.rs, NOT in invoke_handler
pub fn keystore_get_internal(
    vault_path: &Path,
    key_name: &str,
    master_key: &[u8; 32],
) -> Result<String, String> {
    let conn = open_keys_db(vault_path)?;
    let (nonce, ciphertext): (String, String) = conn.query_row(
        "SELECT nonce, ciphertext FROM keystore WHERE key_name = ?1",
        params![key_name],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| format!("Key not found: {}", key_name))?;

    String::from_utf8(
        aes_decrypt(&EncryptedBlob { nonce, ciphertext }, master_key)?
    ).map_err(|e| e.to_string())
}

/// Returns bool only — safe to expose to frontend
#[tauri::command]
pub fn keystore_has(
    state: State<CryptoState>,
    key_name: String,
) -> Result<bool, String> {
    let count: i32 = open_keys_db(&state.vault_path)?.query_row(
        "SELECT COUNT(*) FROM keystore WHERE key_name = ?1",
        params![key_name],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[tauri::command]
pub fn keystore_delete(
    state: State<CryptoState>,
    key_name: String,
) -> Result<(), String> {
    open_keys_db(&state.vault_path)?
        .execute("DELETE FROM keystore WHERE key_name = ?1", params![key_name])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns key names only — never values
#[tauri::command]
pub fn keystore_list(state: State<CryptoState>) -> Result<Vec<String>, String> {
    let conn = open_keys_db(&state.vault_path)?;
    let mut stmt = conn.prepare("SELECT key_name FROM keystore ORDER BY key_name")
        .map_err(|e| e.to_string())?;
    Ok(stmt.query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect())
}

// ─────────────────────────────────────────
// REGISTER in main.rs:
//
// .manage(CryptoState {
//     vault_path: vault_path.clone(),
//     master_key: std::sync::Mutex::new(None),
// })
//
// .invoke_handler(tauri::generate_handler![
//     crypto::crypto_set_pin,
//     crypto::crypto_unlock,
//     crypto::crypto_lock,
//     crypto::crypto_status,
//     crypto::crypto_enable_biometric,
//     crypto::crypto_unlock_biometric,
//     crypto::crypto_encrypt_note,
//     crypto::crypto_decrypt_note,
//     crypto::keystore_set,
//     crypto::keystore_has,
//     crypto::keystore_delete,
//     crypto::keystore_list,
//     // keystore_get_internal → NOT exposed, used internally by providers.rs / oauth.rs
// ])
// ─────────────────────────────────────────
