use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use crate::event_bus::*;
use crate::storage::TaskStorage;
use crate::process_manager::{ProcessManager, ProcessConfig};
use crate::hook_runner::{HookRunner, HookEvent};

// ── Trait ─────────────────────────────────────────────────────────────────

#[async_trait::async_trait]
pub trait AgentOrchestrator: Send + Sync {
    async fn submit_task(&self, request: TaskRequest) -> anyhow::Result<TaskId>;
    async fn cancel_task(&self, task_id: &TaskId) -> anyhow::Result<()>;
    async fn send_input(&self, task_id: &TaskId, data: &str) -> anyhow::Result<()>;
    async fn resize_pty(&self, task_id: &TaskId, rows: u16, cols: u16) -> anyhow::Result<()>;
    async fn get_running_tasks(&self) -> Vec<Task>;
    async fn get_queued_tasks(&self) -> Vec<Task>;
}

// ── Agent Registry ────────────────────────────────────────────────────────

pub struct AgentConfig {
    pub kind: AgentKind,
    pub command: String,
    pub args_prefix: Vec<String>,
    pub color: String,
}

pub fn default_agent_registry() -> Vec<AgentConfig> {
    let default_shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") { "cmd.exe".to_string() } else { "/bin/zsh".to_string() }
    });

    let shell_args = if default_shell.contains("zsh") || default_shell.contains("bash") {
        vec!["-l".to_string(), "-i".to_string()]
    } else {
        vec![]
    };

    vec![
        AgentConfig {
            kind: AgentKind::Custom("shell".to_string()),
            command: default_shell,
            args_prefix: shell_args,
            color: "#928374".to_string(),
        },
        AgentConfig {
            kind: AgentKind::ClaudeCode,
            command: "claude".to_string(),
            args_prefix: vec![],
            color: "#fe8019".to_string(),
        },
        AgentConfig {
            kind: AgentKind::Gemini,
            command: "gemini".to_string(),
            args_prefix: vec![],
            color: "#fabd2f".to_string(),
        },
        AgentConfig {
            kind: AgentKind::Goose,
            command: "goose".to_string(),
            args_prefix: vec!["session".to_string(), "--".to_string()],
            color: "#b8bb26".to_string(),
        },
    ]
}

// ── Default Implementation ────────────────────────────────────────────────

pub struct DefaultAgentOrchestrator {
    pub process_manager: Arc<dyn ProcessManager>,
    pub hook_runner: Arc<dyn HookRunner>,
    pub storage: Arc<dyn TaskStorage>,
    pub event_bus: Arc<dyn EventBus>,
    queue: Mutex<VecDeque<Task>>,
    running: Mutex<Vec<Task>>,
    agent_registry: Vec<AgentConfig>,
}

impl DefaultAgentOrchestrator {
    pub fn new(
        process_manager: Arc<dyn ProcessManager>,
        hook_runner: Arc<dyn HookRunner>,
        storage: Arc<dyn TaskStorage>,
        event_bus: Arc<dyn EventBus>,
    ) -> Arc<Self> {
        Arc::new(DefaultAgentOrchestrator {
            process_manager,
            hook_runner,
            storage,
            event_bus,
            queue: Mutex::new(VecDeque::new()),
            running: Mutex::new(Vec::new()),
            agent_registry: default_agent_registry(),
        })
    }

    /// Start the queue drainer — listens for AgentEnd events to dispatch queued tasks.
    /// Must be called from an async context (after tokio runtime is available).
    pub fn start_queue_drainer(self: &Arc<Self>) {
        let weak = Arc::downgrade(self);
        let mut rx = self.event_bus.subscribe();
        tauri::async_runtime::spawn(async move {
            while let Ok(event) = rx.recv().await {
                if let Event::AgentEnd { agent, task_id, .. } = &event {
                    if let Some(orch) = weak.upgrade() {
                        // Remove from running list
                        {
                            let mut running = orch.running.lock().unwrap();
                            running.retain(|t| t.id != *task_id);
                        }

                        // Try to dispatch next queued task for this agent kind
                        if !Self::is_interactive_shell(agent) {
                            let next_task = {
                                let mut queue = orch.queue.lock().unwrap();
                                let pos = queue.iter().position(|t| t.agent == *agent);
                                pos.and_then(|i| queue.remove(i))
                            };
                            if let Some(task) = next_task {
                                let _ = orch.dispatch_task(task).await;
                            }
                        }
                    } else {
                        break; // Orchestrator dropped
                    }
                }
            }
        });
    }

    fn agent_command(&self, kind: &AgentKind) -> (String, Vec<String>) {
        for config in &self.agent_registry {
            if &config.kind == kind {
                return (config.command.clone(), config.args_prefix.clone());
            }
        }
        (kind.to_string(), vec![])
    }

    fn is_interactive_shell(agent: &AgentKind) -> bool {
        matches!(agent, AgentKind::Custom(s) if s == "shell")
    }

    async fn dispatch_task(&self, task: Task) -> anyhow::Result<TaskId> {
        let (command, mut args) = self.agent_command(&task.agent);
        if !task.prompt.is_empty() {
            args.push(task.prompt.clone());
        }

        let task_id = task.id.clone();
        {
            let mut running = self.running.lock().unwrap();
            running.push(task.clone());
        }

        self.storage.update_task_status(&task_id, TaskStatus::Running).await?;
        self.event_bus.emit(Event::TaskStarted { task: task.clone() }).await?;

        let result = self.process_manager.spawn(ProcessConfig {
            command,
            args,
            working_dir: PathBuf::from(&task.working_dir),
            task_id: task.id.clone(),
            agent: task.agent.clone(),
        }).await;

        if let Err(e) = result {
            // Spawn failed — mark task as error immediately
            self.storage.update_task_status(&task_id, TaskStatus::Error).await?;
            self.event_bus.emit(Event::AgentEnd {
                agent: task.agent,
                task_id: task_id.clone(),
                status: TaskStatus::Error,
                duration_ms: 0,
            }).await?;
            return Err(e);
        }

        // For interactive shells, the process lives until PTY EOF.
        // The process_manager reader thread will emit AgentEnd when done.
        // For non-shell agents, we also rely on PTY EOF for completion now.

        Ok(task_id)
    }
}

#[async_trait::async_trait]
impl AgentOrchestrator for DefaultAgentOrchestrator {
    async fn submit_task(&self, request: TaskRequest) -> anyhow::Result<TaskId> {
        let task = Task::new(request);
        self.storage.save_task(&task).await?;
        self.event_bus.emit(Event::TaskQueued { task: task.clone() }).await?;

        // Interactive shells can always run concurrently — never queue them
        if Self::is_interactive_shell(&task.agent)
            || self.process_manager.is_agent_free(&task.agent).await
        {
            self.dispatch_task(task).await
        } else {
            let id = task.id.clone();
            self.queue.lock().unwrap().push_back(task);
            Ok(id)
        }
    }

    async fn cancel_task(&self, task_id: &TaskId) -> anyhow::Result<()> {
        self.process_manager.kill(task_id).await?;
        self.storage.update_task_status(task_id, TaskStatus::Cancelled).await?;
        self.event_bus.emit(Event::TaskCancelled { task_id: task_id.clone() }).await?;
        Ok(())
    }

    async fn send_input(&self, task_id: &TaskId, data: &str) -> anyhow::Result<()> {
        self.process_manager.write_stdin(task_id, data).await
    }

    async fn resize_pty(&self, task_id: &TaskId, rows: u16, cols: u16) -> anyhow::Result<()> {
        self.process_manager.resize_pty(task_id, rows, cols).await
    }

    async fn get_running_tasks(&self) -> Vec<Task> {
        self.running.lock().unwrap().clone()
    }

    async fn get_queued_tasks(&self) -> Vec<Task> {
        self.queue.lock().unwrap().iter().cloned().collect()
    }
}
