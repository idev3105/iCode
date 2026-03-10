# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is iCode

iCode is a Tauri v2 desktop application — an autonomous AI coding IDE that orchestrates multiple AI agents (Claude Code, Gemini, Goose) and interactive shells through a unified interface. The frontend is React/TypeScript; the backend is Rust.

## Build & Dev Commands

```bash
# Prerequisites: Rust 1.94+, Node 25+, pnpm 10+ (see .tool-versions)

pnpm install              # Install frontend dependencies
pnpm tauri dev            # Run full app in dev mode (starts Vite + Rust backend)
pnpm dev                  # Frontend-only dev server on localhost:1420
pnpm build                # Frontend build (tsc + vite build)
pnpm tauri build          # Full production build (frontend + Rust binary)

# Testing
pnpm test                 # Run vitest once
pnpm test:watch           # Run vitest in watch mode
cd src-tauri && cargo test # Run Rust tests

# Linting
pnpm lint                 # Biome check
pnpm lint:fix             # Biome check with auto-fix
cd src-tauri && cargo clippy # Rust linting
```

## Architecture

### Two-Process Model (Tauri v2)

**Rust backend** (`src-tauri/src/`): Manages processes, state, and system operations. All backend traits are `async_trait` + `Send + Sync` with Arc-wrapped implementations, wired together in `lib.rs::run()`.

- `event_bus.rs` — Core types (`TaskId`, `AgentKind`, `Task`, `Event`, etc.) and `TokioBroadcastBus` for internal pub/sub. This is the type-definition hub.
- `agent_orchestrator.rs` — `AgentOrchestrator` trait; queues tasks and dispatches them to agents via the process manager. Contains the agent registry mapping agent kinds to CLI commands.
- `process_manager.rs` — `ProcessManager` trait; spawns real PTY processes via `portable-pty`, streams output through the event bus.
- `ipc_bridge.rs` — All `#[tauri::command]` handlers + `AppState` struct + DTOs for frontend↔backend IPC. Also runs the event forwarder (Rust events → frontend via `app.emit("app:event")`).
- `git_engine.rs` — `GitEngine` trait wrapping `libgit2` for git operations.
- `hook_runner.rs` — `HookRunner` trait (currently `NoopHookRunner`).
- `storage.rs` — `TaskStorage` and `DiffStorage` traits (in-memory implementations for MVP).

**React frontend** (`src/`): Single-page app with a three-panel layout.

- `App.tsx` — Root component: welcome screen, workspace selection, tab management (terminal/editor/diff tabs).
- `services/ipc/` — `ipc` object wraps all `invoke()` calls; `startEventListener()` bridges `app:event` to Zustand stores.
- `stores/` — Zustand + Immer stores: `agentStore`, `taskStore`, `terminalStore`, `diffStore`, `workspaceStore`.
- `features/` — Feature modules: `terminal/` (xterm.js), `editor/` (CodeMirror), `diff-viewer/`, `task-panel/`.
- `components/ui/` — shadcn/ui components (new-york style, Tailwind CSS variables, lucide icons).

### Data Flow

1. Frontend calls `ipc.submitTask()` → Tauri invoke → `ipc_bridge::submit_task`
2. `AgentOrchestrator` creates a `Task`, saves to storage, emits `TaskQueued`
3. If agent is free, `ProcessManager` spawns a PTY process
4. PTY stdout streams as `AgentOutput` events through the `EventBus`
5. `start_event_forwarder` relays all Rust events to frontend via `app.emit("app:event")`
6. `startEventListener` dispatches events to appropriate Zustand stores
7. React components re-render from store state

### Agent System

Agents are CLI tools spawned as PTY processes. The registry in `agent_orchestrator.rs::default_agent_registry()` maps:
- `"shell"` → user's `$SHELL` (interactive login shell)
- `"claude"` → `claude` CLI
- `"gemini"` → `gemini` CLI
- `"goose"` → `goose session --`

### Conventions

- Path alias: `@/` maps to `src/` (configured in vite.config.ts and tsconfig.json)
- Rust backend uses trait objects (`Arc<dyn Trait>`) for all major subsystems, with test doubles (e.g., `FakeProcessManager`, `RecordingEventBus`)
- Frontend state management: Zustand with Immer middleware
- Serde enums use `#[serde(rename_all = "lowercase")]` for TaskStatus/HunkStatus; Event uses `#[serde(tag = "type")]`
