//! SwarmDeck — orquestrador desktop de múltiplos agentes de IA em terminal.

use std::sync::Mutex;

use tauri::Manager;

pub mod agents;
pub mod commands;
pub mod db;
pub mod ipc;
pub mod paths;
pub mod projects;
// SPEC: quota-indicator (QUOTA-15, QUOTA-19, QUOTA-25)
pub mod quota;
pub mod tasks;
pub mod terminal;
pub mod update;

use db::Db;
use terminal::TerminalManager;

// SPEC: silent-update (SILENT-35), quota-indicator (QUOTA-13)
/// Instala o provedor de cripto do rustls como padrão do processo.
///
/// `reqwest` é compilado com `rustls-no-provider` (ver Cargo.toml): sem esta
/// chamada, `reqwest::Client::builder().build()` **panica** em vez de
/// devolver `Err`. Dentro de um `#[tauri::command] async`, esse panic mata a
/// task e a promise do IPC nunca resolve — a UI fica presa em "Verificando…"
/// (busca de atualização) e o anel de cota nunca sai de "carregando".
///
/// Idempotente: `install_default` devolve `Err` se já houver um provedor
/// instalado, e é exatamente esse o estado desejado — daí o `let _`.
fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_crypto_provider();

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

            // SPEC: quota-indicator (QUOTA-13, QUOTA-14)
            // Cache em memória da busca de cota — `quota_claude` (T8) lê e
            // grava aqui via `app.state::<QuotaCache>()`.
            app.manage(quota::QuotaCache::new());

            // SPEC: silent-update (SILENT-07, SILENT-14)
            // Checagem em segundo plano só consulta e avisa (SILENT-15,
            // SILENT-16) — nunca baixa nem instala no fechamento da janela
            // `main` (AD-005). `Applying` é o guarda de acionamento duplo
            // (SILENT-28) de `update_download`/`update_install`; `Pending`
            // guarda os bytes baixados e conferidos entre os dois passos
            // (SILENT-38). `cleanup_stale_old` apaga um `.old` remanescente
            // de uma troca anterior (SILENT-07) — erro aqui é só logado,
            // nunca trava o boot.
            app.manage(update::apply::Applying::default());
            app.manage(update::apply::Pending::default());
            update::spawn_background_checker(app.handle().clone());

            if let Ok(exe) = std::env::current_exe() {
                if let (Some(exe_dir), Some(exe_name)) =
                    (exe.parent(), exe.file_name().and_then(|n| n.to_str()))
                {
                    if let Err(err) = update::cleanup_stale_old(exe_dir, exe_name) {
                        eprintln!("swarmdeck: falha ao limpar .old remanescente: {err}");
                    }
                }
            }

            Ok(())
        })
        // SPEC: silent-update (SILENT-08)
        // Regista o plugin oficial de update — fora do Windows, é por onde
        // `apply::download`/`apply::install` aplicam a atualização
        // (`UpdaterExt`); no Windows a troca de arquivo não depende dele
        // (AD-009), justamente porque o instalador do plugin encerra o
        // processo para poder substituir o `.exe`.
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
            // SPEC: terminal-layout-options (LAYOUT-26)
            commands::terminal::terminal_workspace_get,
            commands::terminal::terminal_workspace_set,
            // SPEC: projects (PROJ-01)
            commands::projects::project_list,
            commands::projects::project_create,
            commands::projects::project_update,
            commands::projects::project_delete,
            // SPEC: silent-update (SILENT-09, SILENT-13, SILENT-25)
            commands::update::update_status,
            commands::update::update_download,
            commands::update::update_install,
            commands::update::update_restart,
            commands::update::update_skip_version,
            commands::update::update_auto_check_get,
            commands::update::update_auto_check_set,
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
            // SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-11, QUOTA-17)
            commands::quota::quota_prefs_get,
            commands::quota::quota_prefs_set,
            commands::quota::quota_claude,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o SwarmDeck");
}
