use thiserror::Error;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("falha no SQLite: {0}")]
    Sqlite(#[from] rusqlite::Error),
}
