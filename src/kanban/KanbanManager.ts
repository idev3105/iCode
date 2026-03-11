import * as vscode from 'vscode';
import { KanbanStore } from './KanbanStore';
import { KanbanTask, KanbanColumn, Priority } from './types';

export class KanbanManager implements vscode.Disposable {
	private store = new KanbanStore();
	private _onChanged = new vscode.EventEmitter<void>();
	readonly onChanged = this._onChanged.event;

	async getTasks(): Promise<KanbanTask[]> {
		const data = await this.store.load();
		return data.tasks;
	}

	async createTask(params: {
		title: string;
		description?: string;
		column: KanbanColumn;
		priority: Priority;
		labels?: string[];
	}): Promise<KanbanTask> {
		const data = await this.store.load();
		const colTasks = data.tasks.filter(t => t.column === params.column);
		const task: KanbanTask = {
			id: Math.random().toString(36).slice(2, 10),
			title: params.title,
			description: params.description,
			column: params.column,
			priority: params.priority,
			labels: params.labels ?? [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			order: colTasks.length,
		};
		data.tasks.push(task);
		await this.store.save(data);
		this._onChanged.fire();
		return task;
	}

	async moveTask(id: string, column: KanbanColumn, order: number): Promise<void> {
		const data = await this.store.load();
		const task = data.tasks.find(t => t.id === id);
		if (!task) { return; }

		const oldCol = task.column;
		task.column = column;
		task.updatedAt = Date.now();

		// Re-order target column
		const colTasks = data.tasks.filter(t => t.column === column && t.id !== id);
		colTasks.sort((a, b) => a.order - b.order);
		colTasks.splice(order, 0, task);
		colTasks.forEach((t, i) => { t.order = i; });

		// Re-order old column if changed
		if (oldCol !== column) {
			const oldColTasks = data.tasks.filter(t => t.column === oldCol);
			oldColTasks.sort((a, b) => a.order - b.order);
			oldColTasks.forEach((t, i) => { t.order = i; });
		}

		await this.store.save(data);
		this._onChanged.fire();
	}

	async updateTask(id: string, changes: Partial<Pick<KanbanTask, 'title' | 'description' | 'priority' | 'labels'>>): Promise<void> {
		const data = await this.store.load();
		const task = data.tasks.find(t => t.id === id);
		if (!task) { return; }
		Object.assign(task, changes, { updatedAt: Date.now() });
		await this.store.save(data);
		this._onChanged.fire();
	}

	async deleteTask(id: string): Promise<void> {
		const data = await this.store.load();
		data.tasks = data.tasks.filter(t => t.id !== id);
		await this.store.save(data);
		this._onChanged.fire();
	}

	dispose(): void {
		this._onChanged.dispose();
	}
}
