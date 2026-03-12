import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Session } from './types';

export class SessionStore {
	private sessions: Map<string, Session> = new Map();
	private sessionsDir: string;
	private sessionsFile: string;

	constructor(workDir?: string) {
		if (workDir) {
			this.sessionsDir = path.join(workDir, '.iCode');
		} else {
			this.sessionsDir = path.join(os.homedir(), '.iCode');
		}
		this.sessionsFile = path.join(this.sessionsDir, 'sessions.json');
		this.load();
	}

	private load(): void {
		try {
			if (fs.existsSync(this.sessionsFile)) {
				const data = JSON.parse(fs.readFileSync(this.sessionsFile, 'utf-8'));
				if (Array.isArray(data)) {
					for (const s of data) {
						this.sessions.set(s.id, s);
					}
				}
			}
		} catch {
			// Corrupted file — start fresh
			this.sessions.clear();
		}
	}

	private save(): void {
		if (!fs.existsSync(this.sessionsDir)) {
			fs.mkdirSync(this.sessionsDir, { recursive: true });
		}
		const data = Array.from(this.sessions.values());
		fs.writeFileSync(this.sessionsFile, JSON.stringify(data, null, 2), 'utf-8');
	}

	set(session: Session): void {
		this.sessions.set(session.id, session);
		this.save();
	}

	delete(id: string): void {
		this.sessions.delete(id);
		this.save();
	}

	get(id: string): Session | undefined {
		return this.sessions.get(id);
	}

	getAll(): Session[] {
		return Array.from(this.sessions.values());
	}
}
