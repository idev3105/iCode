import * as vscode from 'vscode';
import { AgentManager } from '../agent/AgentManager';
import { AgentType, Task } from '../agent/types';
import { KanbanManager } from '../kanban/KanbanManager';
import { KanbanColumn, Priority } from '../kanban/types';
import { getWebviewContent } from './getWebviewContent';

const SETTING_KEYS = ['yolo'] as const;

type SettingKey = typeof SETTING_KEYS[number];

type WebviewMessage =
	| { type: 'submitTask'; agentType: AgentType; prompt: string }
	| { type: 'submitTaskWithPrompt'; agentType: AgentType }
	| { type: 'focusTerminal'; taskId: string }
	| { type: 'resumeSession'; taskId: string }
	| { type: 'stopSession'; taskId: string }
	| { type: 'updateSetting'; key: SettingKey; value: boolean }
	| { type: 'ready' }
	| { type: 'kanban:getTasks' }
	| { type: 'kanban:createTask'; title: string; description?: string; column: KanbanColumn; priority: Priority; labels?: string[] }
	| { type: 'kanban:moveTask'; id: string; column: KanbanColumn; order: number }
	| { type: 'kanban:updateTask'; id: string; title?: string; description?: string; priority?: Priority; labels?: string[] }
	| { type: 'kanban:deleteTask'; id: string }
	| { type: 'kanban:resolveTask'; id: string };

export class TaskPanelProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'icode.taskPanel';

	private view?: vscode.WebviewView;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly agentManager: AgentManager,
		private readonly kanbanManager: KanbanManager
	) {
		agentManager.onTaskUpdated(() => this.refresh());
		kanbanManager.onChanged(() => this.refreshKanban());
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};

		const devMode = this.context.extensionMode === vscode.ExtensionMode.Development;
		webviewView.webview.html = getWebviewContent(webviewView.webview, this.context, devMode);

		webviewView.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
			switch (msg.type) {
				case 'ready':
					this.refresh();
					this.sendSettings();
					break;

				case 'submitTask': {
					const task: Task = {
						id: Math.random().toString(36).slice(2, 10),
						agentType: msg.agentType,
						prompt: msg.prompt,
						status: 'queued',
						createdAt: Date.now(),
						output: '',
					};
					this.agentManager.queueTask(task);
					break;
				}

				case 'submitTaskWithPrompt': {
					const prompt = await vscode.window.showInputBox({
						prompt: `Enter a prompt for ${msg.agentType}`,
						placeHolder: 'Type your prompt here...',
					});
					if (prompt) {
						const task: Task = {
							id: Math.random().toString(36).slice(2, 10),
							agentType: msg.agentType,
							prompt,
							status: 'queued',
							createdAt: Date.now(),
							output: '',
						};
						this.agentManager.queueTask(task);
					}
					break;
				}

				case 'focusTerminal':
					this.agentManager.focusTerminal(msg.taskId);
					break;

				case 'resumeSession':
					this.agentManager.resumeSession(msg.taskId);
					break;

				case 'stopSession':
					this.agentManager.stopTask(msg.taskId);
					break;

				case 'updateSetting':
					vscode.workspace
						.getConfiguration('icode')
						.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
					break;

				case 'kanban:getTasks':
					await this.refreshKanban();
					break;

				case 'kanban:createTask':
					await this.kanbanManager.createTask({
						title: msg.title,
						description: msg.description,
						column: msg.column,
						priority: msg.priority,
						labels: msg.labels,
					});
					break;

				case 'kanban:moveTask':
					await this.kanbanManager.moveTask(msg.id, msg.column, msg.order);
					break;

				case 'kanban:updateTask':
					await this.kanbanManager.updateTask(msg.id, {
						title: msg.title,
						description: msg.description,
						priority: msg.priority,
						labels: msg.labels,
					});
					break;

				case 'kanban:deleteTask':
					await this.kanbanManager.deleteTask(msg.id);
					break;

				case 'kanban:resolveTask': {
					const allKanbanTasks = await this.kanbanManager.getTasks();
					const kanbanTask = allKanbanTasks.find(t => t.id === msg.id);
					if (!kanbanTask) { break; }

					const agent = await vscode.window.showQuickPick(
						[
							{ label: 'Claude', agentType: 'claude' as AgentType },
							{ label: 'Gemini', agentType: 'gemini' as AgentType },
						],
						{ placeHolder: 'Select an agent to resolve this task' }
					);
					if (!agent) { break; }

					const prompt = kanbanTask.description
						? `${kanbanTask.title}\n\n${kanbanTask.description}`
						: kanbanTask.title;

					const task: Task = {
						id: Math.random().toString(36).slice(2, 10),
						agentType: agent.agentType,
						prompt,
						status: 'queued',
						createdAt: Date.now(),
						output: '',
					};
					this.agentManager.queueTask(task);

					const inProgressTasks = allKanbanTasks.filter(t => t.column === 'in-progress');
					await this.kanbanManager.moveTask(msg.id, 'in-progress', inProgressTasks.length);
					break;
				}
			}
		});
	}

	private sendSettings(): void {
		if (!this.view) { return; }
		const config = vscode.workspace.getConfiguration('icode');
		const settings: Record<string, boolean> = {};
		for (const key of SETTING_KEYS) {
			settings[key] = config.get<boolean>(key, false);
		}
		this.view.webview.postMessage({ type: 'settingsUpdated', settings });
	}

	refresh(): void {
		if (this.view) {
			this.view.webview.postMessage({
				type: 'tasksUpdated',
				tasks: this.agentManager.getTasks(),
				sessions: this.agentManager.getSessions(),
			});
		}
	}

	async refreshKanban(): Promise<void> {
		if (!this.view) { return; }
		const tasks = await this.kanbanManager.getTasks();
		this.view.webview.postMessage({ type: 'kanban:tasksLoaded', tasks });
	}

	notifyFocusedTask(taskId: string | null): void {
		this.view?.webview.postMessage({ type: 'focusedTask', taskId });
	}

	openSettings(): void {
		if (this.view) {
			this.view.webview.postMessage({ type: 'navigate', screen: 'settings' });
		}
	}
}
