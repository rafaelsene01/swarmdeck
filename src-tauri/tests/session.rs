//! Testes de integração do PtySession (T4).
//!
//! Spawnam processos reais — mockar PTY não provaria nada, o valor está em
//! confirmar que ConPTY/openpty se comportam. Não paralelizáveis.

use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

use portable_pty::{CommandBuilder, PtySize};
use swarmdeck_lib::terminal::{PtySession, SessionState};

/// Serializa os testes de PTY.
///
/// `TESTING.md` classifica testes de PTY como não paralelizáveis, mas o
/// harness do Rust roda em paralelo por padrão. Depender de lembrar de passar
/// `--test-threads=1` na invocação não funciona — vários ConPTY concorrentes
/// travaram a suíte por 20 minutos antes disto existir. O guard torna a regra
/// auto-aplicável.
fn serial() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner()) // um teste que falhou não envenena os seguintes
}

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

/// Acumula a saída até `pred` ser satisfeito ou estourar o prazo, **agindo
/// como um terminal de verdade** enquanto isso.
///
/// O ConPTY é criado com `PSUEDOCONSOLE_INHERIT_CURSOR` (o `portable-pty`
/// fixa esse flag), então logo no início ele emite `ESC[6n` — a consulta DSR
/// de posição de cursor — e **fica esperando a resposta antes de liberar o
/// processo filho**. Em produção quem responde é o xterm.js; aqui não existe
/// terminal nenhum, então o teste precisa responder. Sem isso o filho nunca
/// emite nada e nunca encerra.
fn pump_until(session: &mut PtySession, timeout: Duration, pred: impl Fn(&str) -> bool) -> String {
    let deadline = Instant::now() + timeout;
    let mut acc = String::new();

    while Instant::now() < deadline {
        if let Some(chunk) = session.take_output() {
            let texto = String::from_utf8_lossy(&chunk.bytes).into_owned();

            if texto.contains("\x1b[6n") {
                // Responde "cursor em linha 1, coluna 1".
                let _ = session.write(b"\x1b[1;1R");
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

/// Espera o filho encerrar mantendo a bomba de I/O rodando.
///
/// Um `wait` puro não serve no Windows: o filho pode estar bloqueado
/// esperando a resposta do DSR, e ninguém a envia se nada estiver lendo.
fn pump_until_exit(session: &mut PtySession, timeout: Duration) -> Option<u32> {
    let deadline = Instant::now() + timeout;

    while Instant::now() < deadline {
        if let Some(chunk) = session.take_output() {
            if String::from_utf8_lossy(&chunk.bytes).contains("\x1b[6n") {
                let _ = session.write(b"\x1b[1;1R");
            }
        }
        if let Some(code) = session.wait_timeout(Duration::from_millis(50)) {
            return Some(code);
        }
    }
    None
}

#[test]
fn spawn_inicia_em_estado_running() {
    let _g = serial();
    let cmd = shell_cmd(if cfg!(windows) {
        "ping -n 6 127.0.0.1"
    } else {
        "sleep 5"
    });
    let mut session = PtySession::spawn(size(), cmd).expect("spawn deve funcionar");

    assert_eq!(
        session.state(),
        SessionState::Running,
        "processo recém-iniciado está rodando"
    );

    session.kill().expect("kill");
    // Confirma que o filho realmente morreu — senão ele sobrevive ao teste e
    // atrapalha o próximo, que agora roda logo em seguida por causa do guard.
    session.wait_timeout(Duration::from_secs(10));
}

#[test]
fn saida_do_processo_chega_ao_buffer() {
    let _g = serial();
    let cmd = shell_cmd("echo swarmdeck-ok");
    let mut session = PtySession::spawn(size(), cmd).expect("spawn");

    let saida = pump_until(&mut session, Duration::from_secs(20), |s| {
        s.contains("swarmdeck-ok")
    });

    assert!(
        saida.contains("swarmdeck-ok"),
        "a saída do processo deve chegar pela thread leitora; recebido: {saida:?}"
    );
}

#[test]
fn resize_e_aceito_pelo_kernel() {
    let _g = serial();
    let cmd = shell_cmd(if cfg!(windows) {
        "ping -n 6 127.0.0.1"
    } else {
        "sleep 5"
    });
    let mut session = PtySession::spawn(size(), cmd).expect("spawn");

    session.resize(40, 120).expect("resize deve ser aceito");
    session.resize(24, 80).expect("resize de volta");

    session.kill().expect("kill");
    // Confirma que o filho realmente morreu — senão ele sobrevive ao teste e
    // atrapalha o próximo, que agora roda logo em seguida por causa do guard.
    session.wait_timeout(Duration::from_secs(10));
}

#[test]
fn processo_encerrado_reporta_exit_code() {
    let _g = serial();
    let cmd = shell_cmd("exit 3");
    let mut session = PtySession::spawn(size(), cmd).expect("spawn");

    // Prazo em vez de wait() sem limite: se o filho não encerrar, isto vira
    // uma falha em 20s em vez de pendurar a suíte inteira. A bomba de I/O
    // precisa rodar junto para responder ao DSR do ConPTY.
    let code = pump_until_exit(&mut session, Duration::from_secs(20))
        .expect("o filho deve encerrar dentro do prazo");

    assert_eq!(code, 3, "o código de saída do processo deve ser propagado");
    assert_eq!(
        session.state(),
        SessionState::Exited(3),
        "o estado da sessão deve refletir a saída"
    );
}

#[test]
fn comando_inexistente_falha_no_spawn() {
    let _g = serial();
    let cmd = CommandBuilder::new("swarmdeck-binario-que-nao-existe-xyz");
    let resultado = PtySession::spawn(size(), cmd);

    let erro = resultado
        .err()
        .expect("spawn de binário inexistente deve falhar");
    let msg = erro.to_string();

    assert!(
        msg.contains("swarmdeck-binario-que-nao-existe-xyz"),
        "o erro precisa nomear o comando tentado, senão o usuário não sabe o que faltou; \
         recebido: {msg:?}"
    );
}
