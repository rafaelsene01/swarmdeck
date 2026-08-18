// SPEC: terminal-screenshot (SHOT-16, SHOT-20)

//! Gravação do print de um terminal em disco. Invólucro fino sobre
//! `std::fs::write`: o caminho vem sempre do seletor nativo do SO, aberto
//! pelo `@tauri-apps/plugin-dialog` no front.

/// Grava os bytes do PNG em `path` (SHOT-16). Erro de IO volta como
/// `Err(String)` para o modal mostrar inline em vez de fechar em falso
/// sucesso (SHOT-20).
#[tauri::command]
pub fn screenshot_save(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grava_os_bytes_no_caminho_recebido() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("print.png");
        let bytes = vec![0x89, b'P', b'N', b'G', 0x0d];

        screenshot_save(path.to_string_lossy().into_owned(), bytes.clone()).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn caminho_em_diretorio_inexistente_devolve_erro() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nao-existe").join("print.png");

        let result = screenshot_save(path.to_string_lossy().into_owned(), vec![1, 2, 3]);

        assert!(result.is_err());
        assert!(!path.exists());
    }
}
