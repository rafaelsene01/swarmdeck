// SPEC: providers-panel (PROV-05, PROV-10)

//! Estado por provedor: se está habilitado e em quais perfis de terminal a
//! última varredura o encontrou. Uma linha por provedor (`provider_prefs`,
//! migração 014), no mesmo par `get`/`set` de `db::quota_prefs`.
//!
//! Ao contrário de `quota_prefs`, esta tabela **não** é semeada: um banco
//! recém-migrado devolve vetor vazio, e é
//! `commands::providers::provider_prefs_get` que decide varrer nesse caso —
//! não esta camada.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::DbError;

/// Uma linha de `provider_prefs`. `Serialize`/`Deserialize` porque este mesmo
/// tipo é o retorno dos comandos Tauri de provedor — nenhum tipo espelhado à
/// parte no Rust.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPref {
    /// Id do catálogo (`agents::catalog::CATALOG`).
    pub id: String,
    pub enabled: bool,
    /// SPEC: providers-panel (PROV-02) — rótulos dos perfis onde o CLI foi
    /// achado, na ordem de `shells::list::list_profiles`. Vazio = não
    /// encontrado em nenhum terminal disponível.
    pub found_in: Vec<String>,
}

/// Todas as linhas gravadas. Vetor vazio = nunca varreu (banco recém
/// migrado); a ordem de exibição é responsabilidade de quem chama, que a
/// deriva do catálogo.
pub fn get_all(conn: &Connection) -> Result<Vec<ProviderPref>, DbError> {
    let mut stmt = conn.prepare("SELECT provider_id, enabled, found_in FROM provider_prefs")?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let enabled: i64 = row.get(1)?;
        let found_in: String = row.get(2)?;
        Ok(ProviderPref {
            id,
            enabled: enabled != 0,
            // JSON ilegível vira "não encontrado" em vez de derrubar a
            // leitura: a varredura seguinte regrava a linha de qualquer forma.
            found_in: serde_json::from_str(&found_in).unwrap_or_default(),
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(DbError::from)
}

/// Grava o resultado de uma varredura: uma linha por provedor recebido,
/// substituindo o que havia. Provedores fora de `prefs` não são apagados —
/// um id que saiu do catálogo simplesmente deixa de ser lido, e apagar
/// linhas alheias não é trabalho de um upsert.
pub fn replace_all(conn: &Connection, prefs: &[ProviderPref]) -> Result<(), DbError> {
    for pref in prefs {
        let found_in = serde_json::to_string(&pref.found_in).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT INTO provider_prefs (provider_id, enabled, found_in) VALUES (?1, ?2, ?3)
             ON CONFLICT(provider_id) DO UPDATE SET
               enabled = excluded.enabled,
               found_in = excluded.found_in",
            params![pref.id, pref.enabled as i64, found_in],
        )?;
    }
    Ok(())
}

/// SPEC: providers-panel (PROV-05) — liga ou desliga um provedor já gravado.
/// Não cria linha: um id sem varredura não tem `found_in` para justificar o
/// switch, e a UI trava o controle nesse caso.
pub fn set_enabled(conn: &Connection, id: &str, enabled: bool) -> Result<(), DbError> {
    conn.execute(
        "UPDATE provider_prefs SET enabled = ?2 WHERE provider_id = ?1",
        params![id, enabled as i64],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn open_db() -> Db {
        Db::open_in_memory().expect("abrir banco em memória")
    }

    fn pref(id: &str, enabled: bool, found_in: &[&str]) -> ProviderPref {
        ProviderPref {
            id: id.to_string(),
            enabled,
            found_in: found_in.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn sorted(mut prefs: Vec<ProviderPref>) -> Vec<ProviderPref> {
        prefs.sort_by(|a, b| a.id.cmp(&b.id));
        prefs
    }

    // PROV-10: tabela vazia é o estado "nunca varreu" — a migração não semeia.
    #[test]
    fn banco_recem_migrado_nao_tem_provedor_gravado() {
        let db = open_db();
        assert_eq!(get_all(db.conn()).unwrap(), Vec::new());
    }

    #[test]
    fn replace_all_e_get_all_fazem_round_trip_com_found_in() {
        let db = open_db();
        let gravado = vec![
            pref("claude-code", true, &["Windows", "Ubuntu-24.04"]),
            pref("codex-cli", false, &[]),
        ];

        replace_all(db.conn(), &gravado).unwrap();

        assert_eq!(sorted(get_all(db.conn()).unwrap()), sorted(gravado));
    }

    #[test]
    fn replace_all_sobrescreve_a_linha_existente_em_vez_de_duplicar() {
        let db = open_db();
        replace_all(db.conn(), &[pref("claude-code", true, &["Ubuntu-24.04"])]).unwrap();
        replace_all(db.conn(), &[pref("claude-code", false, &[])]).unwrap();

        assert_eq!(
            get_all(db.conn()).unwrap(),
            vec![pref("claude-code", false, &[])]
        );
    }

    // PROV-05: alternar o switch persiste, e só naquele provedor.
    #[test]
    fn set_enabled_altera_so_a_linha_pedida() {
        let db = open_db();
        replace_all(
            db.conn(),
            &[
                pref("claude-code", true, &["Ubuntu-24.04"]),
                pref("codex-cli", true, &["Windows"]),
            ],
        )
        .unwrap();

        set_enabled(db.conn(), "claude-code", false).unwrap();

        assert_eq!(
            sorted(get_all(db.conn()).unwrap()),
            sorted(vec![
                pref("claude-code", false, &["Ubuntu-24.04"]),
                pref("codex-cli", true, &["Windows"]),
            ])
        );
    }

    #[test]
    fn set_enabled_em_id_sem_linha_nao_cria_nada() {
        let db = open_db();
        set_enabled(db.conn(), "nao-existe", true).unwrap();
        assert_eq!(get_all(db.conn()).unwrap(), Vec::new());
    }
}
