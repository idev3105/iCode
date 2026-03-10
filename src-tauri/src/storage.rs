use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::event_bus::*;

// ── Traits ───────────────────────────────────────────────────────────────

#[async_trait::async_trait]
pub trait TaskStorage: Send + Sync {
    async fn save_task(&self, task: &Task) -> anyhow::Result<()>;
    async fn update_task_status(&self, id: &TaskId, status: TaskStatus) -> anyhow::Result<()>;
    async fn find_task(&self, id: &TaskId) -> anyhow::Result<Option<Task>>;
    async fn list_tasks(&self, filter: TaskFilter) -> anyhow::Result<Vec<Task>>;
    async fn search_tasks(&self, query: &str) -> anyhow::Result<Vec<Task>>;
}

#[async_trait::async_trait]
pub trait DiffStorage: Send + Sync {
    async fn save_diff(&self, diff: &FileDiff) -> anyhow::Result<()>;
    async fn get_pending_diffs(&self, task_id: &TaskId) -> anyhow::Result<Vec<FileDiff>>;
    async fn update_hunk_status(&self, hunk_id: &HunkId, status: HunkStatus) -> anyhow::Result<()>;
}

#[derive(Debug, Clone)]
pub struct TaskFilter {
    pub agent: Option<AgentKind>,
    pub status: Option<TaskStatus>,
    pub limit: usize,
    pub offset: usize,
}

impl Default for TaskFilter {
    fn default() -> Self {
        TaskFilter {
            agent: None,
            status: None,
            limit: 50,
            offset: 0,
        }
    }
}

// ── In-Memory Implementations (for tests) ───────────────────────────────

pub struct InMemoryTaskStorage {
    tasks: Mutex<HashMap<String, Task>>,
}

impl InMemoryTaskStorage {
    pub fn new() -> Self {
        InMemoryTaskStorage {
            tasks: Mutex::new(HashMap::new()),
        }
    }
}

#[async_trait::async_trait]
impl TaskStorage for InMemoryTaskStorage {
    async fn save_task(&self, task: &Task) -> anyhow::Result<()> {
        self.tasks.lock().unwrap().insert(task.id.0.clone(), task.clone());
        Ok(())
    }

    async fn update_task_status(&self, id: &TaskId, status: TaskStatus) -> anyhow::Result<()> {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.get_mut(&id.0) {
            task.status = status;
        }
        Ok(())
    }

    async fn find_task(&self, id: &TaskId) -> anyhow::Result<Option<Task>> {
        Ok(self.tasks.lock().unwrap().get(&id.0).cloned())
    }

    async fn list_tasks(&self, filter: TaskFilter) -> anyhow::Result<Vec<Task>> {
        let tasks = self.tasks.lock().unwrap();
        let mut result: Vec<Task> = tasks.values()
            .filter(|t| {
                filter.agent.as_ref().map_or(true, |a| &t.agent == a) &&
                filter.status.as_ref().map_or(true, |s| &t.status == s)
            })
            .cloned()
            .collect();
        result.sort_by(|a, b| a.id.0.cmp(&b.id.0));
        let start = filter.offset.min(result.len());
        let end = (filter.offset + filter.limit).min(result.len());
        Ok(result[start..end].to_vec())
    }

    async fn search_tasks(&self, query: &str) -> anyhow::Result<Vec<Task>> {
        let tasks = self.tasks.lock().unwrap();
        let lower = query.to_lowercase();
        Ok(tasks.values()
            .filter(|t| t.prompt.to_lowercase().contains(&lower))
            .cloned()
            .collect())
    }
}

pub struct InMemoryDiffStorage {
    diffs: Mutex<Vec<FileDiff>>,
}

impl InMemoryDiffStorage {
    pub fn new() -> Self {
        InMemoryDiffStorage { diffs: Mutex::new(Vec::new()) }
    }
}

#[async_trait::async_trait]
impl DiffStorage for InMemoryDiffStorage {
    async fn save_diff(&self, diff: &FileDiff) -> anyhow::Result<()> {
        self.diffs.lock().unwrap().push(diff.clone());
        Ok(())
    }

    async fn get_pending_diffs(&self, task_id: &TaskId) -> anyhow::Result<Vec<FileDiff>> {
        Ok(self.diffs.lock().unwrap()
            .iter()
            .filter(|d| d.task_id.as_ref() == Some(task_id))
            .cloned()
            .collect())
    }

    async fn update_hunk_status(&self, hunk_id: &HunkId, status: HunkStatus) -> anyhow::Result<()> {
        let mut diffs = self.diffs.lock().unwrap();
        for diff in diffs.iter_mut() {
            for hunk in diff.hunks.iter_mut() {
                if &hunk.id == hunk_id {
                    hunk.status = status.clone();
                }
            }
        }
        Ok(())
    }
}
