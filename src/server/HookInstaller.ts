import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

const HOOK_EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
  'PostToolUse', 'PostToolUseFailure', 'Notification', 'SubagentStart',
  'SubagentStop', 'Stop',
];

export async function ensureHooks(port: number): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) { return; }

  const settingsPath = path.join(workspaceRoot, '.claude', 'settings.local.json');
  const hookUrl = `http://localhost:${port}/hook`;
  const hookEntry = [{ hooks: [{ type: 'http', url: hookUrl }] }];

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
    const entries = existing[event] as Array<{ hooks?: Array<{ type?: string; url?: string }> }> | undefined;
    const hasCorrectHook = entries?.some(e =>
      e.hooks?.some(h => h.type === 'http' && h.url === hookUrl)
    );
    if (!hasCorrectHook) {
      // Replace any existing icode hook entries with the correct port, or add new
      existing[event] = hookEntry;
      changed = true;
    }
  }

  if (!changed) { return; }

  settings.hooks = existing;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  vscode.window.showInformationMessage('iCode: Claude hooks installed in .claude/settings.local.json');
}
