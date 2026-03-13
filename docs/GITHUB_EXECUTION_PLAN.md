# GitHub Execution Plan (Roadmap Sync)

This document translates `docs/VIBO_ROADMAP.md` into a GitHub-friendly execution checklist with explicit ownership targets and status tracking.

## 1) Phase 1 Launch Scope — Rust Core + Frontend

### `src-tauri/src/` (Rust)
- [x] `main.rs`
- [x] `notes.rs`
- [x] `kanban.rs`
- [x] `vault.rs`
- [x] `storage.rs`
- [x] `graph.rs`
- [x] `sri.rs`
- [x] `google.rs`
- [x] `oauth.rs`
- [ ] `event_system.rs` *(deferred)*
- [ ] `scheduler.rs` *(deferred)*
- [ ] `providers.rs` *(deferred in user plan; verify against current roadmap)*

### `src-tauri/` config
- [x] `Cargo.toml`
- [x] `build.rs`
- [x] `tauri.conf.json`
- [x] `capabilities/default.json`
- [ ] Add iOS targets in `.cargo/config.toml` and `Cargo.toml`
- [ ] Update `tauri.conf.json` for iOS packaging/runtime targets

### Frontend (`src/lib/`)
- [x] `types.ts`
- [x] `store.tsx`
- [x] `lfm.ts`
- [x] `crypto.ts`
- [ ] `tauriClient.ts` *(missing — should centralize invoke/listen wrappers)*
- [ ] `leapClient.ts` *(missing — should centralize Leap/on-device client wrappers)*

## 2) Mobile Platform Work

### iOS (`ios/App/`)
- [ ] `Swift/LeapPromptExecutor.swift`
- [ ] `Swift/KoogTauriPlugin.swift`
- [ ] `Swift/EmbeddingPlugin.swift`
- [ ] `Swift/ViBoRole.swift`
- [ ] `Swift/BGTaskManager.swift` *(replaces WorkManager equivalent)*
- [ ] `Swift/ModelOrchestrator.swift` *(deferred)*
- [ ] `Swift/ExtractExecutor.swift` *(deferred)*
- [ ] `Swift/MainActivity.swift` *(or iOS equivalent app entry wiring via AppDelegate/SceneDelegate)*
- [ ] `Assets.xcassets/Resources/roles/default.md`
- [ ] `Assets.xcassets/Resources/roles/researcher.md`
- [ ] `Assets.xcassets/Resources/roles/writer.md`
- [ ] `Assets.xcassets/Resources/roles/project_manager.md`
- [ ] `Assets.xcassets/Resources/roles/developer.md`
- [ ] `Assets.xcassets/Resources/roles/analyst.md`
- [ ] `Assets.xcassets/Resources/models/all-MiniLM-L6-v2.onnx`
- [ ] `Info.plist`

### Android secondary track (`android/`)
- [x] `LeapPromptExecutor.kt`
- [x] `KoogTauriPlugin.kt`
- [x] `EmbeddingPlugin.kt`
- [x] `MainActivity.kt`
- [ ] `ViBoRole.kt`
- [ ] `AgentForegroundService.kt` *(deferred)*
- [ ] `AgentWorker.kt` *(deferred)*
- [ ] `ModelOrchestrator.kt` *(deferred)*
- [ ] `ExtractExecutor.kt` *(deferred)*
- [x] `AndroidManifest.xml`
- [x] `build.gradle.kts`

## 3) GitHub Organization

Use labels:
- `phase:1-launch`
- `phase:2-agents`
- `phase:3-cloud-privacy`
- `phase:4-ios-desktop`
- `phase:5-ecosystem`
- `platform:rust`
- `platform:frontend`
- `platform:android`
- `platform:ios`
- `status:blocked`
- `status:deferred`

Recommended milestones:
1. **Android MVP (Phase 1)**
2. **Agent Enablement (Phase 2)**
3. **Cloud + Privacy (Phase 3)**
4. **iOS + Desktop (Phase 4)**

## 4) Suggested First GitHub Issues

1. Add missing frontend clients (`tauriClient.ts`, `leapClient.ts`)
2. iOS target setup (`Cargo.toml`, `.cargo/config.toml`, `tauri.conf.json`)
3. iOS plugin stubs and role resources
4. Bundle model assets (`all-MiniLM-L6-v2.onnx` and tokenizer files)
5. Introduce `ViBoRole.kt` and role mapping parity between Android and iOS

## 5) Source of Truth

Primary architecture/priority source remains `docs/VIBO_ROADMAP.md`. Keep this checklist synchronized whenever roadmap phases or deliverables change.
