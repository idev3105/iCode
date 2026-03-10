import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AgentStatus, AgentState } from "@/services/ipc/types";

interface AgentStore {
  agents: Record<string, AgentState>;
  setAgentStatus: (agent: string, status: AgentStatus) => void;
}

export const useAgentStore = create<AgentStore>()(
  immer((set) => ({
    agents: {
      claude: { status: "idle", current_task_id: null },
      gemini: { status: "idle", current_task_id: null },
      goose: { status: "idle", current_task_id: null },
    },

    setAgentStatus: (agent, status) =>
      set((state) => {
        if (!state.agents[agent]) {
          state.agents[agent] = { status: "idle", current_task_id: null };
        }
        state.agents[agent].status = status;
      }),
  })),
);
