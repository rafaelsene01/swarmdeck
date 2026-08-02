// SPEC: agent-selection (AGT-03, AGT-04)

//! Resolves which command a terminal session should launch: the requested
//! agent's CLI, or a fall back to the plain shell.
//!
//! This module owns the *decision*, not the process spawn itself —
//! `TerminalManager::spawn` (T2, `terminal/manager.rs`) still builds the
//! `CommandBuilder` and owns the PTY lifecycle; this only tells it which
//! program name to use, reusing the catalog and detection T1 already built
//! (`agents::catalog`).

use super::catalog::{catalog, detect_installed, AgentDescriptor, AgentStatus};

/// Outcome of resolving `SessionConfig.agent` into an actual command.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct LaunchResolution {
    /// `Some(program)` when an agent was requested and its CLI is
    /// installed — the caller should launch this instead of a shell.
    /// `None` means "launch the plain shell", for either of two reasons
    /// distinguished by `warning`.
    pub command: Option<String>,
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
pub fn resolve_launch_command(agent_id: Option<&str>) -> LaunchResolution {
    resolve_with(agent_id, catalog(), &detect_installed())
}

/// Testable core of the resolution: takes the catalog and detection results
/// as parameters instead of reading the real PATH — the same split
/// `catalog::detect_installed` / `detect_installed_with` already uses, so
/// tests don't depend on what is actually installed on the machine running
/// them.
fn resolve_with(
    agent_id: Option<&str>,
    catalog: &[AgentDescriptor],
    statuses: &[AgentStatus],
) -> LaunchResolution {
    let Some(agent_id) = agent_id else {
        return LaunchResolution::default();
    };

    let Some(descriptor) = catalog.iter().find(|a| a.id == agent_id) else {
        return LaunchResolution {
            command: None,
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
            warning: None,
        }
    } else {
        LaunchResolution {
            command: None,
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

    fn fake_catalog() -> Vec<AgentDescriptor> {
        vec![AgentDescriptor {
            id: "fake-agent",
            name: "Fake Agent",
            vendor: "Fake Vendor",
            command: "fakecli",
            beta: false,
        }]
    }

    #[test]
    fn agente_conhecido_e_instalado_lanca_seu_comando() {
        let catalog = fake_catalog();
        let statuses = vec![AgentStatus {
            agent: catalog[0],
            installed: true,
        }];

        let resolution = resolve_with(Some("fake-agent"), &catalog, &statuses);

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

        let resolution = resolve_with(None, &catalog, &statuses);

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

        let resolution = resolve_with(Some("fake-agent"), &catalog, &statuses);

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

        let resolution = resolve_with(Some("fake-agent"), &catalog, &statuses);

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
