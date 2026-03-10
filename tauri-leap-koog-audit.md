# Tauri + LEAP SDK + Koog Stack Audit (ViBo)

## Scope and constraints
- Requested targets reviewed: Liquid MCP docs, `hypothesi/mcp-server-tauri`, and Liquid LEAP + Koog Android example.
- In this execution environment, outbound fetches to those URLs returned `403 CONNECT tunnel failed`, so this audit combines:
  1) existing repo state,
  2) your in-repo build guide,
  3) standard Tauri 2 + Android plugin integration patterns.
- Action: treat external-version details below as a **pre-implementation validation checklist** before locking dependencies.

## Current stack snapshot

### What exists now (good foundation)
- Frontend is a Vite + React + TypeScript app with a modular UI and state pattern that can be reused inside Tauri WebView.
- There is already an LFM abstraction (`src/lib/lfm.ts`) with provider switching and streaming handling.
- There is a product-direction implementation guide (`vibo-build-guide.md`) that already outlines Android biometric plugin, LEAP plugin, capability layer, and Koog sidecar concepts.

### What is missing for a runnable Tauri/LEAP/Koog app
- No `src-tauri/` Rust app shell in this repo yet.
- No Android Tauri project scaffolding (`src-android/`) yet.
- No native Kotlin plugin files (`LeapPlugin.kt`, biometric plugin) in-tree yet.
- No formal MCP server process/service wiring yet.

## Readiness assessment

## ✅ UI layer readiness: HIGH
- Existing React app is already portable to Tauri with minimal structural change.
- Most migration work is data-source replacement (mock/web fetch -> `@tauri-apps/api` invoke/events).

## ⚠️ Native runtime readiness: LOW (not started)
- You must add Tauri runtime, Rust commands, capability permissions, Android target init, and plugin registration.

## ⚠️ Agent/tooling readiness: MEDIUM-LOW
- Product architecture exists on paper in `vibo-build-guide.md`, but runtime agent orchestration and tool contracts are not implemented yet.

## Target architecture that fits this repo

### Desktop + Android split
- **Frontend (TS/React):** unchanged UI codebase, hosted in Tauri webview.
- **Rust core (`src-tauri`):** vault, kanban, graph index, command surface, policy/permissions.
- **Android native plugins (Kotlin):** biometric auth + LEAP model lifecycle and inference.
- **Koog agent layer:**
  - Android: in-process Kotlin agent service using LEAP runner + tool adapters.
  - Desktop: sidecar/binary agent or Rust-mediated tool loop.
- **MCP boundary:** expose vault/kanban/graph tools via MCP-compatible server contract so Koog/tooling and future integrations share one capability schema.

## Gap analysis by layer

### 1) Frontend integration gap
- `src/lib/lfm.ts` is HTTP-centric today; for on-device LEAP usage it needs a Tauri-native provider path:
  - `invoke('plugin:leap|load_model', ...)`
  - `invoke('plugin:leap|generate', ...)` or event-stream equivalent.
- Needed refactor: keep cloud providers as-is, add a `tauriLocal` transport backend and capability-tool calls.

### 2) Rust core gap
Implement in `src-tauri`:
- Vault file ops + validation + scoped filesystem access.
- SQLite metadata + migration bootstrap.
- Kanban parser/writer for markdown board format.
- Graph edge extraction from wikilinks.
- Tauri commands as stable API surface for UI and agent adapters.

### 3) Android gap
Implement in `src-android`:
- Tauri plugin registration in `MainActivity`.
- Biometric plugin command(s).
- LEAP plugin command(s): model download/load/generate/stream/cancel.
- Threading/lifecycle handling for long-running generation.

### 4) Koog orchestration gap
- Define single source of truth for tool schema (`read_note`, `write_note`, `list_notes`, `add_card`, etc.).
- Build adapter layer translating Koog tool calls -> Tauri invoke -> Rust capability execution.
- Add response normalization and tool error taxonomy.

### 5) MCP server gap
- Decide process model:
  1) in-process MCP server in Rust, or
  2) sidecar MCP server (Node/Rust/Kotlin) that calls Tauri commands.
- Ensure MCP tool names/JSON schema match Koog tool declarations exactly.

## Recommended implementation sequence (low risk)

1. **Bootstrap Tauri 2 shell in this repo**
   - add `src-tauri`, confirm `tauri dev` on desktop.
2. **Move notes + kanban to Rust commands**
   - wire TS UI to `invoke` for CRUD first.
3. **Add Android target and biometric plugin**
   - confirm auth gate + vault read/write on physical device.
4. **Add LEAP plugin MVP**
   - load one model + non-streaming generate call end-to-end.
5. **Introduce Koog agent with 2-3 tools only**
   - start with `read_note` + `write_note` + `list_notes`.
6. **Introduce MCP-compatible tool server contract**
   - align schemas, add integration tests, then broaden tools.
7. **Add streaming + cancellation + telemetry**
   - production hardening after correctness.

## Compatibility checklist before coding (must verify externally)
- Confirm latest compatible versions matrix for:
  - Tauri 2 Android plugin APIs,
  - LEAP SDK + model downloader artifacts,
  - Koog agent libs,
  - MCP protocol package/server libs.
- Confirm expected LEAP model naming/quantization identifiers and storage requirements.
- Confirm whether Koog expects coroutine/flow interfaces or callback adapters in your chosen version.
- Confirm `mcp-server-tauri` transport expectations (stdio/ws/http) and whether it assumes desktop-only APIs.

## Minimal technical decisions to lock now
- **Tool schema contract first** (versioned JSON schema in repo).
- **Transport strategy**:
  - UI↔Rust: Tauri invoke/events
  - Agent↔tools: direct adapter + MCP parity layer
- **Streaming contract** (chunk format, partials, end/error/cancel events).
- **Permission model** (vault root, FS scopes, model storage location).

## Definition of done for “ViBo on Tauri + LEAP + Koog”
- Android app installs and launches with biometric gate.
- Local LEAP model loads once (cached thereafter).
- Agent can read/write notes and update kanban via tool calls.
- Same tool schema exposed through MCP-compatible interface.
- Desktop build reuses same frontend and Rust capability core.

## Immediate next PR plan
1. Scaffold `src-tauri` and wire 3 commands (`list_notes`, `read_note`, `write_note`).
2. Add TS client wrapper replacing direct local HTTP path when inside Tauri runtime.
3. Add contract file `tool-schema/v1.json` shared by Rust + agent side.
4. Add Android plugin skeletons with no-op command stubs and compile checks.

