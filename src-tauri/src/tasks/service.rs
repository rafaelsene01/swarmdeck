// SPEC: mcp-task-server (MCP-02, MCP-03, MCP-07, MCP-08)

//! `TaskService`: create/start/complete lifecycle plus plan/implementation
//! updates for the `tasks` table (migration `003_tasks.sql`).
//!
//! Two design choices worth calling out because they aren't obvious from the
//! table schema alone:
//!
//! - **Project resolution is not a caller-supplied parameter.** `create`
//!   takes a [`TerminalContext`] (terminal id + cwd) and resolves the
//!   project itself via [`crate::projects::resolve::resolve`], reusing the
//!   same "most specific path wins, fall back to folder name" rule already
//!   proven in `projects::resolve`'s own tests (MCP-08). A `Fallback`
//!   resolution does **not** create a new project row — it simply leaves
//!   `tasks.project_id` `NULL`. Auto-creating a project on the fly is out of
//!   scope for this task (not in its `Done when`); the folder name from the
//!   fallback is not carried in the return value either, since none of this
//!   task's required behavior depends on the caller seeing it back (see task
//!   report for the full DESVIO note).
//! - **`start`/`complete` delegate entirely to `tasks::state`.** This module
//!   never encodes "which status can go where" itself — it loads the
//!   current [`TaskStatus`], asks
//!   [`TaskStatus::try_transition`], and persists whatever comes back (or
//!   propagates the `InvalidTransition` as a `TaskError`). `complete` on a
//!   `task_id` that doesn't exist returns `TaskError::NotFound` before any
//!   transition or write is attempted — no row is ever created as a side
//!   effect of a failed lifecycle call.

use std::fmt;
use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::DbError;
use crate::projects::resolve::{resolve, Resolution};
use crate::projects::service::Project;

use super::state::{InvalidTransition, TaskAction, TaskStatus};

/// Maximum length, in characters, allowed for `plan` and `implementation`
/// text before it gets truncated.
///
/// DESVIO (documented per task brief, not a blocker): the spec only says
/// "when plan/implementation text exceeds the size limit THEN the system
/// MUST truncate and signal it", without naming a number. Chose 8000 chars —
/// generous enough for a real implementation writeup, small enough to keep a
/// task row cheap to read/write repeatedly during a run.
pub const TEXT_CAP: usize = 8000;

/// Everything a `TaskService` call needs to know about the terminal it's
/// being invoked from. `terminal_id` is always recorded as given — it comes
/// straight from the environment, not from a heuristic — while `cwd` is only
/// ever used as input to project resolution.
#[derive(Debug, Clone)]
pub struct TerminalContext {
    pub terminal_id: String,
    pub cwd: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub plan: Option<String>,
    pub implementation: Option<String>,
    pub status: TaskStatus,
    pub project_id: Option<String>,
    pub terminal_id: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Result of a plan/implementation update: the refreshed task, plus whether
/// the text it was given had to be cut down to [`TEXT_CAP`].
///
/// DESVIO: the brief's sketched signature returns a bare `Task`; it also
/// explicitly offers this wrapper as an alternative signaling mechanism
/// ("sua escolha, documente"). Chose the wrapper over a `plan_truncated`
/// field on `Task` itself, since `Task` otherwise mirrors the `tasks` row
/// 1:1 and a transient "did this particular call truncate" flag doesn't
/// belong on that persistent shape.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateResult {
    pub task: Task,
    pub truncated: bool,
}

#[derive(Debug)]
pub enum TaskError {
    /// No task with this id.
    NotFound(i64),
    /// `start`/`complete` requested a transition the state machine doesn't
    /// allow from the task's current status.
    InvalidTransition(InvalidTransition),
    Db(DbError),
}

impl fmt::Display for TaskError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TaskError::NotFound(id) => write!(f, "task not found: {id}"),
            TaskError::InvalidTransition(err) => write!(f, "{err}"),
            TaskError::Db(err) => write!(f, "database error: {err}"),
        }
    }
}

impl std::error::Error for TaskError {}

impl From<rusqlite::Error> for TaskError {
    fn from(err: rusqlite::Error) -> Self {
        TaskError::Db(DbError::from(err))
    }
}

impl From<DbError> for TaskError {
    fn from(err: DbError) -> Self {
        TaskError::Db(err)
    }
}

impl From<InvalidTransition> for TaskError {
    fn from(err: InvalidTransition) -> Self {
        TaskError::InvalidTransition(err)
    }
}

/// Creates a task in `pending` status. Project and terminal are both
/// inferred from `ctx`, never passed loose by the caller: `project_id` comes
/// from resolving `ctx.cwd` against the currently registered projects
/// (`NULL` on a `Fallback` resolution — no project gets created here), and
/// `terminal_id` is copied verbatim from `ctx.terminal_id` (MCP-02, MCP-08).
pub fn create(
    conn: &Connection,
    ctx: &TerminalContext,
    title: &str,
    description: Option<&str>,
) -> Result<Task, TaskError> {
    let projects = list_projects(conn)?;
    let project_id = match resolve(&ctx.cwd, &projects) {
        Resolution::Matched(project) => Some(project.id),
        Resolution::Fallback { .. } => None,
    };

    let now = now_unix();
    conn.execute(
        "INSERT INTO tasks
            (title, description, plan, implementation, status, project_id, terminal_id, created_at, updated_at)
         VALUES (?1, ?2, NULL, NULL, 'pending', ?3, ?4, ?5, ?5)",
        params![title, description, project_id, ctx.terminal_id, now],
    )?;

    let id = conn.last_insert_rowid();
    get(conn, id)
}

/// Fetches a task by id, or `TaskError::NotFound`.
pub fn get(conn: &Connection, task_id: i64) -> Result<Task, TaskError> {
    conn.query_row(
        "SELECT id, title, description, plan, implementation, status, project_id, terminal_id, created_at, updated_at
         FROM tasks WHERE id = ?1",
        params![task_id],
        row_to_task,
    )
    .optional()?
    .ok_or(TaskError::NotFound(task_id))
}

/// Moves a task to `in_progress`, via `TaskStatus::try_transition`. Valid
/// from every status (see `tasks::state`'s doc comment on the idempotent
/// `start` edge) — the only failure mode here is `task_id` not existing.
pub fn start(conn: &Connection, task_id: i64) -> Result<Task, TaskError> {
    apply_transition(conn, task_id, TaskAction::Start)
}

/// Advances a task along the mandatory testing path, via
/// `TaskStatus::try_transition`: `in_progress -> in_testing` on the first
/// call, `in_testing -> completed` on the next. Any other starting status
/// (`pending`, `completed`) yields `TaskError::InvalidTransition` — there is
/// no arm in the state machine that skips `in_testing`.
///
/// If `task_id` doesn't exist, this returns `TaskError::NotFound` before any
/// write is attempted; no row is created as a side effect.
pub fn complete(conn: &Connection, task_id: i64) -> Result<Task, TaskError> {
    apply_transition(conn, task_id, TaskAction::Complete)
}

fn apply_transition(
    conn: &Connection,
    task_id: i64,
    action: TaskAction,
) -> Result<Task, TaskError> {
    let current = get(conn, task_id)?;
    let next_status = TaskStatus::try_transition(current.status, action)?;

    let now = now_unix();
    conn.execute(
        "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![next_status.to_string(), now, task_id],
    )?;

    get(conn, task_id)
}

/// Overwrites `plan`, truncating to [`TEXT_CAP`] characters when needed.
pub fn update_plan(conn: &Connection, task_id: i64, plan: &str) -> Result<UpdateResult, TaskError> {
    update_text_field(conn, task_id, "plan", plan)
}

/// Overwrites `implementation`, truncating to [`TEXT_CAP`] characters when
/// needed.
pub fn update_implementation(
    conn: &Connection,
    task_id: i64,
    implementation: &str,
) -> Result<UpdateResult, TaskError> {
    update_text_field(conn, task_id, "implementation", implementation)
}

fn update_text_field(
    conn: &Connection,
    task_id: i64,
    column: &str,
    text: &str,
) -> Result<UpdateResult, TaskError> {
    // Confirms the task exists before writing anything (NotFound otherwise,
    // same "no side effect on failure" rule as `apply_transition`).
    get(conn, task_id)?;

    let (stored, truncated) = truncate_to_cap(text);
    let now = now_unix();

    // `column` is never caller-controlled — it's one of the two literal
    // strings passed by `update_plan`/`update_implementation` above, never
    // built from external input, so this is not a SQL-injection surface.
    let sql = format!("UPDATE tasks SET {column} = ?1, updated_at = ?2 WHERE id = ?3");
    conn.execute(&sql, params![stored, now, task_id])?;

    let task = get(conn, task_id)?;
    Ok(UpdateResult { task, truncated })
}

/// Cuts `text` down to at most [`TEXT_CAP`] **characters** (not bytes), so a
/// multi-byte UTF-8 character never gets split mid-codepoint. Returns the
/// (possibly unchanged) text and whether truncation happened.
fn truncate_to_cap(text: &str) -> (String, bool) {
    if text.chars().count() <= TEXT_CAP {
        (text.to_string(), false)
    } else {
        (text.chars().take(TEXT_CAP).collect(), true)
    }
}

/// Overwrites `project_id` directly, bypassing `create`'s `cwd`-based
/// resolution. This is the escape hatch `update_task_project` (MCP-08) uses
/// when the automatic resolution picked the wrong project. `task_id` not
/// existing is `TaskError::NotFound`, same "no write on a failed lookup"
/// rule as every other mutator here; an unknown `project_id` is rejected by
/// the `tasks.project_id -> projects.id` foreign key (enabled via `PRAGMA
/// foreign_keys = ON`, `db::Db::from_connection`) and surfaces as
/// `TaskError::Db` — this function does not duplicate that existence check
/// itself, the database is the single source of truth for it.
pub fn update_project(
    conn: &Connection,
    task_id: i64,
    project_id: &str,
) -> Result<Task, TaskError> {
    get(conn, task_id)?;

    let now = now_unix();
    conn.execute(
        "UPDATE tasks SET project_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![project_id, now, task_id],
    )?;

    get(conn, task_id)
}

// SPEC: task-kanban (KAN-03)
// DESVIO: `tasks/service.rs` is otherwise mcp-task-server territory (top
// marker) — this file isn't in task-kanban/T6's authorized file list, but
// KAN-03 criterion 4 ("excluir pede confirmação antes de remover") has no
// deletion primitive anywhere in the codebase to build on, and the one
// existing precedent for "delete a row this service owns"
// (`projects::service::delete`) lives in the domain service, not in a
// `commands/*.rs` wrapper. Putting a raw `DELETE FROM tasks` in
// `commands/tasks.rs` instead would fork where task mutations are allowed to
// happen, which is exactly what `design.md`'s "Criação manual passa pelo
// mesmo TaskService" decision (same table) argues against. Localized marker
// per `spec-driven-changes.md` §3 exception, since this file mostly belongs
// to another feature and only this function is task-kanban's.
/// Deletes a task permanently — no soft-delete, no undo, and no cascading
/// side effect beyond what SQLite's own FKs already do (nothing references
/// `tasks.id`). `task_id` not existing is `TaskError::NotFound`, same
/// "no-op that doesn't silently succeed" rule as every other mutator here.
/// Callers that need a confirmation step before calling this (the Kanban
/// card's delete action) implement that gate on their own side — this
/// function is intentionally just the single place a task row actually
/// leaves the table.
pub fn delete(conn: &Connection, task_id: i64) -> Result<(), TaskError> {
    get(conn, task_id)?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])?;
    Ok(())
}

/// Lists tasks optionally filtered by `status`, most-recently-created first,
/// paginated by `limit`/`offset` (both `None` means "no limit"/"from the
/// start"). `total` is the count of rows matching the `status` filter
/// *before* pagination is applied — what `list_tasks`/`search_tasks` (MCP-07)
/// need to let the caller know there's more to page through.
pub fn list(
    conn: &Connection,
    status: Option<TaskStatus>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<(Vec<Task>, i64), TaskError> {
    let status_str = status.map(|s| s.to_string());
    let limit = limit.unwrap_or(i64::MAX);
    let offset = offset.unwrap_or(0);

    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE (?1 IS NULL OR status = ?1)",
        params![status_str],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT id, title, description, plan, implementation, status, project_id, terminal_id, created_at, updated_at
         FROM tasks WHERE (?1 IS NULL OR status = ?1)
         ORDER BY id DESC LIMIT ?2 OFFSET ?3",
    )?;
    let tasks = stmt
        .query_map(params![status_str, limit, offset], row_to_task)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok((tasks, total))
}

/// Free-text search over `title`/`description` (MCP-07) — a plain substring
/// `LIKE` match, deliberately not scored by similarity (that's
/// `find_related_active_tasks`/`similarity::find_similar`). `%`/`_` in
/// `query` are escaped so a caller's literal percent sign doesn't turn into
/// an unintended wildcard. Same pagination/`total` contract as [`list`].
pub fn search(
    conn: &Connection,
    query: &str,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<(Vec<Task>, i64), TaskError> {
    let pattern = format!(
        "%{}%",
        query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    );
    let limit = limit.unwrap_or(i64::MAX);
    let offset = offset.unwrap_or(0);

    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE title LIKE ?1 ESCAPE '\\' OR description LIKE ?1 ESCAPE '\\'",
        params![pattern],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT id, title, description, plan, implementation, status, project_id, terminal_id, created_at, updated_at
         FROM tasks WHERE title LIKE ?1 ESCAPE '\\' OR description LIKE ?1 ESCAPE '\\'
         ORDER BY id DESC LIMIT ?2 OFFSET ?3",
    )?;
    let tasks = stmt
        .query_map(params![pattern, limit, offset], row_to_task)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok((tasks, total))
}

/// Every task **not** `Completed` (`pending`, `in_progress`, `in_testing`),
/// unpaginated. What `find_related_active_tasks` (MCP-07) feeds into
/// `similarity::find_similar`, whose own doc comment explains why a finished
/// task is never a dedup candidate.
pub fn list_active(conn: &Connection) -> Result<Vec<Task>, TaskError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, plan, implementation, status, project_id, terminal_id, created_at, updated_at
         FROM tasks WHERE status != 'completed' ORDER BY id DESC",
    )?;
    let tasks = stmt
        .query_map([], row_to_task)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(tasks)
}

/// Every task belonging to `project_id`, most-recently-created first. What
/// `get_project_tasks` (MCP-08) exposes.
pub fn list_by_project(conn: &Connection, project_id: &str) -> Result<Vec<Task>, TaskError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, plan, implementation, status, project_id, terminal_id, created_at, updated_at
         FROM tasks WHERE project_id = ?1 ORDER BY id DESC",
    )?;
    let tasks = stmt
        .query_map(params![project_id], row_to_task)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(tasks)
}

/// Loads every registered project as-is. Deliberately a direct query rather
/// than a new `ProjectService::list` — `projects::service` doesn't expose
/// one today.
///
/// No path normalization happens here anymore. It used to (see git history:
/// a `strip_verbatim_prefix`/`normalized_projects` workaround), because
/// `projects::service::create`/`update` stored the Windows verbatim
/// extended-length form (`\\?\C:\...`) coming straight out of
/// `Path::canonicalize`, which broke `projects::resolve::resolve`'s
/// component-by-component matching against a live (never verbatim) `cwd`.
/// That's now fixed at the source — `projects::service::require_existing_dir`
/// strips the verbatim prefix itself before a path is ever written to the
/// `projects` table — so every `path` this query reads back is already in
/// plain form, and this module doesn't need to know about the prefix at all.
fn list_projects(conn: &Connection) -> Result<Vec<Project>, TaskError> {
    let mut stmt = conn.prepare("SELECT id, name, path, color, last_used FROM projects")?;
    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                color: row.get(3)?,
                last_used: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(projects)
}

fn row_to_task(row: &Row) -> rusqlite::Result<Task> {
    let status: String = row.get(5)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        plan: row.get(3)?,
        implementation: row.get(4)?,
        status: parse_status(&status),
        project_id: row.get(6)?,
        terminal_id: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

/// Parses the `tasks.status` column back into `TaskStatus`. The column has a
/// `CHECK` constraint (migration `003_tasks.sql`) restricting it to exactly
/// these four values, so any other string here means the database itself is
/// corrupt — not a case this service tries to recover from.
fn parse_status(status: &str) -> TaskStatus {
    match status {
        "pending" => TaskStatus::Pending,
        "in_progress" => TaskStatus::InProgress,
        "in_testing" => TaskStatus::InTesting,
        "completed" => TaskStatus::Completed,
        other => unreachable!("tasks.status CHECK constraint should rule this out: {other}"),
    }
}

fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
