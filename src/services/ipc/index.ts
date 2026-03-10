import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Task, TaskRequest, TaskFilter, AppEvent, FileEntry } from "./types";
import { useTaskStore } from "@/stores/taskStore";
import { useDiffStore } from "@/stores/diffStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { useAgentStore } from "@/stores/agentStore";

// ── Commands (Frontend → Rust) ────────────────────────────────────────────

export const ipc = {
  submitTask: (request: TaskRequest) =>
    invoke<string>("submit_task", { request }),

  cancelTask: (taskId: string) => invoke<void>("cancel_task", { taskId }),

  sendInput: (taskId: string, data: string) =>
    invoke<void>("send_input", { taskId, data }),

  resizeTerminal: (taskId: string, rows: number, cols: number) =>
    invoke<void>("resize_terminal", { taskId, rows, cols }),

  readDir: (path: string) => invoke<FileEntry[]>("read_dir", { path }),

  readFileContent: (path: string) => invoke<string>("read_file_content", { path }),

  writeFileContent: (path: string, content: string) =>
    invoke<void>("write_file_content", { path, content }),

  listTasks: (filter: TaskFilter = {}) =>
    invoke<Task[]>("list_tasks", { filter }),

  searchTasks: (query: string) => invoke<Task[]>("search_tasks", { query }),

  acceptHunk: (hunkId: string) => invoke<void>("accept_hunk", { hunkId }),

  rejectHunk: (hunkId: string) => invoke<void>("reject_hunk", { hunkId }),

  commitChanges: (repoPath: string, message: string) =>
    invoke<string>("commit_changes", { repoPath, message }),

  getRunningTasks: () => invoke<Task[]>("get_running_tasks"),

  getQueuedTasks: () => invoke<Task[]>("get_queued_tasks"),
};

// ── Event Listener (Rust → Frontend) ─────────────────────────────────────

export function startEventListener(): UnlistenFn {
  const getStores = () => {
    return {
      task: useTaskStore.getState(),
      diff: useDiffStore.getState(),
      terminal: useTerminalStore.getState(),
      agent: useAgentStore.getState(),
    };
  };

  let unlisten: UnlistenFn | null = null;
  let isCancelled = false;

  listen<AppEvent>("app:event", (event) => {
    const e = event.payload;
    const stores = getStores();

    switch (e.type) {
      case "AgentStart":
        stores.agent.setAgentStatus(e.agent, "running");
        break;
      case "AgentEnd":
        stores.agent.setAgentStatus(
          e.agent,
          e.status === "error" ? "error" : "idle",
        );
        stores.task.updateStatus(e.task_id, e.status);
        break;
      case "AgentOutput":
        stores.terminal.appendData(e.task_id, e.agent, e.line);
        break;
      case "AgentFileWrite":
        // Could trigger diff refresh here
        break;
      case "TaskQueued":
        stores.task.addTask(e.task);
        break;
      case "TaskStarted":
        stores.task.updateStatus(e.task.id, "running");
        break;
      case "TaskCancelled":
        stores.task.updateStatus(e.task_id, "cancelled");
        break;
      case "DiffUpdated":
        stores.diff.updateDiff(e.diff);
        break;
      case "HunkAccepted":
        // Handled optimistically by useHunkActions
        break;
      case "HunkRejected":
        break;
    }
  }).then((fn) => {
    if (isCancelled) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  return () => {
    isCancelled = true;
    if (unlisten) unlisten();
  };
}
