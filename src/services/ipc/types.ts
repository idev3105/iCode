// TypeScript types matching the Rust backend types

export type AgentKind = "claude" | "gemini" | "goose" | string;

export type TaskStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface Task {
  id: string;
  agent: AgentKind;
  prompt: string;
  working_dir: string;
  status: TaskStatus;
  started_at: string | null;
  ended_at: string | null;
  error_msg: string | null;
}

export interface TaskRequest {
  agent: AgentKind;
  prompt: string;
  working_dir: string;
}

export interface TaskFilter {
  agent?: AgentKind;
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[];
}

export type HunkStatus = "pending" | "accepted" | "rejected";

export interface DiffHunk {
  id: string;
  header: string;
  lines: string[];
  status: HunkStatus;
}

export interface FileDiff {
  file_path: string;
  hunks: DiffHunk[];
  added_lines: number;
  removed_lines: number;
  agent: AgentKind | null;
  task_id: string | null;
}

export type AgentStatus = "idle" | "running" | "error";

export interface AgentState {
  status: AgentStatus;
  current_task_id: string | null;
}

// ── Event types from Rust ─────────────────────────────────────────────────

export type AppEvent =
  | { type: "AgentStart"; agent: AgentKind; task_id: string; prompt: string }
  | {
      type: "AgentEnd";
      agent: AgentKind;
      task_id: string;
      status: TaskStatus;
      duration_ms: number;
    }
  | {
      type: "AgentOutput";
      agent: AgentKind;
      task_id: string;
      line: string;
      stream: "Stdout" | "Stderr";
    }
  | { type: "AgentFileWrite"; agent: AgentKind; task_id: string; path: string }
  | { type: "TaskQueued"; task: Task }
  | { type: "TaskStarted"; task: Task }
  | { type: "TaskCancelled"; task_id: string }
  | { type: "DiffUpdated"; file_path: string; diff: FileDiff }
  | { type: "HunkAccepted"; hunk_id: string }
  | { type: "HunkRejected"; hunk_id: string }
  | { type: "HookFired"; event_name: string; success: boolean };
