// SPEC: wsl-terminal-profile (WSLP-01, WSLP-16, WSLP-17, WSLP-18, WSLP-19, WSLP-20)
// SPEC: terminal-boot-loading (BOOT-01)

//! Enumera os perfis selecionáveis: `Host` sempre primeiro, seguido de uma
//! entrada por distro WSL registrada. `parse_distro_list` é o núcleo puro
//! (decodifica UTF-16LE, ignora o cabeçalho, descarta as distros internas
//! do Docker Desktop); `list_profiles` é o único ponto que chama
//! `wsl.exe -l -v`, e devolve `Host` sozinho sem erro quando o binário
//! falta, falha, ou o alvo não é Windows.

use serde::Serialize;

use super::TerminalProfile;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DistroEntry {
    pub name: String,
    pub wsl1: bool,
}

/// Espelha `ProfileEntry` do `design.md` (IPC payload) — ver
/// `commands::shells::shell_profiles_list`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntry {
    pub id: String,
    pub label: String,
    pub wsl1: bool,
}

/// Decodifica `wsl.exe -l -v` (UTF-16LE, `\r\n`), pula a linha de
/// cabeçalho e descarta `docker-desktop` / `docker-desktop-data`.
pub fn parse_distro_list(raw: &[u8]) -> Vec<DistroEntry> {
    let text = decode_utf16le(raw);
    let mut entries = Vec::new();
    for line in text.lines() {
        let line = line.trim_end_matches('\r').trim();
        if line.is_empty() {
            continue;
        }
        let upper = line.to_ascii_uppercase();
        if upper.contains("NAME") && upper.contains("STATE") {
            continue;
        }
        let line = line.trim_start_matches('*').trim();
        let tokens: Vec<&str> = line.split_whitespace().collect();
        let (name, version) = match tokens.as_slice() {
            [name, _state, version] => (*name, *version),
            _ => continue,
        };
        if name == "docker-desktop" || name == "docker-desktop-data" {
            continue;
        }
        entries.push(DistroEntry {
            name: name.to_string(),
            wsl1: version == "1",
        });
    }
    entries
}

fn decode_utf16le(raw: &[u8]) -> String {
    let mut units: Vec<u16> = raw
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| u16::from_le_bytes(*pair))
        .collect();
    if units.first() == Some(&0xFEFF) {
        units.remove(0);
    }
    String::from_utf16_lossy(&units)
}

#[cfg_attr(not(windows), allow(dead_code))]
fn label_for(name: &str, wsl1: bool) -> String {
    if wsl1 {
        format!("{name} (WSL1)")
    } else {
        name.to_string()
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn profile_entry_for(entry: &DistroEntry) -> ProfileEntry {
    ProfileEntry {
        id: TerminalProfile::Wsl {
            distro: entry.name.clone(),
        }
        .id(),
        label: label_for(&entry.name, entry.wsl1),
        wsl1: entry.wsl1,
    }
}

fn host_entry() -> ProfileEntry {
    ProfileEntry {
        id: TerminalProfile::Host.id(),
        label: "Windows (padrão)".to_string(),
        wsl1: false,
    }
}

/// Sempre inclui `Host` primeiro. Nenhum erro sobe daqui: um `wsl.exe`
/// ausente ou que falhe apenas deixa a lista com um único item.
pub fn list_profiles() -> Vec<ProfileEntry> {
    let mut profiles = vec![host_entry()];
    profiles.extend(wsl_profiles());
    profiles
}

#[cfg(windows)]
fn wsl_profiles() -> Vec<ProfileEntry> {
    let mut cmd = std::process::Command::new("wsl.exe");
    cmd.args(["-l", "-v"]);
    // BOOT-01: was the only site with the flag inline; now shares `proc`.
    let output = match crate::proc::hide_console(&mut cmd).output() {
        Ok(out) if out.status.success() => out,
        _ => return Vec::new(),
    };
    parse_distro_list(&output.stdout)
        .iter()
        .map(profile_entry_for)
        .collect()
}

#[cfg(not(windows))]
fn wsl_profiles() -> Vec<ProfileEntry> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16le_bytes(text: &str) -> Vec<u8> {
        text.encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect()
    }

    #[test]
    fn parse_distro_list_parses_fixture_dropping_docker() {
        let fixture = "NAME                   STATE           VERSION\r\n\
                        * Ubuntu-24.04           Running         2\r\n\
                        docker-desktop         Stopped         2\r\n";
        let entries = parse_distro_list(&utf16le_bytes(fixture));
        assert_eq!(
            entries,
            vec![DistroEntry {
                name: "Ubuntu-24.04".to_string(),
                wsl1: false,
            }]
        );
    }

    #[test]
    fn parse_distro_list_marks_version_1_as_wsl1() {
        let fixture = "NAME                   STATE           VERSION\r\n\
                        Ubuntu-20.04           Stopped         1\r\n";
        let entries = parse_distro_list(&utf16le_bytes(fixture));
        assert_eq!(
            entries,
            vec![DistroEntry {
                name: "Ubuntu-20.04".to_string(),
                wsl1: true,
            }]
        );
    }

    #[test]
    fn label_for_appends_wsl1_suffix_only_when_flagged() {
        assert_eq!(label_for("Ubuntu-20.04", true), "Ubuntu-20.04 (WSL1)");
        assert_eq!(label_for("Ubuntu-24.04", false), "Ubuntu-24.04");
    }

    #[test]
    fn parse_distro_list_drops_both_docker_desktop_variants() {
        let fixture = "NAME                   STATE           VERSION\r\n\
                        docker-desktop         Stopped         2\r\n\
                        docker-desktop-data    Stopped         2\r\n";
        assert_eq!(parse_distro_list(&utf16le_bytes(fixture)), Vec::new());
    }

    #[test]
    fn parse_distro_list_returns_empty_for_empty_input() {
        assert_eq!(parse_distro_list(&[]), Vec::new());
    }

    #[test]
    fn parse_distro_list_returns_empty_for_header_only_input() {
        let fixture = "NAME                   STATE           VERSION\r\n";
        assert_eq!(parse_distro_list(&utf16le_bytes(fixture)), Vec::new());
    }

    #[test]
    fn list_profiles_returns_host_alone_without_wsl() {
        let profiles = list_profiles();
        assert_eq!(profiles, vec![host_entry()]);
    }
}
