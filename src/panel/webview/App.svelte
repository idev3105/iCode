<script lang="ts">
  import { onMount } from 'svelte';
  import type { Task, AgentType, Session } from '../../agent/types';

  // State using Svelte 5 runes
  let tasks = $state<Task[]>([]);
  let sessions = $state<Session[]>([]);
  let yoloMode = $state(false);
  let currentScreen = $state<'main' | 'settings'>('main');
  let focusedTaskId = $state<string | null>(null);

  // VS Code API
  let vscode: any;

  // Simple Icons paths
  const CLAUDE_PATH = "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z";
  const GEMINI_PATH = "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81";



  onMount(() => {
    // @ts-ignore
    vscode = acquireVsCodeApi();

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'tasksUpdated') {
        tasks = msg.tasks;
        if (msg.sessions) { sessions = msg.sessions; }
      } else if (msg.type === 'settingsUpdated') {
        yoloMode = !!msg.settings['yolo'];
      } else if (msg.type === 'navigate') {
        currentScreen = msg.screen;
      } else if (msg.type === 'focusedTask') {
        focusedTaskId = msg.taskId ?? null;
      }
    });

    vscode.postMessage({ type: 'ready' });
  });

  function navigate(screen: 'main' | 'settings') {
    currentScreen = screen;
  }

  function onSettingChange(key: string, value: boolean) {
    vscode.postMessage({ type: 'updateSetting', key, value });
  }

  function submitTask(agentType: AgentType) {
    vscode.postMessage({ type: 'submitTask', agentType, prompt: '' });
  }

  function focusTerminal(taskId: string) {
    vscode.postMessage({ type: 'focusTerminal', taskId });
  }

  function resumeSession(taskId: string) {
    vscode.postMessage({ type: 'resumeSession', taskId });
  }

  // Unified session list: merge active tasks + stopped persisted sessions
  interface SessionEntry {
    id: string;
    agentType: AgentType;
    sessionId?: string;
    createdAt: number;
    status: 'working' | 'waiting' | 'stop';
    isActive: boolean; // has a live terminal
  }

  let allSessions = $derived.by(() => {
    const statusOrder = (s: SessionEntry['status']) => s === 'working' ? 0 : s === 'waiting' ? 1 : 2;
    const activeIds = new Set(tasks.map(t => t.id));

    const entries: SessionEntry[] = [];

    // Active tasks
    for (const task of tasks) {
      entries.push({
        id: task.id,
        agentType: task.agentType,
        sessionId: task.sessionId,
        createdAt: task.createdAt,
        status: task.status === 'running' ? 'working' : task.status === 'queued' ? 'waiting' : 'stop',
        isActive: task.status === 'running' || task.status === 'queued',
      });
    }

    // Stopped persisted sessions not already shown as active tasks
    for (const s of sessions) {
      if (s.status === 'stop' && s.sessionId && !activeIds.has(s.id)) {
        entries.push({
          id: s.id,
          agentType: s.agentType,
          sessionId: s.sessionId,
          createdAt: s.createdAt,
          status: 'stop',
          isActive: false,
        });
      }
    }

    return entries.sort((a, b) => {
      const sd = statusOrder(a.status) - statusOrder(b.status);
      return sd !== 0 ? sd : b.createdAt - a.createdAt;
    });
  });
</script>

<div class="fixed inset-0 flex flex-col transition-all duration-200 ease-in-out {currentScreen !== 'main' ? 'translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}">
  <div class="text-[11px] uppercase tracking-wider opacity-60 px-2 pt-2 shrink-0">Agents</div>
  <div class="grid grid-cols-2 gap-3 p-3 shrink-0">
    <button class="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none p-3 rounded-md cursor-pointer flex items-center justify-center transition-transform duration-100 hover:bg-[var(--vscode-button-hoverBackground)] hover:-translate-y-0.5 active:translate-y-0" onclick={() => submitTask('claude')} title="Start Claude Session">
      <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24">
        <path d={CLAUDE_PATH} />
      </svg>
    </button>
    <button class="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-none p-3 rounded-md cursor-pointer flex items-center justify-center transition-transform duration-100 hover:bg-[var(--vscode-button-hoverBackground)] hover:-translate-y-0.5 active:translate-y-0" onclick={() => submitTask('gemini')} title="Start Gemini Session">
      <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24">
        <path d={GEMINI_PATH} />
      </svg>
    </button>
  </div>

  <hr class="border-none border-t border-[var(--vscode-panel-border,#333)] shrink-0 m-0">
  <div class="text-[11px] uppercase tracking-wider opacity-60 px-2 pt-1.5 pb-0.5 shrink-0">Sessions</div>
  <div class="overflow-y-auto flex-1 flex flex-col gap-1 p-2">
    {#if allSessions.length === 0}
      <div class="opacity-50 text-[12px] text-center py-4">No sessions. Click a button above to start.</div>
    {:else}
      {#each allSessions as entry (entry.id)}
        <div class="flex items-center gap-2 p-1.5 rounded-md transition-colors
          {entry.isActive ? 'cursor-pointer' : ''}
          {focusedTaskId === entry.id ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'}"
          role="button" tabindex="0"
          onclick={() => entry.isActive && focusTerminal(entry.id)}
          onkeydown={(e) => e.key === 'Enter' && entry.isActive && focusTerminal(entry.id)}>
          <span class="inline-block w-2 h-2 rounded-full shrink-0
            {entry.status === 'working' ? 'bg-yellow-400' : ''}
            {entry.status === 'waiting' ? 'bg-gray-400' : ''}
            {entry.status === 'stop' ? 'bg-gray-500' : ''}"></span>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] opacity-60 uppercase tracking-tight flex items-center gap-1">
              <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <path d={entry.agentType === 'claude' ? CLAUDE_PATH : GEMINI_PATH} />
              </svg>
              {entry.agentType}
            </div>
            <div class="text-[12px] overflow-hidden text-ellipsis whitespace-nowrap">{new Date(entry.createdAt).toLocaleTimeString()}</div>
            {#if entry.sessionId}
              <div class="text-[10px] opacity-40 font-mono mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap" title={entry.sessionId}>
                {entry.sessionId.slice(0, 8)}
              </div>
            {:else if entry.status === 'working' && entry.agentType === 'gemini'}
              <div class="text-[10px] opacity-40 mt-0.5">waiting for session…</div>
            {/if}
          </div>
          {#if entry.status === 'stop' && entry.sessionId}
            <button
              class="bg-transparent border-none text-[var(--vscode-button-background)] p-1 rounded cursor-pointer shrink-0 hover:bg-[var(--vscode-button-background)] hover:text-[var(--vscode-button-foreground)] transition-colors flex items-center justify-center"
              onclick={(e) => { e.stopPropagation(); resumeSession(entry.id); }}
              title="Resume session">
              <i class="codicon codicon-debug-restart text-[16px]"></i>
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<div class="fixed inset-0 flex flex-col transition-all duration-200 ease-in-out {currentScreen !== 'settings' ? 'translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}">
  <div class="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--vscode-panel-border,#333)] shrink-0">
    <button class="bg-transparent border-none text-current cursor-pointer p-1 rounded opacity-60 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)] flex items-center justify-center" onclick={() => navigate('main')} title="Back">
      <i class="codicon codicon-arrow-left text-[16px]"></i>
    </button>
    <span class="flex-1 text-[11px] font-semibold uppercase tracking-wider opacity-70">Settings</span>
  </div>

  <div class="flex flex-col py-2 overflow-y-auto flex-1 text-[var(--vscode-foreground)] bg-[var(--vscode-sideBar-background)]">
    <div class="flex items-center justify-between gap-3 px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] group">
      <div class="flex-1 min-w-0">
        <div class="text-[13px] leading-tight flex items-center gap-1.5">
          <i class="codicon codicon-warning text-[14px] text-[#e5a000] shrink-0"></i>
          Yolo Mode
        </div>
        <div class="text-[11px] opacity-50 mt-0.5">Skip all permission prompts for all agents</div>
      </div>
      <label class="relative w-7 h-4 shrink-0 cursor-pointer">
        <input type="checkbox" class="sr-only peer" checked={yoloMode} onchange={(e) => onSettingChange('yolo', e.currentTarget.checked)}>
        <div class="absolute inset-0 bg-[var(--vscode-input-border,#555)] rounded-full transition-colors peer-checked:bg-[#e5a000] 
          after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-3 after:h-3 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-3"></div>
      </label>
    </div>
  </div>
</div>
