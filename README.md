# Welcome to VIBOAI

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Tauri 2 (desktop/mobile shell)

## Build/Migration Docs

- [Tauri + Koog Migration Audit Tracker](docs/tauri-koog-migration-audit.md)
## Project Structure

```text
.
├── src/                    # Existing React frontend shell (Vite app)
├── src-tauri/              # Tauri 2 backend/runtime shell
│   ├── capabilities/       # Tauri capability definitions
│   ├── src/
│   │   ├── core/           # Core Rust runtime modules
│   │   └── main.rs         # Tauri Rust entrypoint
│   ├── Cargo.toml          # Tauri Rust crate manifest
│   └── tauri.conf.json     # Tauri application config
├── src-android/            # Android wrapper target (from Tauri mobile workflow)
└── docs/                   # Transition and planning/process documentation
```

The React app in `src/` remains the primary UI shell, while `src-tauri/` hosts the Rust runtime and native packaging layer for desktop/mobile rollout.
