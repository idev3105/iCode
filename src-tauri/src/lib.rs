// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod event_bus;
mod storage;
mod process_manager;
mod hook_runner;
mod git_engine;
mod agent_orchestrator;
mod ipc_bridge;

use std::sync::Arc;
use tauri::Manager;
use event_bus::*;
use storage::{InMemoryTaskStorage, InMemoryDiffStorage};
use process_manager::TokioProcessManager;
use hook_runner::NoopHookRunner;
use git_engine::Libgit2Engine;
use agent_orchestrator::DefaultAgentOrchestrator;
use ipc_bridge::*;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ── Event Bus ──────────────────────────────────────
            let event_bus: Arc<dyn EventBus> = Arc::new(TokioBroadcastBus::new(1024));

            // ── Storage (in-memory for MVP; swap with SQLite for prod) ──
            let task_storage: Arc<dyn storage::TaskStorage> =
                Arc::new(InMemoryTaskStorage::new());
            let diff_storage: Arc<dyn storage::DiffStorage> =
                Arc::new(InMemoryDiffStorage::new());

            // ── Process Manager ────────────────────────────────
            let process_manager: Arc<dyn process_manager::ProcessManager> =
                Arc::new(TokioProcessManager::new(event_bus.clone()));

            // ── Hook Runner ────────────────────────────────────
            let hook_runner: Arc<dyn hook_runner::HookRunner> =
                Arc::new(NoopHookRunner);

            // ── Git Engine ─────────────────────────────────────
            let git_engine: Arc<dyn git_engine::GitEngine> =
                Arc::new(Libgit2Engine::new());

            // ── Orchestrator ───────────────────────────────────
            let orchestrator_impl = DefaultAgentOrchestrator::new(
                process_manager,
                hook_runner,
                task_storage.clone(),
                event_bus.clone(),
            );
            orchestrator_impl.start_queue_drainer();
            let orchestrator: Arc<dyn agent_orchestrator::AgentOrchestrator> = orchestrator_impl;

            // ── App State ──────────────────────────────────────
            let state = AppState {
                orchestrator,
                task_storage,
                diff_storage,
                git_engine,
                event_bus: event_bus.clone(),
            };

            app.manage(state);

            // ── Start event forwarder (Rust → Frontend) ────────
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_event_forwarder(app_handle, event_bus).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            submit_task,
            cancel_task,
            send_input,
            resize_terminal,
            read_dir,
            read_file_content,
            write_file_content,
            list_tasks,
            search_tasks,
            accept_hunk,
            reject_hunk,
            commit_changes,
            get_running_tasks,
            get_queued_tasks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
