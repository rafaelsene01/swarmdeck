// SPEC: silent-update (SILENT-09, SILENT-10, SILENT-11, SILENT-25)

//! Status de atualização: versão instalada e versão mais recente
//! publicada, exibidas mesmo quando são iguais (SILENT-09, SILENT-10,
//! SILENT-11) — ao contrário do antigo `UpdaterExt::check()`, que só
//! informava algo quando havia atualização.
//!
//! `status_with` é o núcleo puro (mesmo padrão de `quota.rs`): rede, banco
//! e `AppHandle` entram por parâmetro/closure, nunca hardcoded. `status`
//! (usado pelo comando `update_status`) sempre consulta, ignorando a
//! preferência de verificação automática — essa preferência só governa o
//! checador em segundo plano (`apply::check_only`, T6), que reusa
//! `status_with` passando o valor real lido do banco (SILENT-17).

use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use semver::Version;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use thiserror::Error;

use crate::db::{is_version_skipped, Db, DbError};
use crate::paths::{self, Flavor};
use crate::update::manifest::{self, Manifest, UpdateError as ManifestError};

/// Estado completo de atualização, devolvido mesmo quando não há nada de
/// novo — a UI precisa dos dois números (SILENT-09).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UpdateStatus {
    pub current: String,
    /// `None` só quando a consulta ao manifesto falhou (SILENT-25).
    pub latest: Option<String>,
    pub notes: String,
    pub has_update: bool,
    pub mode: &'static str,
    pub platform_key: String,
}

#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("banco de dados: {0}")]
    Db(#[from] DbError),
    #[error("não foi possível localizar o executável atual: {0}")]
    CurrentExe(#[source] std::io::Error),
    #[error("executável sem diretório pai")]
    NoExeDir,
}

/// Consulta o manifesto e devolve o status completo. Sempre ativo,
/// independente da preferência de verificação automática — quem chama
/// (comando `update_status`) é uma ação explícita do usuário.
pub async fn status(app: &AppHandle) -> Result<UpdateStatus, UpdateError> {
    status_gated(app, true).await
}

/// Mesmo caminho de `status`, mas com `auto_check_enabled` como parâmetro —
/// reaproveitado por `apply::check_only` (T6), que passa a preferência real
/// lida do banco em vez do `true` fixo de `status` (SILENT-17).
pub(crate) async fn status_gated(
    app: &AppHandle,
    auto_check_enabled: bool,
) -> Result<UpdateStatus, UpdateError> {
    let db_state = app.state::<Mutex<Db>>();
    let current_version = app.package_info().version.to_string();
    let flavor = paths::flavor(&exe_dir()?);
    let endpoint_url = endpoint(app);

    status_with(
        auto_check_enabled,
        &current_version,
        flavor,
        || manifest::fetch(&endpoint_url),
        |version| {
            let db = db_state.lock().expect("db mutex poisoned");
            is_version_skipped(db.conn(), version).map_err(UpdateError::from)
        },
    )
    .await
}

/// Núcleo testável: nenhuma dependência de `AppHandle`, banco ou rede —
/// tudo isso entra por parâmetro, para o teste substituir por um fake
/// (closures, sem trait nem mock de framework).
pub(crate) async fn status_with<F, Fut, S>(
    auto_check_enabled: bool,
    current_version: &str,
    flavor: Flavor,
    fetch_remote: F,
    is_skipped: S,
) -> Result<UpdateStatus, UpdateError>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<Manifest, ManifestError>>,
    S: FnOnce(&str) -> Result<bool, UpdateError>,
{
    let mode = match flavor {
        Flavor::Installed => "installed",
        Flavor::Portable => "portable",
    };
    let key = target_key(flavor);

    if !auto_check_enabled {
        return Ok(UpdateStatus {
            current: current_version.to_string(),
            latest: None,
            notes: String::new(),
            has_update: false,
            mode,
            platform_key: key,
        });
    }

    let manifest = match fetch_remote().await {
        Ok(manifest) => manifest,
        Err(err) => {
            eprintln!("swarmdeck: consulta de atualização falhou: {err}");
            return Ok(UpdateStatus {
                current: current_version.to_string(),
                latest: None,
                notes: String::new(),
                has_update: false,
                mode,
                platform_key: key,
            });
        }
    };

    let remote = Version::parse(manifest.version.trim_start_matches('v'));
    let current = Version::parse(current_version.trim_start_matches('v'));
    let (Ok(remote_v), Ok(current_v)) = (remote, current) else {
        eprintln!(
            "swarmdeck: versão de update fora do formato semver, tratando como sem atualização"
        );
        return Ok(UpdateStatus {
            current: current_version.to_string(),
            latest: Some(manifest.version),
            notes: manifest.notes,
            has_update: false,
            mode,
            platform_key: key,
        });
    };

    let skipped = is_skipped(&manifest.version)?;
    let has_update = remote_v > current_v && !skipped && manifest.platforms.contains_key(&key);

    Ok(UpdateStatus {
        current: current_version.to_string(),
        latest: Some(manifest.version),
        notes: manifest.notes,
        has_update,
        mode,
        platform_key: key,
    })
}

/// Chave do manifesto que representa o `flavor` atual. No Windows, os dois
/// flavors convergem para `{os}-{arch}-silent` — a troca de arquivo vale
/// para os dois (SILENT-05). Fora do Windows, o formato antigo se mantém:
/// `{os}-{arch}` para instalado, `{os}-{arch}-portable` para portátil —
/// caminho que continua no `tauri-plugin-updater` (SILENT-08).
pub(crate) fn target_key(flavor: Flavor) -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    if os == "windows" {
        format!("{os}-{arch}-silent")
    } else {
        match flavor {
            Flavor::Portable => format!("{os}-{arch}-portable"),
            Flavor::Installed => format!("{os}-{arch}"),
        }
    }
}

/// Lê o endpoint do manifesto de `tauri.conf.json` (`plugins.updater.endpoints[0]`).
pub(crate) fn endpoint(app: &AppHandle) -> String {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("endpoints"))
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Lê a chave pública minisign de `tauri.conf.json` (`plugins.updater.pubkey`)
/// — usada por `apply::run` (T7) para verificar a assinatura do artefato
/// baixado antes de trocar o executável.
pub(crate) fn pubkey(app: &AppHandle) -> String {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

fn exe_dir() -> Result<PathBuf, UpdateError> {
    let exe = std::env::current_exe().map_err(UpdateError::CurrentExe)?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or(UpdateError::NoExeDir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifest::PlatformEntry;
    use std::collections::HashMap;

    fn manifest(version: &str, entries: &[(&str, &str, &str)]) -> Manifest {
        let mut platforms = HashMap::new();
        for (key, url, signature) in entries {
            platforms.insert(
                key.to_string(),
                PlatformEntry {
                    url: url.to_string(),
                    signature: signature.to_string(),
                },
            );
        }
        Manifest {
            version: version.to_string(),
            notes: "notas".to_string(),
            platforms,
        }
    }

    fn never_skipped(_version: &str) -> Result<bool, UpdateError> {
        Ok(false)
    }

    // 1. auto_check desligado -> fetch_remote nunca chamado, latest: None.
    #[tokio::test]
    async fn auto_check_desligado_nao_sai_para_a_rede() {
        let result = status_with(
            false,
            "0.1.0",
            Flavor::Installed,
            || async { panic!("fetch_remote não deveria ser chamado com auto_check desligado") },
            never_skipped,
        )
        .await
        .unwrap();

        assert_eq!(result.latest, None);
        assert!(!result.has_update);
    }

    // 2. versão remota igual à instalada -> has_update:false E latest:Some(versão).
    #[tokio::test]
    async fn versao_remota_igual_a_instalada_reporta_latest_sem_atualizacao() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.1.0", &[(&key, "url", "sig")]);

        let result = status_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(m) },
            never_skipped,
        )
        .await
        .unwrap();

        assert!(!result.has_update);
        assert_eq!(result.latest, Some("0.1.0".to_string()));
    }

    // 3. versão remota menor que a instalada -> has_update:false, latest preenchido.
    #[tokio::test]
    async fn versao_remota_menor_que_a_instalada_nao_e_atualizacao() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.1.0", &[(&key, "url", "sig")]);

        let result = status_with(
            true,
            "0.2.0",
            Flavor::Installed,
            || async { Ok(m) },
            never_skipped,
        )
        .await
        .unwrap();

        assert!(!result.has_update);
        assert_eq!(result.latest, Some("0.1.0".to_string()));
    }

    // 4. versão remota maior, não pulada -> has_update:true, platform_key termina em -silent no Windows.
    #[tokio::test]
    async fn versao_remota_maior_e_nao_pulada_devolve_has_update_true() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.2.0", &[(&key, "https://exemplo/app.exe", "assinatura")]);

        let result = status_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(m) },
            never_skipped,
        )
        .await
        .unwrap();

        assert!(result.has_update);
        assert_eq!(result.latest, Some("0.2.0".to_string()));
        #[cfg(windows)]
        assert!(result.platform_key.ends_with("-silent"));
    }

    // 5. versão remota maior, mas pulada -> has_update:false, latest preenchido.
    #[tokio::test]
    async fn versao_remota_maior_mas_pulada_nao_e_atualizacao() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.2.0", &[(&key, "url", "sig")]);

        let result = status_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(m) },
            |version| Ok(version == "0.2.0"),
        )
        .await
        .unwrap();

        assert!(!result.has_update);
        assert_eq!(result.latest, Some("0.2.0".to_string()));
    }

    // 6. erro na consulta remota -> latest:None, has_update:false, sem propagar Err.
    #[tokio::test]
    async fn erro_na_consulta_remota_nao_propaga_e_vira_latest_none() {
        let result = status_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Err(ManifestError::Network("rede indisponível".to_string())) },
            never_skipped,
        )
        .await
        .unwrap();

        assert_eq!(result.latest, None);
        assert!(!result.has_update);
    }

    // 7. flavor escolhido bate com o modo — no Windows os dois convergem para -silent.
    #[tokio::test]
    async fn flavor_escolhe_a_entrada_certa_do_manifesto() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.2.0", &[(&key, "url-silencioso", "sig-silencioso")]);
        let m_clone = m.clone();

        let installed = status_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(m) },
            never_skipped,
        )
        .await
        .unwrap();
        assert_eq!(installed.mode, "installed");
        assert!(installed.has_update);

        let portable = status_with(
            true,
            "0.1.0",
            Flavor::Portable,
            || async { Ok(m_clone) },
            never_skipped,
        )
        .await
        .unwrap();
        assert_eq!(portable.mode, "portable");
        #[cfg(windows)]
        assert!(
            portable.has_update,
            "no Windows os dois flavors convergem para a mesma chave -silent"
        );
    }

    // 8. versão remota fora do formato semver -> latest preenchido, has_update:false.
    #[tokio::test]
    async fn versao_remota_fora_do_formato_semver_preserva_latest_sem_atualizacao() {
        let m = manifest("nao-e-semver", &[]);

        let result = status_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(m) },
            never_skipped,
        )
        .await
        .unwrap();

        assert_eq!(result.latest, Some("nao-e-semver".to_string()));
        assert!(!result.has_update);
    }

    // 9. entrada de plataforma ausente no manifesto -> has_update:false mesmo com versão maior e não pulada.
    #[tokio::test]
    async fn sem_entrada_de_plataforma_no_manifesto_nao_e_atualizacao() {
        let m = manifest("0.2.0", &[("outra-plataforma", "url", "sig")]);

        let result = status_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(m) },
            never_skipped,
        )
        .await
        .unwrap();

        assert!(!result.has_update);
        assert_eq!(result.latest, Some("0.2.0".to_string()));
    }

    // 10. is_skipped falhando propaga Err (falha de banco, distinta de falha de rede).
    #[tokio::test]
    async fn falha_ao_consultar_skipped_versions_propaga_err() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.2.0", &[(&key, "url", "sig")]);

        let result = status_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(m) },
            |_version| {
                Err(UpdateError::Db(DbError::Sqlite(
                    rusqlite::Error::InvalidParameterName("conexão indisponível".to_string()),
                )))
            },
        )
        .await;

        assert!(result.is_err());
    }
}
