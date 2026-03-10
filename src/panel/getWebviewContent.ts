import * as vscode from 'vscode';

export function getWebviewContent(_webview: vscode.Webview, _extensionUri: vscode.Uri): string {
	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>iCode</title>
<style>
  :root {
    --bg: var(--vscode-sideBar-background);
    --fg: var(--vscode-foreground);
    --border: var(--vscode-panel-border, #333);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --input-border: var(--vscode-input-border);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --item-hover: var(--vscode-list-hoverBackground);
    --select-bg: var(--vscode-dropdown-background);
    --select-fg: var(--vscode-dropdown-foreground);
    --select-border: var(--vscode-dropdown-border);
    --warn: #e5a000;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--fg);
    background: var(--bg);
    height: 100vh;
    overflow: hidden;
    position: relative;
  }

  /* ── Screen system ── */
  .screen {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  .screen.hidden {
    transform: translateX(100%);
    opacity: 0;
    pointer-events: none;
  }

  /* ── Shared header ── */
  .header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-title {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.7;
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--fg);
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 4px;
    opacity: 0.6;
    width: auto;
    font-size: 14px;
    line-height: 1;
  }

  .icon-btn:hover { opacity: 1; background: var(--item-hover); }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    opacity: 0.7;
  }

  .back-btn:hover { opacity: 1; }

  /* ── Main screen ── */
  .form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    flex-shrink: 0;
  }

  select {
    background: var(--select-bg);
    color: var(--select-fg);
    border: 1px solid var(--select-border);
    padding: 4px 6px;
    border-radius: 2px;
    width: 100%;
    font-size: var(--vscode-font-size);
  }

  textarea {
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border, transparent);
    padding: 6px;
    border-radius: 2px;
    width: 100%;
    resize: vertical;
    min-height: 80px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }

  textarea:focus, select:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  button {
    background: var(--btn-bg);
    color: var(--btn-fg);
    border: none;
    padding: 6px 12px;
    border-radius: 2px;
    cursor: pointer;
    width: 100%;
    font-size: var(--vscode-font-size);
  }

  button:hover { background: var(--btn-hover); }

  .divider { border: none; border-top: 1px solid var(--border); flex-shrink: 0; }

  .section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.6;
    padding: 6px 8px 2px;
    flex-shrink: 0;
  }

  .task-list {
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 8px 8px;
  }

  .task-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  .task-item:hover { background: var(--item-hover); }

  .task-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .badge-queued    { background: #6c757d; color: #fff; }
  .badge-running   { background: #007acc; color: #fff; }
  .badge-completed { background: #388a34; color: #fff; }
  .badge-failed    { background: #c72e0f; color: #fff; }

  .task-info { flex: 1; min-width: 0; }

  .task-agent {
    font-size: 10px;
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .task-prompt {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-state {
    opacity: 0.5;
    font-size: 12px;
    text-align: center;
    padding: 16px 0;
  }

  /* ── Settings screen ── */
  .settings-list {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    overflow-y: auto;
    flex: 1;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
  }

  .setting-row:hover { background: var(--item-hover); }

  .setting-info { flex: 1; min-width: 0; }

  .setting-name { font-size: 13px; line-height: 1.3; }

  .setting-desc {
    font-size: 11px;
    opacity: 0.5;
    margin-top: 2px;
  }

  .setting-warn .setting-name { color: var(--warn); }
  .setting-warn .setting-desc { color: var(--warn); opacity: 0.7; }

  /* Toggle */
  .toggle {
    position: relative;
    width: 28px;
    height: 16px;
    flex-shrink: 0;
  }

  .toggle input { opacity: 0; width: 0; height: 0; position: absolute; }

  .toggle-track {
    position: absolute;
    inset: 0;
    background: var(--vscode-input-border, #555);
    border-radius: 16px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .toggle input:checked + .toggle-track { background: var(--btn-bg); }
  .setting-warn .toggle input:checked + .toggle-track { background: var(--warn); }

  .toggle-track::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 12px; height: 12px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.15s;
  }

  .toggle input:checked + .toggle-track::after { transform: translateX(12px); }
</style>
</head>
<body>

<!-- ── Main screen ── -->
<div class="screen" id="screen-main">
  <div class="header">
    <span class="header-title">iCode</span>
    <button class="icon-btn" title="Settings" onclick="navigate('settings')">⚙</button>
  </div>

  <div class="form">
    <select id="agentSelect">
      <option value="claude">Claude</option>
      <option value="gemini">Gemini</option>
      <option value="goose">Goose</option>
      <option value="shell">Shell</option>
    </select>
    <textarea id="promptInput" placeholder="Describe the task for the agent..." rows="4"></textarea>
    <button onclick="submitTask()">Run Agent</button>
  </div>

  <hr class="divider">
  <div class="section-label">Tasks</div>
  <div class="task-list" id="taskList">
    <div class="empty-state">No tasks yet. Submit a task above.</div>
  </div>
</div>

<!-- ── Settings screen ── -->
<div class="screen hidden" id="screen-settings">
  <div class="header">
    <button class="icon-btn back-btn" onclick="navigate('main')">&#8592; Back</button>
    <span class="header-title">Settings</span>
  </div>

  <div class="settings-list">
    <div class="setting-row setting-warn">
      <div class="setting-info">
        <div class="setting-name">Yolo Mode</div>
        <div class="setting-desc">Skip all permission prompts for all agents</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="setting-yolo" onchange="onSettingChange('yolo', this.checked)">
        <span class="toggle-track"></span>
      </label>
    </div>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();

  function navigate(screen) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('screen-' + screen).classList.remove('hidden');
  }

  function onSettingChange(key, value) {
    vscode.postMessage({ type: 'updateSetting', key, value });
  }

  function submitTask() {
    const prompt = document.getElementById('promptInput').value.trim();
    const agentType = document.getElementById('agentSelect').value;
    if (!prompt) { return; }
    vscode.postMessage({ type: 'submitTask', agentType, prompt });
    document.getElementById('promptInput').value = '';
  }

  document.getElementById('promptInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { submitTask(); }
  });

  function focusTerminal(taskId) {
    vscode.postMessage({ type: 'focusTerminal', taskId });
  }

  function renderTasks(tasks) {
    const list = document.getElementById('taskList');
    if (!tasks || tasks.length === 0) {
      list.innerHTML = '<div class="empty-state">No tasks yet. Submit a task above.</div>';
      return;
    }
    list.innerHTML = tasks.map(task => {
      const prompt = task.prompt.length > 60 ? task.prompt.slice(0, 60) + '...' : task.prompt;
      return \`<div class="task-item" onclick="focusTerminal('\${task.id}')">
        <span class="task-badge badge-\${task.status}">\${task.status}</span>
        <div class="task-info">
          <div class="task-agent">\${task.agentType}</div>
          <div class="task-prompt" title="\${task.prompt.replace(/"/g,'&quot;')}">\${escapeHtml(prompt)}</div>
        </div>
      </div>\`;
    }).join('');
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'tasksUpdated') {
      renderTasks(msg.tasks);
    } else if (msg.type === 'settingsUpdated') {
      document.getElementById('setting-yolo').checked = !!msg.settings['yolo'];
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
