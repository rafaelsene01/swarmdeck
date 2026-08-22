// SPEC: multi-terminal (TERM-01, TERM-03), session-restore (SESS-12, SESS-13, SESS-14), projects (PROJ-14)
// SPEC: wsl-terminal-profile (WSLP-03, WSLP-04, WSLP-09, WSLP-10, WSLP-11)
// SPEC: terminal-boot-loading (BOOT-01)

//! `TerminalManager`: registro das sessões PTY vivas.
//!
//! Única porta de entrada para criar, escrever, redimensionar e matar
//! terminais. Injeta `SWARMDECK_TERMINAL_ID` no ambiente do processo filho —
//! é assim que o agente sabe em qual terminal está rodando (ver design.md →
//! Pontos de integração).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use portable_pty::{CommandBuilder, PtySize};
use uuid::Uuid;

use crate::agents::{resolve_launch_command, LaunchResolution, SessionLaunch};
use crate::shells::{wrap::wrap, TerminalProfile};

use super::session::{PtySession, SessionError, SessionState};
use super::throttle::Chunk;

pub type TerminalId = Uuid;

/// Variável de ambiente injetada no processo filho.
const TERMINAL_ID_ENV: &str = "SWARMDECK_TERMINAL_ID";

/// Prazo dado ao processo para encerrar sozinho antes do shutdown seguir em
/// frente. `PtySession::kill` já força o encerramento; isto só evita que o
/// shutdown do app fique bloqueado esperando um filho que ignora o sinal.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

/// Monta o `CommandBuilder` a partir de uma resolução de lançamento e do
/// perfil de execução ativo.
///
/// Separado de `spawn` para ser testável sem abrir um PTY de verdade: é a
/// única parte da criação de sessão que tem regra (programa + argumentos), e
/// o resto de `spawn` é efeito colateral. Delega a `shells::wrap`, que é
/// quem decide o argv de fato para cada combinação de perfil/programa
/// (`design.md` → `shells::wrap`).
///
/// `SWARMDECK_TERMINAL_ID` só entra como entrada de `env` do argv numa
/// distro WSL — a variável precisa existir *dentro* dela, e `cmd.env()`
/// setaria o ambiente do `wsl.exe` no host, não o do processo lá dentro. No
/// host, continua sendo uma variável de processo de verdade, como sempre.
fn build_command(
    resolution: &LaunchResolution,
    profile: &TerminalProfile,
    cwd: &Path,
    terminal_id: TerminalId,
) -> CommandBuilder {
    let mut extra_env = Vec::new();
    if matches!(profile, TerminalProfile::Wsl { .. }) {
        extra_env.push((TERMINAL_ID_ENV.to_string(), terminal_id.to_string()));
    }
    let mut cmd = wrap(
        profile,
        resolution.command.as_deref(),
        &resolution.args,
        &extra_env,
        cwd,
    );
    if matches!(profile, TerminalProfile::Host) {
        cmd.env(TERMINAL_ID_ENV, terminal_id.to_string());
    }
    cmd
}

/// Confere se o perfil ativo consegue rodar antes de abrir a sessão
/// interativa. No host, sempre disponível. Numa distro WSL, um
/// `wsl.exe -d <distro> --cd <cwd> -- true` síncrono: distro
/// ausente/parada e `cwd` inexistente lá dentro dividem o mesmo status
/// 255 (`WSLP-10`), então o texto de erro é o único jeito de diferenciar —
/// por isso ele sobe verbatim, nunca reinterpretado.
fn check_profile_available(profile: &TerminalProfile, cwd: &Path) -> Result<(), String> {
    match profile {
        TerminalProfile::Host => Ok(()),
        TerminalProfile::Wsl { distro } => check_wsl_profile(distro, cwd),
    }
}

#[cfg(windows)]
fn check_wsl_profile(distro: &str, cwd: &Path) -> Result<(), String> {
    let mut cmd = std::process::Command::new("wsl.exe");
    cmd.args(["-d", distro, "--cd"])
        .arg(cwd)
        .args(["--", "true"]);
    // BOOT-01: this probe runs immediately before the interactive session is
    // opened, so its console window is the flash the user sees when clicking
    // "new terminal".
    let output = crate::proc::hide_console(&mut cmd)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[cfg(not(windows))]
fn check_wsl_profile(_distro: &str, _cwd: &Path) -> Result<(), String> {
    Ok(())
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
    /// Máquina onde o terminal roda. `Host` resolve o shell padrão do SO
    /// (via `portable-pty`), como sempre; `Wsl` roda dentro da distro.
    pub profile: TerminalProfile,
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
    /// WSLP-10, WSLP-11: perfil indisponível — nunca cai para o shell do
    /// host. `stderr` é o texto bruto do `wsl.exe`, sem reinterpretação.
    #[error("perfil `{label}` indisponível: {stderr}")]
    Profile { label: String, stderr: String },
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
        self.spawn_with(cfg, check_profile_available)
    }

    /// Núcleo testável de `spawn`: recebe a checagem de disponibilidade do
    /// perfil como parâmetro em vez de chamar `wsl.exe` de verdade, para
    /// provar a falha (`ManagerError::Profile`, nenhuma sessão inserida)
    /// sem depender de uma distro real.
    fn spawn_with(
        &self,
        cfg: SessionConfig,
        check: impl FnOnce(&TerminalProfile, &Path) -> Result<(), String>,
    ) -> Result<TerminalId, ManagerError> {
        let id = Uuid::now_v7();

        // WSLP-10, WSLP-11: falha de perfil aborta antes de qualquer coisa
        // ser montada ou registrada — nunca cai para o shell do host.
        if let Err(stderr) = check(&cfg.profile, &cfg.cwd) {
            return Err(ManagerError::Profile {
                label: cfg.profile.id(),
                stderr,
            });
        }

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
            &cfg.profile,
            cfg.agent.as_deref(),
            session,
            cfg.permission_mode.as_deref(),
        );
        let mut cmd = build_command(&resolution, &cfg.profile, &cfg.cwd, id);
        cmd.cwd(&cfg.cwd);
        for (key, value) in &cfg.env {
            cmd.env(key, value);
        }

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

        let cmd = build_command(
            &resolution,
            &TerminalProfile::Host,
            Path::new("/tmp"),
            Uuid::now_v7(),
        );

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

        let cmd = build_command(
            &resolution,
            &TerminalProfile::Host,
            Path::new("/tmp"),
            Uuid::now_v7(),
        );

        assert_eq!(argv(&cmd), vec!["codex"]);
    }

    // Sem agente resolvido e perfil host: programa padrão do SO, igual a
    // antes desta feature (o parâmetro `shell` explícito nunca tinha
    // chamador de verdade — ver design.md → Riscos).
    #[test]
    fn build_command_host_sem_resolucao_lanca_programa_padrao_do_so() {
        let resolution = LaunchResolution {
            command: None,
            args: Vec::new(),
            warning: Some("CLI ausente".to_string()),
        };

        let cmd = build_command(
            &resolution,
            &TerminalProfile::Host,
            Path::new("/tmp"),
            Uuid::now_v7(),
        );

        assert_eq!(argv(&cmd), argv(&CommandBuilder::new_default_prog()));
    }

    // WSLP-03/04: mesmo argv que `shells::wrap` já prova sozinho — aqui a
    // prova é que `build_command` de fato delega, não reimplementa.
    #[test]
    fn build_command_wsl_com_programa_produz_argv_com_env_prefixado() {
        let resolution = LaunchResolution {
            command: Some("/home/x/.local/bin/claude".to_string()),
            args: vec!["--resume".to_string(), "abc-123".to_string()],
            warning: None,
        };
        let profile = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let terminal_id = Uuid::now_v7();

        let cmd = build_command(
            &resolution,
            &profile,
            Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x"),
            terminal_id,
        );

        assert_eq!(
            argv(&cmd),
            vec![
                "wsl.exe",
                "-d",
                "Ubuntu-24.04",
                "--cd",
                r"\\wsl.localhost\Ubuntu-24.04\home\x",
                "--",
                "env",
                &format!("{TERMINAL_ID_ENV}={terminal_id}"),
                "/home/x/.local/bin/claude",
                "--resume",
                "abc-123",
            ]
        );
    }

    // WSLP-09: o id do terminal chega como entrada de argv (dentro da
    // distro), nunca como variável de processo do `wsl.exe` no host.
    #[test]
    fn build_command_wsl_inclui_id_do_terminal_como_entrada_de_env() {
        let resolution = LaunchResolution {
            command: Some("claude".to_string()),
            args: Vec::new(),
            warning: None,
        };
        let profile = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let terminal_id = Uuid::now_v7();

        let cmd = build_command(&resolution, &profile, Path::new("/home/x"), terminal_id);

        assert!(argv(&cmd).contains(&format!("{TERMINAL_ID_ENV}={terminal_id}")));
        // `iter_extra_env_as_str` lista só o que foi setado por
        // `cmd.env()`, e não o ambiente herdado que `CommandBuilder::new`
        // copia do processo. `get_env` mistura os dois: quando o próprio
        // `cargo test` roda dentro de um terminal do app,
        // `SWARMDECK_TERMINAL_ID` já está no ambiente e apareceria aqui sem
        // ninguém ter chamado `env()`.
        assert!(
            !cmd.iter_extra_env_as_str()
                .any(|(key, _)| key == TERMINAL_ID_ENV),
            "no perfil WSL o id não pode virar variável de processo do wsl.exe no host"
        );
    }

    // Perfil host: o id continua sendo variável de processo de verdade,
    // exatamente como antes desta feature.
    #[test]
    fn build_command_host_inclui_id_do_terminal_como_variavel_de_processo() {
        let resolution = LaunchResolution {
            command: Some("claude".to_string()),
            args: Vec::new(),
            warning: None,
        };
        let terminal_id = Uuid::now_v7();

        let cmd = build_command(
            &resolution,
            &TerminalProfile::Host,
            Path::new("/tmp"),
            terminal_id,
        );

        assert_eq!(
            cmd.get_env(TERMINAL_ID_ENV),
            Some(std::ffi::OsStr::new(terminal_id.to_string().as_str()))
        );
    }

    // WSLP-10, WSLP-11: falha de perfil vira `ManagerError::Profile` com o
    // rótulo do perfil e o stderr verbatim, e nenhuma sessão é registrada —
    // sem fallback nenhum para o shell do host.
    #[test]
    fn spawn_with_falha_de_perfil_retorna_manager_error_sem_inserir_sessao() {
        let manager = TerminalManager::new();
        let cfg = SessionConfig {
            cwd: PathBuf::from(r"\\wsl.localhost\Ubuntu-24.04\home\x"),
            profile: TerminalProfile::Wsl {
                distro: "Ubuntu-24.04".to_string(),
            },
            ..Default::default()
        };

        let result = manager.spawn_with(cfg, |_, _| Err("distro não encontrada".to_string()));

        match result {
            Err(ManagerError::Profile { label, stderr }) => {
                assert_eq!(label, "wsl:Ubuntu-24.04");
                assert_eq!(stderr, "distro não encontrada");
            }
            other => panic!("esperava ManagerError::Profile, veio {other:?}"),
        }
        assert!(manager.list().is_empty());
    }
}
