// SPEC: multi-terminal (TERM-07)

//! Camada de acesso ao SQLite e runner de migração versionado.
//!
//! As migrações são embutidas no binário via `include_str!` — não há
//! arquivo `.sql` para distribuir junto do app, e uma migração nunca
//! diverge da versão do código que a espera.

use std::path::Path;

use rusqlite::Connection;

mod error;
pub use error::DbError;

// SPEC: release-distribution (REL-34, REL-23)
mod settings;
pub use settings::{auto_check, is_version_skipped, set_auto_check, skip_version};

/// Uma migração: número de versão e o SQL correspondente.
///
/// A ordem desta lista **é** a ordem de aplicação. Migrações novas entram
/// no fim, sempre com versão maior — nunca reordenar nem reciclar número.
// SPEC: release-distribution (REL-34, REL-23), mcp-task-server (MCP-02, MCP-08), agent-selection (AGT-01), multi-terminal (TERM-11)
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("migrations/001_terminal_layout.sql")),
    (2, include_str!("migrations/002_settings.sql")),
    (3, include_str!("migrations/003_tasks.sql")),
    (4, include_str!("migrations/004_agent_prefs.sql")),
    (5, include_str!("migrations/005_terminal_picker_prefs.sql")),
];

/// Conexão com o banco do app, já migrada.
pub struct Db {
    conn: Connection,
}

impl Db {
    /// Abre (criando se preciso) o banco em `path` e aplica as migrações pendentes.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        Self::from_connection(conn)
    }

    /// Banco em memória. Usado em teste e em cenários efêmeros.
    pub fn open_in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self, DbError> {
        // FKs são opt-in no SQLite e precisam ser ligadas por conexão.
        // Sem isso o `ON DELETE SET NULL` das migrações seguintes é ignorado.
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;",
        )?;

        let mut db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    /// Aplica todas as migrações com versão acima da atual.
    ///
    /// Idempotente: uma segunda chamada não faz nada. Cada migração roda
    /// dentro de uma transação junto do registro da sua versão, então uma
    /// falha no meio não deixa o banco em estado parcial.
    fn migrate(&mut self) -> Result<(), DbError> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                 version    INTEGER PRIMARY KEY,
                 applied_at INTEGER NOT NULL
             );",
        )?;

        let current = self.schema_version()?;

        for (version, sql) in MIGRATIONS {
            if *version <= current {
                continue;
            }

            let tx = self.conn.transaction()?;
            tx.execute_batch(sql)?;
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                rusqlite::params![version, now_unix()],
            )?;
            tx.commit()?;
        }

        Ok(())
    }

    /// Maior versão de migração já aplicada. `0` num banco novo.
    pub fn schema_version(&self) -> Result<i64, DbError> {
        let version = self.conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )?;
        Ok(version)
    }

    /// Acesso à conexão para os serviços de domínio.
    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn conn_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }
}

fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
