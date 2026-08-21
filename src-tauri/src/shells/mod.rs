// SPEC: wsl-terminal-profile (WSLP-07, WSLP-21, WSLP-24)
// SPEC: quota-indicator (QUOTA-15)

//! Qual máquina um terminal, uma sonda de CLI, ou um `git init` deve usar.
//! `TerminalProfile` é a única representação disso: `Host` (comportamento
//! de hoje) ou `Wsl { distro }`. `profile_for_path` deriva o perfil de um
//! `cwd` já normalizado por `strip_verbatim_prefix`
//! (`projects::service::strip_verbatim_prefix`), que garante o formato
//! `\\wsl.localhost\<distro>\...` ou o sinônimo legado `\\wsl$\<distro>\...`.
//! Núcleo puro, sem I/O — nenhuma chamada de processo ou banco aqui.

use std::path::Path;

// SPEC: quota-indicator (QUOTA-15) — `home` chama `wsl.exe`, como `wrap`; a
// nota "sem I/O" acima vale para o corpo deste módulo, não para os filhos.
pub mod home;
pub mod list;
pub mod prefs;
pub mod probe;
pub mod wrap;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum TerminalProfile {
    #[default]
    Host,
    Wsl {
        distro: String,
    },
}

impl TerminalProfile {
    /// Forma persistida/transmitida: `"host"` ou `"wsl:<distro>"`.
    pub fn id(&self) -> String {
        match self {
            TerminalProfile::Host => "host".to_string(),
            TerminalProfile::Wsl { distro } => format!("wsl:{distro}"),
        }
    }

    pub fn parse_id(id: &str) -> Option<TerminalProfile> {
        if id == "host" {
            return Some(TerminalProfile::Host);
        }
        let distro = id.strip_prefix("wsl:")?;
        if distro.is_empty() {
            return None;
        }
        Some(TerminalProfile::Wsl {
            distro: distro.to_string(),
        })
    }
}

/// Divide um caminho UNC do WSL em `(distro, caminho dentro da distro)`.
/// `None` para qualquer coisa que não seja `\\wsl.localhost\<distro>\...`
/// (ou o sinônimo legado `\\wsl$\`), inclusive o caso do segmento de
/// distro vazio.
///
/// O caminho devolvido é POSIX porque é exatamente o que existe dentro da
/// distro: o prefixo UNC *é* a raiz dela, então trocar `\` por `/` é
/// tradução exata, e não a adivinhação `C:\x` → `/mnt/c/x` que a spec
/// mantém fora de escopo (`/mnt` é configurável em `/etc/wsl.conf`).
///
/// SPEC: wsl-terminal-profile (WSLP-07, WSLP-21, WSLP-24) — único lugar que
/// interpreta a forma UNC: `profile_for_path` e o `--remote wsl+<distro>` do
/// editor leem os dois pedaços daqui em vez de reimplementar o parse.
pub fn wsl_path_parts(cwd: &Path) -> Option<(String, String)> {
    let raw = cwd.to_string_lossy();
    for prefix in [r"\\wsl.localhost\", r"\\wsl$\"] {
        let Some(rest) = raw.strip_prefix(prefix) else {
            continue;
        };
        let (distro, tail) = match rest.split_once('\\') {
            Some((distro, tail)) => (distro, tail),
            None => (rest, ""),
        };
        if distro.is_empty() {
            return None;
        }
        return Some((distro.to_string(), format!("/{}", tail.replace('\\', "/"))));
    }
    None
}

/// Deriva o perfil a partir do `cwd`: um caminho que nomeia uma distro
/// vence sobre o perfil padrão passado. Sem distro reconhecível, retorna
/// o `default` recebido — quem chama decide o que "padrão" significa.
///
/// WSLP-24 (AD-039): hoje **todos** os chamadores passam `Host`. O parâmetro
/// sobrevive porque é ele que torna a regra testável — um teste passa um
/// perfil WSL aqui justamente para provar que o derivador honraria o default
/// e que quem chama, de propósito, não lhe dá nenhum.
pub fn profile_for_path(cwd: &Path, default: &TerminalProfile) -> TerminalProfile {
    match wsl_path_parts(cwd) {
        Some((distro, _)) => TerminalProfile::Wsl { distro },
        None => default.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_for_path_returns_wsl_for_localhost_and_legacy_prefix() {
        let default = TerminalProfile::Host;
        assert_eq!(
            profile_for_path(Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x"), &default),
            TerminalProfile::Wsl {
                distro: "Ubuntu-24.04".to_string()
            }
        );
        assert_eq!(
            profile_for_path(Path::new(r"\\wsl$\Ubuntu-24.04\home\x"), &default),
            TerminalProfile::Wsl {
                distro: "Ubuntu-24.04".to_string()
            }
        );
    }

    #[test]
    fn profile_for_path_returns_default_for_windows_path() {
        let default = TerminalProfile::Host;
        assert_eq!(
            profile_for_path(Path::new(r"C:\repos\x"), &default),
            default
        );
    }

    #[test]
    fn profile_for_path_returns_default_for_relative_path() {
        let default = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        assert_eq!(profile_for_path(Path::new(r"repos\x"), &default), default);
    }

    #[test]
    fn profile_for_path_returns_default_for_empty_distro_segment() {
        let default = TerminalProfile::Host;
        assert_eq!(
            profile_for_path(Path::new(r"\\wsl.localhost\\home\x"), &default),
            default
        );
    }

    // SPEC: wsl-terminal-profile (WSLP-21) — o caminho dentro da distro é o
    // argumento do `--remote wsl+<distro>` do editor; errar aqui abre a pasta
    // errada, ou nenhuma.
    #[test]
    fn wsl_path_parts_splits_distro_and_posix_path() {
        assert_eq!(
            wsl_path_parts(Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x\repo")),
            Some(("Ubuntu-24.04".to_string(), "/home/x/repo".to_string()))
        );
        assert_eq!(
            wsl_path_parts(Path::new(r"\\wsl$\Ubuntu-24.04\home\x")),
            Some(("Ubuntu-24.04".to_string(), "/home/x".to_string()))
        );
        // Raiz da distro, sem cauda: o caminho lá dentro é `/`.
        assert_eq!(
            wsl_path_parts(Path::new(r"\\wsl.localhost\Ubuntu-24.04")),
            Some(("Ubuntu-24.04".to_string(), "/".to_string()))
        );
    }

    #[test]
    fn wsl_path_parts_returns_none_for_non_wsl_paths() {
        assert_eq!(wsl_path_parts(Path::new(r"C:\repos\x")), None);
        assert_eq!(wsl_path_parts(Path::new("/home/x/repo")), None);
        assert_eq!(wsl_path_parts(Path::new(r"\\wsl.localhost\\home\x")), None);
    }

    #[test]
    fn id_roundtrips_through_parse_id() {
        assert_eq!(
            TerminalProfile::parse_id(&TerminalProfile::Host.id()),
            Some(TerminalProfile::Host)
        );
        let wsl = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        assert_eq!(TerminalProfile::parse_id(&wsl.id()), Some(wsl));
    }

    #[test]
    fn parse_id_returns_none_for_unknown_string() {
        assert_eq!(TerminalProfile::parse_id("cmd"), None);
        assert_eq!(TerminalProfile::parse_id("wsl:"), None);
    }
}
