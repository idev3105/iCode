import * as vscode from 'vscode';
import { Task, AgentType } from './types';

function getAgentShell(agentType: AgentType): { shellPath: string; shellArgs: string[] } {
	const config = vscode.workspace.getConfiguration('icode');
	const yolo = config.get<boolean>('yolo', false);
	switch (agentType) {
		case 'claude':
			return {
				shellPath: config.get<string>('agents.claude.command', 'claude'),
				shellArgs: yolo ? ['--dangerously-skip-permissions'] : [],
			};
		case 'gemini':
			return {
				shellPath: config.get<string>('agents.gemini.command', 'gemini'),
				shellArgs: yolo ? ['--yolo'] : [],
			};
	}
}

export class AgentManager {
	private tasks: Map<string, Task> = new Map();
	private terminals: Map<string, vscode.Terminal> = new Map();

	private readonly _onTaskUpdated = new vscode.EventEmitter<Task>();
	readonly onTaskUpdated = this._onTaskUpdated.event;

	runTask(task: Task): void {
		task.status = 'running';
		this.tasks.set(task.id, task);
		this._onTaskUpdated.fire({ ...task });

		const { shellPath, shellArgs } = getAgentShell(task.agentType);
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		const terminal = vscode.window.createTerminal({
			name: `iCode [${task.agentType}]`,
			shellPath,
			shellArgs,
			cwd,
			location: vscode.TerminalLocation.Editor,
		});

		this.terminals.set(task.id, terminal);
		terminal.show();

		// Send the initial prompt once the shell/agent has started
		if (task.prompt) {
			terminal.sendText(task.prompt);
		}

		// Mark complete when terminal closes
		const disposable = vscode.window.onDidCloseTerminal(closed => {
			if (closed === terminal) {
				task.status = 'completed';
				this.tasks.set(task.id, task);
				this._onTaskUpdated.fire({ ...task });
				this.terminals.delete(task.id);
				disposable.dispose();
			}
		});
	}

	queueTask(task: Task): void {
		task.status = 'queued';
		this.tasks.set(task.id, task);
		this._onTaskUpdated.fire({ ...task });
		this.runTask(task);
	}

	getTasks(): Task[] {
		return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
	}

	getTask(id: string): Task | undefined {
		return this.tasks.get(id);
	}

	focusTerminal(taskId: string): void {
		this.terminals.get(taskId)?.show();
	}

	dispose(): void {
		this._onTaskUpdated.dispose();
		this.terminals.forEach(t => t.dispose());
	}
}
