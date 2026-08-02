// SPEC: release-distribution (REL-19, REL-21, REL-24)

//! Verificação silenciosa de atualização no boot do app.
//!
//! `check` nunca bloqueia a UI (é `async`, chamada dentro do runtime do
//! Tauri) e nunca propaga erro de rede para quem a chama no boot — qualquer
//! falha de rede ou do plugin vira `Ok(None)` com um log (REL-19). Nenhuma
//! atualização visível quando não há nada mais novo é o resultado esperado
//! (REL-21), não um caso de erro.
//!
//! A comparação de versão, a checagem de `skippedVersions` e a escolha da
//! entrada do manifesto pelo `flavor` (T13) são lógica pura em
//! [`check_with`] — testável sem tocar rede nem o plugin do Tauri, via os
//! parâmetros `fetch_remote`/`is_skipped` injetáveis.

use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use semver::Version;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;
use thiserror::Error;

use crate::db::{auto_check, is_version_skipped, Db, DbError};
use crate::paths::{self, Flavor};

/// Atualização publicada, já resolvida para a entrada de manifesto certa
/// pelo `flavor` de quem chamou `check`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
    /// Chave do manifesto escolhida (ex.: `windows-x86_64-portable`).
    pub flavor: String,
    pub download_url: String,
    pub signature: String,
}

#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("banco de dados: {0}")]
    Db(#[from] DbError),
    #[error("não foi possível localizar o executável atual: {0}")]
    CurrentExe(#[source] std::io::Error),
    #[error("executável sem diretório pai")]
    NoExeDir,
    #[error("falha ao consultar o plugin de update: {0}")]
    Plugin(String),
    #[error("manifesto de update mal formado")]
    MalformedManifest,
}

/// Manifesto remoto já desserializado, independente do `flavor` de quem
/// consultou.
#[derive(Debug, Clone)]
struct RemoteManifest {
    version: String,
    notes: String,
    platforms: HashMap<String, PlatformEntry>,
}

#[derive(Debug, Clone)]
struct PlatformEntry {
    url: String,
    signature: String,
}

/// Verificação silenciosa: consulta o endpoint configurado em
/// `tauri.conf.json` via `tauri-plugin-updater` e devolve `Some` só quando
/// há, de fato, algo novo para mostrar ao usuário.
///
/// Fronteira de erro (decisão desta task): um erro de rede ou do plugin
/// vira `Ok(None)` aqui — quem chama `check` no boot nunca recebe `Err`
/// (REL-19). Quem precisar saber que a consulta falhou de verdade (um
/// futuro botão "Verificar agora" manual) chama `fetch_remote_manifest`
/// diretamente e trata o `Err` — essa função continua privada a este
/// módulo porque nenhuma tarefa aprovada ainda a expõe.
pub async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, UpdateError> {
    let db_state = app.state::<Mutex<Db>>();

    let auto_check_enabled = {
        let db = db_state.lock().expect("db mutex poisoned");
        auto_check(db.conn())?
    };

    let current_version = app.package_info().version.to_string();
    let flavor = paths::flavor(&exe_dir()?);

    check_with(
        auto_check_enabled,
        &current_version,
        flavor,
        || fetch_remote_manifest(app),
        |version| {
            let db = db_state.lock().expect("db mutex poisoned");
            is_version_skipped(db.conn(), version).map_err(UpdateError::from)
        },
    )
    .await
}

/// Núcleo testável de `check`: nenhuma dependência de `AppHandle`, banco ou
/// rede — tudo isso entra por parâmetro, para o teste substituir por um
/// fake (closures, sem trait nem mock de framework).
async fn check_with<F, Fut, S>(
    auto_check_enabled: bool,
    current_version: &str,
    flavor: Flavor,
    fetch_remote: F,
    is_skipped: S,
) -> Result<Option<UpdateInfo>, UpdateError>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<Option<RemoteManifest>, UpdateError>>,
    S: FnOnce(&str) -> Result<bool, UpdateError>,
{
    if !auto_check_enabled {
        return Ok(None);
    }

    let manifest = match fetch_remote().await {
        Ok(Some(manifest)) => manifest,
        Ok(None) => return Ok(None),
        Err(err) => {
            eprintln!(
                "swarmdeck: verificação de atualização falhou, tratando como sem atualização: {err}"
            );
            return Ok(None);
        }
    };

    let remote = Version::parse(manifest.version.trim_start_matches('v'));
    let current = Version::parse(current_version.trim_start_matches('v'));
    let (Ok(remote), Ok(current)) = (remote, current) else {
        eprintln!(
            "swarmdeck: versão de update fora do formato semver, tratando como sem atualização"
        );
        return Ok(None);
    };

    if remote <= current {
        return Ok(None);
    }

    if is_skipped(&manifest.version)? {
        return Ok(None);
    }

    let key = target_key(flavor);
    let Some(entry) = manifest.platforms.get(&key) else {
        return Ok(None);
    };

    Ok(Some(UpdateInfo {
        version: manifest.version,
        notes: manifest.notes,
        flavor: key,
        download_url: entry.url.clone(),
        signature: entry.signature.clone(),
    }))
}

/// Chave do manifesto que representa o `flavor` atual, no mesmo formato
/// que o `tauri-action`/`patch-latest-json.mjs` escrevem: `{os}-{arch}`
/// para o modo instalado, `{os}-{arch}-portable` para o portátil.
fn target_key(flavor: Flavor) -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    match flavor {
        Flavor::Portable => format!("{os}-{arch}-portable"),
        Flavor::Installed => format!("{os}-{arch}"),
    }
}

/// Fala de verdade com o `tauri-plugin-updater`. `update.raw_json` carrega
/// o manifesto inteiro (todas as entradas de `platforms`) mesmo já tendo o
/// plugin escolhido uma pelo par SO/arquitetura internamente — é dali que
/// `check_with` escolhe a entrada certa pelo `flavor` (T13), não da escolha
/// interna do plugin.
async fn fetch_remote_manifest(app: &AppHandle) -> Result<Option<RemoteManifest>, UpdateError> {
    let updater = app
        .updater()
        .map_err(|err| UpdateError::Plugin(err.to_string()))?;

    let update = updater
        .check()
        .await
        .map_err(|err| UpdateError::Plugin(err.to_string()))?;

    let Some(update) = update else {
        return Ok(None);
    };

    Ok(Some(RemoteManifest {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
        platforms: parse_platforms(&update.raw_json)?,
    }))
}

fn parse_platforms(raw: &Value) -> Result<HashMap<String, PlatformEntry>, UpdateError> {
    let platforms = raw
        .get("platforms")
        .and_then(Value::as_object)
        .ok_or(UpdateError::MalformedManifest)?;

    let mut map = HashMap::with_capacity(platforms.len());
    for (key, value) in platforms {
        let url = value
            .get("url")
            .and_then(Value::as_str)
            .ok_or(UpdateError::MalformedManifest)?
            .to_string();
        let signature = value
            .get("signature")
            .and_then(Value::as_str)
            .ok_or(UpdateError::MalformedManifest)?
            .to_string();
        map.insert(key.clone(), PlatformEntry { url, signature });
    }
    Ok(map)
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

    fn manifest(version: &str, entries: &[(&str, &str, &str)]) -> RemoteManifest {
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
        RemoteManifest {
            version: version.to_string(),
            notes: "notas".to_string(),
            platforms,
        }
    }

    fn never_skipped(_version: &str) -> Result<bool, UpdateError> {
        Ok(false)
    }

    // 1. auto_check desligado -> Ok(None), fetch_remote nunca chamado.
    #[tokio::test]
    async fn auto_check_desligado_nao_sai_para_a_rede() {
        let result = check_with(
            false,
            "0.1.0",
            Flavor::Installed,
            || async { panic!("fetch_remote não deveria ser chamado com auto_check desligado") },
            never_skipped,
        )
        .await
        .unwrap();

        assert_eq!(result, None);
    }

    // 2. versão remota igual à instalada -> Ok(None).
    #[tokio::test]
    async fn versao_remota_igual_a_instalada_nao_e_atualizacao() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.1.0", &[(&key, "url", "sig")]);

        let result = check_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(Some(m)) },
            never_skipped,
        )
        .await
        .unwrap();

        assert_eq!(result, None);
    }

    // 3. versão remota menor que a instalada -> Ok(None).
    #[tokio::test]
    async fn versao_remota_menor_que_a_instalada_nao_e_atualizacao() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.1.0", &[(&key, "url", "sig")]);

        let result = check_with(
            true,
            "0.2.0",
            Flavor::Installed,
            || async { Ok(Some(m)) },
            never_skipped,
        )
        .await
        .unwrap();

        assert_eq!(result, None);
    }

    // 4. versão remota maior, não pulada -> Some(UpdateInfo) com os campos certos.
    #[tokio::test]
    async fn versao_remota_maior_e_nao_pulada_devolve_update_info() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.2.0", &[(&key, "https://exemplo/app.exe", "assinatura")]);

        let result = check_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(Some(m)) },
            never_skipped,
        )
        .await
        .unwrap();

        assert_eq!(
            result,
            Some(UpdateInfo {
                version: "0.2.0".to_string(),
                notes: "notas".to_string(),
                flavor: key,
                download_url: "https://exemplo/app.exe".to_string(),
                signature: "assinatura".to_string(),
            })
        );
    }

    // 5. versão remota maior, mas presente em skipped_versions -> Ok(None).
    #[tokio::test]
    async fn versao_remota_maior_mas_pulada_nao_e_atualizacao() {
        let key = target_key(Flavor::Installed);
        let m = manifest("0.2.0", &[(&key, "url", "sig")]);

        let result = check_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(Some(m)) },
            |version| Ok(version == "0.2.0"),
        )
        .await
        .unwrap();

        assert_eq!(result, None);
    }

    // 6. erro simulado na consulta remota -> Ok(None), sem propagar Err.
    #[tokio::test]
    async fn erro_na_consulta_remota_nao_propaga_e_vira_none() {
        let result = check_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Err(UpdateError::Plugin("rede indisponível".to_string())) },
            never_skipped,
        )
        .await
        .unwrap();

        assert_eq!(result, None);
    }

    // 7. flavor escolhido bate com o modo (instalado vs portátil): dado um
    // manifesto com as duas entradas, cada flavor escolhe a sua.
    #[tokio::test]
    async fn flavor_escolhe_a_entrada_certa_do_manifesto() {
        let installed_key = target_key(Flavor::Installed);
        let portable_key = target_key(Flavor::Portable);
        let m = manifest(
            "0.2.0",
            &[
                (&installed_key, "url-instalado", "sig-instalado"),
                (&portable_key, "url-portatil", "sig-portatil"),
            ],
        );
        let m_clone = m.clone();

        let installed = check_with(
            true,
            "0.1.0",
            Flavor::Installed,
            || async { Ok(Some(m)) },
            never_skipped,
        )
        .await
        .unwrap()
        .expect("deve haver atualização para o modo instalado");
        assert_eq!(installed.download_url, "url-instalado");

        let portable = check_with(
            true,
            "0.1.0",
            Flavor::Portable,
            || async { Ok(Some(m_clone)) },
            never_skipped,
        )
        .await
        .unwrap()
        .expect("deve haver atualização para o modo portátil");
        assert_eq!(portable.download_url, "url-portatil");
    }
}
