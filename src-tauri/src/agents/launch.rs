// SPEC: agent-selection (AGT-03, AGT-04), session-restore (SESS-12, SESS-13, SESS-14)

//! Resolves which command a terminal session should launch: the requested
//! agent's CLI, or a fall back to the plain shell.
//!
//! This module owns the *decision*, not the process spawn itself —
//! `TerminalManager::spawn` (T2, `terminal/manager.rs`) still builds the
//! `CommandBuilder` and owns the PTY lifecycle; this only tells it which
//! program name to use, reusing the catalog and detection T1 already built
//! (`agents::catalog`).

use super::catalog::{catalog, detect_installed, AgentDescriptor, AgentStatus};

/// Which agent session this launch should pin or resume.
///
/// SPEC: session-restore (SESS-12, SESS-13) — `id` is the UUID the app itself
/// generated for the pane and persisted with it, never one typed by the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionLaunch<'a> {
    pub id: &'a str,
    /// `true` reopens the conversation (`--resume`); `false` pins a fresh one
    /// (`--session-id`).
    pub resume: bool,
}

/// Outcome of resolving `SessionConfig.agent` into an actual command.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct LaunchResolution {
    /// `Some(program)` when an agent was requested and its CLI is
    /// installed — the caller should launch this instead of a shell.
    /// `None` means "launch the plain shell", for either of two reasons
    /// distinguished by `warning`.
    pub command: Option<String>,
    /// Arguments to append to `command`, in order. Empty unless a session
    /// was requested AND the resolved agent declares the matching flag.
    /// Never populated for the shell fallback: a shell has no idea what
    /// `--resume` means.
    pub args: Vec<String>,
    /// Set only when an agent was requested but could not be launched
    /// (unknown id, or its CLI is not on PATH). `None` when no agent was
    /// requested at all — that is the ordinary case, not a warning.
    pub warning: Option<String>,
}

/// Resolves `agent_id` (as stored in `SessionConfig.agent`) against the live
/// catalog and the current PATH.
///
/// Three cases:
/// - `agent_id` is `None` → no agent requested: `{ command: None, warning: None }`.
/// - `agent_id` names a catalog agent whose CLI is installed → its command,
///   no warning.
/// - `agent_id` names an unknown agent, or a known one that isn't
///   installed → falls back to the shell (`command: None`), with a
///   `warning` describing why. The caller never fails the spawn over this.
pub fn resolve_launch_command(
    agent_id: Option<&str>,
    session: Option<SessionLaunch<'_>>,
) -> LaunchResolution {
    resolve_with(agent_id, session, catalog(), &detect_installed())
}

/// Arguments that pin or resume `session` for `descriptor`.
///
/// SPEC: session-restore (SESS-12, SESS-13, SESS-14) — the rule in one line:
/// **the flag only appears when the agent declares it**. A resume request
/// against an agent with no resume flag falls back to no arguments at all,
/// never to `--session-id`: pinning where the user asked to resume would
/// silently start a different conversation.
fn session_args(descriptor: &AgentDescriptor, session: Option<SessionLaunch<'_>>) -> Vec<String> {
    let Some(session) = session else {
        return Vec::new();
    };

    let flag = if session.resume {
        descriptor.session_resume_flag
    } else {
        descriptor.session_new_flag
    };

    match flag {
        Some(flag) => vec![flag.to_string(), session.id.to_string()],
        None => Vec::new(),
    }
}

/// Testable core of the resolution: takes the catalog and detection results
/// as parameters instead of reading the real PATH — the same split
/// `catalog::detect_installed` / `detect_installed_with` already uses, so
/// tests don't depend on what is actually installed on the machine running
/// them.
fn resolve_with(
    agent_id: Option<&str>,
    session: Option<SessionLaunch<'_>>,
    catalog: &[AgentDescriptor],
    statuses: &[AgentStatus],
) -> LaunchResolution {
    let Some(agent_id) = agent_id else {
        return LaunchResolution::default();
    };

    let Some(descriptor) = catalog.iter().find(|a| a.id == agent_id) else {
        return LaunchResolution {
            command: None,
            args: Vec::new(),
            warning: Some(format!(
                "agente `{agent_id}` não existe no catálogo; abrindo shell puro"
            )),
        };
    };

    let installed = statuses
        .iter()
        .find(|status| status.agent.id == agent_id)
        .map(|status| status.installed)
        .unwrap_or(false);

    if installed {
        LaunchResolution {
            command: Some(descriptor.command.to_string()),
            args: session_args(descriptor, session),
            warning: None,
        }
    } else {
        LaunchResolution {
            command: None,
            args: Vec::new(),
            warning: Some(format!(
                "CLI de {} (`{}`) não encontrado no PATH; abrindo shell puro",
                descriptor.name, descriptor.command
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Agente que **declara** flags de sessão, como o Claude Code.
    fn fake_catalog() -> Vec<AgentDescriptor> {
        vec![AgentDescriptor {
            id: "fake-agent",
            name: "Fake Agent",
            vendor: "Fake Vendor",
            command: "fakecli",
            beta: false,
            session_new_flag: Some("--session-id"),
            session_resume_flag: Some("--resume"),
        }]
    }

    /// Agente sem nenhuma flag de sessão, como o Codex e os demais.
    fn sessionless_catalog() -> Vec<AgentDescriptor> {
        vec![AgentDescriptor {
            session_new_flag: None,
            session_resume_flag: None,
            ..fake_catalog()[0]
        }]
    }

    fn installed(catalog: &[AgentDescriptor]) -> Vec<AgentStatus> {
        catalog
            .iter()
            .map(|agent| AgentStatus {
                agent: *agent,
                installed: true,
            })
            .collect()
    }

    const SESSION_ID: &str = "0195d0f0-0000-7000-8000-000000000001";

    // SPEC: session-restore (SESS-12) — sessão nova fixa o id com a flag
    // declarada pelo agente.
    #[test]
    fn sessao_nova_passa_a_flag_de_fixar_id() {
        let catalog = fake_catalog();

        let resolution = resolve_with(
            Some("fake-agent"),
            Some(SessionLaunch {
                id: SESSION_ID,
                resume: false,
            }),
            &catalog,
            &installed(&catalog),
        );

        assert_eq!(
            resolution.args,
            vec!["--session-id".to_string(), SESSION_ID.to_string()]
        );
    }

    // SPEC: session-restore (SESS-13) — retomar usa a flag de retomada, e
    // **nunca** a de fixar: fixar aqui abriria uma conversa diferente da que
    // o usuário pediu de volta.
    #[test]
    fn sessao_retomada_passa_a_flag_de_retomada_e_nao_a_de_fixar() {
        let catalog = fake_catalog();

        let resolution = resolve_with(
            Some("fake-agent"),
            Some(SessionLaunch {
                id: SESSION_ID,
                resume: true,
            }),
            &catalog,
            &installed(&catalog),
        );

        assert_eq!(
            resolution.args,
            vec!["--resume".to_string(), SESSION_ID.to_string()]
        );
        assert!(
            !resolution.args.contains(&"--session-id".to_string()),
            "retomada nunca pode cair na flag de fixar sessão"
        );
    }

    // SPEC: session-restore (SESS-14) — agente sem flag declarada lança como
    // sempre lançou, nos dois modos.
    #[test]
    fn agente_sem_flag_de_sessao_nao_recebe_argumento_nenhum() {
        let catalog = sessionless_catalog();

        for resume in [false, true] {
            let resolution = resolve_with(
                Some("fake-agent"),
                Some(SessionLaunch {
                    id: SESSION_ID,
                    resume,
                }),
                &catalog,
                &installed(&catalog),
            );

            assert_eq!(
                resolution.args,
                Vec::<String>::new(),
                "resume={resume} não deveria produzir argumento"
            );
            assert_eq!(resolution.command, Some("fakecli".to_string()));
            assert_eq!(resolution.warning, None);
        }
    }

    // Terminal sem id de sessão (workspace gravado antes desta feature).
    #[test]
    fn sem_sessao_pedida_nao_ha_argumento() {
        let catalog = fake_catalog();

        let resolution = resolve_with(Some("fake-agent"), None, &catalog, &installed(&catalog));

        assert_eq!(resolution.args, Vec::<String>::new());
    }

    // SPEC: session-restore (SESS-14) — o fallback para shell puro nunca leva
    // argumento de agente junto: o shell não entende `--resume`.
    #[test]
    fn fallback_para_shell_nao_leva_argumento_de_sessao() {
        let catalog = fake_catalog();
        let statuses = vec![AgentStatus {
            agent: catalog[0],
            installed: false,
        }];

        let resolution = resolve_with(
            Some("fake-agent"),
            Some(SessionLaunch {
                id: SESSION_ID,
                resume: true,
            }),
            &catalog,
            &statuses,
        );

        assert_eq!(resolution.command, None);
        assert_eq!(resolution.args, Vec::<String>::new());
    }

    #[test]
    fn agente_conhecido_e_instalado_lanca_seu_comando() {
        let catalog = fake_catalog();
        let statuses = vec![AgentStatus {
            agent: catalog[0],
            installed: true,
        }];

        let resolution = resolve_with(Some("fake-agent"), None, &catalog, &statuses);

        assert_eq!(resolution.command, Some("fakecli".to_string()));
        assert_eq!(resolution.warning, None);
    }

    #[test]
    fn sem_agente_pedido_devolve_shell_puro_sem_aviso() {
        let catalog = fake_catalog();
        // Instalado ou não é irrelevante aqui: sem `agent_id`, a detecção
        // nem deveria ser consultada — o caso `None` é a rota mais curta.
        let statuses = vec![AgentStatus {
            agent: catalog[0],
            installed: true,
        }];

        let resolution = resolve_with(None, None, &catalog, &statuses);

        assert_eq!(resolution.command, None);
        assert_eq!(resolution.warning, None);
    }

    #[test]
    fn agente_pedido_mas_nao_instalado_cai_para_shell() {
        let catalog = fake_catalog();
        let statuses = vec![AgentStatus {
            agent: catalog[0],
            installed: false,
        }];

        let resolution = resolve_with(Some("fake-agent"), None, &catalog, &statuses);

        assert_eq!(
            resolution.command, None,
            "CLI ausente do PATH deve cair para shell puro (command: None)"
        );
    }

    #[test]
    fn aviso_descreve_o_agente_que_faltou() {
        let catalog = fake_catalog();
        let statuses = vec![AgentStatus {
            agent: catalog[0],
            installed: false,
        }];

        let resolution = resolve_with(Some("fake-agent"), None, &catalog, &statuses);

        let warning = resolution
            .warning
            .expect("deve haver aviso quando o CLI pedido não está instalado");
        assert!(
            warning.contains("Fake Agent"),
            "aviso deve nomear o agente: {warning}"
        );
        assert!(
            warning.contains("fakecli"),
            "aviso deve nomear o comando esperado: {warning}"
        );
    }
}
