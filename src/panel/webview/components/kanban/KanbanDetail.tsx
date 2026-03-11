import { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import type { KanbanTask, KanbanColumn, Priority } from "@kanban/types";

const COLUMNS: KanbanColumn[] = ["backlog", "todo", "in-progress", "review", "done", "cancelled"];
const COLUMN_LABELS: Record<KanbanColumn, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};

const PRIORITY_CONFIG: Record<Priority, { label: string; icon: string; color: string }> = {
  low: { label: "Low", icon: "codicon-arrow-down", color: "text-[var(--muted-foreground)]" },
  medium: { label: "Medium", icon: "codicon-arrow-right", color: "text-yellow-500" },
  high: { label: "High", icon: "codicon-arrow-up", color: "text-red-500" },
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface KanbanDetailProps {
  task: KanbanTask;
  visible: boolean;
  onBack: () => void;
  onUpdate: (changes: Partial<Pick<KanbanTask, "title" | "description" | "priority" | "labels">>) => void;
  onMove: (column: KanbanColumn) => void;
  onDelete: () => void;
}

export function KanbanDetail({ task, visible, onBack, onUpdate, onMove, onDelete }: KanbanDetailProps) {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [labelInput, setLabelInput] = useState("");
  const [labels, setLabels] = useState<string[]>(task.labels ?? []);
  const [dirty, setDirty] = useState(false);

  // Sync when task changes (e.g. move updates task prop)
  useEffect(() => {
    setTitle(task.title);
    setDesc(task.description ?? "");
    setLabels(task.labels ?? []);
    setDirty(false);
  }, [task.id]);

  const handleSave = () => {
    onUpdate({ title: title.trim() || task.title, description: desc.trim() || undefined, labels });
    setDirty(false);
  };

  const addLabel = () => {
    const val = labelInput.trim();
    if (val && !labels.includes(val)) {
      const next = [...labels, val];
      setLabels(next);
      setDirty(true);
    }
    setLabelInput("");
  };

  const removeLabel = (l: string) => {
    setLabels((prev) => prev.filter((x) => x !== l));
    setDirty(true);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 flex flex-col bg-[var(--background)] transition-all duration-200 ease-in-out z-20",
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-[var(--border)] shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} title="Back">
          <i className="codicon codicon-arrow-left text-sm" />
        </Button>
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
          Task Detail
        </span>
        {dirty && (
          <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSave}>
            Save
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          title="Delete task"
          onClick={() => { onDelete(); onBack(); }}
        >
          <i className="codicon codicon-trash text-sm" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Checkbox + Title */}
        <div className="flex items-start gap-2.5">
          <button
            className={cn(
              "shrink-0 mt-1 w-4 h-4 rounded-sm border-2 transition-colors flex items-center justify-center",
              task.column === "done"
                ? "bg-emerald-500 border-emerald-500"
                : "border-[var(--border)] hover:border-emerald-500"
            )}
            onClick={() => onMove(task.column === "done" ? "todo" : "done")}
            title={task.column === "done" ? "Mark as not done" : "Mark as done"}
          >
            {task.column === "done" && (
              <i className="codicon codicon-check text-[10px] text-white" />
            )}
          </button>
          <textarea
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            onBlur={() => dirty && handleSave()}
            rows={2}
            className={cn(
              "flex-1 text-[14px] font-medium bg-transparent outline-none resize-none leading-snug",
              "border-b border-transparent focus:border-[var(--border)] transition-colors",
              task.column === "done" && "line-through opacity-50"
            )}
            placeholder="Task title"
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Description
          </span>
          <textarea
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setDirty(true); }}
            onBlur={() => dirty && handleSave()}
            rows={4}
            placeholder="Add a description..."
            className="w-full text-[12px] bg-[var(--accent)] rounded-[var(--radius)] px-2.5 py-2 outline-none resize-none focus:ring-1 focus:ring-[var(--primary)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
          />
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Status
          </span>
          <div className="flex flex-wrap gap-1.5">
            {COLUMNS.map((col) => (
              <button
                key={col}
                onClick={() => onMove(col)}
                className={cn(
                  "px-2.5 py-1 rounded-[var(--radius)] text-[11px] border transition-colors",
                  task.column === col
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]"
                    : "border-[var(--border)] hover:bg-[var(--accent)]"
                )}
              >
                {COLUMN_LABELS[col]}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Priority
          </span>
          <div className="flex gap-1.5">
            {(["low", "medium", "high"] as Priority[]).map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              return (
                <button
                  key={p}
                  onClick={() => { onUpdate({ priority: p }); }}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius)] text-[11px] border transition-colors",
                    task.priority === p
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]"
                      : "border-[var(--border)] hover:bg-[var(--accent)]"
                  )}
                >
                  <i className={cn("codicon text-[10px]", cfg.icon, task.priority !== p && cfg.color)} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Labels */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Labels
          </span>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {labels.map((l) => (
              <button
                key={l}
                onClick={() => removeLabel(l)}
                className="flex items-center gap-1 group"
                title="Remove label"
              >
                <Badge variant="muted" className="text-[10px] px-1.5 py-0 group-hover:bg-red-500/10 group-hover:text-red-400 transition-colors">
                  {l}
                  <i className="codicon codicon-close text-[9px] ml-0.5 opacity-0 group-hover:opacity-100" />
                </Badge>
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { addLabel(); }
                if (e.key === "Escape") { setLabelInput(""); }
              }}
              placeholder="Add label..."
              className="flex-1 text-[11px] bg-[var(--accent)] border border-[var(--border)] rounded-[var(--radius)] px-2 py-1 outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={addLabel}>
              Add
            </Button>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-1 pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
            <span>Created</span>
            <span>{formatDate(task.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
            <span>Updated</span>
            <span>{formatDate(task.updatedAt)}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
            <span>ID</span>
            <code className="font-mono opacity-60">{task.id}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
