import { useState, useRef, useEffect } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { KanbanCard } from "./KanbanCard";
import type { KanbanTask, KanbanColumn, Priority } from "@kanban/types";

const COLUMN_COLORS: Record<KanbanColumn, string> = {
  backlog: "text-[var(--muted-foreground)]",
  todo: "text-blue-400",
  "in-progress": "text-yellow-400",
  review: "text-purple-400",
  done: "text-emerald-400",
  cancelled: "text-red-400/60",
};

const COLUMN_DOT: Record<KanbanColumn, string> = {
  backlog: "bg-[var(--muted-foreground)]",
  todo: "bg-blue-400",
  "in-progress": "bg-yellow-400",
  review: "bg-purple-400",
  done: "bg-emerald-400",
  cancelled: "bg-red-400/60",
};

interface AddTaskFormProps {
  column: KanbanColumn;
  onAdd: (title: string, description: string, priority: Priority) => void;
  onCancel: () => void;
}

function AddTaskForm({ onAdd, onCancel }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  const handleSubmit = () => {
    if (title.trim()) {
      onAdd(title.trim(), desc.trim(), priority);
    }
  };

  return (
    <div className="mt-1 mx-1 p-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--accent)] space-y-1.5">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { handleSubmit(); }
          if (e.key === "Escape") { onCancel(); }
        }}
        placeholder="Task title"
        className="w-full text-[12px] bg-[var(--input)] border border-[var(--border)] rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={2}
        placeholder="Description (optional)"
        className="w-full text-[11px] bg-[var(--input)] border border-[var(--border)] rounded px-1.5 py-0.5 outline-none resize-none focus:ring-1 focus:ring-[var(--primary)] text-[var(--muted-foreground)]"
      />
      <div className="flex items-center gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="text-[10px] bg-[var(--input)] border border-[var(--border)] rounded px-1 py-0.5 outline-none"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <div className="flex gap-1 ml-auto">
          <Button size="sm" className="h-5 text-[10px] px-2" onClick={handleSubmit}>Add</Button>
          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

interface DragState {
  draggingId: string | null;
  overCardId: string | null;
  insertPosition: "before" | "after" | null;
}

interface KanbanSectionProps {
  column: KanbanColumn;
  label: string;
  tasks: KanbanTask[];
  defaultCollapsed?: boolean;
  dragState: DragState;
  isSectionDropTarget: boolean;
  onAddTask: (title: string, description: string, priority: Priority) => void;
  onCardDragStart: (taskId: string) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (e: React.DragEvent, taskId: string, position: "before" | "after") => void;
  onSectionDragOver: (e: React.DragEvent) => void;
  onSectionDragLeave: () => void;
  onDropOnSection: (e: React.DragEvent) => void;
  onDropOnCard: (e: React.DragEvent, targetTaskId: string) => void;
  onCardDragLeave: () => void;
  onOpenTask: (id: string) => void;
  onUpdateTask: (id: string, changes: Partial<Pick<KanbanTask, "title" | "description" | "priority" | "labels">>) => void;
  onDeleteTask: (id: string) => void;
  onMoveTask: (id: string, column: KanbanColumn) => void;
  onResolveTask?: (id: string) => void;
}

export function KanbanSection({
  column,
  label,
  tasks,
  defaultCollapsed = false,
  dragState,
  isSectionDropTarget,
  onAddTask,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onSectionDragOver,
  onSectionDragLeave,
  onDropOnSection,
  onDropOnCard,
  onCardDragLeave,
  onOpenTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  onResolveTask,
}: KanbanSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [showAddForm, setShowAddForm] = useState(false);
  const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasAutoExpanded = useRef(false);

  // Auto-expand on drag hover
  const handleHeaderDragOver = (e: React.DragEvent) => {
    onSectionDragOver(e);
    if (collapsed && !autoExpandTimer.current) {
      autoExpandTimer.current = setTimeout(() => {
        setCollapsed(false);
        wasAutoExpanded.current = true;
      }, 600);
    }
  };

  const handleHeaderDragLeave = () => {
    if (autoExpandTimer.current) {
      clearTimeout(autoExpandTimer.current);
      autoExpandTimer.current = null;
    }
    onSectionDragLeave();
  };

  // Clean up timer
  useEffect(() => () => {
    if (autoExpandTimer.current) { clearTimeout(autoExpandTimer.current); }
  }, []);

  const handleAdd = (title: string, description: string, priority: Priority) => {
    onAddTask(title, description, priority);
    setShowAddForm(false);
  };

  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

  return (
    <div className="shrink-0">
      {/* Section Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none transition-colors rounded-[var(--radius)] mx-1",
          isSectionDropTarget
            ? "bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/40"
            : "hover:bg-[var(--accent)]"
        )}
        onClick={() => setCollapsed((v) => !v)}
        onDragOver={handleHeaderDragOver}
        onDragLeave={handleHeaderDragLeave}
        onDrop={(e) => {
          if (autoExpandTimer.current) { clearTimeout(autoExpandTimer.current); autoExpandTimer.current = null; }
          onDropOnSection(e);
        }}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            COLUMN_DOT[column]
          )}
        />
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider flex-1", COLUMN_COLORS[column])}>
          {label}
        </span>
        <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
          {tasks.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 opacity-60 hover:opacity-100"
          title="Add task"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(false);
            setShowAddForm(true);
          }}
        >
          <i className="codicon codicon-add text-[10px]" />
        </Button>
        <i
          className={cn(
            "codicon text-[10px] opacity-40 transition-transform",
            collapsed ? "codicon-chevron-right" : "codicon-chevron-down"
          )}
        />
      </div>

      {/* Card list */}
      {!collapsed && (
        <div className="pb-1">
          {/* Add form */}
          {showAddForm && (
            <AddTaskForm
              column={column}
              onAdd={handleAdd}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {/* Drop zone when empty */}
          {sortedTasks.length === 0 && !showAddForm && (
            <div
              className={cn(
                "mx-1 my-1 h-8 rounded-[var(--radius)] border border-dashed border-[var(--border)] transition-colors flex items-center justify-center",
                isSectionDropTarget && "border-[var(--primary)]/60 bg-[var(--primary)]/5"
              )}
              onDragOver={onSectionDragOver}
              onDragLeave={onSectionDragLeave}
              onDrop={onDropOnSection}
            >
              <span className="text-[10px] text-[var(--muted-foreground)] opacity-50">
                Drop here
              </span>
            </div>
          )}

          {/* Cards */}
          <div className="px-1 mt-0.5">
            {sortedTasks.map((task, idx) => (
              <div key={task.id}>
                {idx > 0 && (
                  <div className="mx-2 h-px bg-[var(--border)] opacity-50" />
                )}
                <KanbanCard
                  task={task}
                  isDragging={dragState.draggingId === task.id}
                  isInsertBefore={
                    dragState.overCardId === task.id && dragState.insertPosition === "before"
                  }
                  isInsertAfter={
                    dragState.overCardId === task.id && dragState.insertPosition === "after"
                  }
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    onCardDragStart(task.id);
                  }}
                  onDragEnd={onCardDragEnd}
                  onDragOver={(e, pos) => onCardDragOver(e, task.id, pos)}
                  onDragLeave={onCardDragLeave}
                  onDrop={(e) => onDropOnCard(e, task.id)}
                  onOpen={() => onOpenTask(task.id)}
                  onDelete={() => onDeleteTask(task.id)}
                  onMove={(col) => onMoveTask(task.id, col)}
                  onResolve={onResolveTask ? () => onResolveTask(task.id) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
