# Tauri + Koog Migration Audit Tracker

- **Owner:** Platform Team (update with DRI)
- **Last Updated:** 2026-03-10
- **Status:** In progress (audit initialized)
- **Scope:** Phase 1 organization milestones for moving current Vite/React codebase into the target Tauri-first structure defined in `vibo-build-guide.md`.

## 1) Current-state snapshot (today)

### Repository structure observed

```text
/workspace/VIBOAI
  /src
    /components
    /hooks
    /lib
    /test
  /public
  README.md
  package.json
  vibo-build-guide.md
  Cargo.toml.txt
  *.rs.txt
```

### Snapshot notes

- Frontend app exists and is organized under `src/` with React/TypeScript modules.
- No active Tauri app layout exists yet (`src-tauri/` and `src-android/` are absent).
- Rust/Tauri planning artifacts exist as text notes (`Cargo.toml.txt`, `vault.rs.txt`, `kanban.rs`, etc.) but are not yet wired as a compilable Tauri project.
- No `docs/` migration tracker existed before this file.

### Current risks

1. **Structure drift risk:** Current layout differs from the target day-one structure in the build guide, which can slow migration sequencing.
2. **Manifest risk:** No live Rust manifest in expected Tauri location (`src-tauri/Cargo.toml`), so backend compilation and command registration are blocked.
3. **Command-layer disconnect risk:** React code has no guaranteed invoke bindings to a registered Tauri command surface (`read_note`, `write_note`, `list_notes`, etc.).
4. **Android bootstrap risk:** Missing `src-android/` means biometric plugin and platform registration work cannot start yet.

---

## 2) Target-state structure (from `vibo-build-guide.md`)

```text
/vibo
  /src
  /src-tauri
    /src
      /capabilities
        vault.rs
        kanban.rs
      /core
        filesystem.rs
        storage.rs
        crypto.rs
      main.rs
    Cargo.toml
    tauri.conf.json
  /src-android
    /app/src/main
      /kotlin/com/vibo
        BiometricPlugin.kt
        LeapPlugin.kt
```

Target intent for Phase 1:
- Rust vault + kanban modules compile under `src-tauri`.
- Tauri commands are registered in backend and invokable from frontend.
- Android project scaffolding is present to enable biometric plugin integration.

---

## 3) Gap table

| Area | Target expectation | Current state | Gap type | Risk if not addressed | Owner | Status | Target date |
|---|---|---|---|---|---|---|---|
| Tauri root | `src-tauri/` exists with Rust app scaffold | Missing | Missing directory | Cannot compile backend or run Tauri commands | Platform | Open | 2026-03-14 |
| Rust manifest | `src-tauri/Cargo.toml` | Only `Cargo.toml.txt` at repo root | Missing/relocated manifest | Build tooling cannot resolve Rust crate | Platform | Open | 2026-03-14 |
| Tauri config | `src-tauri/tauri.conf.json` | Missing | Missing manifest/config | App packaging/dev run blocked | Platform | Open | 2026-03-14 |
| Capability modules | `src-tauri/src/capabilities/{vault,kanban}.rs` | Notes/prototypes only | Missing module placement | No stable backend API surface | Backend | Open | 2026-03-17 |
| Core modules | `src-tauri/src/core/{filesystem,storage,crypto}.rs` | Notes/prototypes only | Missing module placement | Persistence/security implementation fragmented | Backend | Open | 2026-03-17 |
| Command registration | `src-tauri/src/main.rs` exposes commands | No compiled Tauri main | Disconnected command layer | Frontend cannot invoke backend vault/kanban actions | Backend + Frontend | Open | 2026-03-18 |
| Android scaffold | `src-android/.../kotlin/com/vibo` exists | Missing | Missing directory tree | Biometric plugin phase blocked | Mobile | Open | 2026-03-21 |

---

## 4) Ordered implementation checklist (Phase 1 organization milestones)

### Milestone 1 — Create base Tauri project skeleton
- [ ] Add `src-tauri/` with `Cargo.toml` and `tauri.conf.json`.
- [ ] Add `src-tauri/src/main.rs` with minimal app boot + placeholder commands.
- [ ] Ensure repository can run a Tauri dev compile path.

**Definition of done**
- `src-tauri/` folder exists in repo.
- `cargo check` (from `src-tauri`) succeeds.
- Tauri app starts without command registration errors.

### Milestone 2 — Place Phase 1 backend module boundaries
- [ ] Create `src-tauri/src/capabilities/vault.rs`.
- [ ] Create `src-tauri/src/capabilities/kanban.rs`.
- [ ] Create `src-tauri/src/core/filesystem.rs`, `storage.rs`, `crypto.rs`.
- [ ] Wire modules in `main.rs`/`mod` declarations.

**Definition of done**
- All target folders/files exist at expected paths.
- Module imports resolve and compile cleanly.
- No orphan Rust files remain at repo root for Phase 1 modules.

### Milestone 3 — Connect Tauri command layer
- [ ] Expose `read_note`, `write_note`, `list_notes` commands from backend.
- [ ] Register commands in Tauri handler.
- [ ] Add frontend invoke wrappers for notes operations.

**Definition of done**
- Backend command registration compiles.
- Frontend successfully invokes at least one note read and one note write command.
- Command signatures are documented in frontend integration notes.

### Milestone 4 — Add Android scaffold for biometric path
- [ ] Generate/add `src-android/` structure.
- [ ] Add Kotlin package path `com/vibo`.
- [ ] Prepare plugin registration placeholder for `BiometricPlugin`.

**Definition of done**
- `src-android/app/src/main/kotlin/com/vibo` path exists.
- Android project sync/build passes baseline checks.
- Biometric plugin registration points are present (even if implementation is stubbed).

### Milestone 5 — End-to-end Phase 1 integration sanity
- [ ] Verify frontend boot + Tauri backend boot together.
- [ ] Validate note listing + read/write from UI through Tauri invoke.
- [ ] Log unresolved migration debt into this audit tracker.

**Definition of done**
- Frontend invokes backend commands in runtime path (not only unit code).
- Vault command flow is manually verified in dev run.
- Remaining risks have owner/date/status entries in this document.

---

## 5) Living tracker updates

Use this table for weekly updates during migration:

| Date | Owner | Status | Update |
|---|---|---|---|
| 2026-03-10 | Platform Team | Initialized | Created baseline audit, gaps, and milestones. |

Maintenance rules:
- Update **Last Updated**, **Owner**, and **Status** at top on every revision.
- Mark checklist items and gap-table statuses as work progresses.
- Append one row per update to preserve migration history.
