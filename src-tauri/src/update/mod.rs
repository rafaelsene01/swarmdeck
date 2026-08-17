// SPEC: silent-update (SILENT-09, SILENT-39)

//! Atualização do SwarmDeck: manifesto lido por um caminho HTTP único
//! (`manifest`), status com versão instalada e mais recente (`check`),
//! download confirmado com progresso (`apply::download`) e instalação
//! (`apply::install`, troca do executável via `swap`) — ver
//! `.specs/features/silent-update/design.md`.
//!
//! O módulo `swap` voltou em 16/08/2026 (AD-009): o instalador do
//! `tauri-plugin-updater` mata o processo para trocar o `.exe`, e fechar o
//! app derruba os terminais abertos. `cleanup_stale_old` limpa o `.old` que
//! a troca deixa para trás, no boot seguinte (SILENT-07).

use std::fs;
use std::path::Path;

pub mod apply;
mod check;
pub mod manifest;
pub mod swap;

pub use apply::spawn_background_checker;
pub use check::{status, UpdateError, UpdateStatus};

/// Apaga `<exe_name>.old` remanescente, se existir.
///
/// Sobrevivente do mecanismo de troca no lugar (SILENT-07): quem atualizou
/// por ele ficou com um `.old` de ~13 MB ao lado do executável. Roda no
/// boot e é idempotente — em instalação nova nunca acha nada.
pub fn cleanup_stale_old(exe_dir: &Path, exe_name: &str) -> std::io::Result<()> {
    let old_path = exe_dir.join(format!("{exe_name}.old"));
    if old_path.exists() {
        fs::remove_file(&old_path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_apaga_o_old_e_e_idempotente() {
        let dir = tempfile::tempdir().expect("tempdir");
        let old = dir.path().join("app.exe.old");
        fs::write(&old, b"binario antigo").expect("escrever .old");

        cleanup_stale_old(dir.path(), "app.exe").expect("primeira limpeza");
        assert!(!old.exists(), ".old deve ter sido apagado");

        cleanup_stale_old(dir.path(), "app.exe").expect("sem .old não é erro");
    }
}
