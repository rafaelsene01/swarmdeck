// SPEC: agent-selection (AGT-01, AGT-02), session-restore (SESS-11, SESS-12, SESS-13)
// SPEC: editor-launch (EDITOR-02) — `resolve_command_in_path` é a mesma
// resolução de PATH, agora devolvendo o caminho resolvido: `editors.rs`
// precisa dele para lançar `code.cmd`/`cursor.cmd` no Windows.

//! Catálogo estático dos agentes de IA suportados e detecção de CLI no PATH.
//!
//! O catálogo é a fonte única de verdade sobre "quais agentes existem" —
//! T2 (lançamento) e T4 (UI) leem daqui, não duplicam a lista. A detecção
//! nunca falha por causa de um agente ausente: ausência é só um campo do
//! resultado (`AgentStatus::installed`), porque o app continua útil como
//! multiplexador de terminais mesmo sem nenhum CLI instalado (ver
//! `spec.md`, "Casos de borda").

use std::path::{Path, PathBuf};

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
    /// SPEC: session-restore (SESS-12) — flag que fixa o id da sessão no
    /// **primeiro** lançamento daquele id. `None` = o CLI não deixa o app
    /// escolher o id da sessão, então nenhum argumento de sessão é passado.
    pub session_new_flag: Option<&'static str>,
    /// SPEC: session-restore (SESS-13) — flag que retoma uma sessão já
    /// fixada por `session_new_flag`. `None` = sem retomada possível; o
    /// switch do modal de restauração fica travado em "nova sessão".
    pub session_resume_flag: Option<&'static str>,
    /// SPEC: agent-permission-mode (PERM-01) — flag que escolhe o modo de
    /// permissão da sessão. `None` = o CLI não expõe esse controle, e o passo
    /// AGENT do wizard não mostra o seletor para esse agente.
    pub permission_mode_flag: Option<&'static str>,
}

/// SPEC: agent-permission-mode (PERM-01, PERM-02) — os modos que
/// `claude --permission-mode` aceita, na ordem de exibição (do mais
/// supervisionado ao menos). Conferidos contra `claude --help` da versão
/// instalada; `manual` é o apelido de `default`, e é o que a CLI mostra.
///
/// Esta lista é a **fronteira de confiança**: o modo chega do frontend como
/// string, e só passa para a linha de comando se estiver aqui. Modo
/// desconhecido não vira argumento — nunca é repassado ao CLI.
pub const PERMISSION_MODES: [&str; 6] = [
    "manual",
    "plan",
    "acceptEdits",
    "auto",
    "dontAsk",
    "bypassPermissions",
];

/// `true` quando `mode` é um dos valores aceitos por `PERMISSION_MODES`.
pub fn is_valid_permission_mode(mode: &str) -> bool {
    PERMISSION_MODES.contains(&mode)
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
///
/// SPEC: session-restore (SESS-12, SESS-13, SESS-14) — só o Claude Code
/// declara flags de sessão. O Codex expõe `codex resume <id>` como
/// **subcomando**, sem forma de fixar o id no primeiro lançamento; os outros
/// três não têm flag de sessão documentada. Suportar um deles é preencher
/// estas duas colunas, nunca escrever um `match` por id.
pub const CATALOG: [AgentDescriptor; 5] = [
    AgentDescriptor {
        id: "claude-code",
        name: "Claude Code",
        vendor: "Anthropic",
        command: "claude",
        beta: false,
        session_new_flag: Some("--session-id"),
        session_resume_flag: Some("--resume"),
        permission_mode_flag: Some("--permission-mode"),
    },
    AgentDescriptor {
        id: "codex-cli",
        name: "Codex CLI",
        vendor: "OpenAI",
        command: "codex",
        beta: false,
        session_new_flag: None,
        session_resume_flag: None,
        permission_mode_flag: None,
    },
    AgentDescriptor {
        id: "antigravity-cli",
        name: "Antigravity CLI",
        vendor: "Google",
        command: "antigravity",
        beta: false,
        session_new_flag: None,
        session_resume_flag: None,
        permission_mode_flag: None,
    },
    AgentDescriptor {
        id: "opencode",
        name: "opencode",
        vendor: "SST",
        command: "opencode",
        beta: false,
        session_new_flag: None,
        session_resume_flag: None,
        permission_mode_flag: None,
    },
    AgentDescriptor {
        id: "kimi-code",
        name: "Kimi Code",
        vendor: "Moonshot AI",
        command: "kimi",
        beta: true,
        session_new_flag: None,
        session_resume_flag: None,
        permission_mode_flag: None,
    },
];

/// O catálogo estático, como slice.
pub fn catalog() -> &'static [AgentDescriptor] {
    &CATALOG
}

/// O caminho do arquivo em `dir` que resolve `command`, se houver.
///
/// Tenta primeiro o nome exato (cobre binários Unix sem extensão e o caso
/// raro de um arquivo Windows sem extensão). Quando `pathext` é passado,
/// tenta também `command` com cada extensão listada — é assim que o
/// Windows resolve `claude` para `claude.cmd`/`claude.exe`/etc via
/// `%PATHEXT%`, em vez de aceitar só `.exe`.
///
/// A comparação de nome é case-insensitive de propósito: a resolução real
/// do Windows via `PATHEXT` não diferencia caixa, então essa função não
/// pode depender de o filesystem do processo ser case-insensitive por
/// acaso (ele não é em CI Linux).
fn resolve_command_in_dir(dir: &Path, command: &str, pathext: Option<&str>) -> Option<PathBuf> {
    let names: Vec<std::ffi::OsString> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_file()))
        .map(|entry| entry.file_name())
        .collect();

    // A ordem dos candidatos é a ordem de preferência, e não é cosmética: a
    // mesma pasta costuma ter `code` (shim de shell, sem extensão, que só o
    // Git Bash executa) e `code.cmd` (o que o Windows realmente resolve).
    // Varrer as extensões de `%PATHEXT%` primeiro reproduz a resolução do
    // SO; a ordem de `read_dir` decidiria no cara ou coroa.
    let mut candidates: Vec<String> = pathext
        .map(|pathext| {
            pathext
                .split(';')
                .filter(|ext| !ext.is_empty())
                .map(|ext| format!("{command}{ext}"))
                .collect()
        })
        .unwrap_or_default();
    candidates.push(command.to_string());

    candidates.iter().find_map(|candidate| {
        names
            .iter()
            .find(|name| name.eq_ignore_ascii_case(candidate))
            .map(|name| dir.join(name))
    })
}

/// Núcleo testável da detecção: recebe `PATH` e `PATHEXT` (Windows) já
/// resolvidos, em vez de ler o ambiente diretamente — assim o teste monta
/// um PATH temporário com um executável falso sem depender do que existe
/// de verdade na máquina que roda o teste.
pub fn resolve_command_in_path(
    command: &str,
    path_var: &str,
    pathext: Option<&str>,
) -> Option<PathBuf> {
    std::env::split_paths(path_var).find_map(|dir| resolve_command_in_dir(&dir, command, pathext))
}

/// Açúcar sobre `resolve_command_in_path` para quem só quer saber se resolve.
fn command_exists_in_path(command: &str, path_var: &str, pathext: Option<&str>) -> bool {
    resolve_command_in_path(command, path_var, pathext).is_some()
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
pub fn windows_pathext() -> Option<String> {
    Some(std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string()))
}

#[cfg(not(windows))]
pub fn windows_pathext() -> Option<String> {
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

    // SPEC: session-restore (SESS-12, SESS-13, SESS-14) — só o Claude Code
    // declara flags de sessão; qualquer outro declarando uma sem que o CLI
    // suporte faria o terminal arrancar com argumento inválido.
    #[test]
    fn so_claude_code_declara_flags_de_sessao() {
        for agent in catalog() {
            let esperado = if agent.id == "claude-code" {
                (Some("--session-id"), Some("--resume"))
            } else {
                (None, None)
            };

            assert_eq!(
                (agent.session_new_flag, agent.session_resume_flag),
                esperado,
                "flags de sessão erradas para {}",
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
