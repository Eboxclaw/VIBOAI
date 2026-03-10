# ViBo — Codex Guide
> For AI coding assistants: read this before touching any file.

---

## What is ViBo

Cross-platform AI notebook app (Android, iOS, Desktop).
Tauri 2.0 shell — React/TSX frontend + Rust backend + Kotlin sidecar.
Privacy-first: all data local, API keys encrypted in Rust, Tor optional.

---

## Monorepo Structure

```
vibo/
├── src/                          # React/TSX frontend (Vite)
│   ├── components/               # UI components — DO NOT touch logic here
│   ├── lib/
│   │   ├── store.tsx             # ⚠️ NEEDS MIGRATION — localStorage → invoke()
│   │   ├── lfm.ts               # ⚠️ NEEDS MIGRATION — fetch+keys → Rust
│   │   ├── crypto.ts            # ⚠️ NEEDS MIGRATION — frontend AES → invoke()
│   │   ├── wiki-links.ts        # ✅ keep as-is — pure parsing
│   │   ├── models.ts            # ✅ keep as-is
│   │   └── types.ts             # ✅ keep as-is
│   └── main.tsx
│
├── src-tauri/
│   └── src/
│       ├── main.rs              # ✅ Entry point — registers all commands + states
│       ├── notes.rs             # ✅ Note CRUD, wikilinks, search, snapshots
│       ├── kanban.rs            # ✅ Boards, cards, subtasks, calendar sync
│       ├── storage.rs           # ✅ SQLite + sqlite-vec + SRI pipeline
│       ├── crypto.rs            # ✅ AES-256-GCM + Argon2id + keystore
│       ├── vault.rs             # ✅ Encrypted notes (depends on crypto.rs)
│       ├── graph.rs             # ✅ Knowledge graph edges + clusters
│       ├── providers.rs         # ✅ LFM/Ollama/Anthropic/OpenRouter streaming
│       ├── google.rs            # ✅ Calendar CRUD + Gmail read-only
│       ├── oauth.rs             # ✅ PKCE OAuth flow
│       └── training.rs          # ✅ QLoRA fine-tuning + compute scalers
│
└── src-android/
    └── app/src/main/kotlin/com/vibo/
        ├── ipc/
        │   └── TauriIpc.kt      # ✅ Kotlin → Rust bridge via WebView
        ├── plugins/
        │   ├── LeapPlugin.kt    # ✅ LFM2 on-device inference (Leap SDK)
        │   └── BiometricPlugin.kt # ✅ Android KeyStore vault unlock
        └── agent/
            ├── AgentService.kt  # ✅ Koog agent — wires all tools
            └── tools/
                ├── NoteTool.kt        # ✅ → notes.rs commands
                ├── KanbanTool.kt      # ✅ → kanban.rs commands
                ├── VaultCryptoTool.kt # ✅ → vault.rs + crypto.rs commands
                ├── GoogleTool.kt      # ✅ → google.rs commands
                └── ProviderTool.kt    # ✅ → providers.rs commands
```

---

## File Status

| File | Status | Action |
|------|--------|--------|
| `src/lib/store.tsx` | ⚠️ Needs migration | Replace localStorage/crypto with `invoke()` calls. Keep StoreProvider structure, Note/KanbanColumn/ViewMode types. Persistence moves to Rust vault.rs |
| `src/lib/lfm.ts` | ⚠️ Needs migration | Move API keys + fetch to Rust `providers.rs`. Frontend keeps provider router. Streaming switches from SSE callbacks to Tauri `listen('llm-delta')` events |
| `src/lib/crypto.ts` | ⚠️ Needs migration | Replace all frontend AES with `invoke('crypto_*')` calls. Keys must never be in frontend |
| `src/lib/wiki-links.ts` | ✅ Done | Pure MD parsing — no changes needed |
| `src-tauri/src/*.rs` | ✅ Done | All Rust modules complete |
| `src-android/**/*.kt` | ✅ Done | All Kotlin tools + plugins complete |

---

## Core Rules — read before every edit

### 1. API keys never in frontend
```typescript
// ❌ NEVER
const response = await fetch(url, { headers: { "Authorization": `Bearer ${apiKey}` } })

// ✅ ALWAYS
const response = await invoke('providers_stream', { provider, messages, requestId })
```

### 2. All external calls go via Rust
```
Frontend → invoke() → Rust → Google API / Cloud Provider / Tor
```
Kotlin tools also go via invoke() — never make HTTP calls from Kotlin directly.

### 3. Vault = encrypted notes only
```
notes/      → notes.rs    → plain .md files
vault/      → vault.rs    → encrypted .md files (requires unlock)
tasks/      → kanban.rs   → card .md files (hidden from notes UI)
boards/     → kanban.rs   → board .md files (Obsidian-compatible)
daily/      → notes.rs    → daily note .md files
```

### 4. No optional chaining or nullish coalescing in TSX
```typescript
// ❌ NEVER (breaks Tauri mobile webview)
const x = obj?.property
const y = value ?? fallback

// ✅ ALWAYS
const x = obj && obj.property
const y = value !== null && value !== undefined ? value : fallback
```

### 5. Streaming pattern
```typescript
// Frontend listens for events — never SSE from frontend
const unlisten = await listen('llm-delta', (event) => {
  onDelta(event.payload.delta)
})
await invoke('providers_stream', { provider, messages, requestId })
// cleanup
unlisten()
```

---

## Command Reference

### notes.rs — invoke names
```
note_create         note_read           note_write
note_patch          note_delete         note_move
note_rename         note_list           note_list_folder
note_search         note_search_tags    note_get_frontmatter
note_set_frontmatter note_get_links     note_get_backlinks
note_get_orphans    note_get_graph      note_daily_get
note_snapshot       note_restore        note_list_snapshots
note_stats
```

### kanban.rs — invoke names
```
kanban_create_board kanban_get_board    kanban_list_boards
kanban_add_column   kanban_create_card  kanban_get_card
kanban_update_card  kanban_move_card    kanban_complete_subtask
kanban_archive_card kanban_delete_card  kanban_create_from_calendar
kanban_get_due      kanban_get_overdue  kanban_get_by_event
kanban_search
```

### storage.rs — invoke names
```
storage_init                storage_index_note      storage_remove_note
storage_list_notes          storage_store_embeddings storage_semantic_search
storage_cache_lookup        storage_cache_store      storage_route_query
storage_add_routing_signal  storage_memory_set       storage_memory_get
storage_memory_recall       storage_store_distillation storage_list_distillations
storage_recall_distillations storage_sri_route       storage_stats
```

### crypto.rs — invoke names
```
crypto_set_pin          crypto_unlock           crypto_lock
crypto_status           crypto_enable_biometric crypto_unlock_biometric
crypto_encrypt_note     crypto_decrypt_note     keystore_set
keystore_has            keystore_delete         keystore_list
```
> `keystore_get_internal` — NOT in invoke_handler. Used only by providers.rs / oauth.rs internally.

### vault.rs — invoke names
```
vault_create    vault_read      vault_write
vault_delete    vault_list      vault_search
vault_snapshot  vault_restore   vault_count
```

### google.rs — invoke names
```
google_set_credentials  google_auth_start       google_auth_callback
google_auth_status      google_auth_revoke      google_calendar_list
google_calendar_events  google_calendar_today   google_calendar_create
google_calendar_update  google_calendar_delete  google_gmail_list
google_gmail_read       google_gmail_unread_count
```

### providers.rs — invoke names + events
```
providers_list      providers_tor_set   providers_tor_status
providers_stream    providers_complete

Events emitted by Rust:
  llm-delta   { requestId: string, delta: string }
  llm-done    { requestId: string, fullResponse: string }
  llm-error   { requestId: string, error: string }
```

### graph.rs — invoke names
```
graph_upsert_edge   graph_remove_note   graph_index_note
graph_add_semantic_edges graph_add_tag_edges graph_get_full
graph_get_local     graph_find_path     graph_get_orphans
graph_get_hubs      graph_get_stats     graph_get_cluster
```

---

## Vault Folder Layout on Disk

```
~/Documents/ViBo/           ← vault root (Obsidian-compatible)
├── .vibo/
│   ├── vibo.db             ← SQLite: notes_index, embeddings, semantic_cache,
│   │                                 routing_signals, agent_memory, distillations
│   └── keys.db             ← SQLite: pin_config, keystore (all encrypted)
├── .trash/                 ← deleted notes/cards (recoverable)
│   ├── tasks/
│   └── <note>.md
├── .snapshots/             ← note version history
├── notes/                  ← plain .md notes (notes.rs)
├── vault/                  ← encrypted .md notes (vault.rs)
├── tasks/                  ← kanban card .md files (hidden from notes UI)
├── boards/                 ← kanban board .md files (Obsidian Kanban compatible)
├── daily/                  ← daily notes YYYY-MM-DD.md
└── models/
    ├── lfm2-1.2b-q5_k_m.gguf   ← downloaded at onboarding
    └── adapters/                ← QLoRA adapters
```

---

## SRI Pipeline — how a user message is routed

```
User message
    │
    ▼
storage_sri_route(query, query_embedding, cloud_enabled)
    │
    ├── Step 1 ~1ms  → routing_signals (regex/keyword match)
    │                   returns: intent + action immediately
    │
    ├── Step 2 ~5ms  → semantic_cache (vector similarity ≥ 0.92)
    │                   returns: cached result instantly
    │
    └── Step 3 ~20ms → embeddings (sqlite-vec nearest neighbour)
                        returns: SriDecision {
                          intent, confidence, action,
                          matchedNotes, shouldEscalateCloud, canParallelize
                        }
                            │
                            ▼
                        AgentService.run(message, sriDecision)
                            │
                            ├── local LFM (LeapPlugin)    confidence ≥ 0.5
                            └── cloud provider (ProviderTool) confidence < 0.5
```

---

## Dependency Map

```
crypto.rs ◄── vault.rs
crypto.rs ◄── providers.rs (keystore_get_internal)
crypto.rs ◄── oauth.rs     (keystore_get_internal)
storage.rs ◄── notes.rs    (index on write)
storage.rs ◄── kanban.rs   (index on write)
oauth.rs  ◄── google.rs

BiometricPlugin.kt ──► crypto_unlock_biometric (invoke)
LeapPlugin.kt      ──► AgentService (model)
TauriIpc.kt        ──► all Tool.kt files
AgentService.kt    ──► storage_sri_route (invoke) + all tools
```

---

## What NOT to do

```
❌ Add API keys to any .ts or .tsx file
❌ Make fetch() calls to external APIs from frontend
❌ Use localStorage for anything (use invoke + Rust)
❌ Use optional chaining (?.) or nullish coalescing (??) in TSX
❌ Expose keystore_get_internal as a Tauri command
❌ Let Kotlin tools make HTTP calls directly
❌ Store vault master key outside Rust memory or Android KeyStore
❌ Add MCP server — not needed, Koog uses Local Tools + invoke()
❌ Show tasks/ folder in the notes UI
```
