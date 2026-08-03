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

            // SPEC: multi-terminal (TERM-06)
            // Metadados de título/status por terminal (mcp-task-server/T4).
            // Gerido aqui, do mesmo jeito que `Db`/`TerminalManager` acima,
            // para que `terminal_set_title` (T16) e o futuro `IpcServer`
            // (mcp-task-server/T9, estacionada) acabem enxergando a mesma
            // instância em vez de duas divergentes — sem isto a regra
            // "rename manual vence o agente" não teria como valer entre a UI
            // e o MCP.
            app.manage(std::sync::Arc::new(terminal::TerminalMetaService::new()));

            Ok(())
        })
        // SPEC: release-distribution (REL-19, REL-21, REL-24)
        // Regista o plugin oficial de update; `update::check` fala com ele
        // via `UpdaterExt` para a metade instalada, contra o endpoint em
        // `tauri.conf.json`.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // SPEC: multi-terminal (TERM-10, TERM-11)
        // Regista o plugin oficial de diálogo; o `NewTerminalDialog` (T15)
        // chama `open()` direto do frontend para o seletor de pasta — nenhum
        // comando Rust novo abre o seletor em si.
        .plugin(tauri_plugin_dialog::init())
        // SPEC: multi-terminal (TERM-01, TERM-02)
        .invoke_handler(tauri::generate_handler![
            commands::terminal::pty_spawn,
            commands::terminal::pty_write,
            commands::terminal::pty_resize,
            commands::terminal::pty_kill,
            // SPEC: multi-terminal (TERM-10, TERM-11)
            commands::terminal::terminal_picker_last_dir,
            commands::terminal::terminal_picker_set_last_dir,
            // SPEC: multi-terminal (TERM-06)
            commands::terminal::terminal_set_title,
            // SPEC: projects (PROJ-01)
            commands::projects::project_list,
            commands::projects::project_create,
            commands::projects::project_update,
            commands::projects::project_delete,
            // SPEC: release-distribution (REL-20, REL-23, REL-26)
            commands::update::update_check,
            commands::update::update_skip_version,
            commands::update::terminals_active_count,
            // SPEC: task-kanban (KAN-08)
            commands::kanban::kanban_open,
            commands::kanban::kanban_focus_main,
            // SPEC: settings-shell (SET-01)
            commands::settings::settings_open,
            commands::settings::settings_focus_main,
            // SPEC: task-kanban (KAN-01, KAN-04)
            commands::tasks::task_list,
            commands::tasks::task_get,
            // SPEC: task-kanban (KAN-03, KAN-04)
            commands::tasks::task_delete,
            commands::tasks::task_send,
            // SPEC: agent-selection (AGT-01, AGT-03, AGT-04)
            commands::agents::agent_catalog,
            commands::agents::agent_default,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o SwarmDeck");
}
