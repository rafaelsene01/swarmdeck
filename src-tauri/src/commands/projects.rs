// SPEC: projects (PROJ-01)

//! Comandos Tauri que expõem `projects::service` ao frontend.
//!
//! Invólucros finos: nenhuma regra de negócio mora aqui — só desserializa o
//! argumento, delega para `projects::service` e traduz o erro para `String`
//! (mesmo padrão de `commands/terminal.rs`).

use std::path::Path;
use std::sync::Mutex;

use tauri::State;

use crate::db::Db;
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
