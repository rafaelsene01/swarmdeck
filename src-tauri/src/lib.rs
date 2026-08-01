//! SwarmDeck — orquestrador desktop de múltiplos agentes de IA em terminal.

use std::sync::Mutex;

use tauri::Manager;

pub mod commands;
pub mod db;
pub mod paths;
pub mod terminal;

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
        // SPEC: multi-terminal (TERM-01, TERM-02)
        .invoke_handler(tauri::generate_handler![
            commands::terminal::pty_spawn,
            commands::terminal::pty_write,
            commands::terminal::pty_resize,
            commands::terminal::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o SwarmDeck");
}
