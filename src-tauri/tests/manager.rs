// SPEC: projects (PROJ-14)

//! Testes de integração do TerminalManager (T5).
//!
//! Spawnam shells reais via PtySession — mesmo motivo de `session.rs`: mock
//! de PTY não provaria nada. Não paralelizáveis (mesmo guard serial).

use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

use swarmdeck_lib::commands::terminal::kill_and_touch;
use swarmdeck_lib::db::Db;
use swarmdeck_lib::projects::service;
use swarmdeck_lib::shells::TerminalProfile;
use swarmdeck_lib::terminal::{ManagerError, SessionConfig, TerminalManager};

/// Serializa os testes de PTY — ver `session.rs` para a explicação completa
/// (concorrência de ConPTY reais travou a suíte por 20 minutos sem isto).
fn serial() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Responde ao DSR do ConPTY (`ESC[6n`) enquanto acumula a saída, até `pred`
/// bater ou o prazo estourar. Ver `session.rs` → nota sobre o handshake.
fn pump_until(
    manager: &TerminalManager,
    id: uuid::Uuid,
    timeout: Duration,
    pred: impl Fn(&str) -> bool,
) -> String {
    let deadline = Instant::now() + timeout;
    let mut acc = String::new();

    while Instant::now() < deadline {
        if let Some(chunk) = manager.take_output(id) {
            let texto = String::from_utf8_lossy(&chunk.bytes).into_owned();

            if texto.contains("\x1b[6n") {
                let _ = manager.write(id, b"\x1b[1;1R");
            }

            acc.push_str(&texto);
            if pred(&acc) {
                return acc;
            }
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    acc
}

fn default_config() -> SessionConfig {
    SessionConfig {
        cwd: std::env::temp_dir(),
        profile: TerminalProfile::Host,
        agent: None,
        session_id: None,
        resume: false,
        permission_mode: None,
        env: Default::default(),
    }
}

#[test]
fn spawn_registra_sessao_e_aparece_na_lista() {
    let _g = serial();
    let manager = TerminalManager::new();

    let id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let lista = manager.list();
    let entrada = lista
        .iter()
        .find(|s| s.id == id)
        .expect("a sessão recém-criada deve aparecer em list()");
    assert_eq!(entrada.cwd, std::env::temp_dir());

    manager.kill(id).expect("kill");
}

#[test]
fn env_var_injetada_no_processo_filho() {
    let _g = serial();
    let manager = TerminalManager::new();
    let id = manager.spawn(default_config()).expect("spawn");

    let comando = if cfg!(windows) {
        "echo %SWARMDECK_TERMINAL_ID%\r\n"
    } else {
        "echo $SWARMDECK_TERMINAL_ID\n"
    };
    manager.write(id, comando.as_bytes()).expect("write");

    let esperado = id.to_string();
    let saida = pump_until(&manager, id, Duration::from_secs(20), |s| {
        s.contains(&esperado)
    });

    assert!(
        saida.contains(&esperado),
        "o valor de SWARMDECK_TERMINAL_ID no ambiente do filho deve bater com o id retornado \
         por spawn(); recebido: {saida:?}"
    );

    manager.kill(id).expect("kill");
}

#[test]
fn write_encaminha_bytes_ao_pty() {
    let _g = serial();
    let manager = TerminalManager::new();
    let id = manager.spawn(default_config()).expect("spawn");

    let comando = if cfg!(windows) {
        "echo swarmdeck-manager-ok\r\n"
    } else {
        "echo swarmdeck-manager-ok\n"
    };
    manager.write(id, comando.as_bytes()).expect("write");

    let saida = pump_until(&manager, id, Duration::from_secs(20), |s| {
        s.contains("swarmdeck-manager-ok")
    });

    assert!(
        saida.contains("swarmdeck-manager-ok"),
        "bytes escritos via write() devem ecoar de volta pelo PTY; recebido: {saida:?}"
    );

    manager.kill(id).expect("kill");
}

#[test]
fn operacao_em_id_invalido_retorna_erro_descritivo() {
    let _g = serial();
    let manager = TerminalManager::new();
    let id_inexistente = uuid::Uuid::now_v7();

    let erro_write = manager
        .write(id_inexistente, b"x")
        .expect_err("write em id inexistente deve falhar");
    let erro_resize = manager
        .resize(id_inexistente, 24, 80)
        .expect_err("resize em id inexistente deve falhar");
    let erro_kill = manager
        .kill(id_inexistente)
        .expect_err("kill em id inexistente deve falhar");

    for erro in [&erro_write, &erro_resize, &erro_kill] {
        assert!(
            matches!(erro, ManagerError::UnknownId(id) if *id == id_inexistente),
            "o erro precisa nomear o id que não foi encontrado, para ser descritivo; \
             recebido: {erro}"
        );
    }
}

#[test]
fn kill_remove_da_lista_e_encerra_processo() {
    let _g = serial();
    let manager = TerminalManager::new();
    let id = manager.spawn(default_config()).expect("spawn");

    assert!(
        manager.list().iter().any(|s| s.id == id),
        "a sessão deve estar listada antes do kill"
    );

    manager.kill(id).expect("kill");

    assert!(
        !manager.list().iter().any(|s| s.id == id),
        "kill deve remover a sessão do registro"
    );
    assert!(
        matches!(manager.write(id, b"x"), Err(ManagerError::UnknownId(_))),
        "operar sobre um id morto deve falhar como id desconhecido, não silenciosamente"
    );
}

// SPEC: projects (PROJ-14) — o `cwd` da sessão encerrada é o que alimenta a
// gravação de `last_used` do projeto correspondente.
#[test]
fn kill_devolve_o_cwd_da_sessao_e_falha_na_segunda_vez() {
    let _g = serial();
    let manager = TerminalManager::new();
    let cwd = std::env::temp_dir().join("swarmdeck-kill-cwd");
    std::fs::create_dir_all(&cwd).expect("criar cwd da sessão");

    let config = SessionConfig {
        cwd: cwd.clone(),
        ..default_config()
    };
    let id = manager.spawn(config).expect("spawn");

    let devolvido = manager.kill(id).expect("kill deve funcionar");

    assert_eq!(
        devolvido, cwd,
        "kill deve devolver o diretório que a sessão usava"
    );
    assert!(
        matches!(manager.kill(id), Err(ManagerError::UnknownId(erro)) if erro == id),
        "matar o mesmo id duas vezes deve falhar na segunda como id desconhecido"
    );
}

#[test]
fn shutdown_encerra_tudo_sem_orfao() {
    let _g = serial();
    let manager = TerminalManager::new();

    let id1 = manager.spawn(default_config()).expect("spawn 1");
    let id2 = manager.spawn(default_config()).expect("spawn 2");
    assert_eq!(manager.list().len(), 2, "as duas sessões devem estar vivas");

    manager.shutdown();

    assert!(
        manager.list().is_empty(),
        "shutdown deve encerrar e remover todas as sessões, sem deixar órfão"
    );
    assert!(matches!(
        manager.write(id1, b"x"),
        Err(ManagerError::UnknownId(_))
    ));
    assert!(matches!(
        manager.write(id2, b"x"),
        Err(ManagerError::UnknownId(_))
    ));
}

// --- projects/T8: fechar terminal escreve `last_used` ---------------------
//
// Os testes chamam `kill_and_touch`, o núcleo de `pty_kill`:
// `State<TerminalManager>`/`State<Mutex<Db>>` exigem um app Tauri montado.
// O corpo do comando é exatamente esta chamada.

fn temp_db() -> (tempfile::TempDir, Mutex<Db>) {
    let dir = tempfile::tempdir().expect("criar diretório temporário do banco");
    let db = Db::open(dir.path().join("swarmdeck.db")).expect("abrir banco novo");
    (dir, Mutex::new(db))
}

fn last_used_de(db: &Mutex<Db>, id: &str) -> Option<i64> {
    let guard = db.lock().expect("db mutex");
    service::get(guard.conn(), id)
        .expect("reler o projeto")
        .last_used
}

// P1 AC16: encerrar um terminal grava `last_used` do projeto cujo `path` é
// o `cwd` da sessão.
#[test]
fn pty_kill_grava_last_used_do_projeto_do_cwd() {
    let _g = serial();
    let manager = TerminalManager::new();
    let (_db_dir, db) = temp_db();
    let projeto_dir = tempfile::tempdir().expect("diretório do projeto");

    let projeto = {
        let guard = db.lock().expect("db mutex");
        service::create(guard.conn(), "Projeto", projeto_dir.path()).expect("create")
    };
    assert_eq!(projeto.last_used, None, "precondição: nunca usado");

    let id = manager
        .spawn(SessionConfig {
            cwd: projeto_dir.path().to_path_buf(),
            ..default_config()
        })
        .expect("spawn");

    kill_and_touch(&manager, &db, &id.to_string()).expect("pty_kill deve devolver Ok");

    assert!(
        last_used_de(&db, &projeto.id).is_some(),
        "fechar o terminal deve gravar last_used do projeto"
    );
}

// PROJ-14 via `resolve`: o `cwd` numa subpasta do projeto conta como uso do
// projeto que a contém.
#[test]
fn pty_kill_com_cwd_em_subpasta_grava_last_used_do_projeto() {
    let _g = serial();
    let manager = TerminalManager::new();
    let (_db_dir, db) = temp_db();
    let projeto_dir = tempfile::tempdir().expect("diretório do projeto");
    let subpasta = projeto_dir.path().join("src");
    std::fs::create_dir_all(&subpasta).expect("criar subpasta");

    let projeto = {
        let guard = db.lock().expect("db mutex");
        service::create(guard.conn(), "Projeto", projeto_dir.path()).expect("create")
    };

    let id = manager
        .spawn(SessionConfig {
            cwd: subpasta,
            ..default_config()
        })
        .expect("spawn");

    kill_and_touch(&manager, &db, &id.to_string()).expect("pty_kill deve devolver Ok");

    assert!(
        last_used_de(&db, &projeto.id).is_some(),
        "o cwd em subpasta deve resolver para o projeto que a contém"
    );
}

// Edge cases da spec: `cwd` que não casa com projeto nenhum — a pasta-
// sandbox do "No Project" é justamente esse caso, porque nunca vira linha
// em `projects` — fecha normalmente e não grava nada.
#[test]
fn pty_kill_na_pasta_sandbox_devolve_ok_sem_gravar_nada() {
    let _g = serial();
    let manager = TerminalManager::new();
    let (_db_dir, db) = temp_db();
    let data_dir = tempfile::tempdir().expect("diretório de dados");
    let sandbox = data_dir.path().join("sandbox");
    std::fs::create_dir_all(&sandbox).expect("criar a pasta-sandbox");
    let projeto_dir = tempfile::tempdir().expect("diretório do projeto");

    let projeto = {
        let guard = db.lock().expect("db mutex");
        service::create(guard.conn(), "Projeto", projeto_dir.path()).expect("create")
    };

    let id = manager
        .spawn(SessionConfig {
            cwd: sandbox,
            ..default_config()
        })
        .expect("spawn");

    kill_and_touch(&manager, &db, &id.to_string()).expect("pty_kill deve devolver Ok");

    assert_eq!(
        last_used_de(&db, &projeto.id),
        None,
        "nenhum projeto pode ter sido tocado por um terminal fora de projeto"
    );
}

// A gravação é best-effort: banco quebrado não pode impedir o terminal de
// fechar.
#[test]
fn pty_kill_com_falha_de_banco_na_gravacao_ainda_devolve_ok() {
    let _g = serial();
    let manager = TerminalManager::new();
    let (_db_dir, db) = temp_db();
    let projeto_dir = tempfile::tempdir().expect("diretório do projeto");

    {
        let guard = db.lock().expect("db mutex");
        service::create(guard.conn(), "Projeto", projeto_dir.path()).expect("create");
        guard
            .conn()
            .execute("DROP TABLE projects", [])
            .expect("derrubar a tabela para simular banco corrompido");
    }

    let id = manager
        .spawn(SessionConfig {
            cwd: projeto_dir.path().to_path_buf(),
            ..default_config()
        })
        .expect("spawn");

    kill_and_touch(&manager, &db, &id.to_string())
        .expect("falha de gravação não pode impedir o pty_kill de devolver Ok");

    assert!(
        !manager.list().iter().any(|s| s.id == id),
        "a sessão deve ter sido encerrada mesmo com o banco quebrado"
    );
}

// Id desconhecido continua sendo erro, e nada é gravado — não há `cwd`.
#[test]
fn pty_kill_com_id_desconhecido_falha_sem_gravar_nada() {
    let _g = serial();
    let manager = TerminalManager::new();
    let (_db_dir, db) = temp_db();
    let projeto_dir = tempfile::tempdir().expect("diretório do projeto");

    let projeto = {
        let guard = db.lock().expect("db mutex");
        service::create(guard.conn(), "Projeto", projeto_dir.path()).expect("create")
    };

    let desconhecido = uuid::Uuid::now_v7().to_string();
    let erro = kill_and_touch(&manager, &db, &desconhecido)
        .expect_err("id desconhecido deve continuar falhando");

    assert!(
        erro.contains(&desconhecido),
        "o erro precisa nomear o id desconhecido, veio: {erro}"
    );
    assert_eq!(
        last_used_de(&db, &projeto.id),
        None,
        "um kill que falhou não pode gravar last_used"
    );
}
