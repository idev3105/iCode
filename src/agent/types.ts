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
}
