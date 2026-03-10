import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface TerminalSession {
  taskId: string;
  agent: string;
  data: string; // Changed from lines array to raw data string
}

interface TerminalStore {
  sessions: Record<string, TerminalSession>;
  activeSessionId: string | null;

  appendData: (taskId: string, agent: string, data: string) => void;
  setActive: (taskId: string) => void;
  clearSession: (taskId: string) => void;
  ensureSession: (taskId: string, agent: string) => void;
}

export const useTerminalStore = create<TerminalStore>()(
  immer((set) => ({
    sessions: {},
    activeSessionId: null,

    ensureSession: (taskId, agent) =>
      set((state) => {
        if (!state.sessions[taskId]) {
          state.sessions[taskId] = { taskId, agent, data: "" };
          if (!state.activeSessionId) state.activeSessionId = taskId;
        }
      }),

    appendData: (taskId, agent, data) =>
      set((state) => {
        if (!state.sessions[taskId]) {
          state.sessions[taskId] = { taskId, agent, data: "" };
          if (!state.activeSessionId) state.activeSessionId = taskId;
        }
        state.sessions[taskId].data += data;
        // Cap at 100,000 characters
        if (state.sessions[taskId].data.length > 100000) {
          state.sessions[taskId].data = state.sessions[taskId].data.slice(-100000);
        }
      }),

    setActive: (taskId) =>
      set((state) => {
        state.activeSessionId = taskId;
      }),

    clearSession: (taskId) =>
      set((state) => {
        if (state.sessions[taskId]) {
          state.sessions[taskId].data = "";
        }
      }),
  })),
);
