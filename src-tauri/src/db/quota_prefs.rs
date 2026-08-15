// SPEC: quota-indicator (QUOTA-09, QUOTA-10)

//! Preferência do indicador de cota: ligado/desligado e qual janela
//! rastrear. Linha única (`id = 1`), mesmo formato de par `get`/`set` de
//! `db::settings`.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::DbError;

/// Preferência do indicador de cota. `Serialize`/`Deserialize` porque este
/// mesmo tipo é o argumento/retorno dos comandos Tauri `quota_prefs_get` e
/// `quota_prefs_set` (T7) — nenhum tipo espelhado à parte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotaPrefs {
    pub enabled: bool,
    /// `"five_hour" | "weekly" | "both"`. Validado pelo chamador (comando),
    /// não por esta camada — ver design.md, "Validação de window".
    pub window: String,
}

/// Lê a preferência de cota. A migração 006 semeia a linha 1 com os
/// defaults (`enabled = true`, `window = "both"`), então um banco recém
/// migrado sempre tem o que ler aqui.
pub fn get(conn: &Connection) -> Result<QuotaPrefs, DbError> {
    conn.query_row(
        "SELECT enabled, window FROM quota_prefs WHERE id = 1",
        [],
        |row| {
            let enabled: i64 = row.get(0)?;
            let window: String = row.get(1)?;
            Ok(QuotaPrefs {
                enabled: enabled != 0,
                window,
            })
        },
    )
    .map_err(DbError::from)
}

/// Grava a preferência de cota, substituindo a linha 1.
pub fn set(conn: &Connection, prefs: &QuotaPrefs) -> Result<(), DbError> {
    conn.execute(
        "UPDATE quota_prefs SET enabled = ?1, window = ?2 WHERE id = 1",
        params![prefs.enabled as i64, prefs.window],
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
            }
        );
    }

    #[test]
    fn set_seguido_de_get_faz_round_trip_para_as_tres_janelas() {
        let db = open_db();

        for window in ["five_hour", "weekly", "both"] {
            let written = QuotaPrefs {
                enabled: false,
                window: window.to_string(),
            };
            set(db.conn(), &written).expect("set");

            let read = get(db.conn()).expect("get");
            assert_eq!(read, written);
        }
    }
}
