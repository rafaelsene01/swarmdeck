//! Testes de integração do PtySession (T4).
//!
//! Spawnam processos reais — mockar PTY não provaria nada, o valor está em
//! confirmar que ConPTY/openpty se comportam. Não paralelizáveis.

use std::time::{Duration, Instant};

use portable_pty::{CommandBuilder, PtySize};
use swarmdeck_lib::terminal::{PtySession, SessionState};

fn size() -> PtySize {
    PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// Shell do SO com um comando único.
fn shell_cmd(script: &str) -> CommandBuilder {
    let mut cmd = if cfg!(windows) {
        let mut c = CommandBuilder::new("cmd.exe");
        c.arg("/C");
        c
    } else {
        let mut c = CommandBuilder::new("sh");
        c.arg("-c");
        c
    };
    cmd.arg(script);
    cmd
}

/// Acumula a saída até `pred` ser satisfeito ou estourar o prazo.
fn read_until(session: &PtySession, timeout: Duration, pred: impl Fn(&str) -> bool) -> String {
    let deadline = Instant::now() + timeout;
    let mut acc = String::new();

    while Instant::now() < deadline {
        if let Some(chunk) = session.take_output() {
            acc.push_str(&String::from_utf8_lossy(&chunk.bytes));
            if pred(&acc) {
                return acc;
            }
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    acc
}

#[test]
fn spawn_inicia_em_estado_running() {
    let cmd = shell_cmd(if cfg!(windows) { "timeout /T 5" } else { "sleep 5" });
    let mut session = PtySession::spawn(size(), cmd).expect("spawn deve funcionar");

    assert_eq!(
        session.state(),
        SessionState::Running,
        "processo recém-iniciado está rodando"
    );

    session.kill().expect("kill");
}

#[test]
fn saida_do_processo_chega_ao_buffer() {
    let cmd = shell_cmd("echo swarmdeck-ok");
    let session = PtySession::spawn(size(), cmd).expect("spawn");

    let saida = read_until(&session, Duration::from_secs(10), |s| {
        s.contains("swarmdeck-ok")
    });

    assert!(
        saida.contains("swarmdeck-ok"),
        "a saída do processo deve chegar pela thread leitora; recebido: {saida:?}"
    );
}

#[test]
fn resize_e_aceito_pelo_kernel() {
    let cmd = shell_cmd(if cfg!(windows) { "timeout /T 5" } else { "sleep 5" });
    let mut session = PtySession::spawn(size(), cmd).expect("spawn");

    session.resize(40, 120).expect("resize deve ser aceito");
    session.resize(24, 80).expect("resize de volta");

    session.kill().expect("kill");
}

#[test]
fn processo_encerrado_reporta_exit_code() {
    let cmd = shell_cmd("exit 3");
    let mut session = PtySession::spawn(size(), cmd).expect("spawn");

    let code = session.wait().expect("aguardar o filho");
    assert_eq!(code, 3, "o código de saída do processo deve ser propagado");

    assert_eq!(
        session.state(),
        SessionState::Exited(3),
        "o estado da sessão deve refletir a saída"
    );
}

#[test]
fn comando_inexistente_falha_no_spawn() {
    let cmd = CommandBuilder::new("swarmdeck-binario-que-nao-existe-xyz");
    let resultado = PtySession::spawn(size(), cmd);

    let erro = resultado.err().expect("spawn de binário inexistente deve falhar");
    let msg = erro.to_string();

    assert!(
        msg.contains("swarmdeck-binario-que-nao-existe-xyz"),
        "o erro precisa nomear o comando tentado, senão o usuário não sabe o que faltou; \
         recebido: {msg:?}"
    );
}
