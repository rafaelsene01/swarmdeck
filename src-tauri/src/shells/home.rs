// SPEC: quota-indicator (QUOTA-15, QUOTA-18, QUOTA-20)

//! Diretório home de uma distro WSL, em forma UNC.
//!
//! Existe porque `dirs::home_dir()` responde pelo **host**: num Windows cujo
//! Claude Code está instalado dentro da distro, `~/.claude/.credentials.json`
//! nunca existe em `C:\Users\<user>` e a cota ficava permanentemente em
//! `no_credential`.
//!
//! Mesmo desenho de `shells::wrap::login_path`: uma sonda `wsl.exe` por
//! distro, cacheada pelo tempo de vida do processo, com o núcleo puro
//! separado para ser testável sem WSL de verdade. A conversão para UNC segue
//! AD-026 — o app guarda e entrega caminhos em forma Windows, e é o
//! `\\wsl.localhost\` que atravessa para dentro da distro.

use std::path::PathBuf;
#[cfg(windows)]
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

/// Monta o caminho UNC do `HOME` de uma distro. Puro.
///
/// `\\wsl.localhost\<distro>\<home sem a barra inicial, com `\`>`.
/// `None` quando `linux_home` é vazio ou é a própria raiz (`/`): não há
/// subdiretório de usuário a apontar, e `\\wsl.localhost\<distro>\` sozinho
/// não identifica home nenhum.
pub fn unc_home(distro: &str, linux_home: &str) -> Option<PathBuf> {
    let relative = linux_home.trim().trim_start_matches('/').replace('/', "\\");
    let relative = relative.trim_end_matches('\\');
    if relative.is_empty() {
        return None;
    }
    Some(PathBuf::from(format!(
        r"\\wsl.localhost\{distro}\{relative}"
    )))
}

#[cfg(windows)]
fn home_cache() -> &'static Mutex<HashMap<String, Option<PathBuf>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<PathBuf>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `HOME` da distro em forma UNC, cacheado pelo tempo de vida do processo.
/// `None` quando a sonda falha ou o valor devolvido não nomeia um
/// subdiretório. Sem efeito fora de Windows, pelo mesmo motivo de
/// `wrap::login_path`: rodando *dentro* de um WSL2, o `wsl.exe` do host fica
/// acessível por interop e o resultado passaria a depender da máquina.
#[cfg(windows)]
pub fn wsl_home(distro: &str) -> Option<PathBuf> {
    let cache = home_cache();
    if let Some(cached) = cache.lock().unwrap().get(distro) {
        return cached.clone();
    }
    let value = fetch_home(distro);
    cache
        .lock()
        .unwrap()
        .insert(distro.to_string(), value.clone());
    value
}

#[cfg(not(windows))]
pub fn wsl_home(_distro: &str) -> Option<PathBuf> {
    None
}

/// `printenv HOME` sob shell de login: é o login que define `HOME` para o
/// usuário padrão da distro, e é esse usuário que rodou `claude login`.
#[cfg(windows)]
fn fetch_home(distro: &str) -> Option<PathBuf> {
    let mut cmd = std::process::Command::new("wsl.exe");
    cmd.args(["-d", distro, "--", "bash", "-lc", "printenv HOME"]);
    // BOOT-01: sem janela de console.
    let output = crate::proc::hide_console(&mut cmd).output().ok()?;
    if !output.status.success() {
        return None;
    }
    unc_home(distro, &String::from_utf8(output.stdout).ok()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unc_home_monta_o_caminho_a_partir_do_home_linux() {
        assert_eq!(
            unc_home("Ubuntu-24.04", "/home/sene"),
            Some(PathBuf::from(r"\\wsl.localhost\Ubuntu-24.04\home\sene"))
        );
    }

    // O `printenv` devolve com `\n`; o valor cru entra aqui sem tratamento
    // prévio, então o `trim` precisa morar nesta função.
    #[test]
    fn unc_home_ignora_espaco_e_quebra_de_linha_ao_redor() {
        assert_eq!(
            unc_home("Ubuntu-24.04", "  /home/sene\n"),
            Some(PathBuf::from(r"\\wsl.localhost\Ubuntu-24.04\home\sene"))
        );
    }

    #[test]
    fn unc_home_aceita_home_de_um_nivel() {
        assert_eq!(
            unc_home("Ubuntu-24.04", "/root"),
            Some(PathBuf::from(r"\\wsl.localhost\Ubuntu-24.04\root"))
        );
    }

    #[test]
    fn unc_home_recusa_vazio_e_raiz() {
        assert_eq!(unc_home("Ubuntu-24.04", ""), None);
        assert_eq!(unc_home("Ubuntu-24.04", "   "), None);
        assert_eq!(unc_home("Ubuntu-24.04", "/"), None);
        assert_eq!(unc_home("Ubuntu-24.04", "///"), None);
    }

    #[test]
    fn unc_home_preserva_espaco_no_nome_do_diretorio() {
        assert_eq!(
            unc_home("Ubuntu-24.04", "/home/a b"),
            Some(PathBuf::from(r"\\wsl.localhost\Ubuntu-24.04\home\a b"))
        );
    }

    #[test]
    fn wsl_home_fora_de_windows_ou_sem_a_distro_devolve_none() {
        assert_eq!(wsl_home("Unknown-Distro-For-Test"), None);
    }
}
