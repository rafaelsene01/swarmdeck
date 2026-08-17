// SPEC: multi-terminal (TERM-01, TERM-02, TERM-06, TERM-10, TERM-11), terminal-layout-options (LAYOUT-26)

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

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::db::Db;
use crate::terminal::layout::{self, TabEntry};
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
pub fn terminal_picker_set_last_dir(db: State<'_, Mutex<Db>>, path: String) -> Result<(), String> {
    let db = db.lock().expect("db mutex poisoned");
    picker_prefs::set_last_dir(db.conn(), &path).map_err(|e| e.to_string())
}

/// Diretório de queda quando o `cwd` salvo de um terminal não existe mais
/// (TERM-07). `dirs::home_dir` é a mesma fonte que `quota.rs` usa; num
/// ambiente sem home resolvível sobra o caminho vazio, e `restore` só o usa
/// como texto do `cwd` — nunca falha a restauração por causa disso.
fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

/// Núcleo testável de `terminal_workspace_get`: recebe `&Db` direto em vez
/// de `State<Mutex<Db>>`, que exige um app Tauri montado — mesmo motivo de
/// `commands::quota::set_validated`.
fn workspace_get(db: &Db, home: &Path) -> Result<Vec<TabEntry>, String> {
    layout::restore(db, home).map_err(|e| e.to_string())
}

fn workspace_set(db: &Db, tabs: &[TabEntry]) -> Result<(), String> {
    layout::save(db, tabs).map_err(|e| e.to_string())
}

/// Workspace salvo: abas, terminais e modo de layout de cada aba. Vetor
/// vazio na primeira execução (LAYOUT-24); erro de banco vira `Err(String)`
/// e o frontend abre a aba vazia mesmo assim (LAYOUT-26).
#[tauri::command]
pub fn terminal_workspace_get(db: State<'_, Mutex<Db>>) -> Result<Vec<TabEntry>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    workspace_get(&db, &home_dir())
}

/// Substitui o workspace salvo por completo, numa transação (LAYOUT-27).
#[tauri::command]
pub fn terminal_workspace_set(db: State<'_, Mutex<Db>>, tabs: Vec<TabEntry>) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    workspace_set(&db, &tabs)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terminal::LayoutEntry;

    fn temp_db() -> (tempfile::TempDir, Db) {
        let dir = tempfile::tempdir().expect("criar diretório temporário");
        let path = dir.path().join("swarmdeck.db");
        let db = Db::open(&path).expect("abrir banco");
        (dir, db)
    }

    fn tab(id: &str, cwd: &str) -> TabEntry {
        TabEntry {
            id: id.to_string(),
            slot: 0,
            name: "Aba 1".to_string(),
            layout_mode: "vertical".to_string(),
            layout_span: "last".to_string(),
            terminals: vec![LayoutEntry {
                id: format!("{id}-t1"),
                slot: 0,
                frac_w: 1.0,
                frac_h: 1.0,
                cwd: cwd.to_string(),
                agent_id: Some("claude-code".to_string()),
                title: None,
                title_source: "agent".to_string(),
                minimized: false,
                updated_at: 7,
                cwd_fallback_from: None,
            }],
        }
    }

    // LAYOUT-26: a ponte comando→banco devolve o mesmo workspace que gravou.
    #[test]
    fn workspace_set_seguido_de_get_devolve_as_mesmas_abas_e_terminais() {
        let (dir, db) = temp_db();
        let cwd = dir.path().to_string_lossy().into_owned();

        let escrito = vec![tab("aba-1", &cwd)];
        workspace_set(&db, &escrito).expect("set");

        assert_eq!(workspace_get(&db, dir.path()).expect("get"), escrito);
    }

    // LAYOUT-26: falha de leitura vira Err(String) — nunca panic, nunca
    // impedir a abertura do app.
    #[test]
    fn erro_de_banco_na_leitura_vira_err_string_sem_panicar() {
        let (dir, db) = temp_db();
        db.conn()
            .execute("DROP TABLE terminal_tabs", [])
            .expect("derrubar a tabela para simular banco corrompido");

        let erro = workspace_get(&db, dir.path()).expect_err("get deve falhar");

        assert!(
            erro.contains("terminal_tabs"),
            "a mensagem deve nomear o que falhou, veio: {erro}"
        );
    }

    // LAYOUT-26: mesma tradução de erro no caminho de gravação.
    #[test]
    fn erro_de_banco_na_gravacao_vira_err_string_sem_panicar() {
        let (dir, db) = temp_db();
        let cwd = dir.path().to_string_lossy().into_owned();
        db.conn()
            .execute("DROP TABLE terminal_tabs", [])
            .expect("derrubar a tabela para simular banco corrompido");

        let erro = workspace_set(&db, &[tab("aba-1", &cwd)]).expect_err("set deve falhar");

        assert!(
            erro.contains("terminal_tabs"),
            "a mensagem deve nomear o que falhou, veio: {erro}"
        );
    }
}
