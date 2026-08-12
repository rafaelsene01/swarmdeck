// SPEC: projects (PROJ-07)

//! Fixed "Sandbox" pseudo-project for terminals opened via "No Project".
//!
//! Unlike a real project, Sandbox is never a row in the `projects` table:
//! it has no id, no color assignment, and nothing here ever runs an
//! `INSERT`/`UPDATE`/`DELETE` against that table (PROJ-07 AC3 — it must not
//! appear in `project_list`/`project_list_recent` or count toward the
//! project count). It is just a fixed directory on disk, shared by every
//! terminal that picks "No Project" at the same time (PROJ-07 AC4 — no
//! per-terminal isolation).
//!
//! The directory lives inside the app's own data directory, resolved
//! through `paths::data_dir` — the single authority for that path (portable
//! vs. installed mode) — instead of asking Tauri for `app_data_dir()`
//! directly, which would re-implement resolution that already exists and
//! break portable mode.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::paths::{self, PathError};

const SANDBOX_DIR_NAME: &str = "sandbox";

#[derive(Debug, thiserror::Error)]
pub enum SandboxError {
    #[error(transparent)]
    Path(#[from] PathError),
    #[error("could not create sandbox directory: {0}")]
    Io(#[from] std::io::Error),
}

/// Testable core of `sandbox_dir`: joins the app's data directory with the
/// fixed `sandbox` folder name and creates it if missing.
/// `fs::create_dir_all` is already idempotent (a no-op success when the
/// directory already exists), so two calls — concurrent or sequential —
/// never fail or duplicate anything (PROJ-07 AC2/AC4).
fn resolve_sandbox_dir(data_dir: &Path) -> Result<PathBuf, std::io::Error> {
    let dir = data_dir.join(SANDBOX_DIR_NAME);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// `<app_data_dir>/sandbox`, created automatically if it doesn't exist yet
/// (PROJ-07 AC2).
pub fn sandbox_dir(app: &AppHandle) -> Result<PathBuf, SandboxError> {
    let data_dir = paths::data_dir(app)?;
    Ok(resolve_sandbox_dir(&data_dir)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::projects::service;

    #[test]
    fn creates_sandbox_dir_when_absent() {
        let data_dir = tempfile::tempdir().expect("create temp data dir");
        let expected = data_dir.path().join(SANDBOX_DIR_NAME);
        assert!(!expected.exists(), "precondition: sandbox dir absent yet");

        let resolved = resolve_sandbox_dir(data_dir.path()).expect("resolve_sandbox_dir");

        assert_eq!(resolved, expected);
        assert!(resolved.is_dir(), "sandbox dir must have been created");
    }

    #[test]
    fn resolving_twice_is_idempotent() {
        let data_dir = tempfile::tempdir().expect("create temp data dir");

        let first = resolve_sandbox_dir(data_dir.path()).expect("first resolve_sandbox_dir");
        let second = resolve_sandbox_dir(data_dir.path()).expect("second resolve_sandbox_dir");

        assert_eq!(first, second);
        assert!(first.is_dir());
        assert_eq!(
            fs::read_dir(data_dir.path())
                .expect("read temp data dir")
                .count(),
            1,
            "resolving twice must not duplicate the sandbox dir"
        );
    }

    #[test]
    fn never_registers_a_project_row() {
        let db = Db::open_in_memory().expect("open in-memory db");
        let data_dir = tempfile::tempdir().expect("create temp data dir");

        resolve_sandbox_dir(data_dir.path()).expect("resolve_sandbox_dir");

        let projects = service::list_all(db.conn()).expect("list_all");
        assert!(
            projects.is_empty(),
            "sandbox must never touch the projects table, so project_list stays empty"
        );
    }
}
