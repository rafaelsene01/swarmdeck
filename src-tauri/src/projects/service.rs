// SPEC: projects (PROJ-01, PROJ-02, PROJ-09, PROJ-13, PROJ-14, PROJ-18)
// SPEC: wsl-terminal-profile (WSLP-14, WSLP-15)

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

use std::collections::HashSet;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::DbError;

use super::resolve::{self, Resolution};

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
    /// Explicit color override (T5) is not one of `PALETTE`'s values.
    ColorNotInPalette(String),
    /// Subfolder creation or `git init` spawn failed at the OS level (T5).
    Io(std::io::Error),
    /// `git init` (T5, PROJ-09) ran but exited with a non-zero status.
    GitInitFailed(String),
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
            ProjectError::ColorNotInPalette(color) => {
                write!(f, "color {color} is not in the palette")
            }
            ProjectError::Io(err) => write!(f, "filesystem error: {err}"),
            ProjectError::GitInitFailed(msg) => write!(f, "git init failed: {msg}"),
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

impl From<std::io::Error> for ProjectError {
    fn from(err: std::io::Error) -> Self {
        ProjectError::Io(err)
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

/// Creates a project the way `create` does, revised (T5) so the given
/// directory is a **base**: a subfolder named after `name` is made inside
/// it, and that subfolder — not `base_dir` itself — is registered as the
/// project's `path` (PROJ-01 AC6). `color` overrides the automatic pick when
/// given (PROJ-01 AC7, PROJ-02); `git_init` runs `git init` in the new
/// subfolder before returning (PROJ-09 AC1/AC2).
///
/// DESVIO: kept as a separate function instead of changing `create` in
/// place. `create`'s existing 3-arg signature has two callers this task's
/// file scope excludes — `commands::projects::project_create` and the 8
/// `tests/projects.rs` integration tests (projects/T1) — and the base_dir
/// semantics genuinely change what a same-named `path` argument means (a
/// directory that used to be *the* project path is now merely where a new
/// one gets created), so reusing the name would silently break both
/// callers' behavior even where it still compiled. `commands/projects.rs`
/// wiring this in is `projects/T7`'s job per `tasks.md`'s T5→T7 edge.
pub fn create_with_options(
    conn: &Connection,
    name: &str,
    base_dir: &Path,
    color: Option<String>,
    git_init: bool,
) -> Result<Project, ProjectError> {
    let name = require_name(name)?;
    let canonical_base = require_existing_dir(base_dir)?;
    let target = canonical_base.join(name);
    let target_str = path_to_string(&target);

    // Reuses the exact "directory already associated" validation `create`
    // uses: a subfolder that already resolves to another project's `path`
    // is refused pointing at that project (Done when #2).
    if let Some(existing) = find_by_path(conn, &target_str)? {
        return Err(ProjectError::PathAlreadyUsed {
            path: target,
            existing_id: existing.id,
            existing_name: existing.name,
        });
    }

    let color = match color {
        Some(chosen) => validate_explicit_color(&chosen)?,
        None => pick_least_used_color(conn)?,
    };

    fs::create_dir(&target)?;

    // Everything after the folder exists can still fail, and a failure that
    // left the folder behind would strand the user: the row is missing, so
    // the project is not listed, and retrying the same name dies in
    // `AlreadyExists` (PROJ-18 AC11). Removal is recursive because a
    // successful `git init` leaves `.git` inside.
    let created = (|| -> Result<String, ProjectError> {
        if git_init {
            run_git_init(&target)?;
        }

        let id = uuid::Uuid::now_v7().to_string();

        conn.execute(
            "INSERT INTO projects (id, name, path, color, last_used) VALUES (?1, ?2, ?3, ?4, NULL)",
            params![id, name, target_str, color],
        )?;

        Ok(id)
    })();

    let id = match created {
        Ok(id) => id,
        Err(err) => {
            let _ = fs::remove_dir_all(&target);
            return Err(err);
        }
    };

    Ok(Project {
        id,
        name: name.to_string(),
        path: target_str,
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

/// Stamps the current instant (epoch milliseconds) on `projects.last_used`
/// and returns the updated project (PROJ-14). The project's directory has
/// to still be on disk: a project whose folder is gone cannot be opened, so
/// nothing is written and the missing path comes back in the error
/// (PROJ-13 AC15).
pub fn touch_last_used(conn: &Connection, id: &str) -> Result<Project, ProjectError> {
    let mut project = get(conn, id)?;
    require_existing_dir(Path::new(&project.path))?;

    let now = now_millis();
    conn.execute(
        "UPDATE projects SET last_used = ?1 WHERE id = ?2",
        params![now, id],
    )?;

    project.last_used = Some(now);
    Ok(project)
}

/// Touches `last_used` for every distinct project that `resolve` matches
/// against one of `cwds`, returning how many projects were touched
/// (PROJ-14). Shared by the three triggers that only know a `cwd`: session
/// restore, closing a terminal and closing the app. Two `cwd`s under the
/// same project produce a single `UPDATE`. A `cwd` matching no project —
/// the sandbox directory, which is never a row in `projects` — touches
/// nothing.
pub fn touch_from_cwds(conn: &Connection, cwds: &[PathBuf]) -> Result<usize, ProjectError> {
    if cwds.is_empty() {
        return Ok(0);
    }

    let projects = list_all(conn)?;
    let mut touched: HashSet<String> = HashSet::new();

    for cwd in cwds {
        if let Resolution::Matched(project) = resolve::resolve(cwd, &projects) {
            if touched.insert(project.id.clone()) {
                touch_last_used(conn, &project.id)?;
            }
        }
    }

    Ok(touched.len())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
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

/// Validates an explicit color override: the only rule is belonging to
/// `PALETTE`. Colors are not exclusive between projects (PROJ-18 AC12) —
/// with eight of them, exclusivity made the ninth project impossible to
/// create with a chosen color, and the color exists only to tell projects
/// apart at a glance.
fn validate_explicit_color(color: &str) -> Result<String, ProjectError> {
    if !PALETTE.contains(&color) {
        return Err(ProjectError::ColorNotInPalette(color.to_string()));
    }

    Ok(color.to_string())
}

/// Monta o comando de `git init` para o perfil derivado de `dir` (WSLP-14,
/// WSLP-15), sem executar nada — mesmo desenho de
/// `terminal::manager::build_command`, testável sem rodar processo algum.
/// Só o caminho decide o perfil aqui: `git init` não consulta a preferência
/// padrão salva, a mesma regra de `profile_for_path`.
fn git_init_command(dir: &Path) -> (crate::shells::TerminalProfile, portable_pty::CommandBuilder) {
    let profile = crate::shells::profile_for_path(dir, &crate::shells::TerminalProfile::Host);
    let cmd = crate::shells::wrap::wrap(&profile, Some("git"), &["init".to_string()], &[], dir);
    (profile, cmd)
}

/// Runs `git init` in `dir` (T5, PROJ-09 AC1/AC2; wsl-terminal-profile
/// WSLP-14, WSLP-15). Spawn failure (e.g. `git` not on PATH) surfaces as
/// `ProjectError::Io`; a non-zero exit surfaces as
/// `ProjectError::GitInitFailed` — unchanged from before this feature.
fn run_git_init(dir: &Path) -> Result<(), ProjectError> {
    let (profile, built) = git_init_command(dir);
    let argv = built.get_argv();
    let (program, args) = argv
        .split_first()
        .expect("wrap sempre inclui ao menos o programa no argv");

    let mut cmd = Command::new(program);
    cmd.args(args);
    if matches!(profile, crate::shells::TerminalProfile::Host) {
        cmd.current_dir(dir);
    }

    let status = cmd.status()?;
    if !status.success() {
        return Err(ProjectError::GitInitFailed(format!(
            "git init exited with {status}"
        )));
    }
    Ok(())
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

// SPEC: projects (PROJ-01, PROJ-02, PROJ-09)
//
// Tests for `create_with_options` (T5). Uses an in-memory `Db` — same
// migrations as the real one (`db::Db::open_in_memory`), so no need for the
// real-file setup `tests/projects.rs` uses for its own (untouched, T1)
// coverage of `create`. Directories are real `tempfile::tempdir()`s since
// `create_with_options` validates and creates on disk for real.
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn cria_subpasta_dentro_da_base() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let base = tempfile::tempdir().expect("criar diretório base");

        let project = create_with_options(db.conn(), "MeuProjeto", base.path(), None, false)
            .expect("create_with_options deve funcionar com base válida");

        let expected_path = base.path().join("MeuProjeto");
        assert!(expected_path.is_dir(), "subpasta deve ter sido criada");
        assert_eq!(
            PathBuf::from(&project.path),
            strip_verbatim_prefix(&expected_path.canonicalize().unwrap())
        );
    }

    #[test]
    fn subpasta_colidente_recusa() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let base = tempfile::tempdir().expect("criar diretório base");

        let dono = create_with_options(db.conn(), "Duplicado", base.path(), None, false)
            .expect("primeiro create_with_options deve funcionar");

        let result = create_with_options(db.conn(), "Duplicado", base.path(), None, false);

        match result {
            Err(ProjectError::PathAlreadyUsed {
                existing_id,
                existing_name,
                ..
            }) => {
                assert_eq!(existing_id, dono.id);
                assert_eq!(existing_name, "Duplicado");
            }
            other => panic!("esperava PathAlreadyUsed, veio {other:?}"),
        }
    }

    #[test]
    fn cor_explicita_e_respeitada() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let base = tempfile::tempdir().expect("criar diretório base");
        let escolhida = PALETTE[5];

        let project = create_with_options(
            db.conn(),
            "ComCor",
            base.path(),
            Some(escolhida.to_string()),
            false,
        )
        .expect("create_with_options deve aceitar cor explícita válida");

        assert_eq!(project.color, escolhida);
    }

    // SPEC: projects (PROJ-18 AC12) — a cor deixou de ser exclusiva.
    #[test]
    fn nove_projetos_com_a_mesma_cor_explicita_sao_criados() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let base = tempfile::tempdir().expect("criar diretório base");
        let cor = PALETTE[2];

        for i in 1..=9 {
            let project = create_with_options(
                db.conn(),
                &format!("Projeto{i}"),
                base.path(),
                Some(cor.to_string()),
                false,
            )
            .unwrap_or_else(|e| panic!("criar o projeto {i} com cor repetida deve passar: {e}"));
            assert_eq!(project.color, cor);
        }

        assert_eq!(list_all(db.conn()).expect("listar projetos").len(), 9);
    }

    #[test]
    fn cor_fora_da_paleta_recusa() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let base = tempfile::tempdir().expect("criar diretório base");

        let result = create_with_options(
            db.conn(),
            "ForaDaPaleta",
            base.path(),
            Some("#123456".to_string()),
            false,
        );

        match result {
            Err(ProjectError::ColorNotInPalette(color)) => assert_eq!(color, "#123456"),
            other => panic!("esperava ColorNotInPalette, veio {other:?}"),
        }
    }

    #[test]
    fn git_init_cria_ponto_git() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let base = tempfile::tempdir().expect("criar diretório base");

        let project = create_with_options(db.conn(), "ComGit", base.path(), None, true)
            .expect("create_with_options com git_init deve funcionar");

        assert!(
            PathBuf::from(&project.path).join(".git").is_dir(),
            ".git deve existir na subpasta criada"
        );
    }

    // --- T1: `last_used` writes (PROJ-14, PROJ-13 AC15) ---

    fn projeto_de_teste(db: &Db, nome: &str) -> (tempfile::TempDir, Project) {
        let dir = tempfile::tempdir().expect("criar diretório do projeto");
        let project = create(db.conn(), nome, dir.path()).expect("create do projeto de teste");
        (dir, project)
    }

    #[test]
    fn touch_last_used_grava_epoch_em_milissegundos_e_devolve_o_projeto_atualizado() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let (_dir, project) = projeto_de_teste(&db, "Recente");

        let antes = now_millis();
        let tocado = touch_last_used(db.conn(), &project.id).expect("touch_last_used deve gravar");
        let depois = now_millis();

        let gravado = tocado.last_used.expect("last_used não pode voltar nulo");
        assert!(
            gravado >= antes && gravado <= depois,
            "last_used deve ser o instante atual em milissegundos;              recebido {gravado}, janela [{antes}, {depois}]"
        );
        assert_eq!(
            get(db.conn(), &project.id)
                .expect("reler projeto")
                .last_used,
            Some(gravado),
            "o valor devolvido deve ser o que ficou gravado na linha"
        );
    }

    #[test]
    fn touch_last_used_com_id_inexistente_devolve_not_found() {
        let db = Db::open_in_memory().expect("abrir banco em memória");

        match touch_last_used(db.conn(), "id-que-nao-existe") {
            Err(ProjectError::NotFound(id)) => assert_eq!(id, "id-que-nao-existe"),
            other => panic!("esperava NotFound, veio {other:?}"),
        }
    }

    #[test]
    fn touch_last_used_com_path_ausente_no_disco_nao_grava_nada() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let dir = tempfile::tempdir().expect("criar diretório do projeto");
        let project = create(db.conn(), "Sumido", dir.path()).expect("create do projeto");
        let caminho = PathBuf::from(&project.path);
        dir.close().expect("remover o diretório do projeto");

        match touch_last_used(db.conn(), &project.id) {
            Err(ProjectError::PathNotFound(path)) => assert_eq!(path, caminho),
            other => panic!("esperava PathNotFound, veio {other:?}"),
        }

        assert_eq!(
            get(db.conn(), &project.id)
                .expect("reler projeto")
                .last_used,
            None,
            "nada pode ser gravado quando o diretório do projeto não existe mais"
        );
    }

    #[test]
    fn touch_last_used_duas_vezes_avanca_o_instante() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let (_dir, project) = projeto_de_teste(&db, "Duas Vezes");

        let primeiro = touch_last_used(db.conn(), &project.id)
            .expect("primeiro touch")
            .last_used
            .expect("primeiro last_used");
        let segundo = touch_last_used(db.conn(), &project.id)
            .expect("segundo touch")
            .last_used
            .expect("segundo last_used");

        assert!(
            segundo >= primeiro,
            "o segundo instante não pode ser anterior ao primeiro; {segundo} < {primeiro}"
        );
    }

    #[test]
    fn touch_from_cwds_toca_por_cwd_exato_e_por_subpasta() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let (dir_a, projeto_a) = projeto_de_teste(&db, "Exato");
        let (dir_b, projeto_b) = projeto_de_teste(&db, "Subpasta");
        let subpasta = dir_b.path().join("src").join("projects");

        let tocados = touch_from_cwds(db.conn(), &[dir_a.path().to_path_buf(), subpasta])
            .expect("touch_from_cwds deve funcionar");

        assert_eq!(tocados, 2);
        assert!(
            get(db.conn(), &projeto_a.id)
                .expect("reler A")
                .last_used
                .is_some(),
            "o cwd igual ao path do projeto deve tocar o projeto"
        );
        assert!(
            get(db.conn(), &projeto_b.id)
                .expect("reler B")
                .last_used
                .is_some(),
            "o cwd em subpasta do projeto deve tocar o projeto"
        );
    }

    #[test]
    fn touch_from_cwds_com_dois_cwds_do_mesmo_projeto_grava_uma_vez_so() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let (dir, projeto) = projeto_de_teste(&db, "Um Update");
        let subpasta = dir.path().join("src");

        let antes = db.conn().total_changes();
        let tocados = touch_from_cwds(db.conn(), &[dir.path().to_path_buf(), subpasta])
            .expect("touch_from_cwds deve funcionar");

        assert_eq!(tocados, 1, "dois cwds do mesmo projeto contam como um");
        assert_eq!(
            db.conn().total_changes() - antes,
            1,
            "só uma linha pode ter sido atualizada"
        );
        assert!(get(db.conn(), &projeto.id)
            .expect("reler projeto")
            .last_used
            .is_some());
    }

    #[test]
    fn touch_from_cwds_com_cwd_sem_projeto_devolve_zero() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let (_dir, projeto) = projeto_de_teste(&db, "Intocado");
        let fora = tempfile::tempdir().expect("criar diretório fora de qualquer projeto");

        let tocados = touch_from_cwds(db.conn(), &[fora.path().to_path_buf()])
            .expect("cwd sem projeto não pode falhar");

        assert_eq!(tocados, 0);
        assert_eq!(
            get(db.conn(), &projeto.id)
                .expect("reler projeto")
                .last_used,
            None
        );
    }

    #[test]
    fn touch_from_cwds_com_a_pasta_sandbox_devolve_zero() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let (_dir, projeto) = projeto_de_teste(&db, "Com Projeto");
        // A sandbox mora no diretório de dados do app e nunca vira linha em
        // `projects` (PROJ-07), então nenhum cwd dentro dela casa.
        let data_dir = tempfile::tempdir().expect("criar diretório de dados");
        let sandbox = data_dir.path().join("sandbox");
        fs::create_dir(&sandbox).expect("criar a pasta sandbox");

        let tocados =
            touch_from_cwds(db.conn(), &[sandbox]).expect("sandbox não pode fazer falhar");

        assert_eq!(tocados, 0);
        assert_eq!(
            get(db.conn(), &projeto.id)
                .expect("reler projeto")
                .last_used,
            None
        );
    }

    #[test]
    fn touch_from_cwds_com_lista_vazia_nao_consulta_o_banco() {
        // Conexão sem migração nenhuma: qualquer consulta a `projects`
        // falharia, então um `Ok(0)` prova que o banco não foi consultado.
        let conn = Connection::open_in_memory().expect("abrir conexão crua");

        assert_eq!(
            touch_from_cwds(&conn, &[]).expect("lista vazia não pode falhar"),
            0
        );
    }

    // --- T3: nenhuma pasta órfã quando a criação falha (PROJ-18 AC11) ---

    /// Faz o `INSERT` em `projects` falhar sem quebrar os `SELECT` que
    /// `create_with_options` roda antes de criar a pasta.
    fn bloquear_insert(db: &Db) {
        db.conn()
            .execute_batch(
                "CREATE TRIGGER bloqueia_insert BEFORE INSERT ON projects                  BEGIN SELECT RAISE(ABORT, 'insert bloqueado'); END;",
            )
            .expect("criar trigger de bloqueio");
    }

    #[test]
    fn falha_depois_de_criar_a_pasta_remove_a_pasta_e_propaga_o_erro() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let base = tempfile::tempdir().expect("criar diretório base");
        bloquear_insert(&db);

        // `git_init: true` deixa `.git` dentro da subpasta antes da falha,
        // então a remoção precisa ser recursiva.
        let result = create_with_options(db.conn(), "Orfao", base.path(), None, true);

        assert!(
            matches!(result, Err(ProjectError::Db(_))),
            "o erro precisa ser propagado, não engolido; veio {result:?}"
        );
        assert!(
            !base.path().join("Orfao").exists(),
            "a subpasta recém-criada não pode ficar no disco depois da falha"
        );
    }

    #[test]
    fn repetir_a_criacao_com_o_mesmo_nome_depois_da_falha_funciona() {
        let db = Db::open_in_memory().expect("abrir banco em memória");
        let base = tempfile::tempdir().expect("criar diretório base");
        bloquear_insert(&db);

        create_with_options(db.conn(), "Retentado", base.path(), None, false)
            .expect_err("a primeira tentativa deve falhar");

        db.conn()
            .execute_batch("DROP TRIGGER bloqueia_insert;")
            .expect("liberar o insert");

        let project = create_with_options(db.conn(), "Retentado", base.path(), None, false)
            .expect("a segunda tentativa com o mesmo nome deve funcionar");

        assert!(PathBuf::from(&project.path).is_dir());
    }

    fn argv(cmd: &portable_pty::CommandBuilder) -> Vec<String> {
        cmd.get_argv()
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    // WSLP-15: caminho fora de WSL produz exatamente o `git init` de hoje.
    #[test]
    fn git_init_command_host_produz_argv_de_hoje() {
        let (profile, cmd) = git_init_command(Path::new("/tmp/algum-repo"));
        assert_eq!(profile, crate::shells::TerminalProfile::Host);
        assert_eq!(argv(&cmd), vec!["git", "init"]);
    }

    // WSLP-14: um caminho `\\wsl.localhost\...` roda `git init` dentro da
    // distro, pelo mesmo `wrap` que o terminal usa.
    #[test]
    fn git_init_command_wsl_roda_dentro_da_distro() {
        let dir = Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x\novo-repo");
        let (profile, cmd) = git_init_command(dir);
        assert_eq!(
            profile,
            crate::shells::TerminalProfile::Wsl {
                distro: "Ubuntu-24.04".to_string()
            }
        );
        assert_eq!(
            argv(&cmd),
            vec![
                "wsl.exe",
                "-d",
                "Ubuntu-24.04",
                "--cd",
                r"\\wsl.localhost\Ubuntu-24.04\home\x\novo-repo",
                "--",
                "env",
                "git",
                "init",
            ]
        );
    }

    // Uma falha de `git init` continua igual a antes desta feature: erro
    // `GitInitFailed`, sem mudar o formato ou engolir o status. Sabota o
    // `git init` de forma portável (sem tocar PATH): um arquivo comum
    // chamado `.git` já ocupa o lugar onde o `git` tentaria criar o
    // diretório `.git`.
    #[test]
    fn git_init_falho_devolve_erro_git_init_failed_como_antes() {
        let base = tempfile::tempdir().expect("criar diretório temporário");
        let target = base.path().join("sabotado");
        fs::create_dir(&target).expect("criar subpasta alvo");
        fs::write(target.join(".git"), b"nao sou um diretorio").expect("sabotar o .git");

        let err =
            run_git_init(&target).expect_err("git init deve falhar quando .git já é um arquivo");

        assert!(
            matches!(err, ProjectError::GitInitFailed(_)),
            "esperava GitInitFailed, veio {err:?}"
        );
    }
}
