import * as vscode from 'vscode';
import { AgentManager } from './agent/AgentManager';
import { AgentType, Task } from './agent/types';
import { TaskPanelProvider } from './panel/TaskPanelProvider';
import { DiffManager } from './diff/DiffManager';

export function activate(context: vscode.ExtensionContext) {
	const agentManager = new AgentManager();
	const diffManager = new DiffManager();
	const panelProvider = new TaskPanelProvider(context, agentManager);

	// Register the sidebar Task Panel
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TaskPanelProvider.viewType, panelProvider)
	);

	// Command: New Task via quick input
	context.subscriptions.push(
		vscode.commands.registerCommand('icode.newTask', async () => {
			const agentItems: { label: string; agentType: AgentType }[] = [
				{ label: '$(hubot) Claude', agentType: 'claude' },
				{ label: '$(hubot) Gemini', agentType: 'gemini' },
			];

			const picked = await vscode.window.showQuickPick(agentItems, {
				placeHolder: 'Select an agent',
			});
			if (!picked) { return; }

			const prompt = await vscode.window.showInputBox({
				placeHolder: 'Enter a prompt or shell command...',
				prompt: `Task for ${picked.agentType}`,
			});
			if (!prompt) { return; }

			const task: Task = {
				id: Math.random().toString(36).slice(2, 10),
				agentType: picked.agentType,
				prompt,
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

	context.subscriptions.push(agentManager, diffManager);
}

export function deactivate() {}
