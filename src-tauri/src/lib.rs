//! SwarmDeck — orquestrador desktop de múltiplos agentes de IA em terminal.
//!
//! `commands` (T6) entra na tarefa seguinte.

use std::sync::Mutex;

use tauri::Manager;

pub mod db;
pub mod paths;
pub mod terminal;

use db::Db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // SPEC: release-distribution (REL-16, REL-17)
            // `paths::db_path` é a única autoridade sobre onde o banco mora —
            // portátil ou instalado. Nenhum outro ponto do app monta esse
            // caminho.
            let handle = app.handle().clone();
            let path = paths::db_path(&handle).expect("não foi possível resolver o caminho do banco");
            let db = Db::open(path).expect("não foi possível abrir o banco do SwarmDeck");
            app.manage(Mutex::new(db));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o SwarmDeck");
}
