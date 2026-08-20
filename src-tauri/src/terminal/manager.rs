// SPEC: multi-terminal (TERM-01, TERM-03), session-restore (SESS-12, SESS-13, SESS-14), projects (PROJ-14)

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

use crate::agents::{resolve_launch_command, LaunchResolution, SessionLaunch};

use super::session::{PtySession, SessionError, SessionState};
use super::throttle::Chunk;

pub type TerminalId = Uuid;

/// Variável de ambiente injetada no processo filho.
const TERMINAL_ID_ENV: &str = "SWARMDECK_TERMINAL_ID";

/// Prazo dado ao processo para encerrar sozinho antes do shutdown seguir em
/// frente. `PtySession::kill` já força o encerramento; isto só evita que o
/// shutdown do app fique bloqueado esperando um filho que ignora o sinal.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

/// Monta o `CommandBuilder` a partir de uma resolução de lançamento.
///
/// Separado de `spawn` para ser testável sem abrir um PTY de verdade: é a
/// única parte da criação de sessão que tem regra (programa + argumentos), e
/// o resto de `spawn` é efeito colateral.
fn build_command(resolution: &LaunchResolution, shell: Option<&str>) -> CommandBuilder {
    match &resolution.command {
        Some(agent_command) => {
            let mut cmd = CommandBuilder::new(agent_command);
            for arg in &resolution.args {
                cmd.arg(arg);
            }
            cmd
        }
        // Fallback para shell puro: `resolution.args` é sempre vazio aqui
        // (ver `agents::launch`), mas o shell nunca receberia argumento de
        // agente de qualquer forma.
        None => match shell {
            Some(shell) => CommandBuilder::new(shell),
            None => CommandBuilder::new_default_prog(),
        },
    }
}

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
    /// SPEC: session-restore (SESS-12, SESS-13) — id de sessão que o app fixou
    /// para este painel. `None` só para terminal salvo antes da feature.
    pub session_id: Option<String>,
    /// `true` reabre a conversa do agente (`--resume`); `false` fixa uma nova.
    pub resume: bool,
    /// SPEC: agent-permission-mode (PERM-01) — modo de permissão escolhido no
    /// passo AGENT do wizard (`claude --permission-mode <modo>`). `None` deixa
    /// o CLI aplicar o padrão dele; valor desconhecido é descartado por
    /// `agents::launch`, nunca repassado à linha de comando.
    pub permission_mode: Option<String>,
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
        // SPEC: session-restore (SESS-12, SESS-13) — a decisão de QUAIS
        // argumentos de sessão entram mora em `agents::launch`, junto da
        // decisão de qual programa lançar; aqui só se aplica o resultado.
        let session = cfg.session_id.as_deref().map(|id| SessionLaunch {
            id,
            resume: cfg.resume,
        });
        let resolution = resolve_launch_command(
            cfg.agent.as_deref(),
            session,
            cfg.permission_mode.as_deref(),
        );
        let mut cmd = build_command(&resolution, cfg.shell.as_deref());
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

    /// Encerra o processo, remove a sessão do registro e devolve o `cwd` que
    /// ela usava. O `cwd` sai daqui porque a `Entry` removida já o carrega:
    /// é o que permite gravar `last_used` do projeto correspondente sem
    /// perguntar nada ao frontend (PROJ-14).
    pub fn kill(&self, id: TerminalId) -> Result<PathBuf, ManagerError> {
        let mut entry = self.lock().remove(&id).ok_or(ManagerError::UnknownId(id))?;
        entry.session.kill()?;
        Ok(entry.cwd)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(cmd: &CommandBuilder) -> Vec<String> {
        cmd.get_argv()
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    // SPEC: session-restore (SESS-12, SESS-13) — os argumentos resolvidos
    // chegam ao comando na ordem, logo depois do programa.
    #[test]
    fn build_command_aplica_os_argumentos_da_resolucao_na_ordem() {
        let resolution = LaunchResolution {
            command: Some("claude".to_string()),
            args: vec!["--resume".to_string(), "abc-123".to_string()],
            warning: None,
        };

        let cmd = build_command(&resolution, None);

        assert_eq!(argv(&cmd), vec!["claude", "--resume", "abc-123"]);
    }

    // SPEC: session-restore (SESS-14) — sem argumento resolvido, o comando é
    // exatamente o de antes desta feature.
    #[test]
    fn build_command_sem_argumentos_lanca_so_o_programa() {
        let resolution = LaunchResolution {
            command: Some("codex".to_string()),
            args: Vec::new(),
            warning: None,
        };

        let cmd = build_command(&resolution, None);

        assert_eq!(argv(&cmd), vec!["codex"]);
    }

    // Fallback para shell puro: o shell nunca recebe argumento de agente.
    #[test]
    fn build_command_cai_para_o_shell_pedido_sem_argumentos() {
        let resolution = LaunchResolution {
            command: None,
            args: Vec::new(),
            warning: Some("CLI ausente".to_string()),
        };

        let cmd = build_command(&resolution, Some("bash"));

        assert_eq!(argv(&cmd), vec!["bash"]);
    }
}
