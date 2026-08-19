// SPEC: multi-terminal (TERM-11 — REVOKED by AD-019, no caller left)

//! Persists the last directory chosen in the terminal folder picker, across
//! app restarts.
//!
//! Storage is a single row (`terminal_picker_prefs`, `id = 1`), the same
//! pattern `agents::prefs` uses for the default-agent preference. The
//! migration does not seed a row: a fresh database has no row at all,
//! meaning "no directory chosen yet" — callers treat `None` as exactly
//! that, not as an error.

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::DbError;

/// Reads the last directory chosen in the picker, if any.
///
/// `None` both when the table has no row yet (fresh database, nothing ever
/// chosen) and when the row exists but the column is `NULL` — callers don't
/// need to distinguish those two internal states.
pub fn last_dir(conn: &Connection) -> Result<Option<String>, DbError> {
    let value: Option<Option<String>> = conn
        .query_row(
            "SELECT last_dir FROM terminal_picker_prefs WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value.unwrap_or(None))
}

/// Records `path` as the last directory chosen in the picker. Upserts the
/// single row, so calling this again (with the same or a different path)
/// simply replaces the previous value instead of duplicating rows.
pub fn set_last_dir(conn: &Connection, path: &str) -> Result<(), DbError> {
    conn.execute(
        "INSERT INTO terminal_picker_prefs (id, last_dir) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET last_dir = excluded.last_dir",
        params![path],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    /// Banco em memória, já migrado — mesmo padrão de
    /// `terminal::status_catalog::tests::open_db`.
    fn open_db() -> Db {
        Db::open_in_memory().expect("abrir banco em memória")
    }

    #[test]
    fn banco_novo_nao_tem_diretorio_gravado() {
        let db = open_db();

        assert_eq!(last_dir(db.conn()).expect("last_dir"), None);
    }

    #[test]
    fn set_depois_get_devolve_o_mesmo_caminho() {
        let db = open_db();

        set_last_dir(db.conn(), "/home/user/projects").expect("set_last_dir");

        assert_eq!(
            last_dir(db.conn()).expect("last_dir"),
            Some("/home/user/projects".to_string())
        );
    }

    #[test]
    fn set_duas_vezes_substitui_sem_duplicar_linha() {
        let db = open_db();

        set_last_dir(db.conn(), "/home/user/projects").expect("primeiro set_last_dir");
        set_last_dir(db.conn(), "/home/user/other").expect("segundo set_last_dir");

        assert_eq!(
            last_dir(db.conn()).expect("last_dir"),
            Some("/home/user/other".to_string())
        );

        let count: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM terminal_picker_prefs", [], |row| {
                row.get(0)
            })
            .expect("count");
        assert_eq!(count, 1, "upsert nunca deve duplicar a linha única");
    }

    #[test]
    fn migracao_e_idempotente_em_banco_persistido() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("swarmdeck.db");

        {
            let db = Db::open(&path).expect("abrir banco pela primeira vez");
            set_last_dir(db.conn(), "/home/user/projects").expect("set_last_dir");
        }

        // Reabrir roda `migrate()` de novo sobre o mesmo arquivo: como a
        // versão 5 já está registrada em `schema_migrations`, a migração não
        // deve re-executar (o que falharia com "table already exists") nem
        // apagar o dado gravado na primeira abertura.
        let db = Db::open(&path).expect("reabrir banco deve ser idempotente");

        assert_eq!(
            db.schema_version().expect("schema_version"),
            crate::db::latest_schema_version()
        );
        assert_eq!(
            last_dir(db.conn()).expect("last_dir"),
            Some("/home/user/projects".to_string())
        );
    }
}
