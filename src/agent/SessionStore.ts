import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Session } from './types';

const SESSIONS_DIR = path.join(os.homedir(), '.iCode');
const SESSIONS_FILE = path.join(SESSIONS_DIR, 'sessions.json');

export class SessionStore {
	private sessions: Map<string, Session> = new Map();

	constructor() {
		this.load();
	}

	private load(): void {
		try {
			if (fs.existsSync(SESSIONS_FILE)) {
				const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
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
		if (!fs.existsSync(SESSIONS_DIR)) {
			fs.mkdirSync(SESSIONS_DIR, { recursive: true });
		}
		const data = Array.from(this.sessions.values());
		fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
	}

	set(session: Session): void {
		this.sessions.set(session.id, { ...session });
		this.save();
	}

	get(id: string): Session | undefined {
		return this.sessions.get(id);
	}

	getAll(): Session[] {
		return Array.from(this.sessions.values());
	}
}
