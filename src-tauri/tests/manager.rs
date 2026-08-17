//! Testes de integração do TerminalManager (T5).
//!
//! Spawnam shells reais via PtySession — mesmo motivo de `session.rs`: mock
//! de PTY não provaria nada. Não paralelizáveis (mesmo guard serial).

use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

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
        shell: None,
        agent: None,
        session_id: None,
        resume: false,
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
