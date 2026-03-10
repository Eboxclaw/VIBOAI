# ViBo — Step-by-Step Build Guide

---

## Philosophy
Build in vertical slices. Each phase is a **shippable, testable app**.
Never add a layer before the one below it works.

---

## Current Implementation Status (this repository)

Legend: ✅ Done · 🟡 Partial/In progress · ⬜ Not done

### Phase 1
- ✅ **Step 1 — Project Setup** (`src-tauri`, `src`, and `src-android` scaffolds are present)
- ✅ **Step 2 — Vault Layer (Rust)** (`src-tauri/src/capabilities/vault.rs` implemented)
- ✅ **Step 3 — SQLite Storage (Rust)** (`src-tauri/src/core/storage.rs` implemented)
- ✅ **Step 4 — Kanban Layer (Rust)** (`src-tauri/src/capabilities/kanban.rs` implemented)
- 🟡 **Step 5 — Biometric Login (Android Kotlin Plugin)** (biometric support is wired via `tauri-plugin-biometric`; custom `BiometricPlugin.kt` is not present)
- 🟡 **Step 6 — Connect TSX UI to Real Data** (backend commands exist, but frontend state still relies heavily on local/client state)
- ⬜ **Step 7 — Build & Run on Android** (not documented in repo as completed/verified)

### Phase 2
- ⬜ **Step 8 — Leap SDK (Android Plugin)** (`LeapPlugin.kt` not present)
- ⬜ **Step 9 — Capability Layer for Agents (trait + MCP server)** (current `capabilities/mod.rs` exports modules only)
- ⬜ **Step 10 — Koog Agent Sidecar (Kotlin)** (`AgentService.kt` not present)
- 🟡 **Step 11 — LFM Workbench / training pipeline** (`src-tauri/src/training.rs` exists; full workbench flow not fully represented)
- 🟡 **Step 12 — SQL → MD Distillation** (distillation storage APIs exist; dedicated `core/distiller.rs` pipeline from this guide is not present)

### Phase 3
- 🟡 **Step 13 — Knowledge Graph View** (`src-tauri/src/graph.rs` and embedding/storage endpoints exist; end-to-end graph view completion not fully validated)
- ✅ **Step 14 — Cloud Providers** (`src-tauri/src/providers.rs` implemented)
- ✅ **Step 15 — AES Encryption** (`src-tauri/src/core/crypto.rs` implemented)
- ✅ **Step 16 — OAuth (Gmail + Calendar)** (`src-tauri/src/oauth.rs` and `src-tauri/src/google.rs` implemented)
- ✅ **Step 17 — Tor Routing** (provider and OAuth flows include Tor proxy support)
- ⬜ **Step 18 — QLoRA Marketplace** (`/marketplace` registry flow not present)

---

## PHASE 1 — Android MVP: Notes + Kanban + Biometric Login
> Target: Real app on a physical Android device with working vault

---

### Step 1 — Project Setup

```bash
# Prerequisites
cargo install tauri-cli
npm install -g @tauri-apps/cli@next

# Create project (import your existing ViBo TSX into src/)
npm create tauri-app@latest vibo
cd vibo
```

**Folder structure from day one:**
```
/vibo
  /src                    ← your TSX (React + Vite)
  /src-tauri
    /src
      /capabilities
        vault.rs
        kanban.rs
      /core
        filesystem.rs
        storage.rs        ← SQLite
        crypto.rs
      main.rs
    Cargo.toml
    tauri.conf.json
  /src-android             ← Tauri generates this
    /app/src/main
      /kotlin/com/vibo
        BiometricPlugin.kt
        LeapPlugin.kt     ← Phase 2
```

---

### Step 2 — Vault Layer (Rust)

Notes are plain `.md` files. This is the foundation of everything.

**`capabilities/vault.rs`**
```rust
use std::fs;
use std::path::PathBuf;

pub struct VaultManager {
    vault_path: PathBuf,
}

impl VaultManager {
    // Read note by filename
    pub fn read_note(&self, filename: &str) -> Result<String, String> {
        let path = self.vault_path.join(filename);
        fs::read_to_string(path).map_err(|e| e.to_string())
    }

    // Write/create note
    pub fn write_note(&self, filename: &str, content: &str) -> Result<(), String> {
        let path = self.vault_path.join(filename);
        fs::write(path, content).map_err(|e| e.to_string())
    }

    // List all .md files
    pub fn list_notes(&self) -> Result<Vec<String>, String> {
        // reads vault_path, returns Vec of filenames
    }

    // Parse [[wikilinks]] from content
    pub fn extract_links(&self, content: &str) -> Vec<String> {
        // regex: \[\[([^\]]+)\]\]
    }
}
```

**Tauri commands (exposed to TSX):**
```rust
#[tauri::command]
async fn read_note(state: State<'_, AppState>, filename: String) -> Result<String, String> {
    state.vault.read_note(&filename)
}

#[tauri::command]
async fn write_note(state: State<'_, AppState>, filename: String, content: String) -> Result<(), String> {
    state.vault.write_note(&filename, &content)
}

#[tauri::command]
async fn list_notes(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.vault.list_notes()
}
```

**TSX side:**
```typescript
import { invoke } from '@tauri-apps/api/core';

// Load note
const content = await invoke<string>('read_note', { filename: 'my-note.md' });

// Save note
await invoke('write_note', { filename: 'my-note.md', content: editorValue });

// List all notes
const notes = await invoke<string[]>('list_notes');
```

---

### Step 3 — SQLite Storage (Rust)

**`Cargo.toml` additions:**
```toml
sqlx = { version = "0.7", features = ["runtime-tokio", "sqlite"] }
```

**`core/storage.rs`** — one DB file in the vault:
```rust
// Tables needed for Phase 1:
// notes_meta  → id, filename, created_at, updated_at, tags
// kanban_cards → id, title, body_file, column, position, created_at
// graph_edges  → source_file, target_file (for wikilinks)
```

On first launch, Tauri creates `~/.vibo/vault/vibo.db`.
On Android: `app.filesDir/vault/vibo.db`

---

### Step 4 — Kanban Layer (Rust)

**Format:** Each board is a `kanban-boardname.md` file.
Compatible with Obsidian Kanban plugin.

```markdown
---
kanban-plugin: board
---

## Backlog

- [ ] Research Zettelkasten methods
- [ ] Write intro note

## In Progress

- [ ] Setup Tauri project

## Done

- [x] Design UI mockups
```

**`capabilities/kanban.rs`:**
```rust
pub struct KanbanManager {
    vault: Arc<VaultManager>,
    db: SqlitePool,
}

impl KanbanManager {
    pub fn list_boards(&self) -> Vec<String>
    pub fn get_board(&self, name: &str) -> KanbanBoard
    pub fn add_card(&self, board: &str, column: &str, title: &str) -> Result<()>
    pub fn move_card(&self, card_id: &str, to_column: &str) -> Result<()>
    pub fn update_card(&self, card_id: &str, content: &str) -> Result<()>
}
```

**Tauri commands:**
```rust
#[tauri::command] async fn list_boards(...) -> Result<Vec<KanbanBoard>, String>
#[tauri::command] async fn add_card(...) -> Result<CardId, String>
#[tauri::command] async fn move_card(...) -> Result<(), String>
```

---

### Step 5 — Biometric Login (Android Kotlin Plugin)

This is a **Tauri native plugin** — Kotlin code that Tauri wraps.

**`src-android/.../BiometricPlugin.kt`:**
```kotlin
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import ai.tauri.plugin.Plugin
import ai.tauri.plugin.annotation.TauriPlugin
import ai.tauri.plugin.annotation.Command

@TauriPlugin
class BiometricPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun authenticate(invoke: Invoke) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("ViBo")
            .setSubtitle("Authenticate to access your vault")
            .setNegativeButtonText("Use PIN")
            .build()

        val biometricPrompt = BiometricPrompt(activity,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    invoke.resolve()              // ← tells Tauri: success
                }
                override fun onAuthenticationError(code: Int, msg: CharSequence) {
                    invoke.reject(msg.toString()) // ← tells Tauri: failed
                }
            })

        biometricPrompt.authenticate(promptInfo)
    }
}
```

**Register in `MainActivity.kt`:**
```kotlin
class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(BiometricPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

**TSX side:**
```typescript
import { invoke } from '@tauri-apps/api/core';

async function unlockVault() {
    try {
        await invoke('plugin:biometric|authenticate');
        // vault is unlocked, load notes
    } catch (e) {
        // show error
    }
}
```

**`Cargo.toml` — add biometric permission:**
```toml
[target.'cfg(target_os = "android")'.dependencies]
tauri = { version = "2", features = ["biometric"] }
```

---

### Step 6 — Connect TSX UI to Real Data

Wire your existing ViBo components to Tauri commands.
Pattern: replace all mock data with `invoke()` calls.

```typescript
// Before (mock)
const notes = [{ id: 1, title: "Note 1" }, ...]

// After (real)
const [notes, setNotes] = useState<string[]>([]);
useEffect(() => {
    invoke<string[]>('list_notes').then(setNotes);
}, []);
```

**State management — add Zustand:**
```bash
npm install zustand
```

```typescript
// store/vault.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface VaultStore {
    notes: string[];
    activeNote: string | null;
    content: string;
    loadNotes: () => Promise<void>;
    openNote: (filename: string) => Promise<void>;
    saveNote: (filename: string, content: string) => Promise<void>;
}

export const useVaultStore = create<VaultStore>((set) => ({
    notes: [],
    activeNote: null,
    content: '',
    loadNotes: async () => {
        const notes = await invoke<string[]>('list_notes');
        set({ notes });
    },
    openNote: async (filename) => {
        const content = await invoke<string>('read_note', { filename });
        set({ activeNote: filename, content });
    },
    saveNote: async (filename, content) => {
        await invoke('write_note', { filename, content });
    },
}));
```

---

### Step 7 — Build & Run on Android

```bash
# First time: let Tauri generate Android project
npx tauri android init

# Run on connected device (USB debugging on)
npx tauri android dev

# Build APK
npx tauri android build
```

**`tauri.conf.json` — minimum permissions:**
```json
{
  "app": {
    "security": {
      "capabilities": [{
        "identifier": "vault-access",
        "permissions": [
          "fs:allow-read",
          "fs:allow-write",
          "fs:scope-$APP_DATA"
        ]
      }]
    }
  }
}
```

---

### Phase 1 Checklist
- [x] Notes load from real `.md` files
- [x] Notes save and persist
- [x] Kanban boards load from `.md` files
- [x] Cards can be moved between columns
- [~] Biometric prompt on launch (implemented via Tauri biometric plugin, Android-specific Kotlin plugin in this guide not added)
- [ ] App runs on physical Android device

---

---

## PHASE 2 — Agents + LFM On-Device
> Target: AI agent that can read/write notes and kanban

---

### Step 8 — Leap SDK (Android Plugin)

Add to `app/build.gradle.kts`:
```kotlin
dependencies {
    implementation("ai.liquid.leap:leap-sdk:0.9.7")
    implementation("ai.liquid.leap:leap-model-downloader:0.9.7")
}
```

**`LeapPlugin.kt`:**
```kotlin
@TauriPlugin
class LeapPlugin(private val activity: Activity) : Plugin(activity) {
    private var modelRunner: ModelRunner? = null

    @Command
    fun loadModel(invoke: Invoke) {
        // Downloads LFM2-1.2B on first run (~800MB), cached after
        viewModelScope.launch {
            modelRunner = downloader.loadModel("LFM2-1.2B", "Q5_K_M")
            invoke.resolve()
        }
    }

    @Command
    fun generate(invoke: Invoke) {
        val prompt = invoke.getString("prompt") ?: return invoke.reject("no prompt")
        viewModelScope.launch {
            val conversation = modelRunner?.createConversation()
            var result = ""
            conversation?.generateResponse(prompt)
                ?.collect { chunk ->
                    if (chunk is MessageResponse.Chunk) result += chunk.text
                }
            invoke.resolve(result)
        }
    }
}
```

---

### Step 9 — Capability Layer for Agents

Each capability exposes a **structured interface** that agents can call.
This is the MCP server your Koog agent will connect to.

**`capabilities/mod.rs`:**
```rust
pub trait Capability: Send + Sync {
    fn name(&self) -> &str;
    fn tools(&self) -> Vec<ToolDefinition>;
    fn call(&self, tool: &str, args: serde_json::Value) 
        -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send>>;
}
```

**Register all capabilities:**
```rust
// main.rs
let capabilities: Vec<Box<dyn Capability>> = vec![
    Box::new(VaultCapability::new(vault.clone())),
    Box::new(KanbanCapability::new(kanban.clone())),
    // Phase 3: GraphCapability, MailCapability, CalendarCapability
];
let mcp_server = MCPServer::new(capabilities);
```

**Tools each capability exposes:**

| Capability | Tools |
|---|---|
| vault | read_note, write_note, list_notes, search_notes |
| kanban | list_boards, add_card, move_card, get_board |
| graph | get_links, add_link, query_neighbours |
| mail | list_emails, send_email, search_emails |
| calendar | list_events, add_event |

---

### Step 10 — Koog Agent Sidecar (Kotlin)

On Android, Koog runs **in the same process** as the Leap plugin.
On desktop, it runs as a Tauri sidecar.

**`build.gradle.kts`:**
```kotlin
dependencies {
    implementation("ai.koog:koog-agents:0.1.0")
}
```

**`AgentService.kt`:**
```kotlin
class AgentService(
    private val modelRunner: ModelRunner,
    private val tauriInvoke: (String, Map<String,Any>) -> Any
) {
    private val agent = AIAgent(
        executor = simpleAgent(
            model = LFMModel(modelRunner),
            tools = listOf(
                Tool("read_note") { args -> tauriInvoke("read_note", args) },
                Tool("write_note") { args -> tauriInvoke("write_note", args) },
                Tool("add_card") { args -> tauriInvoke("add_card", args) },
                Tool("move_card") { args -> tauriInvoke("move_card", args) }
            )
        ),
        prompt = PromptExecutor.simple(
            systemPrompt = """
                You are a personal knowledge assistant. 
                You help the user organize notes, manage tasks, and find connections.
                Always think step by step before calling tools.
            """.trimIndent()
        )
    )

    suspend fun run(userMessage: String): String {
        return agent.run(userMessage)
    }
}
```

---

### Step 11 — LFM Workbench: Train Your Expert Model

This is your competitive advantage. Fine-tune LFM2 to be expert at:
- Using your specific tool schema (vault, kanban, graph)
- Zettelkasten methodology (linking notes, creating atomic notes)
- Semantic tool routing (which tool to call when)

**Training data format (JSONL):**
```jsonl
{"messages": [
  {"role": "user", "content": "Create a note about quantum computing linking to [[physics]]"},
  {"role": "assistant", "content": "<tool>write_note</tool><args>{\"filename\": \"quantum-computing.md\", \"content\": \"# Quantum Computing\\n\\nRelated: [[physics]]\\n\\n...\"}</args>"}
]}
{"messages": [
  {"role": "user", "content": "Move my research tasks to In Progress"},
  {"role": "assistant", "content": "<tool>list_boards</tool><args>{}</args>"}
]}
```

**3 aspects for semantic routing (train separately):**

1. **Note intent** — is this a capture, a question, or a connection?
2. **Tool selection** — vault vs kanban vs graph vs calendar
3. **Link suggestion** — which existing notes to link to

**Workflow:**
```
LFM Workbench → export QLoRA adapter (.bin)
                      ↓
              place in /vault/models/adapters/
                      ↓
              Leap SDK loads base LFM2 + adapter
```

---

### Step 12 — SQL → MD Distillation for Knowledge Graph

This is the bridge between structured data (SQLite) and semantic knowledge (wikilinks).

**The problem:** SQLite has your data structured but "dumb".
MD files with wikilinks create a semantic graph that LFM can reason over.

**Distillation pipeline (`core/distiller.rs`):**
```rust
pub struct GraphDistiller {
    db: SqlitePool,
    vault: Arc<VaultManager>,
}

impl GraphDistiller {
    // Run nightly or on-demand
    pub async fn distill(&self) -> Result<()> {
        // 1. Query all notes_meta with tags
        // 2. Query all kanban_cards
        // 3. Find semantic clusters (same tags, same wikilinks)
        // 4. Generate/update hub notes:
        //    [[_index/programming]] → links to all programming notes
        //    [[_index/tasks]] → links to all active kanban items
        // 5. Update graph_edges in SQLite from new wikilinks
    }

    // Extract wikilinks and upsert graph_edges
    pub async fn index_note(&self, filename: &str) -> Result<()> {
        let content = self.vault.read_note(filename)?;
        let links = self.vault.extract_links(&content);
        for target in links {
            self.db.execute(
                "INSERT OR IGNORE INTO graph_edges (source, target) VALUES (?, ?)",
                (filename, &target)
            ).await?;
        }
        Ok(())
    }
}
```

**3 distillation types:**

| Type | Input | Output |
|------|-------|--------|
| Tag clusters | SQLite tags | `[[_tags/rust]]` hub note with all linked notes |
| Temporal | created_at | `[[_journal/2025-03]]` monthly summary |
| Semantic | wikilink frequency | Suggests new links: "you mention X 8 times but no link" |

---

---

## PHASE 3 — Full Stack: Graph + Cloud + Encryption
> Target: Complete platform, iOS support, marketplace

---

### Step 13 — Knowledge Graph View

**sqlite-vec** for embeddings alongside graph_edges:

```toml
# Cargo.toml
sqlite-vec = "0.1"
```

```rust
// Store embedding per note
db.execute(
    "INSERT INTO note_embeddings(filename, embedding) VALUES (?, vec_from_json(?))",
    (filename, serde_json::to_string(&embedding)?)
).await?;

// Semantic search
db.fetch_all(
    "SELECT filename, vec_distance(embedding, vec_from_json(?)) as dist
     FROM note_embeddings ORDER BY dist LIMIT 10",
    (query_embedding,)
).await?;
```

---

### Step 14 — Cloud Providers

**`core/providers.rs`:**
```rust
pub enum Provider {
    Ollama   { base_url: String },
    Anthropic { api_key: String },
    OpenRouter { api_key: String },
    Kimi     { api_key: String, base_url: String },
}

impl Provider {
    pub async fn complete(&self, messages: Vec<Message>, tools: Vec<Tool>) 
        -> Result<Response, ProviderError>
    // All providers speak OpenAI-compatible format
    // API keys stored encrypted in SQLite keystore
}
```

---

### Step 15 — AES Encryption

```toml
aes-gcm = "0.10"
argon2 = "0.5"
```

```rust
// core/crypto.rs
pub fn encrypt_file(path: &Path, password: &str) -> Result<()> {
    let key = derive_key(password); // Argon2id
    let cipher = Aes256Gcm::new(&key);
    // encrypt → write .enc file → delete original
}

pub fn decrypt_file(path: &Path, password: &str) -> Result<Vec<u8>> {
    // read .enc → decrypt → return bytes
}
```

On mobile: biometric unlocks a stored key, not the password directly.
Biometric → KeyStore (Android) → AES key → vault decryption.

---

### Step 16 — OAuth (Gmail + Calendar)

```toml
oauth2 = "4"
```

```rust
// core/oauth.rs
// Standard PKCE flow — opens system browser
// Stores refresh token encrypted in SQLite
pub async fn google_auth() -> Result<GoogleTokens>
pub async fn refresh_token(tokens: &GoogleTokens) -> Result<GoogleTokens>
```

---

### Step 17 — Tor Routing

```toml
reqwest = { version = "0.12", features = ["socks"] }
```

```rust
// Opt-in per provider
let client = reqwest::Client::builder()
    .proxy(reqwest::Proxy::all("socks5://127.0.0.1:9050")?)
    .build()?;
```

Tor runs as a Tauri sidecar binary.
User opts in per provider in settings.

---

### Step 18 — QLoRA Marketplace

**`/marketplace`** — simple local registry:
```json
{
  "skills": [
    {
      "id": "zettelkasten-expert-v1",
      "name": "Zettelkasten Expert",
      "description": "Fine-tuned on Zettelkasten methodology and atomic note creation",
      "base_model": "LFM2-1.2B",
      "adapter_url": "https://...",
      "size_mb": 48,
      "tools": ["vault.*", "graph.*"]
    }
  ]
}
```

Install = download `.bin` adapter → place in `/vault/models/adapters/` → Leap SDK loads it.

---

---

## Build Timeline (realistic)

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1–2 | Phase 1, Steps 1–4 | Notes + Kanban working on desktop |
| 3 | Phase 1, Step 5–6 | Biometric + connected UI |
| 4 | Phase 1, Step 7 | Running on physical Android |
| 5–6 | Phase 2, Steps 8–10 | LFM on-device + first agent |
| 7–8 | Phase 2, Steps 11–12 | Trained model + knowledge graph distillation |
| 9–12 | Phase 3 | Graph view, cloud, encryption, marketplace |

---

## Dev Tools

Install `mcp-server-tauri` in your editor (Claude Code / Cursor).
This lets Claude Code see screenshots of your running app and debug in real-time.

```bash
npx -y install-mcp @hypothesi/tauri-mcp-server --client claude-code
```

---

## Key Files to Create First

```
src-tauri/src/
  main.rs               ← app state, register all commands
  capabilities/
    vault.rs            ← Step 2 ✅ start here
    kanban.rs           ← Step 4
  core/
    storage.rs          ← Step 3
    crypto.rs           ← Phase 3
    providers.rs        ← Phase 3
    distiller.rs        ← Step 12

src-android/.../kotlin/com/vibo/
  BiometricPlugin.kt    ← Step 5
  LeapPlugin.kt         ← Step 8
  AgentService.kt       ← Step 10
```
