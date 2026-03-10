import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { TaskPanel } from "@/features/task-panel/TaskPanel";
import { CenterTerminal } from "@/features/terminal/CenterTerminal";
import { DiffViewer } from "@/features/diff-viewer/DiffViewer";
import { CodeEditor, EditorPlaceholder } from "@/features/editor/CodeEditor";
import { FileExplorer } from "@/features/editor/FileExplorer";
import { startEventListener, ipc } from "@/services/ipc";
import { Terminal, GitBranch, Code2, Cpu, FolderOpen, Files, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type TabType = "terminal" | "editor" | "diff";

interface Tab {
  id: string; // Internal tab ID
  taskId?: string; // Associated process task ID
  type: TabType;
  title: string;
  path?: string;
  closable: boolean;
}

function WelcomeScreen() {
  const { setWorkingDirectory, recentWorkspaces, removeRecentWorkspace } = useWorkspaceStore();

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        setWorkingDirectory(selected as string);
      }
    } catch (err) {
      console.error("Failed to open directory:", err);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground font-sans">
      <div className="flex flex-col items-center gap-8 max-w-md w-full px-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 text-5xl font-bold tracking-tight text-primary">
            <Cpu className="h-12 w-12 text-primary shadow-[0_0_20px_rgba(254,128,25,0.3)]" />
            <span>iCode</span>
          </div>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-medium opacity-60 text-center">
            Autonomous AI Coding Environment
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <Button size="lg" onClick={handleOpenFolder} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 h-12">
            <FolderOpen className="h-5 w-5" />
            OPEN NEW FOLDER
          </Button>
        </div>

        {recentWorkspaces.length > 0 && (
          <div className="flex flex-col gap-3 w-full mt-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                <Files className="h-3 w-3" />
                RECENT WORKSPACES
              </span>
            </div>
            <div className="flex flex-col border border-border/50 rounded-lg overflow-hidden bg-accent/5 max-h-[300px] overflow-y-auto no-scrollbar">
              {recentWorkspaces.map((path) => (
                <div 
                  key={path}
                  className="group flex items-center justify-between p-3 border-b border-border/30 last:border-0 hover:bg-accent/20 cursor-pointer transition-all"
                  onClick={() => setWorkingDirectory(path)}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-foreground/90 truncate">
                      {path.split("/").pop()}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate opacity-50">
                      {path}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentWorkspace(path);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { workingDirectory, setWorkingDirectory } = useWorkspaceStore();
  const ensureSession = useTerminalStore((s) => s.ensureSession);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [rightPanelTab, setRightPanelTab] = useState<"explorer" | "changes">("explorer");
  const [showRightPanel, setShowRightPanel] = useState(true);

  const addTerminalTab = useCallback(async (isMain = false) => {
    if (!workingDirectory) return;
    try {
      // Start a shell task for the new terminal
      const taskId = await ipc.submitTask({
        agent: "shell",
        prompt: "", // Shell starts as interactive
        working_dir: workingDirectory,
      });

      // Ensure session exists in store immediately to avoid hang
      ensureSession(taskId, "shell");

      const tabId = `terminal-${taskId}`;
      const newTab: Tab = {
        id: tabId,
        taskId: taskId,
        type: "terminal",
        title: isMain ? "AGENT" : `SHELL ${taskId.slice(0, 4)}`,
        closable: true,
      };

      setTabs(prev => [...prev, newTab]);
      setActiveTabId(tabId);
    } catch (err) {
      console.error("Failed to start terminal session:", err);
    }
  }, [workingDirectory, ensureSession]);

  // Initial tab setup
  useEffect(() => {
    if (workingDirectory && tabs.length === 0) {
      addTerminalTab(true);
    }
  }, [workingDirectory]);

  useEffect(() => {
    const unlisten = startEventListener();
    return unlisten;
  }, []);

  const addEditorTab = useCallback((title: string, path: string) => {
    const id = path;
    setTabs(prev => {
      if (prev.find(t => t.id === id)) return prev;
      return [...prev, { id, type: "editor", title, path, closable: true }];
    });
    setActiveTabId(id);
  }, []);

  const addDiffTab = useCallback(() => {
    const id = "diff-viewer";
    setTabs(prev => {
      if (prev.find(t => t.id === id)) return prev;
      return [...prev, { id, type: "diff", title: "REVIEW CHANGES", closable: true }];
    });
    setActiveTabId(id);
  }, []);

  const removeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        if (newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        } else {
          setActiveTabId("");
        }
      }
      return newTabs;
    });
  }, [activeTabId]);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        setWorkingDirectory(selected as string);
        setTabs([]); // Reset tabs when switching workspace
        setActiveTabId("");
      }
    } catch (err) {
      console.error("Failed to open directory:", err);
    }
  };

  if (!workingDirectory) {
    return <WelcomeScreen />;
  }

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden font-sans">
      {/* Top bar */}
      <header className="flex h-9 shrink-0 items-center justify-between border-b bg-background px-4 select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-semibold text-sm tracking-tight text-foreground">
            <Cpu className="h-4 w-4 text-primary" />
            <span className="text-[11px] font-bold tracking-widest text-primary uppercase">iCode</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold px-2 hover:bg-accent/50 transition-all outline-none">
                FILE
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-card border-border min-w-[160px] z-50">
              <DropdownMenuItem 
                onClick={handleOpenFolder}
                className="text-[11px] font-medium py-1.5 cursor-pointer focus:bg-primary/20 focus:text-primary transition-colors gap-2"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Open Folder...
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/50" />
              <DropdownMenuItem 
                onClick={() => {
                  setWorkingDirectory(null);
                  setTabs([]);
                  setActiveTabId("");
                }}
                className="text-[11px] font-medium py-1.5 cursor-pointer focus:bg-destructive/20 focus:text-destructive transition-colors gap-2"
              >
                <X className="h-3.5 w-3.5" />
                Close Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center">
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase opacity-70">
            {workingDirectory.split("/").pop()}
          </span>
        </div>
        <div className="flex items-center w-16" />
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Task Panel */}
        <aside className="w-[320px] shrink-0 border-r bg-background flex flex-col overflow-hidden">
          <TaskPanel />
        </aside>

        {/* Center: Main Area */}
        <main className="flex flex-1 flex-col min-w-0 bg-background overflow-hidden relative">
          {/* Dynamic Tab Bar */}
          <div className="flex shrink-0 items-center justify-between h-9 border-b bg-background overflow-hidden">
            <div className="flex items-center h-full overflow-x-auto no-scrollbar flex-1">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={cn(
                    "group flex items-center h-full px-3 gap-2 border-r border-border cursor-pointer transition-all select-none min-w-[100px] max-w-[220px]",
                    activeTabId === tab.id ? "bg-accent/40 text-primary border-b-2 border-b-primary" : "text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  )}
                >
                  {tab.type === "terminal" && <Terminal className="h-3.5 w-3.5 shrink-0" />}
                  {tab.type === "editor" && <Code2 className="h-3.5 w-3.5 shrink-0" />}
                  {tab.type === "diff" && <GitBranch className="h-3.5 w-3.5 shrink-0" />}
                  <span className="text-[10px] font-bold uppercase tracking-tight truncate flex-1">
                    {tab.title}
                  </span>
                  <div 
                    className={cn(
                      "p-0.5 rounded-sm hover:bg-muted-foreground/20 transition-colors shrink-0",
                      activeTabId === tab.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    onClick={(e) => removeTab(tab.id, e)}
                  >
                    <X className="h-3 w-3" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center px-2 border-l border-border h-full bg-background">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] font-bold gap-1.5 text-muted-foreground hover:text-primary transition-all"
                onClick={() => addTerminalTab()}
              >
                <Plus className="h-3.5 w-3.5" />
                <Terminal className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden bg-background">
            {activeTab?.type === "terminal" && activeTab.taskId && (
              <div className="h-full"><CenterTerminal taskId={activeTab.taskId} /></div>
            )}
            {activeTab?.type === "editor" && activeTab.path && (
              <div className="h-full"><CodeEditor filename={activeTab.title} path={activeTab.path} /></div>
            )}
            {activeTab?.type === "diff" && (
              <div className="h-full"><DiffViewer /></div>
            )}
            {!activeTab && (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <EditorPlaceholder />
              </div>
            )}
          </div>
        </main>

        {/* Right: Dynamic Panel */}
        {showRightPanel && (
          <aside className="w-[280px] shrink-0 border-l bg-background flex flex-col overflow-hidden">
            <div className="flex h-9 items-center px-4 border-b bg-background">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
                {rightPanelTab === "explorer" ? "Explorer" : "Changes"}
              </span>
            </div>
            <div className="flex-1 overflow-auto bg-accent/5">
              {rightPanelTab === "explorer" ? (
                <FileExplorer 
                  rootPath={workingDirectory} 
                  activePath={activeTab?.path}
                  onFileClick={(name, path) => addEditorTab(name, path)} 
                />
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground border-b border-border pb-1">Changes detected</div>
                  <div 
                    className="text-[11px] font-mono py-1 px-2 rounded hover:bg-accent/20 cursor-pointer flex items-center justify-between"
                    onClick={() => addDiffTab()}
                  >
                    <span>src/App.tsx</span>
                    <span className="text-[#b8bb26]">+12</span>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Right Panel Vertical Toggle Bar (Far Right) */}
        <div className="w-11 shrink-0 border-l bg-background flex flex-col items-center py-2 gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (rightPanelTab === "explorer" && showRightPanel) {
                setShowRightPanel(false);
              } else {
                setRightPanelTab("explorer");
                setShowRightPanel(true);
              }
            }}
            className={cn(
              "h-9 w-9 text-muted-foreground transition-all",
              showRightPanel && rightPanelTab === "explorer" ? "text-primary bg-accent/50" : "hover:text-foreground hover:bg-accent/30"
            )}
          >
            <Files className="h-4.5 w-4.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (rightPanelTab === "changes" && showRightPanel) {
                setShowRightPanel(false);
              } else {
                setRightPanelTab("changes");
                setShowRightPanel(true);
              }
            }}
            className={cn(
              "h-9 w-9 text-muted-foreground transition-all",
              showRightPanel && rightPanelTab === "changes" ? "text-primary bg-accent/50" : "hover:text-foreground hover:bg-accent/30"
            )}
          >
            <GitBranch className="h-4.5 w-4.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
