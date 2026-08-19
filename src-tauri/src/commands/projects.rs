// SPEC: projects (PROJ-01, PROJ-14, PROJ-16, PROJ-18)

//! Comandos Tauri que expõem `projects::service` ao frontend.
//!
//! Invólucros finos: nenhuma regra de negócio mora aqui — só desserializa o
//! argumento, delega para `projects::service` e traduz o erro para `String`
//! (mesmo padrão de `commands/terminal.rs`).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::db::Db;
use crate::projects::sandbox;
use crate::projects::service::{self, Project};

#[tauri::command]
pub fn project_list(db: State<'_, Mutex<Db>>) -> Result<Vec<Project>, String> {
    let db = db.lock().expect("db mutex poisoned");
    service::list_all(db.conn()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_create(
    db: State<'_, Mutex<Db>>,
    name: String,
    path: String,
) -> Result<Project, String> {
    let db = db.lock().expect("db mutex poisoned");
    service::create(db.conn(), &name, Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_update(
    db: State<'_, Mutex<Db>>,
    id: String,
    name: Option<String>,
    path: Option<String>,
    color: Option<String>,
) -> Result<Project, String> {
    let db = db.lock().expect("db mutex poisoned");
    service::update(
        db.conn(),
        &id,
        name.as_deref(),
        path.as_deref().map(Path::new),
        color.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_delete(db: State<'_, Mutex<Db>>, id: String) -> Result<usize, String> {
    let db = db.lock().expect("db mutex poisoned");
    service::delete(db.conn(), &id).map_err(|e| e.to_string())
}

/// Núcleo testável de `project_touch`: recebe `&Connection` direto em vez de
/// `State<Mutex<Db>>`, que exige um app Tauri montado — mesmo motivo de
/// `commands::quota::set_validated`. É `pub` porque os testes desta camada
/// moram em `tests/projects.rs`, um binário separado.
pub fn touch(conn: &Connection, id: &str) -> Result<Project, String> {
    service::touch_last_used(conn, id).map_err(|e| e.to_string())
}

/// Núcleo testável de `project_touch_cwds`. A única coisa que acontece aqui
/// além da tradução de erro é converter os `cwd` que a IPC transporta como
/// texto em `PathBuf` — a resolução e a deduplicação são de
/// `service::touch_from_cwds`.
pub fn touch_cwds(conn: &Connection, cwds: &[String]) -> Result<usize, String> {
    let paths: Vec<PathBuf> = cwds.iter().map(PathBuf::from).collect();
    service::touch_from_cwds(conn, &paths).map_err(|e| e.to_string())
}

/// Grava o instante atual em `projects.last_used` do projeto escolhido no
/// wizard (P1 AC9).
#[tauri::command]
pub fn project_touch(db: State<'_, Mutex<Db>>, id: String) -> Result<Project, String> {
    let db = db.lock().expect("db mutex poisoned");
    touch(db.conn(), &id)
}

/// Grava `last_used` de cada projeto que casa com um dos `cwd` recebidos e
/// devolve quantos foram tocados (P1 AC10 — restauração de sessão).
#[tauri::command]
pub fn project_touch_cwds(db: State<'_, Mutex<Db>>, cwds: Vec<String>) -> Result<usize, String> {
    let db = db.lock().expect("db mutex poisoned");
    touch_cwds(db.conn(), &cwds)
}

/// Núcleo testável de `project_create_in` — mesmo motivo de `touch` acima.
pub fn create_in(
    conn: &Connection,
    name: &str,
    base_dir: &str,
    color: Option<String>,
    git_init: bool,
) -> Result<Project, String> {
    service::create_with_options(conn, name, Path::new(base_dir), color, git_init)
        .map_err(|e| e.to_string())
}

/// Cria um projeto novo numa subpasta do diretório-base escolhido, com cor
/// da paleta e `git init` opcional (PROJ-18). Distinto de `project_create`,
/// que registra uma pasta que já existe (o "Import Project" de PROJ-17).
#[tauri::command]
pub fn project_create_in(
    db: State<'_, Mutex<Db>>,
    name: String,
    base_dir: String,
    color: Option<String>,
    git_init: bool,
) -> Result<Project, String> {
    let db = db.lock().expect("db mutex poisoned");
    create_in(db.conn(), &name, &base_dir, color, git_init)
}

/// Caminho da pasta-sandbox usada pelo "No Project", criada se ainda não
/// existir (PROJ-16). Invólucro sem núcleo testável próprio: `sandbox_dir`
/// só sabe resolver a partir de um `AppHandle`, e o que ele faz depois já é
/// coberto por `projects::sandbox` (`creates_sandbox_dir_when_absent`,
/// `resolving_twice_is_idempotent`, `never_registers_a_project_row`).
#[tauri::command]
pub fn project_sandbox_dir(app: tauri::AppHandle) -> Result<String, String> {
    sandbox::sandbox_dir(&app)
        .map(|dir| dir.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}
