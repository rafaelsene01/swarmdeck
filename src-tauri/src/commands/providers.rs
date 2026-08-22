// SPEC: providers-panel (PROV-01, PROV-05, PROV-06, PROV-07, PROV-09, PROV-10, PROV-12, PROV-13)

//! Comandos Tauri de Configurações › Provedores: a varredura por perfil de
//! terminal, o estado gravado dela, e o switch de cada provedor.
//!
//! A detecção não é nova — é a mesma de `agents::catalog::detect_installed_in`
//! que `commands::agents::agent_catalog_all` já usa (BOOT-10). O que mora aqui
//! é o **estado**: em quais perfis cada provedor foi achado e se o usuário o
//! quer oferecido no wizard.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::State;

use crate::agents::{catalog, clear_wsl_probe_cache, detect_installed_in};
use crate::db::provider_prefs::{self, ProviderPref};
use crate::db::Db;
use crate::shells::list::list_profiles;
use crate::shells::TerminalProfile;

/// Rótulos dos perfis onde cada id do catálogo foi achado, chaveado por id.
///
/// A ordem dentro de cada vetor é a de `list_profiles` (host primeiro, depois
/// as distros) — é a ordem em que a UI mostra os locais.
type FoundIn = HashMap<String, Vec<String>>;

/// Sonda todo perfil disponível por todo provedor do catálogo.
///
/// Custa um `wsl.exe` por distro registrada, então nunca é chamada com o
/// mutex do `Db` na mão — ver `provider_scan`.
fn probe_all_profiles() -> FoundIn {
    let mut found: FoundIn = HashMap::new();
    for entry in list_profiles() {
        // `continue` e não `expect`: `list_profiles` monta os ids a partir de
        // `TerminalProfile::id()`, então o parse não falha na prática — e se
        // falhar, perder um perfil da varredura é melhor que derrubar a tela
        // de Configurações.
        let Some(profile) = TerminalProfile::parse_id(&entry.id) else {
            continue;
        };
        for status in detect_installed_in(&profile) {
            if status.installed {
                found
                    .entry(status.agent.id.to_string())
                    .or_default()
                    .push(entry.label.clone());
            }
        }
    }
    found
}

/// SPEC: providers-panel (PROV-12, PROV-13) — o novo estado de cada provedor,
/// a partir do que estava gravado e do que a varredura achou.
///
/// Puro de propósito: as três regras que o usuário pediu vivem aqui, e não
/// espalhadas pelos comandos.
///
/// | Situação | Resultado |
/// | -------- | --------- |
/// | achado, sem registro anterior | habilitado (PROV-12) |
/// | achado, com registro anterior | preserva o que estava gravado |
/// | não achado em nenhum perfil | desabilitado, sem locais (PROV-13) |
///
/// Sempre uma entrada por provedor, na ordem do catálogo (PROV-01): a UI nunca
/// precisa completar buracos.
fn merge_scan(previous: &[ProviderPref], found: &FoundIn) -> Vec<ProviderPref> {
    catalog::catalog()
        .iter()
        .map(|agent| {
            let found_in = found.get(agent.id).cloned().unwrap_or_default();
            let enabled = !found_in.is_empty()
                && previous
                    .iter()
                    .find(|pref| pref.id == agent.id)
                    // Sem registro anterior, um provedor achado nasce ligado.
                    .map_or(true, |pref| pref.enabled);
            ProviderPref {
                id: agent.id.to_string(),
                enabled,
                found_in,
            }
        })
        .collect()
}

/// SPEC: providers-panel (PROV-01) — o gravado, na ordem do catálogo e com
/// uma entrada por provedor. Um provedor que entrou no catálogo depois da
/// última varredura aparece como não encontrado, em vez de faltar na lista.
fn in_catalog_order(stored: &[ProviderPref]) -> Vec<ProviderPref> {
    catalog::catalog()
        .iter()
        .map(|agent| {
            stored
                .iter()
                .find(|pref| pref.id == agent.id)
                .cloned()
                .unwrap_or_else(|| ProviderPref {
                    id: agent.id.to_string(),
                    enabled: false,
                    found_in: Vec::new(),
                })
        })
        .collect()
}

/// SPEC: providers-panel (PROV-06, PROV-07) — varre host e cada distro WSL por
/// todo provedor do catálogo, grava o resultado e devolve o novo estado.
///
/// O cache por distro é descartado antes de sondar (PROV-07): ele vive o
/// processo inteiro, então sem isso "Atualizar" devolveria a resposta da
/// varredura anterior. E o lock do banco é liberado **antes** da sondagem —
/// cada distro custa um `wsl.exe`, e segurar o mutex por esse tempo travaria
/// todo outro comando, exatamente como `agent_catalog_all` documenta.
#[tauri::command]
pub fn provider_scan(db: State<'_, Mutex<Db>>) -> Result<Vec<ProviderPref>, String> {
    let previous = {
        let db = db.lock().expect("db mutex poisoned");
        provider_prefs::get_all(db.conn()).map_err(|e| e.to_string())?
    };

    clear_wsl_probe_cache();
    let found = probe_all_profiles();
    let merged = merge_scan(&previous, &found);

    {
        let db = db.lock().expect("db mutex poisoned");
        provider_prefs::replace_all(db.conn(), &merged).map_err(|e| e.to_string())?;
    }
    Ok(merged)
}

/// SPEC: providers-panel (PROV-09, PROV-10) — o estado gravado. Tabela vazia
/// significa "nunca varreu", e aí varre: é o que faz a primeira abertura da
/// janela de Configurações já mostrar a lista, sem duplicar a decisão em cada
/// chamador.
#[tauri::command]
pub fn provider_prefs_get(db: State<'_, Mutex<Db>>) -> Result<Vec<ProviderPref>, String> {
    let stored = {
        let db_guard = db.lock().expect("db mutex poisoned");
        provider_prefs::get_all(db_guard.conn()).map_err(|e| e.to_string())?
    };
    if stored.is_empty() {
        return provider_scan(db);
    }
    Ok(in_catalog_order(&stored))
}

/// SPEC: providers-panel (PROV-05) — liga ou desliga um provedor.
#[tauri::command]
pub fn provider_enabled_set(
    db: State<'_, Mutex<Db>>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let db = db.lock().expect("db mutex poisoned");
    provider_prefs::set_enabled(db.conn(), &id, enabled).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pref(id: &str, enabled: bool, found_in: &[&str]) -> ProviderPref {
        ProviderPref {
            id: id.to_string(),
            enabled,
            found_in: found_in.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn found(pairs: &[(&str, &[&str])]) -> FoundIn {
        pairs
            .iter()
            .map(|(id, places)| {
                (
                    id.to_string(),
                    places.iter().map(|s| s.to_string()).collect(),
                )
            })
            .collect()
    }

    fn by_id<'a>(prefs: &'a [ProviderPref], id: &str) -> &'a ProviderPref {
        prefs
            .iter()
            .find(|pref| pref.id == id)
            .unwrap_or_else(|| panic!("{id} não está no resultado"))
    }

    fn catalog_ids() -> Vec<&'static str> {
        catalog::catalog().iter().map(|agent| agent.id).collect()
    }

    // PROV-01: uma entrada por provedor, na ordem do catálogo.
    #[test]
    fn merge_devolve_o_catalogo_inteiro_na_ordem() {
        let merged = merge_scan(&[], &found(&[("claude-code", &["Ubuntu-24.04"])]));

        let ids: Vec<&str> = merged.iter().map(|pref| pref.id.as_str()).collect();
        assert_eq!(ids, catalog_ids());
    }

    // PROV-12: achado e sem registro anterior nasce habilitado, com os
    // rótulos de todos os perfis onde apareceu.
    #[test]
    fn achado_sem_registro_anterior_nasce_habilitado() {
        let merged = merge_scan(
            &[],
            &found(&[("claude-code", &["Windows", "Ubuntu-24.04"])]),
        );

        let claude = by_id(&merged, "claude-code");
        assert!(claude.enabled);
        assert_eq!(claude.found_in, vec!["Windows", "Ubuntu-24.04"]);
    }

    // A escolha do usuário sobrevive a uma nova varredura.
    #[test]
    fn achado_com_registro_anterior_preserva_a_escolha() {
        let previous = vec![pref("claude-code", false, &["Ubuntu-24.04"])];

        let merged = merge_scan(&previous, &found(&[("claude-code", &["Ubuntu-24.04"])]));

        assert!(!by_id(&merged, "claude-code").enabled);
    }

    // PROV-13: habilitado que deixou de ser achado é desligado e perde os
    // locais — um switch ligado apontando para um CLI ausente ofereceria no
    // wizard uma sessão que falha ao subir.
    #[test]
    fn habilitado_que_nao_foi_achado_e_desligado_e_perde_os_locais() {
        let previous = vec![pref("claude-code", true, &["Ubuntu-24.04"])];

        let merged = merge_scan(&previous, &FoundIn::new());

        let claude = by_id(&merged, "claude-code");
        assert!(!claude.enabled);
        assert_eq!(claude.found_in, Vec::<String>::new());
    }

    // Caso de borda da spec: nenhum provedor em nenhum perfil.
    #[test]
    fn nada_achado_deixa_tudo_desligado_sem_locais() {
        let merged = merge_scan(&[], &FoundIn::new());

        assert_eq!(merged.len(), catalog::catalog().len());
        assert!(merged
            .iter()
            .all(|pref| !pref.enabled && pref.found_in.is_empty()));
    }

    // PROV-01: um provedor novo no catálogo, sem linha gravada, aparece como
    // não encontrado em vez de faltar na lista.
    #[test]
    fn in_catalog_order_completa_provedor_sem_linha_gravada() {
        let stored = vec![pref("codex-cli", true, &["Windows"])];

        let ordered = in_catalog_order(&stored);

        let ids: Vec<&str> = ordered.iter().map(|pref| pref.id.as_str()).collect();
        assert_eq!(ids, catalog_ids());
        assert_eq!(
            by_id(&ordered, "codex-cli"),
            &pref("codex-cli", true, &["Windows"])
        );
        assert_eq!(
            by_id(&ordered, "claude-code"),
            &pref("claude-code", false, &[])
        );
    }
}
