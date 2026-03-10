export type AgentType = 'claude' | 'gemini';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Task {
	id: string;
	agentType: AgentType;
	prompt: string;
	status: TaskStatus;
	createdAt: number;
	output: string;
	sessionId?: string;
	eventCount?: number;
}

export type SessionStatus = 'waiting' | 'init' | 'working' | 'stop';

export interface Session {
	id: string;
	agentType: AgentType;
	prompt: string;
	status: SessionStatus;
	createdAt: number;
	sessionId?: string;
	workDir?: string;
	eventCount?: number;
}
