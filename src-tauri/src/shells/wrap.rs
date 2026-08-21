// SPEC: wsl-terminal-profile (WSLP-03, WSLP-04, WSLP-05, WSLP-09)
// SPEC: terminal-boot-loading (BOOT-01)

//! Traduz (perfil, programa, args, env, cwd) no `CommandBuilder` que de
//! fato roda. `Host` é hoje: `new_default_prog()` sem programa, ou o
//! programa mais seus argumentos. `Wsl` nunca usa string de shell — só
//! entradas de argv, incluindo `env K=V...` para passar variáveis, porque
//! um `$var` dentro de `bash -lc '...'` foi observado sendo consumido antes
//! de `bash` vê-lo. `login_path` busca o `PATH` de login da distro uma vez
//! e cacheia pelo tempo de vida do processo.

use std::path::Path;
#[cfg(windows)]
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use portable_pty::CommandBuilder;

use super::TerminalProfile;

/// Monta o comando para o perfil ativo. `cwd` só entra no argv na variante
/// WSL (`--cd`); no host, quem chama continua ajustando `cmd.cwd()` como
/// hoje — isso não muda aqui.
pub fn wrap(
    profile: &TerminalProfile,
    program: Option<&str>,
    args: &[String],
    env: &[(String, String)],
    cwd: &Path,
) -> CommandBuilder {
    match (profile, program) {
        (TerminalProfile::Host, None) => CommandBuilder::new_default_prog(),
        (TerminalProfile::Host, Some(program)) => {
            let mut cmd = CommandBuilder::new(program);
            for arg in args {
                cmd.arg(arg);
            }
            cmd
        }
        (TerminalProfile::Wsl { distro }, None) => {
            let mut cmd = CommandBuilder::new("wsl.exe");
            cmd.arg("-d");
            cmd.arg(distro);
            cmd.arg("--cd");
            cmd.arg(cwd);
            cmd
        }
        (TerminalProfile::Wsl { distro }, Some(program)) => {
            let mut cmd = CommandBuilder::new("wsl.exe");
            cmd.arg("-d");
            cmd.arg(distro);
            cmd.arg("--cd");
            cmd.arg(cwd);
            cmd.arg("--");
            cmd.arg("env");
            if let Some(login_path) = login_path(distro) {
                cmd.arg(format!("PATH={login_path}"));
            }
            for (key, value) in env {
                cmd.arg(format!("{key}={value}"));
            }
            cmd.arg(program);
            for arg in args {
                cmd.arg(arg);
            }
            cmd
        }
    }
}

#[cfg(windows)]
fn login_path_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `PATH` de login da distro (`wsl.exe -d <distro> -- bash -lc 'printenv
/// PATH'`), cacheado pelo tempo de vida do processo. `None` quando o
/// comando falha ou o `PATH` retornado vem vazio. Sem efeito fora de
/// Windows: o alvo aqui não tem `wsl.exe` a chamar — e, quando este código
/// roda dentro de um WSL2 (como neste próprio ambiente de desenvolvimento),
/// o `wsl.exe` do host *está* acessível via interop, o que tornaria o
/// resultado dependente de máquina se não fosse pelo `cfg(windows)`.
#[cfg(windows)]
pub fn login_path(distro: &str) -> Option<String> {
    let cache = login_path_cache();
    if let Some(cached) = cache.lock().unwrap().get(distro) {
        return cached.clone();
    }
    let value = fetch_login_path(distro);
    cache
        .lock()
        .unwrap()
        .insert(distro.to_string(), value.clone());
    value
}

#[cfg(not(windows))]
pub fn login_path(_distro: &str) -> Option<String> {
    None
}

#[cfg(windows)]
fn fetch_login_path(distro: &str) -> Option<String> {
    let mut cmd = std::process::Command::new("wsl.exe");
    cmd.args(["-d", distro, "--", "bash", "-lc", "printenv PATH"]);
    // BOOT-01: part of the terminal-open path (once per distro, then cached).
    let output = crate::proc::hide_console(&mut cmd).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8(output.stdout).ok()?;
    let trimmed = path.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
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

    #[test]
    fn wrap_host_none_matches_default_prog_argv() {
        let cmd = wrap(&TerminalProfile::Host, None, &[], &[], Path::new("/tmp"));
        assert_eq!(argv(&cmd), argv(&CommandBuilder::new_default_prog()));
    }

    #[test]
    fn wrap_host_with_program_produces_program_and_args() {
        let cmd = wrap(
            &TerminalProfile::Host,
            Some("claude"),
            &["--resume".to_string(), "abc-123".to_string()],
            &[],
            Path::new("/tmp"),
        );
        assert_eq!(argv(&cmd), vec!["claude", "--resume", "abc-123"]);
    }

    #[test]
    fn wrap_wsl_none_produces_cd_command_without_trailing_dashdash() {
        let profile = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let cmd = wrap(
            &profile,
            None,
            &[],
            &[],
            Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x"),
        );
        assert_eq!(
            argv(&cmd),
            vec![
                "wsl.exe",
                "-d",
                "Ubuntu-24.04",
                "--cd",
                r"\\wsl.localhost\Ubuntu-24.04\home\x",
            ]
        );
    }

    #[test]
    fn wrap_wsl_with_program_produces_env_prefixed_command() {
        let profile = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let cmd = wrap(
            &profile,
            Some("/home/x/.local/bin/claude"),
            &["--resume".to_string(), "abc-123".to_string()],
            &[("SWARMDECK_TERMINAL_ID".to_string(), "abc-123".to_string())],
            Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x"),
        );
        // Sem wsl.exe neste ambiente de teste, login_path() sempre falha e
        // devolve None — a entrada PATH= fica de fora (coberto também por
        // wrap_omits_path_entry_when_login_path_is_none).
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
                "SWARMDECK_TERMINAL_ID=abc-123",
                "/home/x/.local/bin/claude",
                "--resume",
                "abc-123",
            ]
        );
    }

    #[test]
    fn wrap_wsl_argv_has_no_shell_metacharacters() {
        let profile = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let cmd = wrap(
            &profile,
            Some("claude"),
            &["--resume".to_string()],
            &[("SWARMDECK_TERMINAL_ID".to_string(), "abc-123".to_string())],
            Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x"),
        );
        for entry in argv(&cmd) {
            for forbidden in ['$', '`', ';', '|', '&'] {
                assert!(
                    !entry.contains(forbidden),
                    "argv entry {entry:?} contains shell metacharacter {forbidden:?}"
                );
            }
        }
    }

    #[test]
    fn wrap_preserves_spaces_in_cwd_and_args_as_single_entries() {
        let profile = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let cmd = wrap(
            &profile,
            Some("echo"),
            &["hello world".to_string()],
            &[],
            Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\a b"),
        );
        let entries = argv(&cmd);
        assert!(entries.contains(&r"\\wsl.localhost\Ubuntu-24.04\home\a b".to_string()));
        assert!(entries.contains(&"hello world".to_string()));
    }

    #[test]
    fn wrap_omits_path_entry_when_login_path_is_none() {
        let profile = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let cmd = wrap(&profile, Some("claude"), &[], &[], Path::new("/home/x"));
        assert!(argv(&cmd).iter().all(|entry| !entry.starts_with("PATH=")));
    }

    #[test]
    fn login_path_returns_none_when_wsl_unavailable() {
        assert_eq!(login_path("Unknown-Distro-For-Test"), None);
    }
}
