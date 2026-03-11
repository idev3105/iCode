export type KanbanColumn = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high';

export interface KanbanTask {
	id: string;
	title: string;
	description?: string;
	column: KanbanColumn;
	priority: Priority;
	labels: string[];
	createdAt: number;
	updatedAt: number;
	order: number;
}

export interface KanbanData {
	version: number;
	tasks: KanbanTask[];
}

export const COLUMN_LABELS: Record<KanbanColumn, string> = {
	backlog: 'Backlog',
	todo: 'To Do',
	'in-progress': 'In Progress',
	review: 'Review',
	done: 'Done',
	cancelled: 'Cancelled',
};

export const ALL_COLUMNS: KanbanColumn[] = [
	'backlog',
	'todo',
	'in-progress',
	'review',
	'done',
	'cancelled',
];
