// SPEC: release-distribution (REL-34, REL-23)

//! Preferências de atualização: toggle de verificação automática e as
//! versões que o usuário escolheu pular.
//!
//! `update_settings` é linha única (id fixo em 1); `skipped_update_versions`
//! guarda uma linha por versão pulada, para que pular uma versão nunca
//! afete o aviso de outra (REL-23).

use rusqlite::{params, Connection, OptionalExtension};

use super::DbError;

/// Lê se a verificação automática de atualização está ligada.
///
/// Nasce `true` num banco novo (default aplicado pela migração `002`).
pub fn auto_check(conn: &Connection) -> Result<bool, DbError> {
    let value: i64 = conn.query_row(
        "SELECT auto_check FROM update_settings WHERE id = 1",
        [],
        |row| row.get(0),
    )?;
    Ok(value != 0)
}

/// Liga ou desliga a verificação automática de atualização.
pub fn set_auto_check(conn: &Connection, enabled: bool) -> Result<(), DbError> {
    conn.execute(
        "UPDATE update_settings SET auto_check = ?1 WHERE id = 1",
        params![enabled as i64],
    )?;
    Ok(())
}

/// Marca `version` como pulada. Chamar de novo para a mesma versão é no-op.
pub fn skip_version(conn: &Connection, version: &str) -> Result<(), DbError> {
    conn.execute(
        "INSERT OR IGNORE INTO skipped_update_versions (version, skipped_at) VALUES (?1, ?2)",
        params![version, now_unix()],
    )?;
    Ok(())
}

/// Verifica se `version` foi marcada como pulada. Não afeta nenhuma outra versão.
pub fn is_version_skipped(conn: &Connection, version: &str) -> Result<bool, DbError> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM skipped_update_versions WHERE version = ?1",
            params![version],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
