import * as vscode from 'vscode';
import { AgentManager } from './agent/AgentManager';
import { AgentType, Task } from './agent/types';
import { TaskPanelProvider } from './panel/TaskPanelProvider';
import { DiffManager } from './diff/DiffManager';
import { HookServer } from './server/HookServer';
import { KanbanManager } from './kanban/KanbanManager';
import { ensureHooks } from './server/HookInstaller';
import { ensureGeminiHooks } from './server/GeminiHookInstaller';

export function activate(context: vscode.ExtensionContext) {
	const agentManager = new AgentManager();
	const hookServer = new HookServer(event => agentManager.onHookEvent(event));

	// Once the server is up, propagate the actual port and install hooks in both .claude and .gemini
	hookServer.ready.then(port => {
		agentManager.setHookPort(port);
		void ensureHooks(port);
		void ensureGeminiHooks(port);
	}).catch(err => {
		vscode.window.showErrorMessage(`iCode: Hook server failed to start: ${(err as Error).message}`);
	});
	const diffManager = new DiffManager();
	const kanbanManager = new KanbanManager();
	const panelProvider = new TaskPanelProvider(context, agentManager, kanbanManager);

	// Register the sidebar Task Panel
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TaskPanelProvider.viewType, panelProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		})
	);

	// Command: New Session via quick pick (agent selection only)
	context.subscriptions.push(
		vscode.commands.registerCommand('icode.newSession', async () => {
			const agentItems: { label: string; agentType: AgentType }[] = [
				{ label: '$(hubot) Claude', agentType: 'claude' },
				{ label: '$(hubot) Gemini', agentType: 'gemini' },
			];

			const picked = await vscode.window.showQuickPick(agentItems, {
				placeHolder: 'Select an agent to start a session',
			});
			if (!picked) { return; }

			const task: Task = {
				id: Math.random().toString(36).slice(2, 10),
				agentType: picked.agentType,
				prompt: '',
				status: 'queued',
				createdAt: Date.now(),
				output: '',
			};
			agentManager.queueTask(task);
		})
	);

	// Command: Show diff for active file (snapshot before vs current)
	context.subscriptions.push(
		vscode.commands.registerCommand('icode.showDiff', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showWarningMessage('iCode: No active file to diff.');
				return;
			}
			await diffManager.showDiff(activeEditor.document.uri);
		})
	);

	// Command: Snapshot current file before running agent
	context.subscriptions.push(
		vscode.commands.registerCommand('icode.snapshotFile', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showWarningMessage('iCode: No active file to snapshot.');
				return;
			}
			await diffManager.snapshotFile(activeEditor.document.uri);
			vscode.window.showInformationMessage(`iCode: Snapshot saved for ${activeEditor.document.fileName}`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('icode.openSettings', () => {
			panelProvider.openSettings();
		})
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTerminal(terminal => {
			const taskId = terminal ? agentManager.getTaskIdByTerminal(terminal) : null;
			panelProvider.notifyFocusedTask(taskId ?? null);
		})
	);

	context.subscriptions.push(agentManager, hookServer, diffManager, kanbanManager);
}

export function deactivate() {}
