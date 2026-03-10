# ViBo Logic Integration Audit

- **Date:** 2026-03-10
- **Scope:** End-to-end integration between frontend React logic and Tauri/Rust backend command surface.
- **Goal:** Identify what is currently integrated vs. where logic is still split or disconnected.

## Executive summary

The backend command surface is broad and production-oriented (notes, kanban, vault, storage, crypto, graph, oauth/google, providers, training), but the frontend runtime logic is still predominantly browser-local and does not yet invoke the Tauri command layer. The result is a **parallel architecture**: rich Rust capabilities exist, but core UI flows (notes/kanban/settings/assistant) currently operate against local in-browser state and localStorage.

## Integration map

## 1) Backend command integration (present)

`src-tauri/src/main.rs` initializes plugins, registers managed state, and wires all command modules into a single invoke handler.

### Registered plugins
- filesystem plugin
- shell plugin
- notification plugin
- deep-link plugin
- biometric plugin

### Managed state (integration backbone)
- notes state
- kanban state
- storage state (SQLite + vector mode fallback)
- crypto state
- graph state
- vault state
- providers state
- training state
- oauth state

### Command families registered
- Notes (`note_*`) including CRUD, search, links/backlinks, graph, snapshots, stats
- Kanban (`kanban_*`) board/card/task lifecycle and calendar linkage
- Storage (`storage_*`) indexing, embeddings, cache, memory, routing, distillation
- Crypto (`crypto_*`) unlock/lock, PIN setup/change, encrypt/decrypt, keystore
- Graph (`graph_*`) indexing, neighbors, paths, hubs, clusters, stats
- Vault (`vault_*`) encrypted content lifecycle and snapshots
- Google/OAuth (`google_*`, `oauth_*`) auth/session/calendar/gmail flow
- Providers (`providers_*`) provider inventory, Tor toggle/status, stream/complete
- Training (`training_*`, `ccp_*`, `exo_*`) endpoint + jobs + adapters

## 2) Frontend logic integration (partial / mostly disconnected from Tauri)

### Store and note lifecycle
`src/lib/store.tsx` is the primary data control plane for UI operations and persists note data by encrypting JSON into localStorage. CRUD/move flows are currently local state transforms, not backend command calls.

### Assistant integration
`src/components/ChatAssistant.tsx` includes command-like UX (“new note:”, “new task:”), but these actions call store methods directly (`addNote`, `setActiveView`) and do not invoke backend command handlers.

### Model/provider transport
`src/lib/lfm.ts` routes inference to HTTP endpoints (local LFM endpoint or cloud provider endpoints) via `fetch` SSE-style streaming. It does not use Tauri invoke/event transport for provider streaming.

### Settings path
`src/components/SettingsView.tsx` stores toggles and secrets in localStorage and exports JSON directly from in-memory notes; no backend crypto/keystore/provider command bridge is used here.

## Key audit findings

1. **Command surface exists but is not consumed by UI paths.**
   Frontend code does not currently use `@tauri-apps/api` invoke/listen patterns for notes/kanban/crypto/storage/provider features.

2. **State duplication risk is high.**
   Notes and task data can diverge between browser-local storage and backend vault/storage if both are used independently in future.

3. **Security model is split.**
   Rust crypto/keystore commands are present, while current frontend settings/storage still rely on localStorage-managed values for practical runtime behavior.

4. **Provider transport is web-first, not Tauri-native.**
   Existing inference flow depends on network `fetch`; no backend-mediated proxying/streaming path is integrated for desktop/mobile runtime parity.

5. **Integration debt is primarily adapter-layer work, not missing backend capabilities.**
   Most required backend primitives already exist; the largest gap is front-end binding and migration sequencing.

## Recommended integration sequence

1. **Create a typed frontend `tauriClient` adapter**
   - Centralize `invoke` wrappers for notes/kanban/crypto/provider/storage commands.
   - Keep signatures aligned to Rust command names and payloads.

2. **Migrate note CRUD first**
   - Replace store-local CRUD persistence with command-backed operations.
   - Keep optimistic UI updates while treating backend as source of truth.

3. **Migrate encryption and secrets handling**
   - Route PIN setup/unlock/encrypt/decrypt and API key storage to `crypto_*` commands.
   - Remove localStorage plaintext secret handling.

4. **Migrate provider streaming transport**
   - Use `providers_stream` / backend event stream for local/cloud parity and policy enforcement.

5. **Unify kanban + graph indexing side effects**
   - On note/card writes, invoke storage/graph indexing to maintain search and relationship consistency.

6. **Add integration tests for command bridges**
   - Validate note create/read/write + assistant “new note/task” flows through Tauri command APIs.

## Suggested integration KPIs

- % of user CRUD actions handled via Tauri commands
- # of localStorage keys remaining for app-critical data
- Note/task consistency checks between UI and backend storage
- Provider streaming success rate through backend transport
- Time-to-first-token and end-to-end latency across local/cloud providers

## Final assessment

- **Backend integration readiness:** High
- **Frontend↔backend runtime integration completeness:** Low-to-medium
- **Overall logic integration maturity:** Medium (capabilities exist, adapter integration incomplete)
