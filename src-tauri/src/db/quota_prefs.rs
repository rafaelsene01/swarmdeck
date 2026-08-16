// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-26)

//! Preferência do indicador de cota: ligado/desligado, qual janela
//! rastrear e quais provedores o popover lista. Linha única (`id = 1`),
//! mesmo formato de par `get`/`set` de `db::settings`.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::DbError;

/// Um provedor na lista do popover (QUOTA-26). A **ordem no vetor** é a
/// ordem de exibição — não há campo de índice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotaProvider {
    /// Id do catálogo (`agents::catalog::CATALOG`). Validado pelo chamador.
    pub id: String,
    pub enabled: bool,
}

/// Lista semeada pela migração 007, também usada como fallback quando a
/// coluna guarda JSON ilegível — o indicador nunca fica sem provedor.
pub fn default_providers() -> Vec<QuotaProvider> {
    ["claude-code", "codex-cli", "opencode"]
        .into_iter()
        .map(|id| QuotaProvider {
            id: id.to_string(),
            enabled: true,
        })
        .collect()
}

/// Preferência do indicador de cota. `Serialize`/`Deserialize` porque este
/// mesmo tipo é o argumento/retorno dos comandos Tauri `quota_prefs_get` e
/// `quota_prefs_set` (T7) — nenhum tipo espelhado à parte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotaPrefs {
    pub enabled: bool,
    /// `"five_hour" | "weekly" | "both"`. Validado pelo chamador (comando),
    /// não por esta camada — ver design.md, "Validação de window".
    pub window: String,
    #[serde(default = "default_providers")]
    pub providers: Vec<QuotaProvider>,
}

/// Lê a preferência de cota. A migração 006 semeia a linha 1 com os
/// defaults (`enabled = true`, `window = "both"`) e a 007 acrescenta a
/// lista de provedores, então um banco recém migrado sempre tem o que ler.
pub fn get(conn: &Connection) -> Result<QuotaPrefs, DbError> {
    conn.query_row(
        "SELECT enabled, window, providers FROM quota_prefs WHERE id = 1",
        [],
        |row| {
            let enabled: i64 = row.get(0)?;
            let window: String = row.get(1)?;
            let providers: String = row.get(2)?;
            Ok(QuotaPrefs {
                enabled: enabled != 0,
                window,
                providers: serde_json::from_str(&providers).unwrap_or_else(|_| default_providers()),
            })
        },
    )
    .map_err(DbError::from)
}

/// Grava a preferência de cota, substituindo a linha 1.
pub fn set(conn: &Connection, prefs: &QuotaPrefs) -> Result<(), DbError> {
    let providers = serde_json::to_string(&prefs.providers).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "UPDATE quota_prefs SET enabled = ?1, window = ?2, providers = ?3 WHERE id = 1",
        params![prefs.enabled as i64, prefs.window, providers],
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

    #[test]
    fn get_num_banco_recem_migrado_devolve_os_defaults() {
        let db = open_db();

        let prefs = get(db.conn()).expect("get");

        assert_eq!(
            prefs,
            QuotaPrefs {
                enabled: true,
                window: "both".to_string(),
                providers: default_providers(),
            }
        );
    }

    #[test]
    fn set_seguido_de_get_preserva_a_ordem_e_o_enabled_dos_provedores() {
        let db = open_db();

        let written = QuotaPrefs {
            enabled: true,
            window: "both".to_string(),
            providers: vec![
                QuotaProvider {
                    id: "codex-cli".to_string(),
                    enabled: false,
                },
                QuotaProvider {
                    id: "claude-code".to_string(),
                    enabled: true,
                },
            ],
        };
        set(db.conn(), &written).expect("set");

        assert_eq!(get(db.conn()).expect("get"), written);
    }

    #[test]
    fn set_seguido_de_get_faz_round_trip_para_as_tres_janelas() {
        let db = open_db();

        for window in ["five_hour", "weekly", "both"] {
            let written = QuotaPrefs {
                enabled: false,
                window: window.to_string(),
                providers: default_providers(),
            };
            set(db.conn(), &written).expect("set");

            let read = get(db.conn()).expect("get");
            assert_eq!(read, written);
        }
    }
}
