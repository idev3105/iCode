# Vibe Coding IDE — Tech Stack Recommendation

> **Version:** 1.0.0  
> **Status:** Approved for Review  
> **Last Updated:** March 2026

---

## Table of Contents

1. [Decision Summary](#decision-summary)
2. [Core Platform](#core-platform)
3. [Frontend UI Layer](#frontend-ui-layer)
4. [Terminal Engine](#terminal-engine)
5. [Process & Agent Orchestration](#process--agent-orchestration)
6. [Git Diff Engine](#git-diff-engine)
7. [State Management](#state-management)
8. [Storage & Persistence](#storage--persistence)
9. [Hook System & Event Bus](#hook-system--event-bus)
10. [Build & Tooling](#build--tooling)
11. [Full Stack Diagram](#full-stack-diagram)
12. [Decision Matrix](#decision-matrix)
13. [Risk & Trade-offs](#risk--trade-offs)

---

## Decision Summary

Vibe Coding is a **desktop IDE** that requires:

- Native OS access to spawn and manage subprocesses (AI agent CLIs)
- High-performance terminal rendering with multiplexed streams
- Real-time git diff computation on live file writes
- Reactive UI that updates without blocking the main thread
- Local file system access and persistent storage

The recommended platform is **Tauri 2 + React + Rust**, chosen over alternatives like Electron for its dramatically lower memory footprint, native subprocess control, and Rust's performance on I/O-heavy workloads.

---

## Core Platform

### ✅ Recommended: Tauri 2 (Rust backend + WebView frontend)

Tauri is a framework for building desktop apps with a Rust backend and a web-based frontend rendered in the OS's native WebView (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux).

| Aspect | Tauri 2 | Electron (alternative) |
|--------|---------|------------------------|
| **Memory usage** | ~30–60 MB | ~150–400 MB |
| **Binary size** | ~5–15 MB | ~150–200 MB |
| **Subprocess control** | Native via Rust `std::process` | Node.js `child_process` |
| **IPC performance** | Rust ↔ WebView via Tauri commands | Node.js ↔ Chromium via IPC |
| **File system access** | Native, sandboxed via Tauri FS API | Full via Node.js |
| **Security model** | Strong capability-based permissions | Broad, opt-in hardening |
| **Startup time** | Fast (~200ms) | Slower (~800ms–2s) |

**Why Tauri wins for Vibe Coding:**
- Spawning and piping agent CLIs (Claude Code, Gemini, Goose) requires robust subprocess management — Rust's `tokio::process` is best in class
- Terminal output streaming at high volume (thousands of lines/sec) benefits from Rust's zero-copy I/O
- The app will run for long developer sessions; low memory usage matters

```
┌─────────────────────────────────────────────────────┐
│               TAURI 2 ARCHITECTURE                  │
│                                                     │
│  ┌──────────────────────────┐                       │
│  │   WebView (React UI)     │  ← HTML/CSS/JS        │
│  │   Renders all panels     │                       │
│  └──────────┬───────────────┘                       │
│             │  Tauri Commands (IPC)                 │
│  ┌──────────▼───────────────┐                       │
│  │   Rust Core              │  ← Native OS access   │
│  │   - Agent processes      │                       │
│  │   - File system          │                       │
│  │   - Git operations       │                       │
│  │   - SQLite storage       │                       │
│  └──────────────────────────┘                       │
└─────────────────────────────────────────────────────┘
```

---

## Frontend UI Layer

### ✅ Recommended: React 19 + TypeScript + Tailwind CSS

| Library | Role | Why |
|---------|------|-----|
| **React 19** | UI component framework | Concurrent rendering, Suspense, fine-grained updates |
| **TypeScript 5** | Type safety | Critical for complex task/event/diff state shapes |
| **Tailwind CSS 4** | Styling | Utility-first, zero runtime, perfect for dense IDE layouts |
| **Radix UI** | Accessible primitives | Dropdowns, modals, tooltips — accessible and unstyled |
| **Framer Motion** | Animations | Smooth task status transitions, panel slide-ins |

**Why React 19 specifically:**
- `useTransition` and `useDeferredValue` allow the task list and diff viewer to update without blocking terminal rendering
- React Server Components are not needed (desktop app), but concurrent features are critical for smooth IDE UX
- Largest ecosystem for IDE-style UI patterns (VS Code extensions use similar patterns)

**Key UI libraries per feature:**

```
Feature                  Library
─────────────────────────────────────────────────────
Center Terminal          xterm.js (see Terminal section)
Git Diff Viewer          react-diff-view + diff2html
Task Panel               TanStack Virtual (virtualized list)
Task Detail Timeline     Custom React component
Search / Filter          Fuse.js (fuzzy search, client-side)
Icons                    Lucide React
```

---

## Terminal Engine

### ✅ Recommended: xterm.js + node-pty (via Tauri sidecar)

The Center Terminal is the most performance-sensitive UI component. It must handle high-throughput output from multiple concurrent agent processes.

| Library | Role |
|---------|------|
| **xterm.js** | Terminal emulator rendered in WebView (used by VS Code) |
| **@xterm/addon-fit** | Auto-resize terminal to container |
| **@xterm/addon-web-links** | Clickable file paths in output |
| **@xterm/addon-search** | Ctrl+F search within terminal output |
| **node-pty** | Pseudo-terminal on macOS/Linux (via Rust sidecar) |

**Why xterm.js:**
- Powers VS Code's integrated terminal — battle-tested at scale
- WebGL renderer handles 100,000+ lines without frame drops
- Supports ANSI color codes natively (all CLI agents use these)
- Can render multiple xterm.js instances (one per agent) in tab/split layout

**Multiplexing Strategy:**

Each active agent gets its own xterm.js instance. The Center Terminal UI renders them in a tabbed or split layout with a shared filter bar. Output is streamed from Rust via Tauri's event system:

```rust
// Rust: Stream agent stdout line-by-line to frontend
app.emit("agent:output", AgentOutputEvent {
    agent: "claude".to_string(),
    task_id: task.id.clone(),
    line: output_line,
    stream: "stdout".to_string(),
});
```

```typescript
// TypeScript: Receive and write to xterm instance
await listen<AgentOutputEvent>("agent:output", (event) => {
  const term = terminalMap.get(event.payload.agent);
  term?.write(event.payload.line + "\r\n");
});
```

---

## Process & Agent Orchestration

### ✅ Recommended: Rust + Tokio async runtime

All agent subprocess management runs in Rust for maximum control and performance.

| Crate | Role |
|-------|------|
| **tokio** | Async runtime — spawn and manage concurrent agent processes |
| **tokio::process** | Spawn agent CLIs, pipe stdin/stdout/stderr |
| **tokio::sync::mpsc** | Channel-based messaging between agent tasks and UI |
| **serde / serde_json** | Serialize/deserialize task payloads and events |

**Agent process lifecycle in Rust:**

```rust
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};

pub async fn spawn_agent(
    agent: &str,
    prompt: &str,
    task_id: &str,
    app: AppHandle,
) -> Result<()> {
    let mut child = Command::new(agent)
        .arg(prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // Emit start event
    app.emit("agent:start", StartEvent { agent, task_id, prompt })?;

    // Stream stdout lines to frontend
    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout).lines();

    while let Some(line) = reader.next_line().await? {
        app.emit("agent:output", OutputEvent {
            agent, task_id, line, stream: "stdout"
        })?;
    }

    let status = child.wait().await?;
    app.emit("agent:end", EndEvent {
        agent, task_id,
        status: if status.success() { "done" } else { "error" }
    })?;

    Ok(())
}
```

**Hook execution:** Hooks defined in `.vibe/hooks.js` are executed in a sandboxed **Bun** runtime (embedded as a Tauri sidecar), allowing fast execution of user JavaScript with full Node.js API compatibility.

| Component | Technology |
|-----------|-----------|
| Hook file format | JavaScript / TypeScript (`.vibe/hooks.js`) |
| Hook runtime | **Bun** (embedded sidecar, JavaScriptCore-based) |
| Hook sandboxing | Process-level isolation; `project_dir` scoped filesystem access |
| Hook timeout | Configurable, default 10000ms |

**Why Bun over Deno for hooks:**
- **~5ms startup** vs. Deno's ~100ms — hooks block the agent loop synchronously, so startup latency compounds on every tool call
- **Full npm/Node.js compatibility** — existing hook scripts from Claude Code or Gemini CLI work in Bun unchanged; Deno requires API migration from `node:` builtins
- **`process.stdin`** — standard Node.js API, so no hook script rewrites needed
- **Smaller binary** — ~50MB vs Deno's ~80MB embedded sidecar
- **Faster JSON throughput** — Bun's native JSON parser outperforms V8 for the small, repeated payloads hooks receive

---

## Git Diff Engine

### ✅ Recommended: git2-rs (libgit2 bindings) + diff2html

| Library | Layer | Role |
|---------|-------|------|
| **git2** (Rust crate) | Backend | Native libgit2 bindings — compute diffs, stage hunks, commit |
| **similar** (Rust crate) | Backend | Fast in-memory diff algorithm (Myers diff) for pre-write snapshots |
| **react-diff-view** | Frontend | Render unified and split diffs in React |
| **diff2html** | Frontend | HTML diff rendering with syntax highlighting |
| **Prism.js** | Frontend | Syntax highlighting inside diff hunks |

**Why git2-rs over shelling out to `git`:**
- No subprocess overhead — pure library calls in-process
- Can access git index directly to stage/unstage individual hunks
- Full control over commit messages, authorship, and ref updates
- Works even when `git` binary is not in PATH

**Diff pipeline:**

```
Agent writes file
      │
      ▼
Rust: capture pre/post snapshots using `similar` crate
      │
      ▼
Compute unified diff (Myers algorithm)
      │
      ▼
Store in pending buffer (SQLite)
      │
      ▼
Emit `diff:updated` event to frontend
      │
      ▼
react-diff-view renders split/unified pane
      │
      ▼
Developer accepts hunk → git2-rs stages it
Developer rejects hunk → snapshot reverted
```

---

## State Management

### ✅ Recommended: Zustand + TanStack Query

| Library | Role | Why |
|---------|------|-----|
| **Zustand** | Global UI state | Lightweight, no boilerplate, works great with real-time event streams |
| **TanStack Query** | Server/async state | Cache and sync task history from SQLite via Tauri commands |
| **Immer** | Immutable state updates | Simplify nested state mutations (task lists, diff hunks) |

**Zustand store structure:**

```typescript
interface VibeCodingStore {
  // Agent state
  agents: Record<string, AgentState>;
  
  // Task state
  runningTasks: Task[];
  queuedTasks: Task[];
  
  // Diff state
  pendingDiffs: Record<string, DiffFile[]>;
  
  // Terminal state
  terminalOutputs: Record<string, string[]>;
  
  // Actions
  addTask: (task: Task) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  acceptHunk: (fileId: string, hunkIndex: number) => void;
  rejectHunk: (fileId: string, hunkIndex: number) => void;
}
```

**Why not Redux / MobX:**
- Redux: too much boilerplate for real-time event-driven state
- MobX: observable proxies add overhead on high-frequency terminal events
- Zustand: minimal overhead, works with `immer` for complex nested updates

---

## Storage & Persistence

### ✅ Recommended: SQLite via sqlx (Rust)

| Component | Technology | Why |
|-----------|-----------|-----|
| **Primary store** | SQLite (via `sqlx` Rust crate) | Embedded, zero-config, fast for structured task/event data |
| **ORM / query builder** | `sqlx` with compile-time checked queries | Type-safe SQL, async, no runtime overhead |
| **Migration** | `sqlx migrate` | Simple file-based schema migrations |
| **Location** | `~/.vibe/history.db` | Per-user, persisted across restarts |

**Schema overview:**

```sql
-- Tasks table
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  agent       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  status      TEXT NOT NULL,  -- queued | running | done | error | cancelled
  started_at  INTEGER,        -- Unix timestamp ms
  ended_at    INTEGER,
  duration_ms INTEGER,
  error_msg   TEXT,
  exit_code   INTEGER
);

-- Files changed per task
CREATE TABLE task_files (
  id       INTEGER PRIMARY KEY,
  task_id  TEXT REFERENCES tasks(id),
  path     TEXT NOT NULL,
  diff_ref TEXT             -- Key to diff snapshot
);

-- Hook events per task
CREATE TABLE hook_events (
  id         INTEGER PRIMARY KEY,
  task_id    TEXT REFERENCES tasks(id),
  event_name TEXT NOT NULL,
  payload    TEXT NOT NULL,  -- JSON
  fired_at   INTEGER NOT NULL
);

-- Diff snapshots (pending/accepted/rejected)
CREATE TABLE diff_snapshots (
  id         TEXT PRIMARY KEY,
  task_id    TEXT REFERENCES tasks(id),
  file_path  TEXT NOT NULL,
  diff_patch TEXT NOT NULL,  -- Unified diff format
  status     TEXT NOT NULL,  -- pending | accepted | rejected
  created_at INTEGER NOT NULL
);
```

**Why not a file-based JSON store or localStorage:**
- Task history can grow to thousands of entries — SQLite handles queries and indexes efficiently
- Full-text search across prompts and logs requires proper indexing
- Concurrent writes from multiple agent processes are safe with SQLite WAL mode

---

## Hook System & Event Bus

### ✅ Recommended: Tauri Event System + Bun Runtime

| Component | Technology |
|-----------|-----------|
| **Internal event bus** | Tauri's built-in `emit` / `listen` (Rust ↔ WebView) |
| **Hook execution runtime** | Bun (embedded as sidecar binary) |
| **Hook API surface** | TypeScript with typed event payloads |
| **Hook file** | `.vibe/hooks.js` at project root |

**Event flow:**

```
Rust backend emits event
        │
        ▼
Tauri event bus (IPC)
        │
    ┌───┴──────────────────┐
    │                      │
    ▼                      ▼
React UI updates    Bun hook runner
(Task Panel,        executes user hooks
 Diff Viewer,       (.vibe/hooks.js)
 Terminal badges)
```

**Why Bun for hooks (not Deno, not Node.js):**
- **~5ms startup time** — hooks run in the agent's hot path; Deno's ~100ms startup is unacceptable for synchronous PreToolUse hooks
- **Full Node.js API compatibility** — `process.stdin`, `fs`, `path` all work natively; existing Claude Code and Gemini CLI scripts reuse without modification
- **Native TypeScript** — no `tsc` compile step needed, just like Deno
- **Single embedded binary** — ~50MB sidecar, smaller than Deno's ~80MB
- **npm package support** — hook scripts can `import` any npm package without a Deno-specific adapter

---

## Build & Tooling

| Tool | Role |
|------|------|
| **Vite 6** | Frontend bundler — fast HMR, ESM output |
| **Cargo** | Rust package manager and build tool |
| **pnpm** | Fast JS package manager |
| **Biome** | Linter + formatter (replaces ESLint + Prettier) |
| **Vitest** | Frontend unit and integration tests |
| **Rust `#[cfg(test)]`** | Backend unit tests |
| **Playwright** | End-to-end desktop tests via Tauri's test driver |
| **GitHub Actions** | CI/CD — build for macOS, Windows, Linux |
| **tauri-action** | Official GitHub Action for Tauri builds and releases |

**Development workflow:**

```bash
# Install dependencies
pnpm install

# Run in development (hot reload)
pnpm tauri dev

# Build for production
pnpm tauri build

# Run frontend tests
pnpm vitest

# Run Rust tests
cargo test

# Lint + format
pnpm biome check --apply
```

---

## Full Stack Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VIBE CODING IDE                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    FRONTEND (WebView)                         │  │
│  │                                                              │  │
│  │  React 19 + TypeScript + Tailwind CSS + Radix UI            │  │
│  │                                                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │  │
│  │  │ Center       │  │ Git Diff     │  │ Task Panel        │ │  │
│  │  │ Terminal     │  │ Viewer       │  │ & History         │ │  │
│  │  │ xterm.js     │  │ react-diff   │  │ TanStack Virtual  │ │  │
│  │  │ WebGL render │  │ view         │  │ Zustand store     │ │  │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘ │  │
│  │         └─────────────────┴──────────────┬─────┘            │  │
│  │                                    Zustand + TanStack Query  │  │
│  └────────────────────────────────────┬─────────────────────────┘  │
│                                       │ Tauri IPC Commands/Events   │
│  ┌────────────────────────────────────▼─────────────────────────┐  │
│  │                    RUST BACKEND (Tauri 2)                     │  │
│  │                                                              │  │
│  │  ┌─────────────────┐  ┌──────────────┐  ┌───────────────┐  │  │
│  │  │ Agent           │  │ Git Engine   │  │ Storage       │  │  │
│  │  │ Orchestrator    │  │ git2-rs      │  │ sqlx +        │  │  │
│  │  │ tokio::process  │  │ similar      │  │ SQLite        │  │  │
│  │  └────────┬────────┘  └──────┬───────┘  └───────────────┘  │  │
│  │           │                  │                               │  │
│  │  ┌────────▼──────────────────▼─────────────────────────┐   │  │
│  │  │              Tauri Event Bus                         │   │  │
│  │  │  agent:start / agent:end / agent:output / diff:*    │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    SIDECARS                                   │  │
│  │                                                              │  │
│  │  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │  │
│  │  │ Claude Code │   │ Gemini CLI   │   │ Bun Runtime     │  │  │
│  │  │ (subprocess)│   │ (subprocess) │   │ (hooks runner)  │  │  │
│  │  └─────────────┘   └──────────────┘   └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Decision Matrix

| Concern | Chosen Technology | Score | Runner-up | Score |
|---------|-------------------|-------|-----------|-------|
| Desktop shell | **Tauri 2** | ⭐⭐⭐⭐⭐ | Electron | ⭐⭐⭐ |
| Backend language | **Rust** | ⭐⭐⭐⭐⭐ | Node.js | ⭐⭐⭐ |
| UI framework | **React 19** | ⭐⭐⭐⭐⭐ | Vue 3 | ⭐⭐⭐⭐ |
| Terminal emulator | **xterm.js** | ⭐⭐⭐⭐⭐ | Terminal.js | ⭐⭐ |
| Process management | **tokio::process** | ⭐⭐⭐⭐⭐ | node child_process | ⭐⭐⭐ |
| Diff engine | **git2-rs + similar** | ⭐⭐⭐⭐⭐ | child `git diff` | ⭐⭐⭐ |
| State management | **Zustand** | ⭐⭐⭐⭐⭐ | Redux Toolkit | ⭐⭐⭐ |
| Database | **SQLite / sqlx** | ⭐⭐⭐⭐⭐ | LevelDB / JSON files | ⭐⭐⭐ |
| Hook runtime | **Bun** | ⭐⭐⭐⭐⭐ | Deno | ⭐⭐⭐⭐ |
| Styling | **Tailwind CSS 4** | ⭐⭐⭐⭐⭐ | CSS Modules | ⭐⭐⭐⭐ |
| Build tool | **Vite 6** | ⭐⭐⭐⭐⭐ | Webpack 5 | ⭐⭐⭐ |

---

## Risk & Trade-offs

| Risk | Mitigation |
|------|------------|
| **Tauri / Rust learning curve** is steep for frontend-only teams | Provide Rust module templates for common patterns; isolate Rust behind well-defined Tauri commands |
| **xterm.js WebGL** may not work on all Linux GPU configurations | Fallback to canvas renderer automatically via `xterm.js` renderer detection |
| **Bun sidecar** adds ~50MB to binary size | Bundle Bun only once as a shared sidecar; all hook scripts share the same process pool |
| **SQLite concurrent writes** from multiple agents | Enable WAL (Write-Ahead Logging) mode — handles concurrent reads/writes safely |
| **WebView differences** across macOS/Windows/Linux | Use Tauri's abstraction layer; test on all three platforms in CI |
| **git2-rs** doesn't support all git operations | Fall back to shelling out `git` for rare operations not covered by libgit2 |

---

*This document should be reviewed alongside the Feature Specification and User Story documents before implementation begins.*
