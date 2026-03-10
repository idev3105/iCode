import * as vscode from 'vscode';
import { v7 as uuidv7 } from 'uuid';
import { Task, AgentType } from './types';
import { ensureHooks } from '../server/HookInstaller';
import { ensureGeminiHooks } from '../server/GeminiHookInstaller';

const GEMINI_SESSION_START_TIMEOUT_MS = 15_000;

// Events that warrant focusing the agent's terminal
const FOCUS_EVENTS = new Set([
	'Stop', 'Notification', 'PermissionRequest',  // Claude
	'AfterAgent', 'SessionEnd',                    // Gemini
]);

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
	private sessionTerminals: Map<string, vscode.Terminal> = new Map();
	private hookPort: number | undefined;

	// Queue ensures only one Gemini agent initializes at a time (waits for SessionStart)
	private geminiInitQueue: Promise<void> = Promise.resolve();
	// Resolves with the session_id once SessionStart hook fires
	private pendingGeminiSession: ((sessionId: string) => void) | null = null;

	private readonly _onTaskUpdated = new vscode.EventEmitter<Task>();
	readonly onTaskUpdated = this._onTaskUpdated.event;

	constructor(hookPort?: number) {
		this.hookPort = hookPort;
	}

	/** Called by HookServer for every incoming hook event. */
	onHookEvent(event: Record<string, unknown>): void {
		const eventName = event.hook_event_name as string | undefined;
		const sessionId = event.session_id as string | undefined;

		// Gemini SessionStart: resolve the pending init promise
		if (eventName === 'SessionStart' && this.pendingGeminiSession && sessionId) {
			const resolve = this.pendingGeminiSession;
			this.pendingGeminiSession = null;
			resolve(sessionId);
			return;
		}

		// Focus the terminal for notable events
		if (eventName && FOCUS_EVENTS.has(eventName) && sessionId) {
			this.focusTerminalBySession(sessionId);
		}
	}

	focusTerminalBySession(sessionId: string): void {
		this.sessionTerminals.get(sessionId)?.show(true);
	}

	async runTask(task: Task): Promise<void> {
		if (task.agentType === 'gemini') {
			// Chain onto the init queue so Gemini agents start sequentially,
			// each waiting for SessionStart before the next can begin.
			this.geminiInitQueue = this.geminiInitQueue
				.then(() => this.initGeminiTask(task))
				.catch(() => { /* don't break the queue on timeout/error */ });
			return;
		}

		// Claude (and any future agents)
		await this.startTask(task);
	}

	private async startTask(task: Task): Promise<void> {
		if (task.agentType === 'claude' && this.hookPort !== undefined) {
			await ensureHooks(this.hookPort);
		}

		task.status = 'running';
		this.tasks.set(task.id, task);
		this._onTaskUpdated.fire({ ...task });

		const { shellPath, shellArgs } = getAgentShell(task.agentType);
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		const sessionId = uuidv7();
		task.sessionId = sessionId;
		shellArgs.push('--session-id', sessionId);
		this.tasks.set(task.id, task);
		this._onTaskUpdated.fire({ ...task });

		const terminal = vscode.window.createTerminal({
			name: `iCode [${task.agentType}]`,
			shellPath,
			shellArgs,
			cwd,
			location: vscode.TerminalLocation.Editor,
		});

		this.terminals.set(task.id, terminal);
		this.sessionTerminals.set(sessionId, terminal);
		terminal.show();

		if (task.prompt) {
			terminal.sendText(task.prompt);
		}

		const disposable = vscode.window.onDidCloseTerminal(closed => {
			if (closed === terminal) {
				task.status = 'completed';
				this.tasks.set(task.id, task);
				this._onTaskUpdated.fire({ ...task });
				this.terminals.delete(task.id);
				this.sessionTerminals.delete(sessionId);
				disposable.dispose();
			}
		});
	}

	/** Starts a Gemini task and waits for SessionStart before resolving (unblocking the queue). */
	private async initGeminiTask(task: Task): Promise<void> {
		if (this.hookPort !== undefined) {
			await ensureGeminiHooks(this.hookPort);
		}

		task.status = 'running';
		this.tasks.set(task.id, task);
		this._onTaskUpdated.fire({ ...task });

		const { shellPath, shellArgs } = getAgentShell('gemini');
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		const terminal = vscode.window.createTerminal({
			name: `iCode [gemini]`,
			shellPath,
			shellArgs,
			cwd,
			location: vscode.TerminalLocation.Editor,
		});

		this.terminals.set(task.id, terminal);
		terminal.show();

		if (task.prompt) {
			terminal.sendText(task.prompt);
		}

		// Wait for Gemini to fire SessionStart hook to learn the session_id
		const sessionId = await Promise.race([
			new Promise<string>(resolve => { this.pendingGeminiSession = resolve; }),
			new Promise<string>((_, reject) =>
				setTimeout(() => reject(new Error('SessionStart timeout')), GEMINI_SESSION_START_TIMEOUT_MS)
			),
		]);

		task.sessionId = sessionId;
		this.tasks.set(task.id, task);
		this.sessionTerminals.set(sessionId, terminal);
		this._onTaskUpdated.fire({ ...task });

		const disposable = vscode.window.onDidCloseTerminal(closed => {
			if (closed === terminal) {
				task.status = 'completed';
				this.tasks.set(task.id, task);
				this._onTaskUpdated.fire({ ...task });
				this.terminals.delete(task.id);
				this.sessionTerminals.delete(sessionId);
				disposable.dispose();
			}
		});
	}

	queueTask(task: Task): void {
		task.status = 'queued';
		this.tasks.set(task.id, task);
		this._onTaskUpdated.fire({ ...task });
		void this.runTask(task);
	}

	getTasks(): Task[] {
		const statusOrder = (s: Task['status']) => s === 'running' ? 0 : s === 'queued' ? 1 : 2;
		return Array.from(this.tasks.values()).sort((a, b) => {
			const statusDiff = statusOrder(a.status) - statusOrder(b.status);
			return statusDiff !== 0 ? statusDiff : b.createdAt - a.createdAt;
		});
	}

	getTask(id: string): Task | undefined {
		return this.tasks.get(id);
	}

	focusTerminal(taskId: string): void {
		this.terminals.get(taskId)?.show();
	}

	getTaskIdByTerminal(terminal: vscode.Terminal): string | undefined {
		for (const [taskId, t] of this.terminals) {
			if (t === terminal) { return taskId; }
		}
		return undefined;
	}

	dispose(): void {
		this._onTaskUpdated.dispose();
		this.terminals.forEach(t => t.dispose());
	}
}
