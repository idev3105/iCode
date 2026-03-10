import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { FileDiff } from "@/services/ipc/types";

interface DiffStore {
  pendingDiffs: Record<string, FileDiff>; // keyed by file_path

  updateDiff: (diff: FileDiff) => void;
  acceptHunk: (filePath: string, hunkId: string) => void;
  rejectHunk: (filePath: string, hunkId: string) => void;
  clearDiff: (filePath: string) => void;
}

export const useDiffStore = create<DiffStore>()(
  immer((set) => ({
    pendingDiffs: {},

    updateDiff: (diff) =>
      set((state) => {
        state.pendingDiffs[diff.file_path] = diff;
      }),

    acceptHunk: (filePath, hunkId) =>
      set((state) => {
        const diff = state.pendingDiffs[filePath];
        if (diff) {
          const hunk = diff.hunks.find((h) => h.id === hunkId);
          if (hunk) hunk.status = "accepted";
        }
      }),

    rejectHunk: (filePath, hunkId) =>
      set((state) => {
        const diff = state.pendingDiffs[filePath];
        if (diff) {
          const hunk = diff.hunks.find((h) => h.id === hunkId);
          if (hunk) hunk.status = "rejected";
        }
      }),

    clearDiff: (filePath) =>
      set((state) => {
        delete state.pendingDiffs[filePath];
      }),
  })),
);
