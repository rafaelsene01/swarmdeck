// SPEC: multi-terminal (TERM-01, TERM-03)

//! `TerminalManager`: registro das sessões PTY vivas.
//!
//! Única porta de entrada para criar, escrever, redimensionar e matar
//! terminais. Injeta `SWARMDECK_TERMINAL_ID` no ambiente do processo filho —
//! é assim que o agente sabe em qual terminal está rodando (ver design.md →
//! Pontos de integração).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use portable_pty::{CommandBuilder, PtySize};
use uuid::Uuid;

use crate::agents::resolve_launch_command;

use super::session::{PtySession, SessionError, SessionState};
use super::throttle::Chunk;

pub type TerminalId = Uuid;

/// Variável de ambiente injetada no processo filho.
const TERMINAL_ID_ENV: &str = "SWARMDECK_TERMINAL_ID";

/// Prazo dado ao processo para encerrar sozinho antes do shutdown seguir em
/// frente. `PtySession::kill` já força o encerramento; isto só evita que o
/// shutdown do app fique bloqueado esperando um filho que ignora o sinal.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

fn default_size() -> PtySize {
    PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// Configuração de uma nova sessão. Ver `design.md` → Modelos de dados.
#[derive(Debug, Clone, Default)]
pub struct SessionConfig {
    pub cwd: PathBuf,
    /// `None` = resolve o shell padrão do SO (via `portable-pty`).
    pub shell: Option<String>,
    pub agent: Option<String>,
    pub env: HashMap<String, String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ManagerError {
    #[error("terminal `{0}` não existe")]
    UnknownId(TerminalId),
    #[error(transparent)]
    Session(#[from] SessionError),
}

/// Retrato de uma sessão para listagem.
///
/// Escopo desta tarefa: só os campos que `TerminalManager` já possui
/// (identidade, diretório, agente, estado do processo). O restante do
/// `TerminalSnapshot` do design.md — título, git, atividade — vem das fontes
/// que as tarefas de header/persistência (T9–T11) introduzem.
#[derive(Debug, Clone)]
pub struct TerminalSnapshot {
    pub id: TerminalId,
    pub cwd: PathBuf,
    pub agent: Option<String>,
    pub state: SessionState,
    /// `Some` quando `agent` foi pedido mas o `spawn` caiu para shell puro
    /// (agente desconhecido ou CLI ausente do PATH) — ver
    /// `agents::launch::resolve_launch_command`. `None` no caso comum: sem
    /// agente pedido, ou agente pedido e lançado com sucesso.
    pub launch_warning: Option<String>,
}

struct Entry {
    session: PtySession,
    cwd: PathBuf,
    agent: Option<String>,
    /// Espelha `TerminalSnapshot.launch_warning` — ver ali.
    launch_warning: Option<String>,
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<TerminalId, Entry>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Abre um PTY com um shell interativo e registra a sessão.
    pub fn spawn(&self, cfg: SessionConfig) -> Result<TerminalId, ManagerError> {
        let id = Uuid::now_v7();

        // SPEC: agent-selection (AGT-03, AGT-04)
        // Sobrescrita por sessão (AGT-03): o agente lançado é o que esta
        // sessão pediu, resolvido agora — nada aqui lê um "agente padrão"
        // global depois do spawn, então trocar o padrão nunca afeta uma
        // sessão já aberta. `launch_warning` fica na `Entry` para a UI
        // identificar visualmente quando caiu para shell puro (AGT-04).
        let resolution = resolve_launch_command(cfg.agent.as_deref());
        let mut cmd = match &resolution.command {
            Some(agent_command) => CommandBuilder::new(agent_command),
            None => match &cfg.shell {
                Some(shell) => CommandBuilder::new(shell),
                None => CommandBuilder::new_default_prog(),
            },
        };
        cmd.cwd(&cfg.cwd);
        for (key, value) in &cfg.env {
            cmd.env(key, value);
        }
        cmd.env(TERMINAL_ID_ENV, id.to_string());

        let session = PtySession::spawn(default_size(), cmd)?;

        self.lock().insert(
            id,
            Entry {
                session,
                cwd: cfg.cwd,
                agent: cfg.agent,
                launch_warning: resolution.warning,
            },
        );

        Ok(id)
    }

    /// Encaminha teclas ao processo filho.
    pub fn write(&self, id: TerminalId, data: &[u8]) -> Result<(), ManagerError> {
        let mut sessions = self.lock();
        let entry = sessions.get_mut(&id).ok_or(ManagerError::UnknownId(id))?;
        entry.session.write(data)?;
        Ok(())
    }

    /// Propaga um novo tamanho ao PTY.
    pub fn resize(&self, id: TerminalId, rows: u16, cols: u16) -> Result<(), ManagerError> {
        let sessions = self.lock();
        let entry = sessions.get(&id).ok_or(ManagerError::UnknownId(id))?;
        entry.session.resize(rows, cols)?;
        Ok(())
    }

    /// Encerra o processo e remove a sessão do registro.
    pub fn kill(&self, id: TerminalId) -> Result<(), ManagerError> {
        let mut entry = self.lock().remove(&id).ok_or(ManagerError::UnknownId(id))?;
        entry.session.kill()?;
        Ok(())
    }

    /// Drena a saída acumulada de uma sessão desde o último tick. Ponte que
    /// `T6` usa para alimentar o `Channel` do Tauri.
    pub fn take_output(&self, id: TerminalId) -> Option<Chunk> {
        self.lock().get(&id)?.session.take_output()
    }

    /// Retrato de todas as sessões vivas.
    pub fn list(&self) -> Vec<TerminalSnapshot> {
        self.lock()
            .iter_mut()
            .map(|(id, entry)| TerminalSnapshot {
                id: *id,
                cwd: entry.cwd.clone(),
                agent: entry.agent.clone(),
                state: entry.session.state(),
                launch_warning: entry.launch_warning.clone(),
            })
            .collect()
    }

    /// Encerra todas as sessões vivas, sem deixar processo órfão.
    pub fn shutdown(&self) {
        let mut sessions = self.lock();
        for (_, mut entry) in sessions.drain() {
            let _ = entry.session.kill();
            entry.session.wait_timeout(SHUTDOWN_TIMEOUT);
        }
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<TerminalId, Entry>> {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
