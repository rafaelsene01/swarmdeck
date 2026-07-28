//! Uma sessão de PTY: processo filho, I/O e ciclo de vida.
//!
//! A API do `portable-pty` é síncrona e bloqueante, então cada sessão tem
//! uma thread dedicada de leitura. Com no máximo 4 terminais isso é mais
//! simples e mais previsível do que fazer ponte para async.
//!
//! Nota sobre Windows: `portable-pty` já cria o ConPTY com `RESIZE_QUIRK`
//! e `WIN32_INPUT_MODE`. Não há flag a configurar aqui — ver
//! `.specs/features/multi-terminal/design.md`.

use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};

use super::throttle::{Chunk, OutputThrottle};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionState {
    Running,
    Exited(u32),
    Failed(String),
}

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("falha ao abrir o PTY: {0}")]
    OpenPty(String),
    // O campo não pode se chamar `source`: thiserror o interpretaria como a
    // causa encadeada e exigiria que implementasse `Error`.
    #[error("falha ao iniciar `{cmd}`: {reason}")]
    Spawn { cmd: String, reason: String },
    #[error("falha de E/S no PTY: {0}")]
    Io(#[from] std::io::Error),
}

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
    state: Arc<Mutex<SessionState>>,
    throttle: Arc<Mutex<OutputThrottle>>,
}

impl PtySession {
    /// Abre um PTY e inicia `cmd` dentro dele.
    ///
    /// Um comando inexistente falha **aqui**, com o nome do comando no erro —
    /// e não silenciosamente numa sessão que parece viva mas não é.
    pub fn spawn(size: PtySize, cmd: CommandBuilder) -> Result<Self, SessionError> {
        let label = format!("{cmd:?}");

        let pair = native_pty_system()
            .openpty(size)
            .map_err(|e| SessionError::OpenPty(e.to_string()))?;

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| SessionError::Spawn {
                cmd: label,
                reason: e.to_string(),
            })?;

        // O slave precisa ser descartado depois do spawn: enquanto ele viver
        // neste processo, o master nunca vê EOF e a thread leitora ficaria
        // pendurada para sempre após o filho morrer.
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| SessionError::OpenPty(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| SessionError::OpenPty(e.to_string()))?;

        let state = Arc::new(Mutex::new(SessionState::Running));
        let throttle = Arc::new(Mutex::new(OutputThrottle::new()));

        spawn_reader_thread(reader, Arc::clone(&throttle), Arc::clone(&state));

        Ok(Self {
            master: pair.master,
            child,
            writer,
            state,
            throttle,
        })
    }

    /// Encaminha teclas ao processo filho.
    pub fn write(&mut self, data: &[u8]) -> Result<(), SessionError> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    /// Informa ao kernel o novo tamanho da janela (dispara SIGWINCH no unix).
    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), SessionError> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| SessionError::OpenPty(e.to_string()))
    }

    /// Estado atual, consultando o filho antes de responder.
    pub fn state(&mut self) -> SessionState {
        if let Ok(Some(status)) = self.child.try_wait() {
            let mut guard = self.state.lock().expect("state mutex envenenado");
            if matches!(*guard, SessionState::Running) {
                *guard = SessionState::Exited(status.exit_code());
            }
        }
        self.state.lock().expect("state mutex envenenado").clone()
    }

    /// Bloqueia até o filho terminar. Usado em teste e no shutdown.
    pub fn wait(&mut self) -> Result<u32, SessionError> {
        let status = self
            .child
            .wait()
            .map_err(|e| SessionError::OpenPty(e.to_string()))?;
        let code = status.exit_code();
        *self.state.lock().expect("state mutex envenenado") = SessionState::Exited(code);
        Ok(code)
    }

    /// Encerra o processo filho.
    pub fn kill(&mut self) -> Result<(), SessionError> {
        self.child
            .kill()
            .map_err(|e| SessionError::OpenPty(e.to_string()))?;
        Ok(())
    }

    /// Drena a saída acumulada desde o último tick.
    pub fn take_output(&self) -> Option<Chunk> {
        self.throttle
            .lock()
            .expect("throttle mutex envenenado")
            .flush_tick()
    }
}

fn spawn_reader_thread(
    mut reader: Box<dyn Read + Send>,
    throttle: Arc<Mutex<OutputThrottle>>,
    state: Arc<Mutex<SessionState>>,
) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                // EOF: o filho fechou o PTY.
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut t) = throttle.lock() {
                        t.push(&buf[..n]);
                    }
                }
                Err(e) => {
                    // Erro de leitura não derruba o app: marca a sessão e sai.
                    if let Ok(mut s) = state.lock() {
                        if matches!(*s, SessionState::Running) {
                            *s = SessionState::Failed(e.to_string());
                        }
                    }
                    break;
                }
            }
        }
    });
}
