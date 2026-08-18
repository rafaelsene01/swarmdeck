// SPEC: silent-update (SILENT-04, SILENT-05, SILENT-18, SILENT-19, SILENT-22, SILENT-23, SILENT-26, SILENT-39)

//! Troca de executável na pasta do app — vale para os dois flavors,
//! instalado e portátil (SILENT-05, SILENT-18): a instalação real via NSIS
//! usa `installMode: "currentUser"`, então `%LOCALAPPDATA%\SwarmDeck` é
//! gravável sem admin, e a operação de troca é idêntica nos dois casos.
//!
//! Restaurado em 16/08/2026 por AD-009, depois de ter sido aposentado por
//! AD-008: o instalador do `tauri-plugin-updater` mata o processo para
//! poder substituir o `.exe` (`install_inner` termina em
//! `std::process::exit(0)`), o que fecha os terminais abertos sem
//! autorização. O rename+escrita daqui atualiza o app com ele rodando —
//! a versão nova vale quando o usuário reabrir, quando ele quiser
//! (SILENT-39, SILENT-40).
//!
//! - **Download**: fora desta função. `apply_swap` recebe
//!   `downloaded_bytes: &[u8]` — bytes já completos, em memória. Essa
//!   assinatura de função é, ela mesma, a garantia estrutural de "sem
//!   parcial" (SILENT-22): não existe um caminho de stream/`.part` por onde
//!   bytes parciais cheguem até aqui. Quem baixa (T7) é responsável por só
//!   chamar esta função depois que o download inteiro terminar; o teste
//!   `apply_swap_rejeita_bytes_truncados_pela_assinatura_do_arquivo_completo`
//!   prova a consequência prática: mesmo que bytes truncados escapem dessa
//!   responsabilidade e cheguem aqui, a assinatura (calculada sobre o
//!   arquivo inteiro) os rejeita antes de tocar em qualquer arquivo.
//! - **Extração de zip**: `downloaded_bytes` é tratado, nesta task, como o
//!   conteúdo direto do novo executável — não um `.zip` inteiro. Fora de
//!   escopo por decisão da spec (ver `spec.md`, Out of Scope).
//! - **Relançamento do processo**: fora do escopo desta função (comando
//!   `update_restart`, T8).

use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use minisign_verify::{PublicKey, Signature};
use thiserror::Error;

use crate::paths::is_writable;

#[derive(Debug, Error)]
pub enum PortableUpdateError {
    #[error("chave pública inválida: {0}")]
    InvalidPublicKey(String),
    #[error("assinatura mal formada: {0}")]
    InvalidSignatureFormat(String),
    #[error("assinatura não confere com os dados baixados: {0}")]
    SignatureMismatch(String),
    #[error("pasta {0} não é gravável")]
    NotWritable(PathBuf),
    #[error("falha de E/S ao trocar o executável: {0}")]
    Io(#[source] std::io::Error),
}

/// Verifica a assinatura minisign de `data` contra `public_key` (base64,
/// no mesmo formato usado pelo `pubkey` de `tauri.conf.json`). A chave
/// pública é recebida por parâmetro: buscá-la da config do app é
/// responsabilidade de quem chama, não desta função, para ela continuar
/// testável isoladamente.
///
/// `allow_legacy = false`: só aceita o modo "pre-hashed" que ferramentas
/// modernas (minisign atual, rsign2, `tauri signer`) produzem — o mesmo
/// esquema que o `tauri-plugin-updater` usa internamente.
pub fn verify_signature(
    data: &[u8],
    signature: &str,
    public_key: &str,
) -> Result<(), PortableUpdateError> {
    let key = parse_public_key(public_key)
        .map_err(|e| PortableUpdateError::InvalidPublicKey(e.to_string()))?;
    let sig = parse_signature(signature).map_err(PortableUpdateError::InvalidSignatureFormat)?;
    key.verify(data, &sig, false)
        .map_err(|e| PortableUpdateError::SignatureMismatch(e.to_string()))
}

/// Aceita as três formas em que a chave pública minisign circula, porque
/// quem chama passa a que tem em mãos:
///
/// 1. o conteúdo do arquivo `.pub` (linha de comentário + linha da chave);
/// 2. só a linha base64 da chave (`RW...`);
/// 3. o arquivo inteiro **em base64** — que é o que `tauri.conf.json` guarda
///    em `plugins.updater.pubkey`, e o que o `tauri-plugin-updater` espera.
///
/// A forma 3 é a que chega em produção por `check::pubkey`. Passá-la direto
/// a `PublicKey::from_base64` decodifica 100 bytes de texto onde a chave tem
/// 42, e o erro que sobe é `Invalid encoding in minisign data` — a falha de
/// update relatada em 0.1.17.
fn parse_public_key(public_key: &str) -> Result<PublicKey, String> {
    let trimmed = public_key.trim();

    // Forma 1: arquivo .pub literal.
    if let Ok(key) = PublicKey::decode(trimmed) {
        return Ok(key);
    }

    // Forma 2: só a linha da chave.
    if let Ok(key) = PublicKey::from_base64(trimmed) {
        return Ok(key);
    }

    // Forma 3: arquivo .pub inteiro em base64 (tauri.conf.json). O erro
    // desta tentativa é o que sobe, por ser o caminho de produção.
    let decoded = BASE64
        .decode(trimmed)
        .map_err(|e| format!("base64 inválido: {e}"))?;
    let text = String::from_utf8(decoded).map_err(|e| format!("chave não é UTF-8: {e}"))?;
    PublicKey::decode(text.trim()).map_err(|e| e.to_string())
}

/// Aceita a assinatura minisign crua (conteúdo do `.sig`) e a forma que o
/// `latest.json` publica: esse mesmo arquivo em base64, como o
/// `tauri-plugin-updater` grava e lê. `apply::download` passa o campo
/// `signature` do manifesto direto para cá, então a segunda forma é a de
/// produção.
fn parse_signature(signature: &str) -> Result<Signature, String> {
    let trimmed = signature.trim();

    if let Ok(sig) = Signature::decode(trimmed) {
        return Ok(sig);
    }

    let decoded = BASE64
        .decode(trimmed)
        .map_err(|e| format!("base64 inválido: {e}"))?;
    let text = String::from_utf8(decoded).map_err(|e| format!("assinatura não é UTF-8: {e}"))?;
    Signature::decode(text.trim()).map_err(|e| e.to_string())
}

/// Aplica a troca de executável em `exe_dir`: reprova pasta somente-leitura
/// antes de processar qualquer byte, verifica a assinatura antes de tocar
/// em qualquer arquivo, e só então troca o executável — renomeando o atual
/// para `<exe_name>.old` (rename, não cópia: atômico no mesmo filesystem)
/// antes de escrever o novo. Falha na escrita do novo executável restaura
/// o `.old` de volta, deixando o estado final idêntico ao inicial
/// (SILENT-23).
pub fn apply_swap(
    exe_dir: &Path,
    exe_name: &str,
    downloaded_bytes: &[u8],
    signature: &str,
    public_key: &str,
) -> Result<(), PortableUpdateError> {
    apply_swap_with(
        exe_dir,
        exe_name,
        downloaded_bytes,
        signature,
        public_key,
        |path, bytes| fs::write(path, bytes),
    )
}

/// Núcleo testável de `apply_swap`: a escrita do novo executável entra por
/// closure, para o teste injetar uma falha no meio da troca sem precisar
/// manipular permissões de arquivo reais no meio do fluxo (mesmo padrão de
/// `check_with`/`status_with` em `check.rs` e `resolve_data_dir` em
/// `paths.rs`: dependência injetável em vez de mock de framework).
fn apply_swap_with(
    exe_dir: &Path,
    exe_name: &str,
    downloaded_bytes: &[u8],
    signature: &str,
    public_key: &str,
    write_exe: impl FnOnce(&Path, &[u8]) -> std::io::Result<()>,
) -> Result<(), PortableUpdateError> {
    if !is_writable(exe_dir) {
        return Err(PortableUpdateError::NotWritable(exe_dir.to_path_buf()));
    }

    verify_signature(downloaded_bytes, signature, public_key)?;

    let exe_path = exe_dir.join(exe_name);
    let old_path = exe_dir.join(format!("{exe_name}.old"));

    fs::rename(&exe_path, &old_path).map_err(PortableUpdateError::Io)?;

    if let Err(write_err) = write_exe(&exe_path, downloaded_bytes) {
        // Restaura o estado anterior: o rename de volta MOVE (não copia)
        // .old para o lugar original, então não sobra `.old` depois de um
        // rollback bem-sucedido — a decisão desta task é não deixar
        // resíduo de rollback no disco.
        fs::rename(&old_path, &exe_path).map_err(PortableUpdateError::Io)?;
        return Err(PortableUpdateError::Io(write_err));
    }

    Ok(())
}

/// Chave de desinstalação padrão do flavor instalado no Windows
/// (`HKCU`, sem admin — o NSIS usa `installMode: "currentUser"`).
#[cfg(windows)]
pub const UNINSTALL_KEY: &str =
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SwarmDeck";

/// Grava `DisplayVersion` em `key` via `reg add` (SILENT-18) — sem crate
/// `winreg` nova, mesmo padrão de `std::process::Command` que `paths.rs` já
/// usa para `icacls` nos testes. Falha aqui é responsabilidade de quem
/// chama tratar como não-fatal (SILENT-19): o binário novo já está no
/// lugar antes desta chamada rodar.
#[cfg(windows)]
pub fn set_registry_display_version(key: &str, version: &str) -> std::io::Result<()> {
    let status = std::process::Command::new("reg")
        .args([
            "add",
            key,
            "/v",
            "DisplayVersion",
            "/t",
            "REG_SZ",
            "/d",
            version,
            "/f",
        ])
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(format!(
            "reg add saiu com código {status}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Par chave pública/assinatura reais de minisign — vetor de teste
    // "pre-hashed mode" do próprio projeto rust-minisign-verify (não
    // simulados): prova que verify_signature fala Ed25519/minisign de
    // verdade, não uma checagem de fachada.
    const PUBLIC_KEY: &str = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
    const DATA: &[u8] = b"test";
    const SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==\n";

    /// Mesma chave de `PUBLIC_KEY`, na forma que `tauri.conf.json` guarda:
    /// o arquivo `.pub` inteiro (comentário + chave) em base64.
    fn public_key_tauri_form() -> String {
        BASE64.encode(format!(
            "untrusted comment: minisign public key: 628A0A42B42D1FA7
{PUBLIC_KEY}
"
        ))
    }

    // 0. a chave como `tauri.conf.json` a guarda verifica igual à forma
    // crua — sem isto o update de produção morre em "chave pública
    // inválida: Invalid encoding in minisign data".
    #[test]
    fn verify_signature_aceita_chave_no_formato_do_tauri_conf() {
        assert!(verify_signature(DATA, SIGNATURE, &public_key_tauri_form()).is_ok());
    }

    // 0b. chave que não é nenhuma das três formas continua reprovando.
    #[test]
    fn verify_signature_rejeita_chave_invalida() {
        assert!(matches!(
            verify_signature(DATA, SIGNATURE, "nao-e-uma-chave"),
            Err(PortableUpdateError::InvalidPublicKey(_))
        ));
    }

    // 0c. assinatura no formato do latest.json (arquivo .sig em base64)
    // verifica igual à crua — é a forma que `apply::download` recebe.
    #[test]
    fn verify_signature_aceita_assinatura_no_formato_do_manifesto() {
        let encoded = BASE64.encode(SIGNATURE);
        assert!(verify_signature(DATA, &encoded, PUBLIC_KEY).is_ok());
    }

    // 0d. assinatura base64 válida mas adulterada por dentro continua
    // reprovando — a normalização não afrouxa a verificação.
    #[test]
    fn verify_signature_rejeita_assinatura_adulterada_no_formato_do_manifesto() {
        let tampered = SIGNATURE.replace("y/rUw2y8", "y/rUw2y9");
        assert!(verify_signature(DATA, &BASE64.encode(tampered), PUBLIC_KEY).is_err());
    }

    // 1. assinatura válida sobre os bytes certos -> Ok.
    #[test]
    fn verify_signature_aceita_assinatura_valida() {
        assert!(verify_signature(DATA, SIGNATURE, PUBLIC_KEY).is_ok());
    }

    // 2. assinatura adulterada (base64 corrompido) -> Err.
    #[test]
    fn verify_signature_rejeita_assinatura_adulterada() {
        let tampered = SIGNATURE.replace(
            "RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=",
            "RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwp=",
        );

        assert!(verify_signature(DATA, &tampered, PUBLIC_KEY).is_err());
    }

    // 3. arquivo adulterado (bytes diferentes dos que a assinatura cobre) -> Err.
    #[test]
    fn verify_signature_rejeita_dados_adulterados() {
        assert!(verify_signature(b"tested", SIGNATURE, PUBLIC_KEY).is_err());
    }

    // 4. pasta somente-leitura reprova ANTES de qualquer processamento: usa
    // assinatura/dados VÁLIDOS de propósito, para provar que o erro
    // devolvido é NotWritable (não SignatureMismatch) -- ou seja, a
    // checagem de gravabilidade roda antes da verificação de assinatura,
    // não depois.
    #[test]
    fn apply_swap_reprova_pasta_somente_leitura_antes_de_verificar_assinatura() {
        let exe_dir = tempfile::tempdir().unwrap();
        let path = exe_dir.path();
        deny_write(path);

        let result = apply_swap(path, "app.exe", DATA, SIGNATURE, PUBLIC_KEY);

        allow_write(path);

        match result {
            Err(PortableUpdateError::NotWritable(dir)) => assert_eq!(dir.as_path(), path),
            other => panic!("esperava NotWritable, obteve {other:?}"),
        }
        assert!(
            !path.join("app.exe").exists(),
            "nenhum arquivo deveria ter sido criado"
        );
    }

    // 5. fluxo completo com sucesso: exe_name termina com o conteúdo novo,
    // exe_name.old existe com o conteúdo antigo.
    #[test]
    fn apply_swap_com_sucesso_troca_o_executavel_e_preserva_o_old() {
        let exe_dir = tempfile::tempdir().unwrap();
        let exe_path = exe_dir.path().join("app.exe");
        fs::write(&exe_path, b"conteudo antigo").unwrap();

        apply_swap(exe_dir.path(), "app.exe", DATA, SIGNATURE, PUBLIC_KEY).unwrap();

        assert_eq!(fs::read(&exe_path).unwrap(), DATA);
        assert_eq!(
            fs::read(exe_dir.path().join("app.exe.old")).unwrap(),
            b"conteudo antigo"
        );
    }

    // 6. falha na escrita do novo executável (injetada) -> restaura o
    // executável original, sem `.old` sobrando (o rename de volta já o
    // consome -- ver comentário em apply_swap_with sobre a decisão de não
    // deixar resíduo de rollback).
    #[test]
    fn apply_swap_restaura_o_executavel_anterior_quando_a_escrita_falha() {
        let exe_dir = tempfile::tempdir().unwrap();
        let exe_path = exe_dir.path().join("app.exe");
        fs::write(&exe_path, b"conteudo original").unwrap();

        let result = apply_swap_with(
            exe_dir.path(),
            "app.exe",
            DATA,
            SIGNATURE,
            PUBLIC_KEY,
            |_path, _bytes| Err(std::io::Error::other("disco cheio (simulado)")),
        );

        assert!(matches!(result, Err(PortableUpdateError::Io(_))));
        assert_eq!(fs::read(&exe_path).unwrap(), b"conteudo original");
        assert!(
            !exe_dir.path().join("app.exe.old").exists(),
            "rollback bem-sucedido não deveria deixar .old para trás"
        );
    }

    // 7. `cleanup_stale_old` mora em `update/mod.rs` (sobreviveu à
    // aposentadoria de AD-008) e é testado lá — não duplicado aqui.

    // 8. garantia estrutural de "sem parcial" (SILENT-22): apply_swap só
    // aceita `&[u8]` completo, nunca um stream -- não há, na assinatura da
    // função, um jeito de "ir alimentando" bytes parciais. Este teste prova
    // a consequência prática dessa escolha de design: se alguém chamasse
    // apply_swap com bytes truncados (um download interrompido que escapou
    // da responsabilidade de quem baixa), a verificação de assinatura --
    // que cobre o arquivo inteiro -- rejeita, e nada no disco muda. "Sem
    // parcial" não depende de checar um contador de bytes; é a assinatura
    // minisign, calculada sobre o arquivo completo, que torna qualquer
    // prefixo truncado inválido.
    #[test]
    fn apply_swap_rejeita_bytes_truncados_pela_assinatura_do_arquivo_completo() {
        let exe_dir = tempfile::tempdir().unwrap();
        let exe_path = exe_dir.path().join("app.exe");
        fs::write(&exe_path, b"conteudo original").unwrap();
        let partial = &DATA[..2]; // "te" -- download interrompido no meio

        let result = apply_swap(exe_dir.path(), "app.exe", partial, SIGNATURE, PUBLIC_KEY);

        assert!(matches!(
            result,
            Err(PortableUpdateError::SignatureMismatch(_))
        ));
        assert_eq!(
            fs::read(&exe_path).unwrap(),
            b"conteudo original",
            "bytes truncados nunca deveriam tocar o executável"
        );
    }

    #[cfg(unix)]
    fn deny_write(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o555);
        fs::set_permissions(path, perms).unwrap();
    }

    #[cfg(unix)]
    fn allow_write(path: &Path) {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms).unwrap();
    }

    #[cfg(windows)]
    fn deny_write(path: &Path) {
        let status = std::process::Command::new("icacls")
            .arg(path)
            .arg("/deny")
            .arg("*S-1-1-0:(OI)(CI)W")
            .status()
            .expect("falha ao invocar icacls");
        assert!(status.success(), "icacls /deny falhou");
    }

    #[cfg(windows)]
    fn allow_write(path: &Path) {
        let _ = std::process::Command::new("icacls")
            .arg(path)
            .arg("/remove:d")
            .arg("*S-1-1-0")
            .status();
    }

    // T5: DisplayVersion no registro. Subchave descartável de HKCU, apagada
    // ao final — nunca a chave real de desinstalação.
    #[cfg(windows)]
    mod registry_tests {
        use super::super::*;

        const TEST_KEY: &str = r"HKCU\Software\SwarmDeckUpdateTest";

        fn delete_test_key() {
            let _ = std::process::Command::new("reg")
                .args(["delete", TEST_KEY, "/f"])
                .status();
        }

        // 9. grava uma versão, relê com reg query, confere o valor.
        #[test]
        fn grava_e_relê_display_version_numa_subchave_descartavel() {
            delete_test_key();

            set_registry_display_version(TEST_KEY, "0.2.0").expect("gravação deve funcionar");

            let output = std::process::Command::new("reg")
                .args(["query", TEST_KEY, "/v", "DisplayVersion"])
                .output()
                .expect("reg query deve rodar");
            let text = String::from_utf8_lossy(&output.stdout);

            delete_test_key();

            assert!(
                text.contains("0.2.0"),
                "reg query deveria devolver a versão gravada, saída: {text}"
            );
        }

        // 10. chave inválida -> Err, sem panicar.
        #[test]
        fn chave_invalida_devolve_err_sem_panicar() {
            let result = set_registry_display_version("", "0.2.0");
            assert!(result.is_err());
        }
    }
}
