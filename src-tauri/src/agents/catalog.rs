// SPEC: agent-selection (AGT-01, AGT-02)

//! Catálogo estático dos agentes de IA suportados e detecção de CLI no PATH.
//!
//! O catálogo é a fonte única de verdade sobre "quais agentes existem" —
//! T2 (lançamento) e T4 (UI) leem daqui, não duplicam a lista. A detecção
//! nunca falha por causa de um agente ausente: ausência é só um campo do
//! resultado (`AgentStatus::installed`), porque o app continua útil como
//! multiplexador de terminais mesmo sem nenhum CLI instalado (ver
//! `spec.md`, "Casos de borda").

use std::path::Path;

/// Uma entrada do catálogo: identidade estável + como resolver o CLI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AgentDescriptor {
    /// Id estável, usado como chave de persistência (T3) e no frontend (T4).
    /// Nunca muda depois de publicado — trocar quebraria preferências salvas.
    pub id: &'static str,
    pub name: &'static str,
    pub vendor: &'static str,
    /// Nome do binário a resolver no PATH, sem extensão (a extensão é
    /// resolvida via `PATHEXT` no Windows).
    pub command: &'static str,
    pub beta: bool,
}

/// Resultado da detecção para um agente: o agente e se o comando resolveu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AgentStatus {
    pub agent: AgentDescriptor,
    pub installed: bool,
}

/// Catálogo estático. A ordem é a ordem de exibição (T4) — Claude Code
/// primeiro por ser o padrão observado na instalação de referência
/// (`spec.md`, "Agentes do catálogo").
pub const CATALOG: [AgentDescriptor; 5] = [
    AgentDescriptor {
        id: "claude-code",
        name: "Claude Code",
        vendor: "Anthropic",
        command: "claude",
        beta: false,
    },
    AgentDescriptor {
        id: "codex-cli",
        name: "Codex CLI",
        vendor: "OpenAI",
        command: "codex",
        beta: false,
    },
    AgentDescriptor {
        id: "antigravity-cli",
        name: "Antigravity CLI",
        vendor: "Google",
        command: "antigravity",
        beta: false,
    },
    AgentDescriptor {
        id: "opencode",
        name: "opencode",
        vendor: "SST",
        command: "opencode",
        beta: false,
    },
    AgentDescriptor {
        id: "kimi-code",
        name: "Kimi Code",
        vendor: "Moonshot AI",
        command: "kimi",
        beta: true,
    },
];

/// O catálogo estático, como slice.
pub fn catalog() -> &'static [AgentDescriptor] {
    &CATALOG
}

/// `true` quando `dir` contém um arquivo que resolve `command`.
///
/// Tenta primeiro o nome exato (cobre binários Unix sem extensão e o caso
/// raro de um arquivo Windows sem extensão). Quando `pathext` é passado,
/// tenta também `command` com cada extensão listada — é assim que o
/// Windows resolve `claude` para `claude.cmd`/`claude.exe`/etc via
/// `%PATHEXT%`, em vez de aceitar só `.exe`.
fn command_exists_in_dir(dir: &Path, command: &str, pathext: Option<&str>) -> bool {
    if dir.join(command).is_file() {
        return true;
    }

    if let Some(pathext) = pathext {
        for ext in pathext.split(';').filter(|e| !e.is_empty()) {
            if dir.join(format!("{command}{ext}")).is_file() {
                return true;
            }
        }
    }

    false
}

/// Núcleo testável da detecção: recebe `PATH` e `PATHEXT` (Windows) já
/// resolvidos, em vez de ler o ambiente diretamente — assim o teste monta
/// um PATH temporário com um executável falso sem depender do que existe
/// de verdade na máquina que roda o teste.
fn command_exists_in_path(command: &str, path_var: &str, pathext: Option<&str>) -> bool {
    std::env::split_paths(path_var).any(|dir| command_exists_in_dir(&dir, command, pathext))
}

/// Detecta, para cada agente do catálogo, se o comando resolve no PATH
/// atual do processo. Nunca retorna `Err`: um CLI ausente é só
/// `installed: false` na entrada correspondente, nunca uma falha da
/// função — o chamador (T2) decide o que fazer com isso (cair para shell
/// puro), não esta camada.
pub fn detect_installed() -> Vec<AgentStatus> {
    let path_var = std::env::var("PATH").unwrap_or_default();
    let pathext_var = windows_pathext();

    detect_installed_with(&CATALOG, &path_var, pathext_var.as_deref())
}

/// `%PATHEXT%` do processo no Windows, com o padrão do SO como fallback
/// quando a variável não está definida. `None` fora do Windows: lá a
/// resolução por extensão implícita não existe.
#[cfg(windows)]
fn windows_pathext() -> Option<String> {
    Some(std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string()))
}

#[cfg(not(windows))]
fn windows_pathext() -> Option<String> {
    None
}

fn detect_installed_with(
    catalog: &[AgentDescriptor],
    path_var: &str,
    pathext: Option<&str>,
) -> Vec<AgentStatus> {
    catalog
        .iter()
        .map(|agent| AgentStatus {
            agent: *agent,
            installed: command_exists_in_path(agent.command, path_var, pathext),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn catalogo_tem_os_5_agentes_com_ids_esperados() {
        let ids: Vec<&str> = catalog().iter().map(|a| a.id).collect();
        assert_eq!(
            ids,
            vec![
                "claude-code",
                "codex-cli",
                "antigravity-cli",
                "opencode",
                "kimi-code",
            ]
        );
    }

    #[test]
    fn so_kimi_code_tem_a_flag_beta() {
        for agent in catalog() {
            let esperado_beta = agent.id == "kimi-code";
            assert_eq!(
                agent.beta, esperado_beta,
                "flag beta errada para {}",
                agent.id
            );
        }
    }

    #[test]
    fn detecta_comando_existente_no_path() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("fakecli.exe"), b"").unwrap();
        let path_var = dir.path().to_string_lossy().into_owned();

        assert!(command_exists_in_path(
            "fakecli",
            &path_var,
            Some(".COM;.EXE;.BAT;.CMD"),
        ));
    }

    #[test]
    fn nao_detecta_comando_ausente() {
        let dir = tempfile::tempdir().unwrap();
        let path_var = dir.path().to_string_lossy().into_owned();

        assert!(!command_exists_in_path(
            "definitely-not-a-real-cli-xyz123",
            &path_var,
            Some(".COM;.EXE;.BAT;.CMD"),
        ));
    }

    #[test]
    fn resolucao_aceita_qualquer_extensao_do_pathext_nao_so_exe() {
        let dir = tempfile::tempdir().unwrap();
        // Só .cmd existe, sem .exe — prova que a extensão não está
        // hardcoded, ela vem da lista do PATHEXT.
        fs::write(dir.path().join("fakecli.cmd"), b"").unwrap();
        let path_var = dir.path().to_string_lossy().into_owned();

        assert!(command_exists_in_path(
            "fakecli",
            &path_var,
            Some(".COM;.EXE;.BAT;.CMD"),
        ));
    }
}
