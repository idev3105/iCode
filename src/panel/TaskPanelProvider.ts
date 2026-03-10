import * as vscode from 'vscode';
import { AgentManager } from '../agent/AgentManager';
import { AgentType, Task, Session } from '../agent/types';
import { getWebviewContent } from './getWebviewContent';

const SETTING_KEYS = ['yolo'] as const;

type SettingKey = typeof SETTING_KEYS[number];

type WebviewMessage =
	| { type: 'submitTask'; agentType: AgentType; prompt: string }
	| { type: 'focusTerminal'; taskId: string }
	| { type: 'resumeSession'; taskId: string }
	| { type: 'stopSession'; taskId: string }
	| { type: 'updateSetting'; key: SettingKey; value: boolean }
	| { type: 'ready' };

export class TaskPanelProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'icode.taskPanel';

	private view?: vscode.WebviewView;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly agentManager: AgentManager
	) {
		agentManager.onTaskUpdated(() => this.refresh());
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

		webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
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

	notifyFocusedTask(taskId: string | null): void {
		this.view?.webview.postMessage({ type: 'focusedTask', taskId });
	}

	openSettings(): void {
		if (this.view) {
			this.view.webview.postMessage({ type: 'navigate', screen: 'settings' });
		}
	}
}
