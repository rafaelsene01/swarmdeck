// SPEC: silent-update (SILENT-01, SILENT-21)

//! Manifesto de atualização (`latest.json`): um único caminho HTTP,
//! consumido tanto pela exibição de versão quanto pela decisão de
//! atualizar (SILENT-01). `parse_manifest` é puro e testável com fixture;
//! `fetch` é o único ponto de rede do módulo.

use std::collections::HashMap;

use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("manifesto de update mal formado")]
    MalformedManifest,
    #[error("falha ao consultar o manifesto de update: {0}")]
    Network(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlatformEntry {
    pub url: String,
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Manifest {
    pub version: String,
    pub notes: String,
    pub platforms: HashMap<String, PlatformEntry>,
}

/// Decodifica o JSON bruto do `latest.json`. Puro — nenhum I/O.
pub fn parse_manifest(raw: &str) -> Result<Manifest, UpdateError> {
    let value: Value = serde_json::from_str(raw).map_err(|_| UpdateError::MalformedManifest)?;

    let version = value
        .get("version")
        .and_then(Value::as_str)
        .ok_or(UpdateError::MalformedManifest)?
        .to_string();
    let notes = value
        .get("notes")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let platforms_raw = value
        .get("platforms")
        .and_then(Value::as_object)
        .ok_or(UpdateError::MalformedManifest)?;

    let mut platforms = HashMap::with_capacity(platforms_raw.len());
    for (key, entry) in platforms_raw {
        let url = entry
            .get("url")
            .and_then(Value::as_str)
            .ok_or(UpdateError::MalformedManifest)?
            .to_string();
        let signature = entry
            .get("signature")
            .and_then(Value::as_str)
            .ok_or(UpdateError::MalformedManifest)?
            .to_string();
        platforms.insert(key.clone(), PlatformEntry { url, signature });
    }

    Ok(Manifest {
        version,
        notes,
        platforms,
    })
}

/// Único ponto de rede do módulo: GET do endpoint configurado, parse via
/// [`parse_manifest`].
pub async fn fetch(endpoint: &str) -> Result<Manifest, UpdateError> {
    let body = reqwest::get(endpoint)
        .await
        .map_err(|err| UpdateError::Network(err.to_string()))?
        .text()
        .await
        .map_err(|err| UpdateError::Network(err.to_string()))?;

    parse_manifest(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"{
        "version": "0.2.0",
        "notes": "notas da versão",
        "platforms": {
            "windows-x86_64": { "url": "https://exemplo/instalado.exe", "signature": "sig-instalado" },
            "windows-x86_64-portable": { "url": "https://exemplo/portatil.zip", "signature": "sig-portatil" },
            "windows-x86_64-silent": { "url": "https://exemplo/silencioso.exe", "signature": "sig-silencioso" }
        }
    }"#;

    // 1. fixture completa -> version, notes e as três entradas de platforms.
    #[test]
    fn fixture_completa_devolve_version_notes_e_todas_entradas_de_platforms() {
        let manifest = parse_manifest(FIXTURE).expect("fixture válida deve parsear");

        assert_eq!(manifest.version, "0.2.0");
        assert_eq!(manifest.notes, "notas da versão");
        assert_eq!(manifest.platforms.len(), 3);
        assert_eq!(
            manifest.platforms["windows-x86_64"],
            PlatformEntry {
                url: "https://exemplo/instalado.exe".to_string(),
                signature: "sig-instalado".to_string(),
            }
        );
        assert_eq!(
            manifest.platforms["windows-x86_64-portable"].url,
            "https://exemplo/portatil.zip"
        );
        assert_eq!(
            manifest.platforms["windows-x86_64-silent"].url,
            "https://exemplo/silencioso.exe"
        );
    }

    // 2. JSON sem platforms -> Err.
    #[test]
    fn json_sem_platforms_devolve_err() {
        let raw = r#"{ "version": "0.2.0", "notes": "" }"#;
        assert!(matches!(
            parse_manifest(raw),
            Err(UpdateError::MalformedManifest)
        ));
    }

    // 3. entrada de platform sem url -> Err.
    #[test]
    fn entrada_sem_url_devolve_err() {
        let raw = r#"{
            "version": "0.2.0",
            "platforms": { "windows-x86_64": { "signature": "sig" } }
        }"#;
        assert!(matches!(
            parse_manifest(raw),
            Err(UpdateError::MalformedManifest)
        ));
    }

    // 4. entrada de platform sem signature -> Err.
    #[test]
    fn entrada_sem_signature_devolve_err() {
        let raw = r#"{
            "version": "0.2.0",
            "platforms": { "windows-x86_64": { "url": "https://exemplo/app.exe" } }
        }"#;
        assert!(matches!(
            parse_manifest(raw),
            Err(UpdateError::MalformedManifest)
        ));
    }
}
