<script lang="ts">
  import { onMount } from 'svelte';
  import type { Task, AgentType } from '../../agent/types';

  // State using Svelte 5 runes
  let tasks = $state<Task[]>([]);
  let yoloMode = $state(false);
  let currentScreen = $state<'main' | 'settings'>('main');
  let focusedTaskId = $state<string | null>(null);

  // VS Code API
  let vscode: any;

  // Simple Icons paths
  const CLAUDE_PATH = "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z";
  const GEMINI_PATH = "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81";

  // VS Code Codicon paths
  const WARNING_ICON = "M12.71 2.42a1 1 0 0 0-1.42 0L1.13 12.58a1 1 0 0 0 0 1.42l10.16 10.16a1 1 0 0 0 1.42 0l10.16-10.16a1 1 0 0 0 0-1.42L12.71 2.42zM12 18a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1-5h-2V7h2v6z";
  const BACK_ICON = "M13.71 4.29l-5.7 5.71h11.99v2h-11.99l5.7 5.71-1.42 1.42-8.12-8.13 8.12-8.13z";

  onMount(() => {
    // @ts-ignore
    vscode = acquireVsCodeApi();

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'tasksUpdated') {
        tasks = msg.tasks;
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
  <div class="text-[11px] uppercase tracking-wider opacity-60 px-2 pt-1.5 pb-0.5 shrink-0">Active Sessions</div>
  <div class="overflow-y-auto flex-1 flex flex-col gap-1 p-2">
    {#if tasks.length === 0}
      <div class="opacity-50 text-[12px] text-center py-4">No active agents. Click a button above to start.</div>
    {:else}
      {#each tasks as task (task.id)}
        <div class="flex items-start gap-2 p-1.5 rounded-md cursor-pointer transition-colors
          {focusedTaskId === task.id ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'}"
          role="button" tabindex="0"
          onclick={() => focusTerminal(task.id)}
          onkeydown={(e) => e.key === 'Enter' && focusTerminal(task.id)}>
          <span class="inline-block w-2 h-2 rounded-full shrink-0 mt-1.5
            {task.status === 'running' ? 'bg-yellow-400' : ''}
            {task.status === 'completed' ? 'bg-green-500' : ''}
            {task.status === 'queued' ? 'bg-gray-400' : ''}
            {task.status === 'failed' ? 'bg-red-500' : ''}"></span>
          <div class="flex-1 min-w-0">
            <div class="text-[10px] opacity-60 uppercase tracking-tight flex items-center gap-1">
              <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <path d={task.agentType === 'claude' ? CLAUDE_PATH : GEMINI_PATH} />
              </svg>
              {task.agentType}
            </div>
            <div class="text-[12px] overflow-hidden text-ellipsis whitespace-nowrap">{new Date(task.createdAt).toLocaleTimeString()}</div>
            {#if task.sessionId}
              <div class="text-[10px] opacity-40 font-mono mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap" title={task.sessionId}>
                {task.sessionId.slice(0, 8)}
              </div>
            {:else if task.status === 'running' && task.agentType === 'gemini'}
              <div class="text-[10px] opacity-40 mt-0.5">waiting for session…</div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<div class="fixed inset-0 flex flex-col transition-all duration-200 ease-in-out {currentScreen !== 'settings' ? 'translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}">
  <div class="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--vscode-panel-border,#333)] shrink-0">
    <button class="bg-transparent border-none text-current cursor-pointer p-1 rounded opacity-60 hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)] flex items-center justify-center" onclick={() => navigate('main')} title="Back">
      <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
        <path d={BACK_ICON} />
      </svg>
    </button>
    <span class="flex-1 text-[11px] font-semibold uppercase tracking-wider opacity-70">Settings</span>
  </div>

  <div class="flex flex-col py-2 overflow-y-auto flex-1 text-[var(--vscode-foreground)] bg-[var(--vscode-sideBar-background)]">
    <div class="flex items-center justify-between gap-3 px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] group">
      <div class="flex-1 min-w-0">
        <div class="text-[13px] leading-tight flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 fill-[#e5a000] shrink-0" viewBox="0 0 24 24">
            <path d={WARNING_ICON} />
          </svg>
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
