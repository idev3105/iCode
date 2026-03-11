import * as vscode from 'vscode';
import { KanbanData } from './types';

const ICODE_DIR = '.iCode';
const TASKS_FILE = 'tasks.json';

export class KanbanStore {
	private getFilePath(): vscode.Uri | null {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) { return null; }
		return vscode.Uri.joinPath(folders[0].uri, ICODE_DIR, TASKS_FILE);
	}

	async load(): Promise<KanbanData> {
		const uri = this.getFilePath();
		if (!uri) { return { version: 1, tasks: [] }; }
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			const data = JSON.parse(Buffer.from(bytes).toString('utf8')) as KanbanData;
			// Normalise fields that may be missing in older saved data
			data.tasks = (data.tasks ?? []).map(t => ({ ...t, labels: t.labels ?? [] }));
			return data;
		} catch {
			return { version: 1, tasks: [] };
		}
	}

	async save(data: KanbanData): Promise<void> {
		const uri = this.getFilePath();
		if (!uri) { return; }
		const dir = vscode.Uri.joinPath(uri, '..');
		await vscode.workspace.fs.createDirectory(dir);
		const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
		await vscode.workspace.fs.writeFile(uri, content);
	}
}
