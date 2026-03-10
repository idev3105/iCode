# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is iCode

A VS Code extension that orchestrates AI coding agents (Claude CLI, Gemini CLI) through integrated terminals. Users submit tasks via a sidebar webview panel, and the extension spawns agent processes in VS Code terminal tabs, with hook-based event communication back to the extension.

## Build & Development Commands

- **Install deps:** `pnpm install`
- **Compile (typecheck + lint + bundle):** `pnpm compile`
- **Watch mode:** `pnpm watch` (runs esbuild + tsc in parallel)
- **Production bundle:** `pnpm package`
- **Lint:** `pnpm lint` (eslint on `src/`)
- **Type check only:** `pnpm check-types`
- **Run tests:** `pnpm test` (uses `@vscode/test-cli`)
- **Build VSIX:** `pnpm vsix`

## Architecture

### Two build targets (esbuild.js)

1. **Extension host** (`src/extension.ts` → `dist/extension.js`): Node/CJS, externals `vscode`
2. **Webview UI** (`src/panel/webview/main.ts` → `dist/webview.js`): IIFE/browser, built with esbuild-svelte + PostCSS/Tailwind

The webview is a Svelte app (`src/panel/webview/App.svelte`) styled with Tailwind CSS. It communicates with the extension via `postMessage`/`onDidReceiveMessage`. The webview JS/CSS are inlined into HTML by `getWebviewContent.ts` (no separate resource URIs).

### Core modules

- **`src/agent/AgentManager.ts`** — Central orchestrator. Spawns CLI agents as VS Code terminals, tracks tasks by ID, maps session IDs to terminals. Gemini agents are serialized through an init queue (waits for `SessionStart` hook before starting the next).
- **`src/agent/types.ts`** — `Task`, `AgentType` (`'claude' | 'gemini'`), `TaskStatus`
- **`src/server/HookServer.ts`** — Local HTTP server (port 3500) receiving JSON POST events from agent hooks. Forwards events to `AgentManager.onHookEvent()`.
- **`src/server/HookInstaller.ts`** — Writes Claude hook config to `.claude/settings.local.json` (HTTP hooks)
- **`src/server/GeminiHookInstaller.ts`** — Writes Gemini hook config to `.gemini/settings.json` (command hooks via curl)
- **`src/diff/DiffManager.ts`** — Snapshot-based file diffing using temp files and `vscode.diff`
- **`src/panel/TaskPanelProvider.ts`** — WebviewViewProvider for the sidebar. Handles messages from the Svelte UI (submitTask, focusTerminal, updateSetting).

### Agent lifecycle

1. User submits task → `AgentManager.queueTask()` → `runTask()`
2. Hook configs are auto-installed in the workspace (`.claude/` or `.gemini/`)
3. A VS Code terminal is created with the agent CLI as the shell process, session ID passed via `--session-id`
4. The agent's prompt is sent via `terminal.sendText()`
5. Hook events (permissions, notifications, stop) arrive at `HookServer` → `AgentManager` → terminal focus changes
6. Terminal close → task marked completed

### Webview ↔ Extension messages

- **To extension:** `submitTask`, `focusTerminal`, `updateSetting`, `ready`
- **To webview:** `tasksUpdated`, `settingsUpdated`, `focusedTask`, `navigate`

## Key conventions

- Package manager: **pnpm**
- Webview source is excluded from the main tsconfig (`src/panel/webview/` has its own `tsconfig.json`)
- No separate webview resource URIs — JS and CSS are inlined into the HTML
