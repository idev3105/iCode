use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use uuid::Uuid;
use chrono::{DateTime, Utc};

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct TaskId(pub String);

impl TaskId {
    pub fn new() -> Self {
        TaskId(Uuid::new_v4().to_string())
    }
}

impl From<String> for TaskId {
    fn from(s: String) -> Self {
        TaskId(s)
    }
}

impl std::fmt::Display for TaskId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct HunkId(pub String);

impl HunkId {
    pub fn new() -> Self {
        HunkId(Uuid::new_v4().to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentKind {
    #[serde(rename = "claude")]
    ClaudeCode,
    Gemini,
    Goose,
    #[serde(untagged)]
    Custom(String),
}

impl std::fmt::Display for AgentKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentKind::ClaudeCode => write!(f, "claude"),
            AgentKind::Gemini => write!(f, "gemini"),
            AgentKind::Goose => write!(f, "goose"),
            AgentKind::Custom(name) => write!(f, "{}", name),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Queued,
    Running,
    Done,
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: TaskId,
    pub agent: AgentKind,
    pub prompt: String,
    pub working_dir: String,
    pub status: TaskStatus,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
    pub error_msg: Option<String>,
}

impl Task {
    pub fn new(request: TaskRequest) -> Self {
        Task {
            id: TaskId::new(),
            agent: request.agent,
            prompt: request.prompt,
            working_dir: request.working_dir,
            status: TaskStatus::Queued,
            started_at: None,
            ended_at: None,
            error_msg: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRequest {
    pub agent: AgentKind,
    pub prompt: String,
    pub working_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Stream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookResult {
    pub success: bool,
    pub output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub file_path: String,
    pub hunks: Vec<DiffHunk>,
    pub added_lines: usize,
    pub removed_lines: usize,
    pub agent: Option<AgentKind>,
    pub task_id: Option<TaskId>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HunkStatus {
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub id: HunkId,
    pub header: String,
    pub lines: Vec<String>,
    pub status: HunkStatus,
}

// ── Event Bus ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Event {
    // Agent lifecycle
    AgentStart { agent: AgentKind, task_id: TaskId, prompt: String },
    AgentEnd { agent: AgentKind, task_id: TaskId, status: TaskStatus, duration_ms: u64 },
    AgentOutput { agent: AgentKind, task_id: TaskId, line: String, stream: Stream },
    AgentFileWrite { agent: AgentKind, task_id: TaskId, path: String },
    AgentCommand { agent: AgentKind, task_id: TaskId, command: String },

    // Task lifecycle
    TaskQueued { task: Task },
    TaskStarted { task: Task },
    TaskCancelled { task_id: TaskId },

    // Diff lifecycle
    DiffUpdated { file_path: String, diff: FileDiff },
    HunkAccepted { hunk_id: HunkId },
    HunkRejected { hunk_id: HunkId },

    // Hook lifecycle
    HookFired { event_name: String, success: bool },
}

#[async_trait::async_trait]
pub trait EventBus: Send + Sync {
    async fn emit(&self, event: Event) -> anyhow::Result<()>;
    fn subscribe(&self) -> broadcast::Receiver<Event>;
}

pub struct TokioBroadcastBus {
    sender: broadcast::Sender<Event>,
}

impl TokioBroadcastBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        TokioBroadcastBus { sender }
    }
}

#[async_trait::async_trait]
impl EventBus for TokioBroadcastBus {
    async fn emit(&self, event: Event) -> anyhow::Result<()> {
        // Ignore errors when no receivers
        let _ = self.sender.send(event);
        Ok(())
    }

    fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.sender.subscribe()
    }
}

// Test double
pub struct RecordingEventBus {
    pub events: Mutex<Vec<Event>>,
    sender: broadcast::Sender<Event>,
}

impl RecordingEventBus {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1024);
        RecordingEventBus {
            events: Mutex::new(Vec::new()),
            sender,
        }
    }
}

#[async_trait::async_trait]
impl EventBus for RecordingEventBus {
    async fn emit(&self, event: Event) -> anyhow::Result<()> {
        self.events.lock().unwrap().push(event.clone());
        let _ = self.sender.send(event);
        Ok(())
    }

    fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.sender.subscribe()
    }
}
