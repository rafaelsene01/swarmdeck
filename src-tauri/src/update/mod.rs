// SPEC: release-distribution (REL-19, REL-21, REL-24)

//! Verificação de atualização do SwarmDeck.
//!
//! Metade instalada (REL-24): fala com o `tauri-plugin-updater` — ver
//! [`check`]. A aplicação da atualização (instalada e portátil, REL-22,
//! REL-25) e a UI que a aciona (REL-20, REL-23, REL-26) chegam nas tarefas
//! seguintes (T16-T18) desta feature.

mod check;
pub mod portable;

pub use check::{check, UpdateError, UpdateInfo};
