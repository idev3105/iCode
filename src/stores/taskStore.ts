import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Task, TaskStatus } from "@/services/ipc/types";

interface TaskStore {
  runningTasks: Task[];
  queuedTasks: Task[];
  historyTasks: Task[];

  addTask: (task: Task) => void;
  updateStatus: (taskId: string, status: TaskStatus) => void;
  moveToHistory: (taskId: string) => void;
  removeTask: (taskId: string) => void;
}

export const useTaskStore = create<TaskStore>()(
  immer((set) => ({
    runningTasks: [],
    queuedTasks: [],
    historyTasks: [],

    addTask: (task) =>
      set((state) => {
        if (task.status === "queued") {
          state.queuedTasks.push(task);
        } else {
          state.runningTasks.push(task);
        }
      }),

    updateStatus: (taskId, status) =>
      set((state) => {
        // Check running
        const runningIdx = state.runningTasks.findIndex((t) => t.id === taskId);
        if (runningIdx !== -1) {
          state.runningTasks[runningIdx].status = status;
          if (
            status === "done" ||
            status === "error" ||
            status === "cancelled"
          ) {
            const [task] = state.runningTasks.splice(runningIdx, 1);
            state.historyTasks.unshift(task);
          }
          return;
        }
        // Check queued
        const queuedIdx = state.queuedTasks.findIndex((t) => t.id === taskId);
        if (queuedIdx !== -1) {
          state.queuedTasks[queuedIdx].status = status;
          if (status === "running") {
            const [task] = state.queuedTasks.splice(queuedIdx, 1);
            state.runningTasks.push(task);
          }
        }
      }),

    moveToHistory: (taskId) =>
      set((state) => {
        const idx = state.runningTasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) {
          const [task] = state.runningTasks.splice(idx, 1);
          state.historyTasks.unshift(task);
        }
      }),

    removeTask: (taskId) =>
      set((state) => {
        state.runningTasks = state.runningTasks.filter((t) => t.id !== taskId);
        state.queuedTasks = state.queuedTasks.filter((t) => t.id !== taskId);
        state.historyTasks = state.historyTasks.filter((t) => t.id !== taskId);
      }),
  })),
);
