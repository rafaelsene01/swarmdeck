// SPEC: wsl-terminal-profile (WSLP-07, WSLP-08)
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

/// Deriva o perfil a partir do `cwd`: um caminho que nomeia uma distro
/// vence sobre o perfil padrão passado. Sem distro reconhecível, retorna
/// o `default` recebido — quem chama decide o que "padrão" significa.
pub fn profile_for_path(cwd: &Path, default: &TerminalProfile) -> TerminalProfile {
    let raw = cwd.to_string_lossy();
    for prefix in [r"\\wsl.localhost\", r"\\wsl$\"] {
        if let Some(rest) = raw.strip_prefix(prefix) {
            if let Some(distro) = rest.split('\\').next() {
                if !distro.is_empty() {
                    return TerminalProfile::Wsl {
                        distro: distro.to_string(),
                    };
                }
            }
        }
    }
    default.clone()
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
