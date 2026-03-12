import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Task, AgentType, Session } from "../../agent/types";
import type { KanbanTask, KanbanColumn, Priority } from "@kanban/types";
import { cn } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Switch } from "./components/ui/switch";
import { Separator } from "./components/ui/separator";
import { Badge } from "./components/ui/badge";
import { Tooltip } from "./components/ui/tooltip";
import { KanbanBoard } from "./components/kanban/KanbanBoard";
import { KanbanDetail } from "./components/kanban/KanbanDetail";

// Simple Icons SVG paths
const CLAUDE_PATH =
  "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z";
const GEMINI_PATH =
  "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81";

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
};

interface SessionEntry {
  id: string;
  agentType: AgentType;
  sessionId?: string;
  createdAt: number;
  status: "working" | "waiting" | "stop";
  isActive: boolean;
  eventCount?: number;
}

const MAX_COLLAPSED_STOPPED = 3;

function AgentIcon({ type, className }: { type: AgentType; className?: string }) {
  return (
    <svg className={cn("fill-current", className)} viewBox="0 0 24 24">
      <path d={type === "claude" ? CLAUDE_PATH : GEMINI_PATH} />
    </svg>
  );
}

function StatusDot({ status }: { status: SessionEntry["status"] }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status === "working" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          status === "working" && "bg-emerald-400",
          status === "waiting" && "bg-yellow-400",
          status === "stop" && "bg-[var(--muted-foreground)] opacity-40"
        )}
      />
    </span>
  );
}

function StatusLabel({ status }: { status: SessionEntry["status"] }) {
  if (status === "working") return <Badge variant="success">Active</Badge>;
  if (status === "waiting") return <Badge variant="warning">Queued</Badge>;
  return <Badge variant="muted">Stopped</Badge>;
}

function AgentSplitButton({
  type,
  onStart,
  onStartWithPrompt,
}: {
  type: AgentType;
  onStart: () => void;
  onStartWithPrompt: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className="flex">
        <Button
          onClick={onStart}
          className="h-10 gap-2 flex-1 rounded-r-none transition-transform hover:-translate-y-px active:translate-y-0"
          title={`Start ${type} Session`}
        >
          <AgentIcon type={type} className="w-4 h-4" />
          <span className="text-xs font-medium capitalize">{type}</span>
        </Button>
        <Button
          onClick={() => setOpen((v) => !v)}
          className="h-10 px-1.5 rounded-l-none border-l border-l-[var(--primary-foreground)]/20"
          title="More options"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-md overflow-hidden">
          <button
            className="w-full px-3 py-2 text-xs text-left hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] transition-colors"
            onClick={() => { setOpen(false); onStart(); }}
          >
            Start Session
          </button>
          <button
            className="w-full px-3 py-2 text-xs text-left hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] transition-colors"
            onClick={() => { setOpen(false); onStartWithPrompt(); }}
          >
            Start with Prompt
          </button>
        </div>
      )}
    </div>
  );
}

function SessionItem({
  entry,
  focused,
  onFocus,
  onResume,
  onStop,
}: {
  entry: SessionEntry;
  focused: boolean;
  onFocus: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius)] transition-colors",
        entry.isActive && "cursor-pointer",
        focused
          ? "bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30"
          : "hover:bg-[var(--accent)]"
      )}
      role="button"
      tabIndex={0}
      onClick={() => entry.isActive && onFocus()}
      onKeyDown={(e) => e.key === "Enter" && entry.isActive && onFocus()}
    >
      <StatusDot status={entry.status} />

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <AgentIcon type={entry.agentType} className="w-3 h-3 opacity-60" />
          <span className="text-[11px] font-medium capitalize opacity-70">
            {entry.agentType}
          </span>
          <StatusLabel status={entry.status} />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
          <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
          {entry.eventCount !== undefined && entry.eventCount > 0 && (
            <span className="flex items-center gap-0.5 opacity-60">
              <i className="codicon codicon-history text-[10px]" />
              {entry.eventCount}
            </span>
          )}
          {entry.sessionId ? (
            <Tooltip content={entry.sessionId}>
              <code className="text-[10px] opacity-50 font-mono">
                {entry.sessionId.slice(0, 8)}
              </code>
            </Tooltip>
          ) : entry.status === "working" && entry.agentType === "gemini" ? (
            <span className="text-[10px] italic opacity-40">awaiting session...</span>
          ) : null}
        </div>
      </div>

      {entry.isActive && (
        <Tooltip content="Stop session">
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={(e) => {
              e.stopPropagation();
              onStop();
            }}
          >
            <i className="codicon codicon-debug-stop text-sm" />
          </Button>
        </Tooltip>
      )}

      {entry.status === "stop" && entry.sessionId && (
        <Tooltip content="Resume session">
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onResume();
            }}
          >
            <i className="codicon codicon-debug-restart text-sm" />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}


type MainTab = "agents" | "kanban";

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>([]);
  const [yoloMode, setYoloMode] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<"main" | "settings">("main");
  const [activeTab, setActiveTab] = useState<MainTab>("agents");
  const [kanbanLoaded, setKanbanLoaded] = useState(false);
  const [selectedKanbanId, setSelectedKanbanId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [vscode] = useState(() => acquireVsCodeApi());

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "tasksUpdated") {
        setTasks(msg.tasks);
        if (msg.sessions) setSessions(msg.sessions);
      } else if (msg.type === "settingsUpdated") {
        setYoloMode(!!msg.settings["yolo"]);
      } else if (msg.type === "navigate") {
        setCurrentScreen(msg.screen);
      } else if (msg.type === "focusedTask") {
        setFocusedTaskId(msg.taskId ?? null);
      } else if (msg.type === "kanban:tasksLoaded") {
        setKanbanTasks(msg.tasks);
      }
    };
    window.addEventListener("message", handler);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, [vscode]);

  const submitTask = useCallback(
    (agentType: AgentType) => vscode.postMessage({ type: "submitTask", agentType, prompt: "" }),
    [vscode]
  );
  const submitTaskWithPrompt = useCallback(
    (agentType: AgentType) => vscode.postMessage({ type: "submitTaskWithPrompt", agentType }),
    [vscode]
  );
  const focusTerminal = useCallback(
    (taskId: string) => vscode.postMessage({ type: "focusTerminal", taskId }),
    [vscode]
  );
  const resumeSession = useCallback(
    (taskId: string) => vscode.postMessage({ type: "resumeSession", taskId }),
    [vscode]
  );
  const stopSession = useCallback(
    (taskId: string) => vscode.postMessage({ type: "stopSession", taskId }),
    [vscode]
  );
  const onSettingChange = useCallback(
    (key: string, value: boolean) => vscode.postMessage({ type: "updateSetting", key, value }),
    [vscode]
  );

  const kanbanCreateTask = useCallback(
    (title: string, description: string, priority: Priority, column: KanbanColumn) =>
      vscode.postMessage({ type: "kanban:createTask", title, description: description || undefined, column, priority }),
    [vscode]
  );
  const kanbanMoveTask = useCallback(
    (id: string, column: KanbanColumn, order: number) =>
      vscode.postMessage({ type: "kanban:moveTask", id, column, order }),
    [vscode]
  );
  const kanbanUpdateTask = useCallback(
    (id: string, changes: Partial<Pick<KanbanTask, "title" | "description" | "priority" | "labels">>) =>
      vscode.postMessage({ type: "kanban:updateTask", id, ...changes }),
    [vscode]
  );
  const kanbanDeleteTask = useCallback(
    (id: string) => vscode.postMessage({ type: "kanban:deleteTask", id }),
    [vscode]
  );
  const kanbanResolveTask = useCallback(
    (id: string) => vscode.postMessage({ type: "kanban:resolveTask", id }),
    [vscode]
  );

  const allSessions = useMemo<SessionEntry[]>(() => {
    const statusOrder = (s: SessionEntry["status"]) =>
      s === "working" ? 0 : s === "waiting" ? 1 : 2;
    const activeIds = new Set(tasks.map((t) => t.id));
    const entries: SessionEntry[] = [];

    for (const task of tasks) {
      entries.push({
        id: task.id,
        agentType: task.agentType,
        sessionId: task.sessionId,
        createdAt: task.createdAt,
        status: task.status === "running" ? "working" : task.status === "queued" ? "waiting" : "stop",
        isActive: task.status === "running" || task.status === "queued",
        eventCount: task.eventCount,
      });
    }

    for (const s of sessions) {
      if (s.status === "stop" && s.sessionId && !activeIds.has(s.id)) {
        entries.push({
          id: s.id,
          agentType: s.agentType,
          sessionId: s.sessionId,
          createdAt: s.createdAt,
          status: "stop",
          isActive: false,
          eventCount: s.eventCount,
        });
      }
    }

    return entries.sort((a, b) => {
      const sd = statusOrder(a.status) - statusOrder(b.status);
      return sd !== 0 ? sd : b.createdAt - a.createdAt;
    });
  }, [tasks, sessions]);

  const stoppedSessions = useMemo(
    () => allSessions.filter((s) => s.status === "stop"),
    [allSessions]
  );

  const visibleSessions = useMemo(() => {
    const active = allSessions.filter((s) => s.status !== "stop");
    if (showAllSessions || stoppedSessions.length <= MAX_COLLAPSED_STOPPED) {
      return [...active, ...stoppedSessions];
    }
    return [...active, ...stoppedSessions.slice(0, MAX_COLLAPSED_STOPPED)];
  }, [allSessions, stoppedSessions, showAllSessions]);

  const hiddenCount = useMemo(() => {
    if (showAllSessions || stoppedSessions.length <= MAX_COLLAPSED_STOPPED) return 0;
    return stoppedSessions.length - MAX_COLLAPSED_STOPPED;
  }, [stoppedSessions, showAllSessions]);

  return (
    <>
      {/* ── Main Screen ── */}
      <div
        className={cn(
          "fixed inset-0 flex flex-col transition-all duration-200 ease-in-out",
          currentScreen !== "main"
            ? "translate-x-full opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100"
        )}
      >
        {/* Tab Bar */}
        <div className="flex shrink-0 border-b border-[var(--border)]">
          <button
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors border-b-2",
              activeTab === "agents"
                ? "border-[var(--primary)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
            onClick={() => setActiveTab("agents")}
          >
            <i className="codicon codicon-terminal text-[12px]" />
            Agents
          </button>
          <button
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors border-b-2",
              activeTab === "kanban"
                ? "border-[var(--primary)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
            onClick={() => {
                setActiveTab("kanban");
                if (!kanbanLoaded) {
                  setKanbanLoaded(true);
                  vscode.postMessage({ type: "kanban:getTasks" });
                }
              }}
          >
            <i className="codicon codicon-project text-[12px]" />
            Tasks
            {kanbanTasks.filter((t) => t.column === "in-progress").length > 0 && (
              <span className="text-[9px] bg-yellow-500/20 text-yellow-500 rounded px-1 tabular-nums">
                {kanbanTasks.filter((t) => t.column === "in-progress").length}
              </span>
            )}
          </button>
        </div>

        {/* ── Agents Tab ── */}
        <div
          className={cn(
            "flex flex-col flex-1 min-h-0 transition-all duration-200",
            activeTab !== "agents" && "hidden"
          )}
        >
          {/* Agent Launch */}
          <div className="px-3 pt-3 pb-2 space-y-2 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
              New Session
            </span>
            <div className="grid grid-cols-2 gap-2">
              <AgentSplitButton type="claude" onStart={() => submitTask("claude")} onStartWithPrompt={() => submitTaskWithPrompt("claude")} />
              <AgentSplitButton type="gemini" onStart={() => submitTask("gemini")} onStartWithPrompt={() => submitTaskWithPrompt("gemini")} />
            </div>
          </div>

          <Separator />

          {/* Sessions List */}
          <div className="px-3 pt-2 pb-1 shrink-0 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
              Sessions
            </span>
            {allSessions.length > 0 && (
              <span className="text-[10px] tabular-nums text-[var(--muted-foreground)]">
                {allSessions.filter((s) => s.status !== "stop").length} active
              </span>
            )}
          </div>

          <div className="overflow-y-auto flex-1 px-1 pt-1 pb-2 space-y-0.5">
            {visibleSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-2">
                <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                  <i className="codicon codicon-terminal text-[var(--muted-foreground)] text-base" />
                </div>
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  No sessions yet.
                  <br />
                  Start one above.
                </p>
              </div>
            ) : (
              <>
                {visibleSessions.map((entry) => (
                  <SessionItem
                    key={entry.id}
                    entry={entry}
                    focused={focusedTaskId === entry.id}
                    onFocus={() => focusTerminal(entry.id)}
                    onResume={() => resumeSession(entry.id)}
                    onStop={() => stopSession(entry.id)}
                  />
                ))}

                {hiddenCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-[11px] text-[var(--muted-foreground)] mt-1"
                    onClick={() => setShowAllSessions(true)}
                  >
                    Show {hiddenCount} more
                    <i className="codicon codicon-chevron-down text-xs ml-1" />
                  </Button>
                )}
                {showAllSessions && stoppedSessions.length > MAX_COLLAPSED_STOPPED && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-[11px] text-[var(--muted-foreground)] mt-1"
                    onClick={() => setShowAllSessions(false)}
                  >
                    Show less
                    <i className="codicon codicon-chevron-up text-xs ml-1" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Kanban Tab ── */}
        <div
          className={cn(
            "flex flex-col flex-1 min-h-0 transition-all duration-200",
            activeTab !== "kanban" && "hidden"
          )}
        >
          {!kanbanLoaded ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-2">
                <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                  <i className="codicon codicon-project text-[var(--muted-foreground)] text-base" />
                </div>
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  Select this tab to load tasks.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 py-1">
                {kanbanTasks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-2">
                    <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                      <i className="codicon codicon-project text-[var(--muted-foreground)] text-base" />
                    </div>
                    <p className="text-[12px] text-[var(--muted-foreground)]">
                      No tasks yet.
                      <br />
                      Click <strong>+</strong> next to a column to add one.
                    </p>
                  </div>
                )}
                <KanbanBoard
                  tasks={kanbanTasks}
                  onCreateTask={kanbanCreateTask}
                  onMoveTask={kanbanMoveTask}
                  onUpdateTask={kanbanUpdateTask}
                  onDeleteTask={kanbanDeleteTask}
                  onResolveTask={kanbanResolveTask}
                  onOpenTask={(id) => setSelectedKanbanId(id)}
                />
              </div>
            )}
        </div>
      </div>

      {/* ── Settings Screen ── */}
      <div
        className={cn(
          "fixed inset-0 flex flex-col transition-all duration-200 ease-in-out",
          currentScreen !== "settings"
            ? "translate-x-full opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100"
        )}
      >
        <div className="flex items-center gap-1.5 px-2 py-2 border-b border-[var(--border)] shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentScreen("main")}
            title="Back"
          >
            <i className="codicon codicon-arrow-left text-sm" />
          </Button>
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
            Settings
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-[var(--accent)] transition-colors rounded-[var(--radius)] mx-1 mt-1">
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="text-[13px] leading-tight flex items-center gap-1.5 font-medium">
                <i className="codicon codicon-warning text-sm text-yellow-500 shrink-0" />
                Yolo Mode
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Skip all permission prompts for all agents
              </p>
            </div>
            <Switch
              checked={yoloMode}
              onCheckedChange={(checked) => onSettingChange("yolo", checked)}
            />
          </div>
        </div>
      </div>

      {/* ── Kanban Detail Screen ── */}
      {(() => {
        const selectedTask = kanbanTasks.find((t) => t.id === selectedKanbanId) ?? null;
        if (!selectedTask) { return null; }
        return (
          <KanbanDetail
            key={selectedTask.id}
            task={selectedTask}
            visible={true}
            onBack={() => setSelectedKanbanId(null)}
            onUpdate={(changes) => kanbanUpdateTask(selectedTask.id, changes)}
            onMove={(col) => {
              const colTasks = kanbanTasks.filter((t) => t.column === col);
              kanbanMoveTask(selectedTask.id, col, colTasks.length);
            }}
            onDelete={() => kanbanDeleteTask(selectedTask.id)}
          />
        );
      })()}
    </>
  );
}
