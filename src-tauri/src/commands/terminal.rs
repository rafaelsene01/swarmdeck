// SPEC: multi-terminal (TERM-01, TERM-02, TERM-06, TERM-10, TERM-11)

//! Comandos Tauri que expõem `TerminalManager`, `picker_prefs` e
//! `TerminalMetaService` ao frontend.
//!
//! Invólucros finos: nenhuma regra de negócio mora aqui — só desserializa o
//! argumento, delega para `TerminalManager` (T5) / `picker_prefs` (T13) /
//! `TerminalMetaService` (T16, mcp-task-server/T4) e traduz o erro para
//! `String` (o que a IPC do Tauri consegue transportar). A única peça extra
//! é `pump_output`, a ponte necessária entre o modelo de leitura por
//! `take_output()` do manager (pull) e o `Channel` do Tauri (push) — sem ela
//! `pty_spawn` não teria como ligar a saída da sessão ao `Channel`.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::db::Db;
use crate::terminal::throttle::FLUSH_INTERVAL_MS;
use crate::terminal::{
    picker_prefs, SessionConfig, SessionState, TerminalId, TerminalManager, TerminalMetaService,
    TitleSource,
};

fn parse_id(id: &str) -> Result<TerminalId, String> {
    id.parse()
        .map_err(|_| format!("`{id}` não é um id de terminal válido"))
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    cwd: String,
    shell: Option<String>,
    agent: Option<String>,
    channel: Channel<Vec<u8>>,
) -> Result<String, String> {
    let manager = app.state::<TerminalManager>();
    let cfg = SessionConfig {
        cwd: cwd.into(),
        shell,
        agent,
        env: Default::default(),
    };
    let id = manager.spawn(cfg).map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    std::thread::spawn(move || pump_output(app_handle, id, channel));

    Ok(id.to_string())
}

#[tauri::command]
pub fn pty_write(
    manager: State<'_, TerminalManager>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let id = parse_id(&id)?;
    manager.write(id, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    manager: State<'_, TerminalManager>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let id = parse_id(&id)?;
    manager.resize(id, rows, cols).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(manager: State<'_, TerminalManager>, id: String) -> Result<(), String> {
    let id = parse_id(&id)?;
    manager.kill(id).map_err(|e| e.to_string())
}

/// Invólucro fino sobre `picker_prefs::last_dir` (T13) — o diálogo de pasta
/// em si (`open()`, com `directory: true`) é chamado direto do frontend pelo
/// `@tauri-apps/plugin-dialog`; este comando só devolve de onde reabrir.
#[tauri::command]
pub fn terminal_picker_last_dir(db: State<'_, Mutex<Db>>) -> Result<Option<String>, String> {
    let db = db.lock().expect("db mutex poisoned");
    picker_prefs::last_dir(db.conn()).map_err(|e| e.to_string())
}

/// Invólucro fino sobre `picker_prefs::set_last_dir` (T13) — chamado pelo
/// frontend depois que o usuário confirma uma pasta no seletor nativo.
#[tauri::command]
pub fn terminal_picker_set_last_dir(
    db: State<'_, Mutex<Db>>,
    path: String,
) -> Result<(), String> {
    let db = db.lock().expect("db mutex poisoned");
    picker_prefs::set_last_dir(db.conn(), &path).map_err(|e| e.to_string())
}

/// Invólucro fino sobre `TerminalMetaService::set_title` (mcp-task-server/T4,
/// já existe e já é testada) com `TitleSource::User` — a metade "rename
/// manual" de TERM-06 (absorve `terminal-statuses/STAT-07`, revogada por
/// descrever a mesma regra: "rename manual do terminal vence o agente"). Não
/// reimplementa essa regra — ela já vive em `meta.rs`
/// (`rename_manual_do_usuario_vence_chamada_seguinte_do_agente`, testada
/// lá); este comando só é a ponte entre o duplo-clique do header e aquele
/// serviço.
///
/// `id` não é validado contra uma sessão viva de propósito:
/// `route_set_terminal_title` (`ipc/server.rs`), que expõe a mesma operação
/// para o MCP, também não valida — a chave usada por `TerminalMetaService` é
/// só o `terminal_id` bruto, não um `TerminalId` parseado.
#[tauri::command]
pub fn terminal_set_title(
    meta: State<'_, Arc<TerminalMetaService>>,
    id: String,
    title: String,
) -> Result<(), String> {
    meta.set_title(&id, &title, TitleSource::User);
    Ok(())
}

/// Drena a saída da sessão para o `Channel`, na mesma janela de agregação
/// que `OutputThrottle` já usa, até a sessão morrer ou o front fechar o
/// canal.
fn pump_output(app: AppHandle, id: TerminalId, channel: Channel<Vec<u8>>) {
    loop {
        std::thread::sleep(Duration::from_millis(FLUSH_INTERVAL_MS));

        let manager = app.state::<TerminalManager>();

        if let Some(chunk) = manager.take_output(id) {
            if channel.send(chunk.bytes).is_err() {
                return; // o front fechou o canal
            }
        }

        let ainda_viva = manager
            .list()
            .into_iter()
            .any(|s| s.id == id && matches!(s.state, SessionState::Running));

        if !ainda_viva {
            if let Some(chunk) = manager.take_output(id) {
                let _ = channel.send(chunk.bytes);
            }
            return;
        }
    }
}
