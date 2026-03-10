use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::Duration;
use crate::event_bus::HookResult;

// ── Trait ─────────────────────────────────────────────────────────────────

pub struct HookEvent {
    pub name: String,
    pub payload: serde_json::Value,
    pub timeout: Duration,
}

#[async_trait::async_trait]
pub trait HookRunner: Send + Sync {
    async fn run(&self, event: &HookEvent) -> anyhow::Result<HookResult>;
    async fn load_hooks(&self, project_dir: &Path) -> anyhow::Result<()>;
}

// ── Bun Implementation ────────────────────────────────────────────────────

pub struct BunHookRunner {
    bun_bin: PathBuf,
    hooks_path: RwLock<Option<PathBuf>>,
}

impl BunHookRunner {
    pub fn new(bun_bin: PathBuf) -> Self {
        BunHookRunner {
            bun_bin,
            hooks_path: RwLock::new(None),
        }
    }
}

#[async_trait::async_trait]
impl HookRunner for BunHookRunner {
    async fn load_hooks(&self, project_dir: &Path) -> anyhow::Result<()> {
        let hooks_path = project_dir.join(".agent").join("hooks.js");
        let mut path = self.hooks_path.write().unwrap();
        *path = if hooks_path.exists() { Some(hooks_path) } else { None };
        Ok(())
    }

    async fn run(&self, event: &HookEvent) -> anyhow::Result<HookResult> {
        let hooks_path = self.hooks_path.read().unwrap().clone();
        let Some(path) = hooks_path else {
            return Ok(HookResult { success: true, output: None });
        };

        let payload = serde_json::to_string(&event.payload)?;
        let output = tokio::time::timeout(
            event.timeout,
            tokio::process::Command::new(&self.bun_bin)
                .args(["run", path.to_str().unwrap()])
                .env("AGENT_EVENT_NAME", &event.name)
                .env("AGENT_EVENT_PAYLOAD", &payload)
                .output(),
        ).await??;

        Ok(HookResult {
            success: output.status.success(),
            output: Some(String::from_utf8_lossy(&output.stdout).to_string()),
        })
    }
}

// ── Noop (test double) ────────────────────────────────────────────────────

pub struct NoopHookRunner;

#[async_trait::async_trait]
impl HookRunner for NoopHookRunner {
    async fn load_hooks(&self, _project_dir: &Path) -> anyhow::Result<()> { Ok(()) }
    async fn run(&self, _event: &HookEvent) -> anyhow::Result<HookResult> {
        Ok(HookResult { success: true, output: None })
    }
}
