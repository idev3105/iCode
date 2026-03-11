import { useState, useCallback } from "react";
import { cn } from "../../lib/utils";
import { KanbanSection } from "./KanbanSection";
import type { KanbanTask, KanbanColumn, Priority } from "@kanban/types";

const ALL_COLUMNS: KanbanColumn[] = ["backlog", "todo", "in-progress", "review", "done", "cancelled"];
const COLUMN_LABELS: Record<KanbanColumn, string> = {
  backlog: "Backlog",
  todo: "To Do",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};
const DEFAULT_COLLAPSED: Partial<Record<KanbanColumn, boolean>> = {
  done: true,
  cancelled: true,
};

interface DragState {
  draggingId: string | null;
  sourceColumn: KanbanColumn | null;
  overColumn: KanbanColumn | null;   // section header hover
  overCardId: string | null;
  insertPosition: "before" | "after" | null;
}

const EMPTY_DRAG: DragState = {
  draggingId: null,
  sourceColumn: null,
  overColumn: null,
  overCardId: null,
  insertPosition: null,
};

interface KanbanBoardProps {
  tasks: KanbanTask[];
  onCreateTask: (title: string, description: string, priority: Priority, column: KanbanColumn) => void;
  onMoveTask: (id: string, column: KanbanColumn, order: number) => void;
  onUpdateTask: (id: string, changes: Partial<Pick<KanbanTask, "title" | "description" | "priority" | "labels">>) => void;
  onDeleteTask: (id: string) => void;
  onOpenTask: (id: string) => void;
}

export function KanbanBoard({
  tasks,
  onCreateTask,
  onMoveTask,
  onUpdateTask,
  onDeleteTask,
  onOpenTask,
}: KanbanBoardProps) {
  const [drag, setDrag] = useState<DragState>(EMPTY_DRAG);

  const tasksByColumn = useCallback(
    (col: KanbanColumn) => tasks.filter((t) => t.column === col),
    [tasks]
  );

  const handleCardDragStart = useCallback((taskId: string, column: KanbanColumn) => {
    setDrag({ draggingId: taskId, sourceColumn: column, overColumn: null, overCardId: null, insertPosition: null });
  }, []);

  const handleCardDragEnd = useCallback(() => setDrag(EMPTY_DRAG), []);

  const handleCardDragOver = useCallback(
    (e: React.DragEvent, taskId: string, position: "before" | "after") => {
      e.preventDefault();
      e.stopPropagation();
      setDrag((d) => ({ ...d, overCardId: taskId, insertPosition: position, overColumn: null }));
    },
    []
  );

  const handleCardDragLeave = useCallback(() => {
    setDrag((d) => ({ ...d, overCardId: null, insertPosition: null }));
  }, []);

  const handleSectionDragOver = useCallback((e: React.DragEvent, column: KanbanColumn) => {
    e.preventDefault();
    setDrag((d) => ({ ...d, overColumn: column, overCardId: null, insertPosition: null }));
  }, []);

  const handleSectionDragLeave = useCallback(() => {
    setDrag((d) => ({ ...d, overColumn: null }));
  }, []);

  const handleDropOnSection = useCallback(
    (e: React.DragEvent, column: KanbanColumn) => {
      e.preventDefault();
      if (!drag.draggingId) { return; }
      const colTasks = tasks.filter((t) => t.column === column && t.id !== drag.draggingId);
      onMoveTask(drag.draggingId, column, colTasks.length);
      setDrag(EMPTY_DRAG);
    },
    [drag.draggingId, tasks, onMoveTask]
  );

  const handleDropOnCard = useCallback(
    (e: React.DragEvent, targetTaskId: string, column: KanbanColumn) => {
      e.preventDefault();
      e.stopPropagation();
      if (!drag.draggingId || drag.draggingId === targetTaskId) { return; }

      const colTasks = tasks
        .filter((t) => t.column === column && t.id !== drag.draggingId)
        .sort((a, b) => a.order - b.order);

      const targetIdx = colTasks.findIndex((t) => t.id === targetTaskId);
      const insertIdx = drag.insertPosition === "after" ? targetIdx + 1 : targetIdx;

      onMoveTask(drag.draggingId, column, Math.max(0, insertIdx));
      setDrag(EMPTY_DRAG);
    },
    [drag.draggingId, drag.insertPosition, tasks, onMoveTask]
  );

  return (
    <div className="flex flex-col gap-0">
      {ALL_COLUMNS.map((col) => (
        <KanbanSection
          key={col}
          column={col}
          label={COLUMN_LABELS[col]}
          tasks={tasksByColumn(col)}
          defaultCollapsed={DEFAULT_COLLAPSED[col] ?? false}
          dragState={{
            draggingId: drag.draggingId,
            overCardId: drag.overCardId,
            insertPosition: drag.insertPosition,
          }}
          isSectionDropTarget={drag.overColumn === col}
          onAddTask={(title, desc, priority) => onCreateTask(title, desc, priority, col)}
          onOpenTask={onOpenTask}
          onCardDragStart={(taskId) => handleCardDragStart(taskId, col)}
          onCardDragEnd={handleCardDragEnd}
          onCardDragOver={handleCardDragOver}
          onCardDragLeave={handleCardDragLeave}
          onSectionDragOver={(e) => handleSectionDragOver(e, col)}
          onSectionDragLeave={handleSectionDragLeave}
          onDropOnSection={(e) => handleDropOnSection(e, col)}
          onDropOnCard={(e, targetId) => handleDropOnCard(e, targetId, col)}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onMoveTask={(id, targetCol) => {
            const colTasks = tasks.filter((t) => t.column === targetCol);
            onMoveTask(id, targetCol, colTasks.length);
          }}
        />
      ))}
    </div>
  );
}
