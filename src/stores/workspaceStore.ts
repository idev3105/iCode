import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface WorkspaceStore {
  workingDirectory: string | null;
  recentWorkspaces: string[];
  setWorkingDirectory: (dir: string | null) => void;
  removeRecentWorkspace: (dir: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      workingDirectory: null,
      recentWorkspaces: [],
      setWorkingDirectory: (dir) => set((state) => {
        let newRecents = state.recentWorkspaces;
        if (dir) {
          // Add to recents, move to top if exists, limit to 10
          newRecents = [dir, ...state.recentWorkspaces.filter(r => r !== dir)].slice(0, 10);
        }
        return { 
          workingDirectory: dir,
          recentWorkspaces: newRecents
        };
      }),
      removeRecentWorkspace: (dir) => set((state) => ({
        recentWorkspaces: state.recentWorkspaces.filter(r => r !== dir)
      })),
    }),
    {
      name: "icode-workspace-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
