//! SwarmDeck — orquestrador desktop de múltiplos agentes de IA em terminal.

use std::sync::Mutex;

use tauri::Manager;

pub mod agents;
pub mod commands;
pub mod db;
pub mod ipc;
pub mod paths;
pub mod projects;
pub mod tasks;
pub mod terminal;
pub mod update;

use db::Db;
use terminal::TerminalManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // SPEC: release-distribution (REL-16, REL-17)
            // `paths::db_path` é a única autoridade sobre onde o banco mora —
            // portátil ou instalado. Nenhum outro ponto do app monta esse
            // caminho.
            let handle = app.handle().clone();
            let path =
                paths::db_path(&handle).expect("não foi possível resolver o caminho do banco");
            let db = Db::open(path).expect("não foi possível abrir o banco do SwarmDeck");
            app.manage(Mutex::new(db));

            // SPEC: multi-terminal (TERM-01, TERM-03)
            // Registro único das sessões PTY vivas — comandos e o pump de
            // saída (T6) leem este estado via `app.state::<TerminalManager>()`.
            app.manage(TerminalManager::new());

            Ok(())
        })
        // SPEC: release-distribution (REL-19, REL-21, REL-24)
        // Regista o plugin oficial de update; `update::check` fala com ele
        // via `UpdaterExt` para a metade instalada, contra o endpoint em
        // `tauri.conf.json`.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // SPEC: multi-terminal (TERM-01, TERM-02)
        .invoke_handler(tauri::generate_handler![
            commands::terminal::pty_spawn,
            commands::terminal::pty_write,
            commands::terminal::pty_resize,
            commands::terminal::pty_kill,
            // SPEC: projects (PROJ-01)
            commands::projects::project_list,
            commands::projects::project_create,
            commands::projects::project_update,
            commands::projects::project_delete,
            // SPEC: release-distribution (REL-20, REL-23, REL-26)
            commands::update::update_check,
            commands::update::update_skip_version,
            commands::update::terminals_active_count,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o SwarmDeck");
}
