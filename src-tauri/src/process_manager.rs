use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::io::{Read, Write};
use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty, Child};
use crate::event_bus::*;

// ── Trait ─────────────────────────────────────────────────────────────────

pub struct ProcessConfig {
    pub command: String,
    pub args: Vec<String>,
    pub working_dir: PathBuf,
    pub task_id: TaskId,
    pub agent: AgentKind,
}

pub struct ProcessHandle {
    pub pid: u32,
}

#[async_trait::async_trait]
pub trait ProcessManager: Send + Sync {
    async fn spawn(&self, config: ProcessConfig) -> anyhow::Result<ProcessHandle>;
    async fn kill(&self, task_id: &TaskId) -> anyhow::Result<()>;
    async fn write_stdin(&self, task_id: &TaskId, data: &str) -> anyhow::Result<()>;
    async fn is_agent_free(&self, agent: &AgentKind) -> bool;
    async fn resize_pty(&self, task_id: &TaskId, rows: u16, cols: u16) -> anyhow::Result<()>;
}

// ── Real Implementation ───────────────────────────────────────────────────

pub struct TokioProcessManager {
    pub event_bus: Arc<dyn EventBus>,
    handles: Arc<Mutex<HashMap<String, u32>>>,
    pty_masters: Arc<Mutex<HashMap<String, Box<dyn MasterPty + Send>>>>,
    pty_writers: Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>,
    pty_children: Arc<Mutex<HashMap<String, Box<dyn Child + Send>>>>,
    running_agents: Arc<Mutex<HashMap<String, bool>>>,
}

impl TokioProcessManager {
    pub fn new(event_bus: Arc<dyn EventBus>) -> Self {
        TokioProcessManager {
            event_bus,
            handles: Arc::new(Mutex::new(HashMap::new())),
            pty_masters: Arc::new(Mutex::new(HashMap::new())),
            pty_writers: Arc::new(Mutex::new(HashMap::new())),
            pty_children: Arc::new(Mutex::new(HashMap::new())),
            running_agents: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[async_trait::async_trait]
impl ProcessManager for TokioProcessManager {
    async fn spawn(&self, config: ProcessConfig) -> anyhow::Result<ProcessHandle> {
        let pty_system = native_pty_system();
        let pty_pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(&config.command);
        cmd.args(&config.args);
        cmd.cwd(&config.working_dir);
        
        // Inherit environment and set terminal variables
        for (key, val) in std::env::vars() {
            cmd.env(key, val);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pty_pair.slave.spawn_command(cmd)?;
        let pid = child.process_id().unwrap_or(0);

        let master = pty_pair.master;
        let reader = master.try_clone_reader()?;
        let writer = master.take_writer()?;
        
        {
            let mut handles = self.handles.lock().unwrap();
            handles.insert(config.task_id.0.clone(), pid);
            
            let mut masters = self.pty_masters.lock().unwrap();
            masters.insert(config.task_id.0.clone(), master);
            
            let mut writers = self.pty_writers.lock().unwrap();
            writers.insert(config.task_id.0.clone(), writer);

            let mut children = self.pty_children.lock().unwrap();
            children.insert(config.task_id.0.clone(), child);
            
            let mut running = self.running_agents.lock().unwrap();
            running.insert(config.agent.to_string(), true);
        }

        // Stream output
        let bus = self.event_bus.clone();
        let task_id = config.task_id.clone();
        let agent = config.agent.clone();
        let handles_ref = self.handles.clone();
        let masters_ref = self.pty_masters.clone();
        let writers_ref = self.pty_writers.clone();
        let children_ref = self.pty_children.clone();
        let running_ref = self.running_agents.clone();

        let rt = tokio::runtime::Handle::current();
        let start = std::time::Instant::now();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buffer = [0u8; 8192];
            while let Ok(n) = reader.read(&mut buffer) {
                if n == 0 { break; }
                let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                let bus_clone = bus.clone();
                let task_id_clone = task_id.clone();
                let agent_clone = agent.clone();
                rt.spawn(async move {
                    let _ = bus_clone.emit(Event::AgentOutput {
                        agent: agent_clone,
                        task_id: task_id_clone,
                        line: data,
                        stream: Stream::Stdout,
                    }).await;
                });
            }

            // PTY EOF — process exited. Clean up resources.
            let tid = task_id.0.clone();
            {
                let mut handles = handles_ref.lock().unwrap();
                handles.remove(&tid);
                let mut masters = masters_ref.lock().unwrap();
                masters.remove(&tid);
                let mut writers = writers_ref.lock().unwrap();
                writers.remove(&tid);
                let mut children = children_ref.lock().unwrap();
                children.remove(&tid);
                let mut running = running_ref.lock().unwrap();
                running.remove(&agent.to_string());
            }

            let duration_ms = start.elapsed().as_millis() as u64;
            let bus_clone = bus.clone();
            let task_id_clone = task_id.clone();
            let agent_clone = agent.clone();
            rt.spawn(async move {
                let _ = bus_clone.emit(Event::AgentEnd {
                    agent: agent_clone,
                    task_id: task_id_clone,
                    status: TaskStatus::Done,
                    duration_ms,
                }).await;
            });
        });

        Ok(ProcessHandle { pid })
    }

    async fn kill(&self, task_id: &TaskId) -> anyhow::Result<()> {
        let pid = {
            let mut handles = self.handles.lock().unwrap();
            handles.remove(&task_id.0)
        };
        if let Some(pid) = pid {
            #[cfg(unix)]
            {
                let _ = std::process::Command::new("kill")
                    .arg("-9")
                    .arg(pid.to_string())
                    .status();
            }
        }
        {
            let mut masters = self.pty_masters.lock().unwrap();
            masters.remove(&task_id.0);
            let mut writers = self.pty_writers.lock().unwrap();
            writers.remove(&task_id.0);
            let mut children = self.pty_children.lock().unwrap();
            children.remove(&task_id.0);
        }
        Ok(())
    }

    async fn write_stdin(&self, task_id: &TaskId, data: &str) -> anyhow::Result<()> {
        let mut writers = self.pty_writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(&task_id.0) {
            writer.write_all(data.as_bytes())?;
            writer.flush()?;
        }
        Ok(())
    }

    async fn is_agent_free(&self, agent: &AgentKind) -> bool {
        let running = self.running_agents.lock().unwrap();
        !running.get(&agent.to_string()).copied().unwrap_or(false)
    }

    async fn resize_pty(&self, task_id: &TaskId, rows: u16, cols: u16) -> anyhow::Result<()> {
        let masters = self.pty_masters.lock().unwrap();
        if let Some(master) = masters.get(&task_id.0) {
            master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;
        }
        Ok(())
    }
}

// ── Test Double ───────────────────────────────────────────────────────────

pub struct FakeProcessManager {
    pub fixture_lines: Vec<String>,
    pub event_bus: Arc<dyn EventBus>,
    pub busy: bool,
}

impl FakeProcessManager {
    pub fn idle(event_bus: Arc<dyn EventBus>) -> Self {
        FakeProcessManager { fixture_lines: vec![], event_bus, busy: false }
    }

    pub fn busy(event_bus: Arc<dyn EventBus>) -> Self {
        FakeProcessManager { fixture_lines: vec![], event_bus, busy: true }
    }
}

#[async_trait::async_trait]
impl ProcessManager for FakeProcessManager {
    async fn spawn(&self, config: ProcessConfig) -> anyhow::Result<ProcessHandle> {
        for line in &self.fixture_lines {
            let _ = self.event_bus.emit(Event::AgentOutput {
                agent: config.agent.clone(),
                task_id: config.task_id.clone(),
                line: line.clone(),
                stream: Stream::Stdout,
            }).await;
        }
        Ok(ProcessHandle { pid: 0 })
    }

    async fn kill(&self, _task_id: &TaskId) -> anyhow::Result<()> { Ok(()) }
    async fn write_stdin(&self, _task_id: &TaskId, _data: &str) -> anyhow::Result<()> { Ok(()) }
    async fn is_agent_free(&self, _agent: &AgentKind) -> bool { !self.busy }
    async fn resize_pty(&self, _task_id: &TaskId, _rows: u16, _cols: u16) -> anyhow::Result<()> { Ok(()) }
}
