# ViBo — Project Roadmap & Architecture
_Last updated: March 2026_

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  React TSX Frontend (ViBo UI — already built)   │
│  NoteEditor · KanbanView · Graph · AgentsView   │
└──────────────────┬──────────────────────────────┘
                   │ invoke() / listen()  [Tauri IPC]
┌──────────────────▼──────────────────────────────┐
│  Rust Core  ←── SINGLE point of exit to outside │
│  notes.rs     kanban.rs    storage.rs            │
│  vault.rs     crypto.rs    graph.rs              │
│  providers.rs google.rs    oauth.rs              │
│  training.rs  main.rs                            │
└──────────────────┬──────────────────────────────┘
                   │ IPC
┌──────────────────▼──────────────────────────────┐
│  Kotlin Sidecar (KMP — Android / iOS / JVM)     │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  Koog Agent      │  │  Leap SDK (LFM2)     │ │
│  │  (orchestration) │  │  on-device inference │ │
│  └──────┬───────────┘  └──────────────────────┘ │
│         │ Local Tools (invoke → Rust)            │
│  NoteTool  KanbanTool  VaultCryptoTool           │
│  GoogleTool  ProviderTool  AgentService          │
└─────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────┐
│  Native Plugins                                 │
│  EmbeddingPlugin.kt  (ONNX · all-MiniLM · 384d)│
│  BiometricPlugin.kt  (Android KeyStore)         │
│  LeapPlugin.kt       (LFM2 on-device streaming) │
│  LeapPlugin.swift    (iOS — deferred)           │
└─────────────────────────────────────────────────┘
```

### Key Architecture Rules
- **Koog never makes network calls directly** — all external calls go via Rust
- **API keys never leave Rust** — encrypted in SQLite via AES-256-GCM + Argon2id
- **Tor is transparent** — Rust routes cloud calls through SOCKS5 proxy, agents are unaware
- **MCP Server: not needed** — Koog uses Local Tools (invoke()) for all in-app actions
- **MCP Client: not needed at launch** — Google goes via Rust directly, not Google MCP server
- **Future MCPs** — add per service: if has API key → Local Tool → Rust; if public/no auth → direct MCP in Koog

---

## SRI — Semantic Routing Intelligence

User message triggers 3-step pipeline before any LLM token is spent:

```
1. routing_signals   regex/keyword match         ~1ms
2. semantic_cache    vector similarity ≥92%       ~5ms   → instant answer if hit
3. embeddings        sqlite-vec cosine search     ~20ms  → find relevant notes
→ SriDecision: { action, confidence, can_parallelize, should_escalate_cloud }
→ Koog receives enriched context + intent before processing
```

Embedding model: **all-MiniLM-L6-v2** — 22MB, bundled, 384 dimensions, runs on CPU, zero download.

---

## File Structure

```
vibo/
├── src/                          # React TSX (existing)
│   ├── components/               # ✅ All UI done
│   ├── lib/
│   │   ├── store.tsx             ✅ MIGRATED — invoke() replaces localStorage
│   │   ├── lfm.ts                ✅ MIGRATED — Rust handles fetch + keys
│   │   ├── crypto.ts             ✅ MIGRATED — Rust handles AES
│   │   ├── wiki-links.ts         ✅ Keep as-is (pure parsing)
│   │   ├── models.ts             ✅ Keep as-is
│   │   └── types.ts              ✅ Keep as-is
│   └── ...
├── src-tauri/
│   ├── Cargo.toml                ⚠️  EXISTS from earlier session — verify deps
│   ├── tauri.conf.json           ⚠️  EXISTS from earlier session — verify
│   └── src/
│       ├── main.rs               ✅ 115 commands registered, all modules
│       ├── notes.rs              ✅ 22 commands, Obsidian-compatible
│       ├── kanban.rs             ✅ 16 commands, calendar sync, task.md per card
│       ├── storage.rs            ✅ 18 commands, SRI + sqlite-vec, 6 tables
│       ├── vault.rs              ✅ (crypto.rs renamed) AES-256-GCM + Argon2id
│       ├── graph.rs              ✅ from earlier session
│       ├── providers.rs          ✅ Ollama + Anthropic + OpenRouter + Kimi
│       ├── google.rs             ✅ Calendar + Gmail, direct API (no MCP)
│       ├── oauth.rs              ✅ tokens encrypted in Rust
│       └── training.rs           ✅ from earlier session
├── android/
│   └── app/src/main/kotlin/
│       ├── TauriIpc.kt           ✅ bridge with coroutines + event listeners
│       ├── LeapPlugin.kt         ✅ LFM2 on-device, streaming llm-delta events
│       ├── BiometricPlugin.kt    ✅ Android KeyStore, hardware-backed keys
│       ├── EmbeddingPlugin.kt    ✅ ONNX Runtime + all-MiniLM, 5 commands
│       ├── NoteTool.kt           ✅ → invoke("note_*")
│       ├── KanbanTool.kt         ✅ → invoke("kanban_*")
│       ├── VaultCryptoTool.kt    ✅ → invoke("vault_*" + "crypto_*")
│       ├── GoogleTool.kt         ✅ → invoke("google_*") read/write calendar, read gmail
│       ├── ProviderTool.kt       ✅ → invoke("providers_*") scale to cloud
│       └── AgentService.kt       ✅ wires SriDecision → Koog → tools
├── assets/models/
│   ├── all-MiniLM-L6-v2.onnx    ❌ MISSING — download from HuggingFace
│   ├── tokenizer.json            ❌ MISSING
│   └── special_tokens_map.json   ❌ MISSING
└── CODEX.md                      ✅ AI coding assistant guide
```

---

## ✅ DONE

| Layer | File | Notes |
|---|---|---|
| **Rust** | notes.rs | 22 Tauri commands, full Obsidian parity, wikilinks, backlinks, daily notes, snapshots |
| **Rust** | kanban.rs | 16 commands, each card = task.md, calendar sync, subtasks, agent-friendly |
| **Rust** | storage.rs | 6 SQLite tables, SRI pipeline, semantic cache, embeddings, distillations, agent memory |
| **Rust** | vault.rs | AES-256-GCM, Argon2id, biometric unlock, encrypted SQLite keystore |
| **Rust** | graph.rs | Knowledge graph edges |
| **Rust** | providers.rs | Multi-provider: Ollama, Anthropic, OpenRouter, Kimi + Tor routing |
| **Rust** | google.rs | Calendar R/W + Gmail read-only, direct API |
| **Rust** | oauth.rs | OAuth tokens encrypted in Rust |
| **Rust** | training.rs | QLoRA / Unsloth pipeline |
| **Rust** | main.rs | 115 commands registered, all states |
| **Kotlin** | TauriIpc.kt | IPC bridge with coroutines |
| **Kotlin** | LeapPlugin.kt | LFM2 on-device, SSE-style streaming |
| **Kotlin** | BiometricPlugin.kt | Android KeyStore hardware-backed |
| **Kotlin** | EmbeddingPlugin.kt | ONNX + all-MiniLM, 5 commands |
| **Kotlin** | NoteTool.kt | Koog tool for notes |
| **Kotlin** | KanbanTool.kt | Koog tool for kanban |
| **Kotlin** | VaultCryptoTool.kt | Koog tool for encrypted vault |
| **Kotlin** | GoogleTool.kt | Koog tool for calendar/gmail |
| **Kotlin** | ProviderTool.kt | Koog tool to scale to cloud |
| **Kotlin** | AgentService.kt | Main Koog agent wiring |
| **TSX** | store.tsx | Migrated: localStorage → invoke() |
| **TSX** | lfm.ts | Migrated: direct fetch → Rust providers |
| **TSX** | crypto.ts | Migrated: frontend AES → Rust crypto |
| **Docs** | CODEX.md | Full guide for AI coding assistants |

---

## ❌ MISSING — Must Do Before Building

### Critical (app won't run without these)
| # | What | Why | File(s) |
|---|---|---|---|
| 1 | Download ONNX model files | EmbeddingPlugin won't load | `all-MiniLM-L6-v2.onnx`, `tokenizer.json`, `special_tokens_map.json` |
| 2 | Verify Cargo.toml has all deps | `sqlite-vec`, `aes-gcm`, `argon2`, `reqwest`, `serde`, `tauri` | `Cargo.toml` |
| 3 | Verify tauri.conf.json | permissions, sidecar declarations, Android target | `tauri.conf.json` |
| 4 | Onboarding flow | User needs to set PIN + download LFM2 model on first launch | `OnboardingWizard.tsx` needs real invoke() calls |
| 5 | Update StoreProvider mount | Migrated store no longer takes `pin` or `initialNotes` props — callers need updating | `App.tsx` |

### Important (needed for core features)
| # | What | Why |
|---|---|---|
| 6 | Gradle deps for Kotlin | `onnxruntime-android`, `leap-sdk`, Koog, Tauri Android plugin |
| 7 | Leap structured outputs integration | LFM tool calls direct from model, not just text parsing |
| 8 | SRI → AgentService wiring | Rust SRI decision needs to reach AgentService before Koog runs |
| 9 | llm-delta event listener in store/lfm | streaming responses need to update UI state in real time |

### Deferred (post-launch)
| # | What | Notes |
|---|---|---|
| 10 | LeapPlugin.swift (iOS) | Same interface, Swift implementation |
| 11 | vault.rs encrypted notes UI | LockScreen.tsx needs crypto_unlock flow |
| 12 | Marketplace backend | QLoRA / skills marketplace — needs server |
| 13 | MCP plugins (Notion, GitHub, etc.) | Add per-service as needed |
| 14 | Unsloth training UI | training.rs exists, UI needs wiring |
| 15 | Tor sidecar bundling | Currently assumes tor running — needs bundled sidecar |
| 16 | Desktop Leap JVM | Still in testing — use Ollama on desktop for now |

---

## Build Phases

```
PHASE 1 — Android MVP  (current target)
  ✅ Rust core (notes, kanban, storage, crypto)
  ✅ Kotlin tools + plugins
  ✅ TSX migrated
  ❌ Cargo.toml + tauri.conf.json verified
  ❌ ONNX model files bundled
  ❌ Onboarding flow wired
  ❌ Gradle deps added
  → Deliverable: Notes + Kanban + Biometric login on Android

PHASE 2 — Agents
  ❌ SRI → AgentService data flow
  ❌ Leap structured outputs
  ❌ Koog multi-agent (already supported, needs config)
  → Deliverable: Agent writes notes, moves cards, reads calendar

PHASE 3 — Cloud + Privacy
  ❌ Tor sidecar bundled
  ❌ Provider API keys UI wired to keystore
  ❌ Google OAuth flow end-to-end
  → Deliverable: Cloud AI calls via Tor, Google Calendar sync

PHASE 4 — iOS + Desktop
  ❌ LeapPlugin.swift
  ❌ Desktop build tested
  → Deliverable: Full cross-platform

PHASE 5 — Ecosystem
  ❌ Marketplace backend
  ❌ QLoRA training UI
  ❌ Plugin system for MCPs
  → Deliverable: Extensible platform
```

---

## Immediate Next Steps (ordered)

1. `cargo check` on Cargo.toml — add missing crates
2. Add Gradle deps to `android/app/build.gradle`
3. Download and place ONNX model files in assets
4. Wire `OnboardingWizard.tsx` to real invoke() calls (PIN setup + model download)
5. Fix `App.tsx` — remove `pin` and `initialNotes` props from StoreProvider
6. First Android build test
