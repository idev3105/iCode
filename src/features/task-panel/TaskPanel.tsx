import { useState, useMemo } from "react";
import { useTaskStore } from "@/stores/taskStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ipc } from "@/services/ipc";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  RotateCcw,
  ChevronDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Search,
  Plus,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Task, AgentKind, TaskStatus } from "@/services/ipc/types";
import Fuse from "fuse.js";

const AGENT_COLORS: Record<string, string> = {
  claude: "#fe8019", // Gruvbox orange
  gemini: "#fabd2f", // Gruvbox yellow
  goose: "#b8bb26", // Gruvbox green
};

function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case "done":
      return <CheckCircle className="h-3 w-3" />;
    case "error":
      return <AlertCircle className="h-3 w-3" />;
    case "queued":
      return <Clock className="h-3 w-3" />;
    case "cancelled":
      return <X className="h-3 w-3" />;
  }
}

function RunningTaskCard({
  task,
  onCancel,
}: {
  task: Task;
  onCancel: (id: string) => void;
}) {
  const color = AGENT_COLORS[task.agent] ?? "#888";

  return (
    <motion.div
      className="rounded-lg border border-primary/20 bg-primary/5 mb-3 overflow-hidden shadow-sm"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: color }}
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              {task.agent}
            </span>
          </div>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 border-primary/30 text-primary">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            RUNNING
          </Badge>
        </div>
        <p className="text-sm font-medium text-foreground mb-3 line-clamp-3">
          {task.prompt}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground">
            {task.id.slice(0, 8)}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onCancel(task.id)}
            className="h-7 text-[10px] px-2.5 gap-1.5"
          >
            <X className="h-3 w-3" /> CANCEL
          </Button>
        </div>
      </div>
      <div className="h-1 bg-muted overflow-hidden">
        <motion.div
          className="h-full bg-primary"
          initial={{ x: "-100%" }}
          animate={{ x: "0%" }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          style={{ width: "50%" }}
        />
      </div>
    </motion.div>
  );
}

function HistoryTaskCard({
  task,
  onRerun,
}: {
  task: Task;
  onRerun: (task: Task) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = AGENT_COLORS[task.agent] ?? "#888";

  return (
    <div
      className={cn(
        "group flex flex-col border-b border-border/50 hover:bg-accent/20 transition-colors",
        expanded && "bg-accent/10"
      )}
    >
      <div
        className="flex items-center gap-3 p-2 px-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0">
          <StatusIcon status={task.status} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="text-[11px] text-foreground truncate">
            {task.prompt}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-tighter text-muted-foreground/70" style={{ color: expanded ? color : undefined }}>
              {task.agent}
            </span>
            <span className="text-[9px] text-muted-foreground/50 font-mono">
              {task.id.slice(0, 4)}
            </span>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform text-muted-foreground opacity-0 group-hover:opacity-100",
            expanded && "rotate-180 opacity-100"
          )}
        />
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="px-3 pb-3 pt-1 overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="text-[10px] text-muted-foreground mb-2 whitespace-pre-wrap bg-background/50 p-2 rounded border border-border/30">
              {task.prompt}
            </div>
            {task.error_msg && (
              <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-[10px] text-destructive mb-2">
                {task.error_msg}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[9px] px-2 gap-1 border-muted-foreground/30"
                onClick={(e) => {
                  e.stopPropagation();
                  onRerun(task);
                }}
              >
                <RotateCcw className="h-2.5 w-2.5" /> RE-RUN
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NewTaskModal({ onClose }: { onClose: () => void }) {
  const workingDirectory = useWorkspaceStore((s) => s.workingDirectory);
  const [prompt, setPrompt] = useState("");
  const [agent, setAgent] = useState<AgentKind | "custom">("claude");
  const [customAgentName, setCustomAgentName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!prompt.trim() || !workingDirectory) return;
    setSubmitting(true);
    const resolvedAgent =
      agent === "custom" ? customAgentName.trim() || "custom_agent" : agent;
    try {
      await ipc.submitTask({
        agent: resolvedAgent as string,
        prompt,
        working_dir: workingDirectory,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden bg-card border-primary/20">
        <DialogHeader className="px-6 py-4 border-b border-border bg-accent/10">
          <DialogTitle className="text-sm font-bold tracking-widest uppercase text-primary">
            INITIATE TASK
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 p-6 bg-background">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                AGENT
              </label>
              <select
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-accent/5 px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all cursor-pointer"
                value={agent}
                onChange={(e) => setAgent(e.target.value as any)}
              >
                <option value="claude">Claude Code</option>
                <option value="gemini">Gemini CLI</option>
                <option value="goose">Goose</option>
                <option value="custom">Custom Agent</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                DIRECTORY
              </label>
              <div className="h-9 px-3 py-2 rounded-md border border-input bg-muted/30 text-xs text-muted-foreground truncate flex items-center">
                {workingDirectory?.split("/").pop()}
              </div>
            </div>
          </div>

          {agent === "custom" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                CUSTOM COMMAND
              </label>
              <Input
                className="h-9 text-xs bg-accent/5 border-input"
                value={customAgentName}
                onChange={(e) => setCustomAgentName(e.target.value)}
                placeholder="e.g. 'my-cli-tool --agent'"
                autoFocus
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              OBJECTIVE
            </label>
            <textarea
              className="flex min-h-[140px] w-full rounded-md border border-input bg-accent/5 px-3 py-3 text-xs shadow-sm font-mono placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-all"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task for the agent..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleSubmit();
              }}
            />
            <div className="flex justify-between items-center mt-1">
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-tighter">
                Press ⌘+Enter to execute
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-accent/10 sm:justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="text-[11px] font-bold h-8">
            DISCARD
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || submitting}
            className="gap-2 h-8 text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {submitting ? "SUBMITTING..." : "EXECUTE"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskPanel() {
  const runningTasks = useTaskStore((s) => s.runningTasks);
  const queuedTasks = useTaskStore((s) => s.queuedTasks);
  const historyTasks = useTaskStore((s) => s.historyTasks);
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState("");

  const allTasksForSearch = [...historyTasks];
  const fuse = useMemo(
    () =>
      new Fuse(allTasksForSearch, {
        keys: ["prompt", "agent", "id"],
        threshold: 0.3,
      }),
    [allTasksForSearch.length],
  );

  const filteredHistory = query.trim()
    ? fuse.search(query).map((r) => r.item)
    : historyTasks;

  const handleCancel = async (id: string) => {
    await ipc.cancelTask(id);
  };

  const handleRerun = async (task: Task) => {
    await ipc.submitTask({
      agent: task.agent,
      prompt: task.prompt,
      working_dir: task.working_dir,
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-3 px-4 border-b border-border shrink-0 bg-background">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">
          Orchestrator
        </span>
        <Button
          size="sm"
          onClick={() => setShowModal(true)}
          className="h-7 w-7 p-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Running / Active Section */}
        <div className="shrink-0 p-4 border-b border-border/50 bg-accent/5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <div className="w-1 h-1 bg-primary rounded-full" />
            Active Tasks
          </div>
          
          <div className="min-h-[100px]">
            {runningTasks.length === 0 && queuedTasks.length === 0 ? (
              <div className="h-[100px] border border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground/40">
                <Zap className="h-5 w-5 opacity-20" />
                <span className="text-[10px] font-medium uppercase tracking-tighter">No active tasks</span>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {runningTasks.map((t) => (
                  <RunningTaskCard key={t.id} task={t} onCancel={handleCancel} />
                ))}
                {queuedTasks.map((t) => (
                  <div key={t.id} className="p-3 rounded-lg border border-border bg-muted/10 mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{t.prompt}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCancel(t.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* History Section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 p-2 px-4 border-b border-border/50 text-muted-foreground bg-background">
            <Search className="h-3 w-3" />
            <input
              className="flex-1 bg-transparent border-none outline-none text-[11px] text-foreground placeholder:text-muted-foreground/40"
              placeholder="Search history..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredHistory.length === 0 ? (
              <div className="p-8 text-center">
                <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest">History is empty</span>
              </div>
            ) : (
              filteredHistory.map((t) => (
                <HistoryTaskCard key={t.id} task={t} onRerun={handleRerun} />
              ))
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showModal && <NewTaskModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
