import { useState, useRef } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import type { KanbanTask, KanbanColumn } from "@kanban/types";

const COLUMNS: KanbanColumn[] = ["backlog", "todo", "in-progress", "review", "done", "cancelled"];
const COLUMN_LABELS_MAP: Record<KanbanColumn, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};

interface KanbanCardProps {
  task: KanbanTask;
  isDragging: boolean;
  isInsertBefore: boolean;
  isInsertAfter: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, position: "before" | "after") => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onOpen: () => void;
  onDelete: () => void;
  onMove: (column: KanbanColumn) => void;
  onResolve?: () => void;
}

export function KanbanCard({
  task,
  isDragging,
  isInsertBefore,
  isInsertAfter,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpen,
  onDelete,
  onMove,
  onResolve,
}: KanbanCardProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!cardRef.current) { return; }
    const rect = cardRef.current.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    onDragOver(e, e.clientY < midY ? "before" : "after");
  };

  return (
    <div
      ref={cardRef}
      className={cn("relative", isDragging && "opacity-40")}
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isInsertBefore && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--primary)] rounded-full z-10 -translate-y-px" />
      )}

      <div
        className="group flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] hover:bg-[var(--accent)] transition-colors"
      >
        {/* Drag handle */}
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex items-center opacity-0 group-hover:opacity-40 hover:!opacity-80 cursor-grab active:cursor-grabbing shrink-0 transition-opacity"
          title="Drag to move"
        >
          <i className="codicon codicon-gripper text-[11px]" />
        </div>

        {/* Checkbox */}
        <button
          className={cn(
            "shrink-0 w-3.5 h-3.5 rounded-sm border transition-colors flex items-center justify-center",
            task.column === "done"
              ? "bg-emerald-500 border-emerald-500"
              : "border-[var(--border)] hover:border-emerald-500"
          )}
          title={task.column === "done" ? "Mark as not done" : "Mark as done"}
          onClick={(e) => {
            e.stopPropagation();
            onMove(task.column === "done" ? "todo" : "done");
          }}
        >
          {task.column === "done" && (
            <i className="codicon codicon-check text-[9px] text-white" />
          )}
        </button>

        {/* Title + labels — click opens detail */}
        <button className="flex-1 min-w-0 text-left" onClick={onOpen}>
          <span
            className={cn(
              "text-[12px] leading-tight block",
              task.column === "done" && "line-through opacity-50"
            )}
          >
            {task.title}
          </span>
          {task.labels?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {task.labels.map((l) => (
                <Badge key={l} variant="muted" className="text-[9px] px-1 py-0">
                  {l}
                </Badge>
              ))}
            </div>
          )}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {onResolve && task.column === "todo" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
              title="Start resolving with AI agent"
              onClick={(e) => { e.stopPropagation(); onResolve(); }}
            >
              <i className="codicon codicon-play text-[10px]" />
            </Button>
          )}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              title="Move to column"
              onClick={(e) => { e.stopPropagation(); setShowMoveMenu((v) => !v); }}
            >
              <i className="codicon codicon-arrow-swap text-[10px]" />
            </Button>
            {showMoveMenu && (
              <div
                className="absolute right-0 top-6 z-50 min-w-[120px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] shadow-lg py-0.5"
                onMouseLeave={() => setShowMoveMenu(false)}
              >
                {COLUMNS.filter((c) => c !== task.column).map((col) => (
                  <button
                    key={col}
                    className="w-full text-left px-2.5 py-1 text-[11px] hover:bg-[var(--accent)] transition-colors"
                    onClick={() => { onMove(col); setShowMoveMenu(false); }}
                  >
                    {COLUMN_LABELS_MAP[col]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <i className="codicon codicon-trash text-[10px]" />
          </Button>
        </div>
      </div>

      {isInsertAfter && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] rounded-full z-10 translate-y-px" />
      )}
    </div>
  );
}
