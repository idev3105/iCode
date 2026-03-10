import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// Gemini hook events we care about
const HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'BeforeAgent',
  'AfterAgent',
  'BeforeTool',
  'AfterTool',
  'Notification',
];

export async function ensureGeminiHooks(port: number): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) { return; }
  if (path.resolve(workspaceRoot) === path.resolve(os.homedir())) { return; }

  const settingsPath = path.join(workspaceRoot, '.gemini', 'settings.json');
  const hookUrl = `http://localhost:${port}/hook`;
  // curl pipes stdin JSON to our HTTP server; ignore errors so the agent isn't blocked
  const hookCommand = `curl -s -X POST -H 'Content-Type: application/json' -d @- '${hookUrl}' || true`;
  const hookEntry = [{ hooks: [{ type: 'command', command: hookCommand }] }];

  let settings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(raw);
  } catch {
    // file missing or invalid JSON — start fresh
  }

  const existing = (settings.hooks ?? {}) as Record<string, unknown>;
  let changed = false;

  for (const event of HOOK_EVENTS) {
    const entries = existing[event] as Array<{ hooks?: Array<{ type?: string; command?: string }> }> | undefined;
    const hasCorrectHook = entries?.some(e =>
      e.hooks?.some(h => h.type === 'command' && h.command === hookCommand)
    );
    if (!hasCorrectHook) {
      existing[event] = hookEntry;
      changed = true;
    }
  }

  if (!changed) { return; }

  settings.hooks = existing;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  vscode.window.showInformationMessage('iCode: Gemini hooks installed in .gemini/settings.json');
}
