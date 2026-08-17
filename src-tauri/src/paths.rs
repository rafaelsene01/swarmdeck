// SPEC: release-distribution (REL-16, REL-17, REL-18)

//! Única autoridade sobre onde os dados do SwarmDeck moram.
//!
//! Modo portátil (marcador `.portable` ao lado do executável): os dados
//! ficam numa pasta `data` também ao lado do executável. Modo instalado:
//! os dados ficam no diretório de dados do SO (`app_data_dir()`). Nenhum
//! outro ponto do código deve montar esse caminho — quem precisa do banco
//! chama `db_path`.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use thiserror::Error;

const PORTABLE_MARKER: &str = ".portable";
const DB_FILE_NAME: &str = "swarmdeck.sqlite";

/// Modo em que o app está rodando.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flavor {
    Installed,
    Portable,
}

#[derive(Debug, Error)]
pub enum PathError {
    #[error("não foi possível localizar o executável atual: {0}")]
    CurrentExe(#[source] std::io::Error),
    #[error("executável sem diretório pai")]
    NoExeDir,
    #[error("não foi possível resolver o diretório de dados do SO: {0}")]
    AppDataDir(#[source] tauri::Error),
    #[error("não foi possível criar o diretório de dados em {path}: {source}")]
    CreateDataDir {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Decide o `Flavor` a partir do diretório onde o executável mora:
/// `Portable` quando existe o marcador `.portable` ali, `Installed` caso
/// contrário.
pub fn flavor(exe_dir: &Path) -> Flavor {
    if exe_dir.join(PORTABLE_MARKER).is_file() {
        Flavor::Portable
    } else {
        Flavor::Installed
    }
}

fn current_exe_dir() -> Result<PathBuf, PathError> {
    let exe = std::env::current_exe().map_err(PathError::CurrentExe)?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or(PathError::NoExeDir)
}

/// Núcleo testável de `data_dir`: recebe o diretório do executável e uma
/// forma de obter o diretório de dados do SO (só invocada no modo
/// instalado, nunca no portátil). Cria o diretório resolvido se ele ainda
/// não existir.
fn resolve_data_dir(
    exe_dir: &Path,
    installed_dir: impl FnOnce() -> Result<PathBuf, PathError>,
) -> Result<PathBuf, PathError> {
    let dir = match flavor(exe_dir) {
        Flavor::Portable => exe_dir.join("data"),
        Flavor::Installed => installed_dir()?,
    };
    fs::create_dir_all(&dir).map_err(|source| PathError::CreateDataDir {
        path: dir.clone(),
        source,
    })?;
    Ok(dir)
}

fn resolve_db_path(
    exe_dir: &Path,
    installed_dir: impl FnOnce() -> Result<PathBuf, PathError>,
) -> Result<PathBuf, PathError> {
    Ok(resolve_data_dir(exe_dir, installed_dir)?.join(DB_FILE_NAME))
}

/// Diretório onde o banco e a configuração do app moram: `<exe_dir>/data`
/// no modo portátil, `app_data_dir()` no modo instalado.
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, PathError> {
    let exe_dir = current_exe_dir()?;
    resolve_data_dir(&exe_dir, || {
        app.path().app_data_dir().map_err(PathError::AppDataDir)
    })
}

/// Caminho do arquivo SQLite dentro do diretório de dados resolvido.
pub fn db_path(app: &AppHandle) -> Result<PathBuf, PathError> {
    let exe_dir = current_exe_dir()?;
    resolve_db_path(&exe_dir, || {
        app.path().app_data_dir().map_err(PathError::AppDataDir)
    })
}

/// `true` quando `dir` aceita escrita. Usado pela atualização antes de
/// baixar qualquer coisa, para reprovar pasta somente-leitura cedo
/// (SILENT-24).
pub fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".swarmdeck-write-check");
    match fs::write(&probe, b"") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_writable_reprova_diretorio_somente_leitura() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path();

        deny_write(path);
        let result = is_writable(path);
        allow_write(path);

        assert!(
            !result,
            "diretório somente-leitura deveria reprovar is_writable"
        );
    }

    #[cfg(unix)]
    fn deny_write(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o555);
        fs::set_permissions(path, perms).unwrap();
    }

    #[cfg(unix)]
    fn allow_write(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms).unwrap();
    }

    #[cfg(windows)]
    fn deny_write(path: &Path) {
        let status = std::process::Command::new("icacls")
            .arg(path)
            .arg("/deny")
            .arg("*S-1-1-0:(OI)(CI)W")
            .status()
            .expect("falha ao invocar icacls");
        assert!(status.success(), "icacls /deny falhou");
    }

    #[cfg(windows)]
    fn allow_write(path: &Path) {
        let _ = std::process::Command::new("icacls")
            .arg(path)
            .arg("/remove:d")
            .arg("*S-1-1-0")
            .status();
    }

    #[test]
    fn flavor_retorna_portable_quando_o_marcador_existe() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(PORTABLE_MARKER), b"").unwrap();

        assert_eq!(flavor(dir.path()), Flavor::Portable);
    }

    #[test]
    fn flavor_retorna_installed_quando_o_marcador_nao_existe() {
        let dir = tempfile::tempdir().unwrap();

        assert_eq!(flavor(dir.path()), Flavor::Installed);
    }

    #[test]
    fn resolve_data_dir_usa_pasta_data_ao_lado_do_executavel_no_portatil() {
        let exe_dir = tempfile::tempdir().unwrap();
        fs::write(exe_dir.path().join(PORTABLE_MARKER), b"").unwrap();

        // O closure do modo instalado nunca deve ser chamado no portátil —
        // se for, o teste falha aqui em vez de silenciosamente divergir.
        let resolved = resolve_data_dir(exe_dir.path(), || {
            panic!("installed_dir não deveria ser chamado em modo portátil")
        })
        .unwrap();

        assert_eq!(resolved, exe_dir.path().join("data"));
    }

    #[test]
    fn resolve_data_dir_usa_o_diretorio_do_so_quando_instalado() {
        let exe_dir = tempfile::tempdir().unwrap();
        let os_data_dir = tempfile::tempdir().unwrap();
        let expected = os_data_dir.path().join("swarmdeck-app-data");

        let resolved = resolve_data_dir(exe_dir.path(), || Ok(expected.clone())).unwrap();

        assert_eq!(resolved, expected);
    }

    #[test]
    fn resolve_db_path_junta_swarmdeck_sqlite_e_cria_o_diretorio_se_faltar() {
        let exe_dir = tempfile::tempdir().unwrap();
        fs::write(exe_dir.path().join(PORTABLE_MARKER), b"").unwrap();
        let expected_dir = exe_dir.path().join("data");
        assert!(
            !expected_dir.exists(),
            "pré-condição: a pasta data ainda não existe"
        );

        let resolved = resolve_db_path(exe_dir.path(), || unreachable!()).unwrap();

        assert_eq!(resolved, expected_dir.join(DB_FILE_NAME));
        assert!(
            expected_dir.is_dir(),
            "resolve_db_path deve criar o diretório de dados"
        );
    }
}
