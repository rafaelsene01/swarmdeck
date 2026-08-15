// SPEC: silent-update (SILENT-01, SILENT-09)

//! Atualização do SwarmDeck: manifesto lido por um caminho HTTP único
//! (`manifest`), status com versão instalada e mais recente (`check`),
//! troca de executável assinada (`swap`) e aplicação confirmada
//! (`apply::run`) — ver `.specs/features/silent-update/design.md`.

pub mod apply;
mod check;
pub mod manifest;
pub mod swap;

pub use apply::spawn_background_checker;
pub use check::{status, UpdateError, UpdateStatus};
