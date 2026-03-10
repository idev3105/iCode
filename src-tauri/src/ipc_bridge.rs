use std::path::Path;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri::Emitter;
use crate::event_bus::*;
use crate::storage::{TaskStorage, DiffStorage, TaskFilter};
use crate::agent_orchestrator::AgentOrchestrator;
use crate::git_engine::GitEngine;

// ── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskRequestDto {
    pub agent: String,
    pub prompt: String,
    pub working_dir: String,
}

impl From<TaskRequestDto> for TaskRequest {
    fn from(dto: TaskRequestDto) -> Self {
        TaskRequest {
            agent: match dto.agent.as_str() {
                "claude" => AgentKind::ClaudeCode,
                "gemini" => AgentKind::Gemini,
                "goose" => AgentKind::Goose,
                other => AgentKind::Custom(other.to_string()),
            },
            prompt: dto.prompt,
            working_dir: dto.working_dir,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskFilterDto {
    pub agent: Option<String>,
    pub status: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

impl From<TaskFilterDto> for TaskFilter {
    fn from(dto: TaskFilterDto) -> Self {
        TaskFilter {
            agent: dto.agent.map(|a| match a.as_str() {
                "claude" => AgentKind::ClaudeCode,
                "gemini" => AgentKind::Gemini,
                "goose" => AgentKind::Goose,
                other => AgentKind::Custom(other.to_string()),
            }),
            status: dto.status.and_then(|s| match s.as_str() {
                "queued" => Some(TaskStatus::Queued),
                "running" => Some(TaskStatus::Running),
                "done" => Some(TaskStatus::Done),
                "error" => Some(TaskStatus::Error),
                "cancelled" => Some(TaskStatus::Cancelled),
                _ => None,
            }),
            limit: dto.limit.unwrap_or(50),
            offset: dto.offset.unwrap_or(0),
        }
    }
}

// ── Application State ─────────────────────────────────────────────────────

pub struct AppState {
    pub orchestrator: Arc<dyn AgentOrchestrator>,
    pub task_storage: Arc<dyn TaskStorage>,
    pub diff_storage: Arc<dyn DiffStorage>,
    pub git_engine: Arc<dyn GitEngine>,
    pub event_bus: Arc<dyn EventBus>,
}

// ── Tauri Commands ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn submit_task(
    request: TaskRequestDto,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.orchestrator
        .submit_task(request.into())
        .await
        .map(|id| id.to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.orchestrator
        .cancel_task(&TaskId::from(task_id))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_input(
    task_id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.orchestrator
        .send_input(&TaskId::from(task_id), &data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_terminal(
    task_id: String,
    rows: u16,
    cols: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.orchestrator
        .resize_pty(&TaskId::from(task_id), rows, cols)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_tasks(
    filter: TaskFilterDto,
    state: State<'_, AppState>,
) -> Result<Vec<Task>, String> {
    state.task_storage
        .list_tasks(filter.into())
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

#[tauri::command]
pub async fn read_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err("Path does not exist".to_string());
    }

    let mut entries = Vec::new();
    let read_res = std::fs::read_dir(root).map_err(|e| e.to_string())?;

    for entry in read_res {
        let entry = entry.map_err(|e| e.to_string())?;
        let path_buf = entry.path();
        let name = path_buf
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        
        // Skip hidden files like .git
        if name.starts_with('.') && name != ".env" {
            continue;
        }

        let is_dir = path_buf.is_dir();
        entries.push(FileEntry {
            name,
            path: path_buf.to_str().unwrap_or("").to_string(),
            is_dir,
            children: None, // We'll load lazily or just return flat for now
        });
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn search_tasks(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<Task>, String> {
    state.task_storage
        .search_tasks(&query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn accept_hunk(
    hunk_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.diff_storage
        .update_hunk_status(&HunkId(hunk_id), HunkStatus::Accepted)
        .await
        .map_err(|e| e.to_string())?;
    state.event_bus
        .emit(Event::HunkAccepted { hunk_id: HunkId(uuid::Uuid::new_v4().to_string()) })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reject_hunk(
    hunk_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.diff_storage
        .update_hunk_status(&HunkId(hunk_id), HunkStatus::Rejected)
        .await
        .map_err(|e| e.to_string())?;
    state.event_bus
        .emit(Event::HunkRejected { hunk_id: HunkId(uuid::Uuid::new_v4().to_string()) })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn commit_changes(
    repo_path: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.git_engine
        .commit(Path::new(&repo_path), &message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_running_tasks(
    state: State<'_, AppState>,
) -> Result<Vec<Task>, String> {
    Ok(state.orchestrator.get_running_tasks().await)
}

#[tauri::command]
pub async fn get_queued_tasks(
    state: State<'_, AppState>,
) -> Result<Vec<Task>, String> {
    Ok(state.orchestrator.get_queued_tasks().await)
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

// ── Event Forwarder ───────────────────────────────────────────────────────

pub async fn start_event_forwarder(app: AppHandle, event_bus: Arc<dyn EventBus>) {
    let mut rx = event_bus.subscribe();
    tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            let _ = app.emit("app:event", &event);
        }
    });
}
