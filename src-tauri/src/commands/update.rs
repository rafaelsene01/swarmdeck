// SPEC: release-distribution (REL-20, REL-23, REL-26)

//! Comandos Tauri que alimentam o `UpdateBanner` do frontend (T17).
//!
//! Invólucros finos, mesmo padrão de `commands/terminal.rs` e
//! `commands/projects.rs`: nenhuma regra de negócio mora aqui — só
//! desserializa o argumento, delega para `update::check` / `db::settings`
//! / `TerminalManager` e traduz o erro para `String`.

use std::sync::Mutex;

use tauri::{AppHandle, State};

use crate::db::{skip_version, Db};
use crate::terminal::TerminalManager;
use crate::update::{self, UpdateInfo};

/// Verificação sob demanda: mesmo núcleo de `update::check` usado no boot
/// (T15), aqui acionável a qualquer momento (ex.: um botão futuro em T18).
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    update::check(&app).await.map_err(|e| e.to_string())
}

/// Marca `version` como pulada (REL-23) — só essa versão para de gerar
/// aviso; qualquer versão futura continua sendo avisada normalmente.
#[tauri::command]
pub fn update_skip_version(db: State<'_, Mutex<Db>>, version: String) -> Result<(), String> {
    let db = db.lock().expect("db mutex poisoned");
    skip_version(db.conn(), &version).map_err(|e| e.to_string())
}

/// Quantos terminais estão registrados no `TerminalManager` agora — o
/// frontend usa isso para decidir se pede confirmação antes de aplicar a
/// atualização (REL-26: avisar que os PTYs serão encerrados).
#[tauri::command]
pub fn terminals_active_count(manager: State<'_, TerminalManager>) -> u32 {
    manager.list().len() as u32
}
