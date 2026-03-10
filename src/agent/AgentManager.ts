import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { v7 as uuidv7 } from 'uuid';
import { Task, AgentType, Session, SessionStatus } from './types';
import { ensureHooks } from '../server/HookInstaller';
import { ensureGeminiHooks } from '../server/GeminiHookInstaller';
import { SessionStore } from './SessionStore';

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
	private sessionStore: SessionStore;

	// Queue ensures only one Gemini agent initializes at a time (waits for SessionStart)
	private geminiInitQueue: Promise<void> = Promise.resolve();
	// Resolves with the session_id once SessionStart hook fires
	private pendingGeminiSession: ((sessionId: string) => void) | null = null;

	private readonly _onTaskUpdated = new vscode.EventEmitter<Task>();
	readonly onTaskUpdated = this._onTaskUpdated.event;

	constructor(hookPort?: number) {
		this.hookPort = hookPort;
		const workDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		this.sessionStore = new SessionStore(workDir);
	}

	private taskStatusToSessionStatus(status: Task['status']): SessionStatus {
		switch (status) {
			case 'queued': return 'waiting';
			case 'running': return 'working';
			case 'completed':
			case 'failed': return 'stop';
		}
	}

	private findTaskBySessionId(sessionId: string): Task | undefined {
		for (const task of this.tasks.values()) {
			if (task.sessionId === sessionId) {
				return task;
			}
		}
		return undefined;
	}

	private persistSession(task: Task, statusOverride?: SessionStatus): void {
		const session: Session = {
			id: task.id,
			agentType: task.agentType,
			prompt: task.prompt,
			status: statusOverride ?? this.taskStatusToSessionStatus(task.status),
			createdAt: task.createdAt,
			sessionId: task.sessionId,
			eventCount: task.eventCount ?? 0,
		};
		this.sessionStore.set(session);
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

		if (sessionId && eventName !== 'SessionStart' && eventName !== 'SessionEnd' && eventName !== 'Stop') {
			const task = this.findTaskBySessionId(sessionId);
			if (task) {
				task.eventCount = (task.eventCount ?? 0) + 1;
				this.persistSession(task);
				this._onTaskUpdated.fire({ ...task });
			}
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
		this.persistSession(task, 'init');
		this._onTaskUpdated.fire({ ...task });

		const { shellPath, shellArgs } = getAgentShell(task.agentType);
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		const sessionId = uuidv7();
		task.sessionId = sessionId;
		shellArgs.push('--session-id', sessionId);
		this.tasks.set(task.id, task);

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

		this.persistSession(task); // working
		this._onTaskUpdated.fire({ ...task });

		const disposable = vscode.window.onDidCloseTerminal(closed => {
			if (closed === terminal) {
				task.status = 'completed';
				this.tasks.set(task.id, task);
				if ((task.eventCount ?? 0) === 0) {
					this.sessionStore.delete(task.id);
				} else {
					this.persistSession(task); // stop
				}
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
		this.persistSession(task, 'init');
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
		this.persistSession(task); // working
		this._onTaskUpdated.fire({ ...task });

		const disposable = vscode.window.onDidCloseTerminal(closed => {
			if (closed === terminal) {
				task.status = 'completed';
				this.tasks.set(task.id, task);
				if ((task.eventCount ?? 0) === 0) {
					this.sessionStore.delete(task.id);
				} else {
					this.persistSession(task); // stop
				}
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
		this.persistSession(task); // waiting
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

	getSessions(): Session[] {
		return this.sessionStore.getAll().sort((a, b) => b.createdAt - a.createdAt);
	}

	stopTask(taskId: string): void {
		const terminal = this.terminals.get(taskId);
		if (terminal) {
			terminal.dispose();
		}
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

	/** Resume a stopped session by its task ID. */
	async resumeSession(taskId: string): Promise<void> {
		const session = this.sessionStore.get(taskId);
		if (!session || session.status !== 'stop') { return; }

		const task: Task = {
			id: taskId,
			agentType: session.agentType,
			prompt: '',
			status: 'running',
			createdAt: Date.now(),
			output: '',
			sessionId: session.sessionId,
			eventCount: session.eventCount,
		};

		this.tasks.set(task.id, task);
		this.persistSession(task, 'init');
		this._onTaskUpdated.fire({ ...task });

		const config = vscode.workspace.getConfiguration('icode');
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		if (session.agentType === 'claude') {
			if (this.hookPort !== undefined) {
				await ensureHooks(this.hookPort);
			}
			const shellPath = config.get<string>('agents.claude.command', 'claude');
			const shellArgs: string[] = [];
			if (config.get<boolean>('yolo', false)) {
				shellArgs.push('--dangerously-skip-permissions');
			}
			shellArgs.push('--resume', session.sessionId!);

			const terminal = vscode.window.createTerminal({
				name: `iCode [claude] (resumed)`,
				shellPath,
				shellArgs,
				cwd,
				location: vscode.TerminalLocation.Editor,
			});

			this.terminals.set(task.id, terminal);
			if (session.sessionId) {
				this.sessionTerminals.set(session.sessionId, terminal);
			}
			terminal.show();

			this.persistSession(task); // working
			this._onTaskUpdated.fire({ ...task });

			const disposable = vscode.window.onDidCloseTerminal(closed => {
				if (closed === terminal) {
					task.status = 'completed';
					this.tasks.set(task.id, task);
					if ((task.eventCount ?? 0) === 0) {
						this.sessionStore.delete(task.id);
					} else {
						this.persistSession(task); // stop
					}
					this._onTaskUpdated.fire({ ...task });
					this.terminals.delete(task.id);
					if (session.sessionId) {
						this.sessionTerminals.delete(session.sessionId);
					}
					disposable.dispose();
				}
			});
		} else {
			// Gemini: find session index from --list-sessions output
			if (this.hookPort !== undefined) {
				await ensureGeminiHooks(this.hookPort);
			}
			const geminiCmd = config.get<string>('agents.gemini.command', 'gemini');
			const sessionIndex = this.findGeminiSessionIndex(geminiCmd, session.sessionId!, cwd);
			if (sessionIndex === undefined) {
				vscode.window.showErrorMessage(`Could not find Gemini session to resume.`);
				task.status = 'failed';
				this.tasks.set(task.id, task);
				this.persistSession(task); // stop
				this._onTaskUpdated.fire({ ...task });
				return;
			}

			const shellArgs: string[] = [];
			if (config.get<boolean>('yolo', false)) {
				shellArgs.push('--yolo');
			}
			shellArgs.push('-r', String(sessionIndex));

			const terminal = vscode.window.createTerminal({
				name: `iCode [gemini] (resumed)`,
				shellPath: geminiCmd,
				shellArgs,
				cwd,
				location: vscode.TerminalLocation.Editor,
			});

			this.terminals.set(task.id, terminal);
			if (session.sessionId) {
				this.sessionTerminals.set(session.sessionId, terminal);
			}
			terminal.show();

			this.persistSession(task); // working
			this._onTaskUpdated.fire({ ...task });

			const disposable = vscode.window.onDidCloseTerminal(closed => {
				if (closed === terminal) {
					task.status = 'completed';
					this.tasks.set(task.id, task);
					if ((task.eventCount ?? 0) === 0) {
						this.sessionStore.delete(task.id);
					} else {
						this.persistSession(task); // stop
					}
					this._onTaskUpdated.fire({ ...task });
					this.terminals.delete(task.id);
					if (session.sessionId) {
						this.sessionTerminals.delete(session.sessionId);
					}
					disposable.dispose();
				}
			});
		}
	}

	/** Parse `gemini --list-sessions` to find the line index for a given session ID. */
	private findGeminiSessionIndex(geminiCmd: string, sessionId: string, cwd?: string): number | undefined {
		try {
			const output = execSync(`${geminiCmd} --list-sessions`, {
				encoding: 'utf-8',
				cwd,
				timeout: 10_000,
			});
			const lines = output.split('\n');
			for (const line of lines) {
				if (line.includes(sessionId)) {
					const match = line.match(/^\s*(\d+)/);
					if (match) { return parseInt(match[1], 10); }
				}
			}
		} catch {
			// Command failed
		}
		return undefined;
	}

	dispose(): void {
		this._onTaskUpdated.dispose();
		this.terminals.forEach(t => t.dispose());
	}
}
