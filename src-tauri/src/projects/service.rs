// SPEC: projects (PROJ-01, PROJ-02)

//! `ProjectService`: create/update/delete for the `projects` table created
//! by migration `003_tasks.sql` (mcp-task-server/T1).
//!
//! Follows the same shape as `db/settings.rs`: plain functions receiving
//! `&Connection`, no connection ownership here. Propagation of project
//! fields to linked tasks is not something this module does explicitly —
//! `tasks.project_id` is a foreign key into `projects.id`, so any consumer
//! that joins `tasks` with `projects` always reads the current row. Deleting
//! a project relies on the same FK's `ON DELETE SET NULL` (migration `003`)
//! to detach linked tasks instead of orphaning or cascading them; this
//! service's `delete` only counts how many tasks were linked *before* the
//! delete, since the count is gone once the FK clears `project_id`.

use std::fmt;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::DbError;

/// Fixed color palette assigned round-robin (least-used-first) at creation.
///
/// DESVIO: the spec has no defined palette for this. Chose 8 visually
/// distinct hex colors; easy to swap later, documented in the task report.
const PALETTE: &[&str] = &[
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
];

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub color: String,
    pub last_used: Option<i64>,
}

#[derive(Debug)]
pub enum ProjectError {
    /// Name is missing or blank after trimming.
    NameRequired,
    /// The given directory does not exist on disk.
    PathNotFound(PathBuf),
    /// The given directory is already registered to another project.
    PathAlreadyUsed {
        path: PathBuf,
        existing_id: String,
        existing_name: String,
    },
    /// No project with this id.
    NotFound(String),
    Db(DbError),
}

impl fmt::Display for ProjectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProjectError::NameRequired => write!(f, "project name is required"),
            ProjectError::PathNotFound(path) => {
                write!(f, "directory does not exist: {}", path.display())
            }
            ProjectError::PathAlreadyUsed {
                path,
                existing_id,
                existing_name,
            } => write!(
                f,
                "directory {} is already used by project '{}' ({})",
                path.display(),
                existing_name,
                existing_id
            ),
            ProjectError::NotFound(id) => write!(f, "project not found: {id}"),
            ProjectError::Db(err) => write!(f, "database error: {err}"),
        }
    }
}

impl std::error::Error for ProjectError {}

impl From<rusqlite::Error> for ProjectError {
    fn from(err: rusqlite::Error) -> Self {
        ProjectError::Db(DbError::from(err))
    }
}

impl From<DbError> for ProjectError {
    fn from(err: DbError) -> Self {
        ProjectError::Db(err)
    }
}

/// Creates a project. `name` must be non-blank; `path` must exist on disk
/// and not already belong to another project. The color is auto-assigned:
/// the least-used color in `PALETTE`, first entry wins ties (PROJ-01).
pub fn create(conn: &Connection, name: &str, path: &Path) -> Result<Project, ProjectError> {
    let name = require_name(name)?;
    let canonical = require_existing_dir(path)?;
    let path_str = path_to_string(&canonical);

    if let Some(existing) = find_by_path(conn, &path_str)? {
        return Err(ProjectError::PathAlreadyUsed {
            path: canonical,
            existing_id: existing.id,
            existing_name: existing.name,
        });
    }

    let color = pick_least_used_color(conn)?;
    let id = uuid::Uuid::now_v7().to_string();

    conn.execute(
        "INSERT INTO projects (id, name, path, color, last_used) VALUES (?1, ?2, ?3, ?4, NULL)",
        params![id, name, path_str, color],
    )?;

    Ok(Project {
        id,
        name: name.to_string(),
        path: path_str,
        color,
        last_used: None,
    })
}

/// Lists all projects, ordered by name (PROJ-01).
pub fn list_all(conn: &Connection) -> Result<Vec<Project>, ProjectError> {
    let mut stmt =
        conn.prepare("SELECT id, name, path, color, last_used FROM projects ORDER BY name")?;
    let rows = stmt.query_map([], row_to_project)?;

    let mut projects = Vec::new();
    for row in rows {
        projects.push(row?);
    }
    Ok(projects)
}

/// Fetches a project by id, or `ProjectError::NotFound`.
pub fn get(conn: &Connection, id: &str) -> Result<Project, ProjectError> {
    conn.query_row(
        "SELECT id, name, path, color, last_used FROM projects WHERE id = ?1",
        params![id],
        row_to_project,
    )
    .optional()?
    .ok_or_else(|| ProjectError::NotFound(id.to_string()))
}

/// Updates the fields given as `Some`. Linked tasks need no touching of
/// their own: they read the project's current name/path/color through the
/// `tasks.project_id -> projects.id` join (PROJ-04's "propagation" is just
/// this join being live).
pub fn update(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    path: Option<&Path>,
    color: Option<&str>,
) -> Result<Project, ProjectError> {
    let mut current = get(conn, id)?;

    if let Some(name) = name {
        current.name = require_name(name)?.to_string();
    }

    if let Some(path) = path {
        let canonical = require_existing_dir(path)?;
        let path_str = path_to_string(&canonical);

        if let Some(existing) = find_by_path(conn, &path_str)? {
            if existing.id != id {
                return Err(ProjectError::PathAlreadyUsed {
                    path: canonical,
                    existing_id: existing.id,
                    existing_name: existing.name,
                });
            }
        }

        current.path = path_str;
    }

    if let Some(color) = color {
        current.color = color.to_string();
    }

    conn.execute(
        "UPDATE projects SET name = ?1, path = ?2, color = ?3 WHERE id = ?4",
        params![current.name, current.path, current.color, id],
    )?;

    Ok(current)
}

/// Deletes a project and returns how many tasks were linked to it *before*
/// the delete. Those tasks are not deleted — `tasks.project_id` has
/// `ON DELETE SET NULL` (migration `003_tasks.sql`), so they survive with
/// `project_id = NULL`. This function only measures the count; the FK does
/// the detaching.
pub fn delete(conn: &Connection, id: &str) -> Result<usize, ProjectError> {
    // Ensures the project exists (NotFound otherwise) before we bother
    // counting or deleting anything.
    get(conn, id)?;

    let affected: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE project_id = ?1",
        params![id],
        |row| row.get(0),
    )?;

    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;

    Ok(affected as usize)
}

fn require_name(name: &str) -> Result<&str, ProjectError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ProjectError::NameRequired);
    }
    Ok(trimmed)
}

/// Confirms `path` exists and is a directory, returning its canonical form
/// so equivalent paths (relative, differently-cased drive letter, trailing
/// separator) always compare equal against the `projects.path` unique
/// column.
///
/// On Windows, `Path::canonicalize` returns the "verbatim" extended-length
/// form (`\\?\C:\...`, or `\\?\UNC\server\share\...` for network paths) —
/// never the plain form a real terminal's `cwd` would have. The doc comment
/// above only ever promised *equivalent paths compare equal*, not that this
/// verbatim prefix be preserved, so [`strip_verbatim_prefix`] removes it
/// before the path is returned (and eventually stored). Without this,
/// `projects::resolve::resolve` — which compares paths component-by-component
/// without touching the filesystem — treats the leading `\\?\` as an extra
/// `"?"` component that no live `cwd` ever has, so it never matches any
/// project, exact path included (PROJ-03/MCP-08 broken silently on
/// Windows). No-op on non-Windows targets, where `canonicalize` never
/// produces this prefix.
fn require_existing_dir(path: &Path) -> Result<PathBuf, ProjectError> {
    if !path.is_dir() {
        return Err(ProjectError::PathNotFound(path.to_path_buf()));
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| ProjectError::PathNotFound(path.to_path_buf()))?;
    Ok(strip_verbatim_prefix(&canonical))
}

/// Strips the Windows verbatim/extended-length prefix (`\\?\` or its UNC
/// variant `\\?\UNC\`) that `Path::canonicalize` adds, if present. Plain
/// string transform on the lossy string form — the paths this function
/// receives always come straight out of `canonicalize`, so they're valid
/// UTF-16 on Windows and this round-trips cleanly. No-op on non-Windows
/// targets and on any Windows path that doesn't carry the prefix.
#[cfg(windows)]
fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let raw = path.to_string_lossy();
    if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = raw.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

#[cfg(not(windows))]
fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    path.to_path_buf()
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn find_by_path(conn: &Connection, path: &str) -> Result<Option<Project>, ProjectError> {
    let project = conn
        .query_row(
            "SELECT id, name, path, color, last_used FROM projects WHERE path = ?1",
            params![path],
            row_to_project,
        )
        .optional()?;
    Ok(project)
}

/// Picks the color in `PALETTE` with the fewest projects currently using
/// it. Ties resolve to whichever color comes first in `PALETTE`'s
/// declaration order, since colors are scanned in that order and only a
/// strictly lower count replaces the current pick.
fn pick_least_used_color(conn: &Connection) -> Result<String, ProjectError> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM projects WHERE color = ?1")?;

    let mut best_color = PALETTE[0];
    let mut best_count = i64::MAX;

    for &color in PALETTE {
        let count: i64 = stmt.query_row(params![color], |row| row.get(0))?;
        if count < best_count {
            best_count = count;
            best_color = color;
        }
    }

    Ok(best_color.to_string())
}

fn row_to_project(row: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        color: row.get(3)?,
        last_used: row.get(4)?,
    })
}
