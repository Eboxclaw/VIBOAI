# Rust File Migration Map

This document maps legacy root-level Rust artifacts to their new `src-tauri` module paths.

| Old filename | New path |
|---|---|
| `main.rs (1).txt` | `src-tauri/src/main.rs` |
| `notes-vibo.rs` | `src-tauri/src/notes.rs` |
| `kanban.rs` | `src-tauri/src/capabilities/kanban.rs` |
| `vault.rs.txt` | `src-tauri/src/capabilities/vault.rs` |
| `storage.rs.txt` | `src-tauri/src/core/storage.rs` |
| `crypto.rs.txt` | `src-tauri/src/core/crypto.rs` |
| `graph.rs.txt` | `src-tauri/src/graph.rs` |
| `providers.rs.txt` | `src-tauri/src/providers.rs` |
| `oauth-1.rs.txt` | `src-tauri/src/oauth.rs` |
| `google-1.rs.txt` | `src-tauri/src/google.rs` |
| `training.rs.txt` | `src-tauri/src/training.rs` |
| `Cargo.toml.txt` | `src-tauri/Cargo.toml` |

## Duplicate consolidation

The following duplicate-suffixed files were consolidated to deterministic module names:

- `oauth-1.rs.txt` → `oauth.rs`
- `google-1.rs.txt` → `google.rs`
