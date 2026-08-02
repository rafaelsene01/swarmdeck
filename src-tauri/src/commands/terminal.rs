// SPEC: multi-terminal (TERM-01, TERM-02)

//! Comandos Tauri que expõem `TerminalManager` ao frontend.
//!
//! Invólucros finos: nenhuma regra de negócio mora aqui — só desserializa o
//! argumento, delega para `TerminalManager` (T5) e traduz o erro para
//! `String` (o que a IPC do Tauri consegue transportar). A única peça extra
//! é `pump_output`, a ponte necessária entre o modelo de leitura por
//! `take_output()` do manager (pull) e o `Channel` do Tauri (push) — sem
//! ela `pty_spawn` não teria como ligar a saída da sessão ao `Channel`.

use std::time::Duration;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::terminal::throttle::FLUSH_INTERVAL_MS;
use crate::terminal::{SessionConfig, SessionState, TerminalId, TerminalManager};

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
