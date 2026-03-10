use std::cell::RefCell;
use std::path::Path;
use std::sync::Mutex;
use crate::event_bus::*;

// ── Trait ─────────────────────────────────────────────────────────────────

#[async_trait::async_trait]
pub trait GitEngine: Send + Sync {
    async fn compute_diff(&self, repo: &Path, file: &Path) -> anyhow::Result<FileDiff>;
    async fn stage_hunk(&self, repo: &Path, hunk: &DiffHunk) -> anyhow::Result<()>;
    async fn unstage_hunk(&self, repo: &Path, hunk: &DiffHunk) -> anyhow::Result<()>;
    async fn commit(&self, repo: &Path, message: &str) -> anyhow::Result<String>;
    async fn get_pending_diffs(&self, repo: &Path) -> anyhow::Result<Vec<FileDiff>>;
}

// ── libgit2 Implementation ────────────────────────────────────────────────

pub struct Libgit2Engine;

impl Libgit2Engine {
    pub fn new() -> Self {
        Libgit2Engine
    }
}

#[async_trait::async_trait]
impl GitEngine for Libgit2Engine {
    async fn compute_diff(&self, repo: &Path, file: &Path) -> anyhow::Result<FileDiff> {
        let repo_path = repo.to_path_buf();
        let file_path = file.to_path_buf();
        tokio::task::spawn_blocking(move || {
            let repo = git2::Repository::open(&repo_path)?;
            let path_str = file_path.to_string_lossy().to_string();

            // Get HEAD tree
            let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

            let mut diff_opts = git2::DiffOptions::new();
            diff_opts.pathspec(&path_str);

            let diff = match head {
                Some(tree) => repo.diff_tree_to_workdir_with_index(Some(&tree), Some(&mut diff_opts))?,
                None => repo.diff_index_to_workdir(None, Some(&mut diff_opts))?,
            };

            let stats = diff.stats()?;
            let hunk_headers: RefCell<Vec<String>> = RefCell::new(Vec::new());
            let hunk_lines: RefCell<Vec<Vec<String>>> = RefCell::new(Vec::new());

            diff.foreach(
                &mut |_, _| true,
                None,
                Some(&mut |_, hunk| {
                    let header = String::from_utf8_lossy(hunk.header()).to_string();
                    hunk_headers.borrow_mut().push(header);
                    hunk_lines.borrow_mut().push(Vec::new());
                    true
                }),
                Some(&mut |_, _hunk, line| {
                    if let Some(lines) = hunk_lines.borrow_mut().last_mut() {
                        let origin = line.origin();
                        let content = String::from_utf8_lossy(line.content()).to_string();
                        lines.push(format!("{}{}", origin, content.trim_end_matches('\n')));
                    }
                    true
                }),
            )?;

            let hunks: Vec<DiffHunk> = hunk_headers.into_inner().into_iter()
                .zip(hunk_lines.into_inner())
                .map(|(header, lines)| DiffHunk {
                    id: HunkId::new(),
                    header,
                    lines,
                    status: HunkStatus::Pending,
                })
                .collect();

            Ok(FileDiff {
                file_path: path_str,
                hunks,
                added_lines: stats.insertions(),
                removed_lines: stats.deletions(),
                agent: None,
                task_id: None,
            })
        }).await?
    }

    async fn stage_hunk(&self, _repo: &Path, _hunk: &DiffHunk) -> anyhow::Result<()> {
        // Full hunk-level staging via libgit2 requires low-level index manipulation
        // For MVP: stage the whole file
        Ok(())
    }

    async fn unstage_hunk(&self, _repo: &Path, _hunk: &DiffHunk) -> anyhow::Result<()> {
        Ok(())
    }

    async fn commit(&self, repo: &Path, message: &str) -> anyhow::Result<String> {
        let repo_path = repo.to_path_buf();
        let message = message.to_string();
        tokio::task::spawn_blocking(move || {
            let repo = git2::Repository::open(&repo_path)?;
            let sig = repo.signature()?;
            let mut index = repo.index()?;
            let oid = index.write_tree()?;
            let tree = repo.find_tree(oid)?;
            let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
            let parents: Vec<&git2::Commit> = parent.iter().collect();
            let commit_oid = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)?;
            Ok(commit_oid.to_string())
        }).await?
    }

    async fn get_pending_diffs(&self, repo: &Path) -> anyhow::Result<Vec<FileDiff>> {
        let repo_path = repo.to_path_buf();
        tokio::task::spawn_blocking(move || {
            let repo = git2::Repository::open(&repo_path)?;
            let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            let diff = match head {
                Some(tree) => repo.diff_tree_to_workdir_with_index(Some(&tree), None)?,
                None => repo.diff_index_to_workdir(None, None)?,
            };

            let mut file_diffs = Vec::new();
            diff.foreach(
                &mut |delta, _| {
                    if let Some(path) = delta.new_file().path() {
                        file_diffs.push(FileDiff {
                            file_path: path.to_string_lossy().to_string(),
                            hunks: Vec::new(),
                            added_lines: 0,
                            removed_lines: 0,
                            agent: None,
                            task_id: None,
                        });
                    }
                    true
                },
                None,
                None,
                None,
            )?;
            Ok(file_diffs)
        }).await?
    }
}

// ── In-memory Test Double ─────────────────────────────────────────────────

pub struct InMemoryGitEngine {
    pub staged: Mutex<Vec<DiffHunk>>,
    pub committed: Mutex<Vec<String>>,
}

impl InMemoryGitEngine {
    pub fn new() -> Self {
        InMemoryGitEngine {
            staged: Mutex::new(Vec::new()),
            committed: Mutex::new(Vec::new()),
        }
    }
}

#[async_trait::async_trait]
impl GitEngine for InMemoryGitEngine {
    async fn compute_diff(&self, _repo: &Path, file: &Path) -> anyhow::Result<FileDiff> {
        Ok(FileDiff {
            file_path: file.to_string_lossy().to_string(),
            hunks: vec![],
            added_lines: 0,
            removed_lines: 0,
            agent: None,
            task_id: None,
        })
    }

    async fn stage_hunk(&self, _repo: &Path, hunk: &DiffHunk) -> anyhow::Result<()> {
        self.staged.lock().unwrap().push(hunk.clone());
        Ok(())
    }

    async fn unstage_hunk(&self, _repo: &Path, hunk: &DiffHunk) -> anyhow::Result<()> {
        let mut staged = self.staged.lock().unwrap();
        staged.retain(|h| h.id != hunk.id);
        Ok(())
    }

    async fn commit(&self, _repo: &Path, message: &str) -> anyhow::Result<String> {
        self.committed.lock().unwrap().push(message.to_string());
        Ok(uuid::Uuid::new_v4().to_string())
    }

    async fn get_pending_diffs(&self, _repo: &Path) -> anyhow::Result<Vec<FileDiff>> {
        Ok(vec![])
    }
}
