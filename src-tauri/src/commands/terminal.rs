// SPEC: multi-terminal (TERM-01, TERM-02, TERM-06, TERM-11 — REVOKED by AD-019: the two `terminal_picker_*` commands have no caller left), terminal-layout-options (LAYOUT-26), session-restore (SESS-12, SESS-13), projects (PROJ-14)
// SPEC: wsl-terminal-profile (WSLP-07, WSLP-10, WSLP-24)

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
use crate::projects::service;
use crate::shells;
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

/// SPEC: wsl-terminal-profile (WSLP-07, WSLP-24, WSLP-10) — o perfil de um
/// `pty_spawn` sai só do `cwd`: distro nomeada no caminho vence, e qualquer
/// outro caminho é `Host`. Nunca `prefs::resolve_default` (AD-039): aquele
/// valor é o resquício do seletor global que a AD-035 revogou, e usá-lo aqui
/// abria o terminal dentro da distro para um projeto puramente Windows.
fn resolve_profile(cwd: &Path) -> shells::TerminalProfile {
    shells::profile_for_path(cwd, &shells::TerminalProfile::Host)
}

// A assinatura é o contrato da IPC: cada parâmetro é uma chave do objeto que o
// `invoke` do front manda. Agrupá-los num struct só para caber no limite do
// clippy mudaria o payload (e o `TerminalPane` junto) sem ganho nenhum de
// legibilidade — o comando continua sendo um invólucro fino.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    cwd: String,
    agent: Option<String>,
    // SPEC: session-restore (SESS-12, SESS-13) — o front manda `sessionId` e
    // `resume`; `Option<bool>` em vez de `bool` para que uma chamada antiga
    // (sem o campo) continue significando "sessão nova".
    session_id: Option<String>,
    resume: Option<bool>,
    // SPEC: agent-permission-mode (PERM-01) — `None` numa chamada antiga
    // significa "sem flag", que é o comportamento de antes desta feature.
    permission_mode: Option<String>,
    channel: Channel<Vec<u8>>,
) -> Result<String, String> {
    let manager = app.state::<TerminalManager>();
    let cwd: PathBuf = cwd.into();
    let profile = resolve_profile(&cwd);
    let cfg = SessionConfig {
        cwd,
        profile,
        agent,
        session_id,
        resume: resume.unwrap_or(false),
        permission_mode,
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

/// SPEC: projects (PROJ-14) — núcleo testável de `pty_kill`: recebe
/// `&TerminalManager` e `&Mutex<Db>` diretos em vez de `State<...>`, que
/// exige um app Tauri montado (mesmo motivo de `workspace_get` acima).
///
/// Todo fechamento de terminal converge para cá (`TerminalPane` chama
/// `pty_kill` na limpeza do efeito), então é aqui que o `cwd` da sessão
/// encerrada vira `last_used` do projeto correspondente (P1 AC16) — sem
/// repetir a resolução nos três handlers de fechamento do `App.tsx`.
///
/// A gravação é best-effort: o `Result` é descartado porque uma falha de
/// banco não pode impedir o terminal de fechar. O único efeito é a
/// ordenação da lista de recentes ficar desatualizada.
pub fn kill_and_touch(manager: &TerminalManager, db: &Mutex<Db>, id: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let cwd = manager.kill(id).map_err(|e| e.to_string())?;

    let db = db.lock().expect("db mutex poisoned");
    let _ = service::touch_from_cwds(db.conn(), &[cwd]);

    Ok(())
}

#[tauri::command]
pub fn pty_kill(
    manager: State<'_, TerminalManager>,
    db: State<'_, Mutex<Db>>,
    id: String,
) -> Result<(), String> {
    kill_and_touch(manager.inner(), db.inner(), &id)
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
                agent_session_id: Some("0195d0f0-0000-7000-8000-000000000001".to_string()),
                permission_mode: None,
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

    // WSLP-07: um `cwd` que nomeia uma distro resolve para ela, nos dois
    // prefixos — `\\wsl.localhost\` e o sinônimo legado `\\wsl$\`.
    #[test]
    fn resolve_profile_cwd_naming_distro_resolves_to_that_distro() {
        for cwd in [
            r"\\wsl.localhost\Ubuntu-24.04\home\x",
            r"\\wsl$\Ubuntu-24.04\home\x",
        ] {
            assert_eq!(
                resolve_profile(Path::new(cwd)),
                shells::TerminalProfile::Wsl {
                    distro: "Ubuntu-24.04".to_string()
                },
                "{cwd} deveria resolver para a distro que ele nomeia"
            );
        }
    }

    // WSLP-24 (AD-039): o defeito relatado. Uma preferência WSL gravada
    // antes da AD-035 sobrevive no banco; se `pty_spawn` a consultasse, um
    // projeto em `C:\` abriria o terminal dentro da distro.
    //
    // O teste ataca o mutante pelo derivador, não pelo banco: prova que
    // `profile_for_path` **honra** um default WSL quando recebe um, e que
    // `resolve_profile` deliberadamente não lhe entrega nenhum. Gravar a
    // preferência e conferir o resultado não provaria nada fora do Windows
    // — `list_profiles` devolve só o host em `cfg(not(windows))`
    // (`shells/list.rs`), então `resolve_default` já cairia para `Host`
    // sozinho e o teste passaria com o defeito reintroduzido.
    #[test]
    fn resolve_profile_ignores_stored_wsl_preference_for_windows_path() {
        let cwd = Path::new(r"C:\repos\x");
        let wsl = shells::TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };

        assert_eq!(
            shells::profile_for_path(cwd, &wsl),
            wsl,
            "o derivador honra o default que recebe — é por isso que passar \
             um perfil WSL aqui reabriria o defeito"
        );
        assert_eq!(
            resolve_profile(cwd),
            shells::TerminalProfile::Host,
            "`resolve_profile` não pode ter default nenhum além de Host"
        );
    }
}
