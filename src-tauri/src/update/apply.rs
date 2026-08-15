// SPEC: silent-update (SILENT-02, SILENT-03, SILENT-06, SILENT-08, SILENT-14, SILENT-15, SILENT-16, SILENT-17, SILENT-21, SILENT-24, SILENT-27, SILENT-28)

//! Checagem automática em segundo plano (`check_only`, T6): consulta e
//! avisa, nunca baixa. Download confirmado (`run`/`run_with`, T7): a única
//! porta de download do módulo (SILENT-03) — resolve a entrada de
//! plataforma, reprova pasta não gravável antes de baixar (SILENT-24),
//! baixa, troca via `swap::apply_swap` (verifica assinatura antes de tocar
//! arquivo) e grava `DisplayVersion` no flavor instalado.
//!
//! Aposentados em T6: `PendingUpdate`, `handle_close`, `check_and_download`,
//! `check_and_download_with` — o download em segundo plano e a instalação
//! no fechamento da janela `main` saem do crate (AD-005).

use std::future::Future;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;

use crate::db::{auto_check, Db};
use crate::paths::{self, Flavor};
use crate::update::{manifest, swap};

const CHECK_INTERVAL: Duration = Duration::from_secs(3600);

/// Inicia o checador em segundo plano (SILENT-15): roda uma vez no boot e
/// depois se repete a cada hora, pelo resto da vida do processo. Nunca
/// baixa nada — só consulta e emite `update://available` quando há
/// novidade (SILENT-16).
pub fn spawn_background_checker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        run_loop(
            || check_only(&app),
            |interval| tokio::time::sleep(interval),
            None,
        )
        .await;
    });
}

/// Núcleo testável do loop de checagem: dispara `cycle` (boot-fire),
/// depois `wait(CHECK_INTERVAL)` (repetição a cada hora), e repete. `cycle`
/// nunca propaga erro (já loga e retorna dentro de `check_only`), então uma
/// falha num ciclo não quebra a cadência — o próximo `wait`/`cycle` roda de
/// qualquer jeito. `max_cycles` só existe para o teste parar o loop;
/// produção passa `None` (infinito).
async fn run_loop<C, CFut, W, WFut>(mut cycle: C, mut wait: W, max_cycles: Option<usize>)
where
    C: FnMut() -> CFut,
    CFut: Future<Output = ()>,
    W: FnMut(Duration) -> WFut,
    WFut: Future<Output = ()>,
{
    let mut ran = 0;
    loop {
        cycle().await;
        ran += 1;
        if max_cycles == Some(ran) {
            return;
        }
        wait(CHECK_INTERVAL).await;
    }
}

/// Invólucro fino: liga o núcleo testável (`check_only_with`) à preferência
/// real de verificação automática (SILENT-17) e ao `status_gated` de
/// `check.rs`.
async fn check_only(app: &AppHandle) {
    let db_state = app.state::<Mutex<Db>>();
    let auto_check_enabled = {
        let db = db_state.lock().expect("db mutex poisoned");
        auto_check(db.conn()).unwrap_or(true)
    };

    check_only_with(
        || super::check::status_gated(app, auto_check_enabled),
        |version| {
            let _ = app.emit(
                "update://available",
                serde_json::json!({ "version": version }),
            );
        },
        |msg| eprintln!("{msg}"),
    )
    .await;
}

/// Núcleo testável de um ciclo de checagem: `check` decide se há versão
/// nova (SILENT-16) e nunca baixa nada — a decisão de baixar é do usuário,
/// via `run` (T7). `emit` só roda quando há atualização de fato; consulta
/// que falhou loga e não emite, sem quebrar a cadência do `run_loop`.
async fn check_only_with<CheckFut>(
    check: impl FnOnce() -> CheckFut,
    emit: impl FnOnce(&str),
    mut log: impl FnMut(&str),
) where
    CheckFut: Future<Output = Result<crate::update::UpdateStatus, crate::update::UpdateError>>,
{
    match check().await {
        Ok(status) if status.has_update => {
            if let Some(latest) = status.latest {
                emit(&latest);
            }
        }
        Ok(_) => {}
        Err(err) => {
            log(&format!(
                "swarmdeck: checagem automática de update falhou: {err}"
            ));
        }
    }
}

#[derive(Debug, Error)]
pub enum ApplyError {
    #[error("não foi possível localizar o executável atual: {0}")]
    CurrentExe(#[source] std::io::Error),
    #[error("executável sem nome ou diretório pai")]
    NoExePath,
    #[error("consulta ao manifesto falhou: {0}")]
    Manifest(#[from] manifest::UpdateError),
    #[error("atualização não disponível para esta instalação")]
    PlatformUnavailable,
    #[error("pasta {0} não é gravável")]
    NotWritable(std::path::PathBuf),
    #[error("falha ao baixar o artefato de atualização: {0}")]
    Download(String),
    #[error("{0}")]
    Swap(#[from] swap::PortableUpdateError),
    #[error("já existe uma atualização em andamento")]
    AlreadyApplying,
}

/// Guarda de acionamento duplo (SILENT-28): `true` enquanto uma troca está
/// em andamento — um segundo clique em "Baixar e atualizar" nesse meio
/// tempo é ignorado, não enfileirado.
pub type Applying = Mutex<bool>;

/// Única porta de download do módulo (SILENT-03): resolve a entrada de
/// plataforma do manifesto, reprova pasta não gravável antes de baixar
/// qualquer byte (SILENT-24), baixa, troca via `swap::apply_swap` e grava
/// `DisplayVersion` no flavor instalado (SILENT-18). No Windows, os dois
/// flavors passam por aqui (SILENT-05); fora do Windows, delega ao
/// `tauri-plugin-updater` (SILENT-08) — `Update::install` nunca roda no
/// caminho Windows.
#[cfg(windows)]
pub async fn run(app: &AppHandle) -> Result<String, ApplyError> {
    let applying = app.state::<Applying>();
    let exe = std::env::current_exe().map_err(ApplyError::CurrentExe)?;
    let exe_dir = exe.parent().ok_or(ApplyError::NoExePath)?.to_path_buf();
    let exe_name = exe
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or(ApplyError::NoExePath)?
        .to_string();
    let flavor = paths::flavor(&exe_dir);
    let key = super::check::target_key(flavor);
    let endpoint_url = super::check::endpoint(app);
    let public_key = super::check::pubkey(app);

    run_with(
        &applying,
        &exe_dir,
        &exe_name,
        &key,
        &public_key,
        flavor,
        || manifest::fetch(&endpoint_url),
        |url| async move {
            let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
            response
                .bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(|e| e.to_string())
        },
        |version| swap::set_registry_display_version(swap::UNINSTALL_KEY, version),
    )
    .await
}

/// Fora do Windows, delega ao `tauri-plugin-updater` (SILENT-08): a troca
/// de arquivo é exclusiva do Windows (`spec.md`, Out of Scope). `Update`
/// não tem construtor público e `tauri::test::mock_builder` quebra neste
/// binário de teste — por isso este caminho não é testável isoladamente,
/// mesmo padrão já documentado para o resto do módulo antes desta feature.
#[cfg(not(windows))]
pub async fn run(app: &AppHandle) -> Result<String, ApplyError> {
    use tauri_plugin_updater::UpdaterExt;

    let applying = app.state::<Applying>();
    {
        let mut guard = applying.lock().expect("applying mutex poisoned");
        if *guard {
            return Err(ApplyError::AlreadyApplying);
        }
        *guard = true;
    }

    let result: Result<String, ApplyError> = async {
        let updater = app
            .updater()
            .map_err(|err| ApplyError::Download(err.to_string()))?;
        let update = updater
            .check()
            .await
            .map_err(|err| ApplyError::Download(err.to_string()))?
            .ok_or(ApplyError::PlatformUnavailable)?;
        let version = update.version.clone();
        let bytes = update
            .download(|_, _| {}, || {})
            .await
            .map_err(|err| ApplyError::Download(err.to_string()))?;
        update
            .install(bytes)
            .map_err(|err| ApplyError::Download(err.to_string()))?;
        Ok(version)
    }
    .await;

    *applying.lock().expect("applying mutex poisoned") = false;
    result
}

/// Núcleo testável de `run`: manifesto, download e o mutex `Applying`
/// entram por parâmetro/closure — mesmo padrão do resto do módulo. A
/// verificação de assinatura e a troca de arquivo em si rodam de verdade
/// via `swap::apply_swap` (já testado em `swap.rs`), não injetadas.
#[allow(clippy::too_many_arguments)]
async fn run_with<Fetch, FetchFut, Download, DownloadFut>(
    applying: &Applying,
    exe_dir: &Path,
    exe_name: &str,
    key: &str,
    public_key: &str,
    flavor: Flavor,
    fetch_manifest: Fetch,
    download: Download,
    set_registry: impl FnOnce(&str) -> std::io::Result<()>,
) -> Result<String, ApplyError>
where
    Fetch: FnOnce() -> FetchFut,
    FetchFut: Future<Output = Result<manifest::Manifest, manifest::UpdateError>>,
    Download: FnOnce(String) -> DownloadFut,
    DownloadFut: Future<Output = Result<Vec<u8>, String>>,
{
    {
        let mut guard = applying.lock().expect("applying mutex poisoned");
        if *guard {
            return Err(ApplyError::AlreadyApplying);
        }
        *guard = true;
    }

    let result: Result<String, ApplyError> = async {
        let manifest = fetch_manifest().await?;
        let entry = manifest
            .platforms
            .get(key)
            .cloned()
            .ok_or(ApplyError::PlatformUnavailable)?;

        if !paths::is_writable(exe_dir) {
            return Err(ApplyError::NotWritable(exe_dir.to_path_buf()));
        }

        let bytes = download(entry.url.clone())
            .await
            .map_err(ApplyError::Download)?;

        swap::apply_swap(exe_dir, exe_name, &bytes, &entry.signature, public_key)?;

        // SILENT-18/19: só no flavor instalado; falha aqui é cosmética e
        // não invalida a troca (o binário novo já está no lugar).
        if flavor == Flavor::Installed {
            if let Err(err) = set_registry(&manifest.version) {
                eprintln!("swarmdeck: falha ao atualizar DisplayVersion do registro: {err}");
            }
        }

        Ok(manifest.version)
    }
    .await;

    *applying.lock().expect("applying mutex poisoned") = false;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::update::UpdateStatus;

    fn status(has_update: bool, latest: Option<&str>) -> UpdateStatus {
        UpdateStatus {
            current: "0.1.0".to_string(),
            latest: latest.map(str::to_string),
            notes: String::new(),
            has_update,
            mode: "installed",
            platform_key: "windows-x86_64-silent".to_string(),
        }
    }

    fn nunca_loga(_msg: &str) {
        panic!("log não deveria ser chamado nesse caminho");
    }

    // 1. ciclo com versão nova emite update://available uma vez, sem baixar
    // nada -- não há função de download alcançável a partir daqui: o núcleo
    // testável só recebe `check` e `emit`.
    #[tokio::test]
    async fn ciclo_com_versao_nova_emite_uma_vez() {
        let mut emitida = None;

        check_only_with(
            || async { Ok(status(true, Some("0.2.0"))) },
            |v| emitida = Some(v.to_string()),
            nunca_loga,
        )
        .await;

        assert_eq!(emitida.as_deref(), Some("0.2.0"));
    }

    // 2. ciclo sem versão nova não emite nada.
    #[tokio::test]
    async fn ciclo_sem_versao_nova_nao_emite() {
        check_only_with(
            || async { Ok(status(false, Some("0.1.0"))) },
            |_v| panic!("emit não deveria ser chamado sem atualização"),
            nunca_loga,
        )
        .await;
    }

    // 3. ciclo com falha de consulta loga e não emite -- a cadência do
    // run_loop é verificada separadamente pelos testes de run_loop abaixo,
    // que continuam passando porque check_only_with nunca propaga Err.
    #[tokio::test]
    async fn ciclo_com_falha_na_consulta_loga_e_nao_emite() {
        let mut logada = None;

        check_only_with(
            || async { Err(crate::update::UpdateError::NoExeDir) },
            |_v| panic!("emit não deveria ser chamado com falha na consulta"),
            |msg| logada = Some(msg.to_string()),
        )
        .await;

        assert!(logada.unwrap().contains("checagem automática"));
    }

    // P1-a: o loop dispara o ciclo antes de qualquer espera (boot-fire) e
    // repete espera+ciclo a cada CHECK_INTERVAL -- a ordem das chamadas
    // prova as duas coisas de uma vez.
    #[tokio::test]
    async fn run_loop_dispara_ciclo_no_boot_e_repete_no_intervalo() {
        let eventos = Mutex::new(Vec::<String>::new());

        run_loop(
            || async { eventos.lock().unwrap().push("cycle".to_string()) },
            |interval| {
                eventos
                    .lock()
                    .unwrap()
                    .push(format!("wait:{}", interval.as_secs()));
                async {}
            },
            Some(3),
        )
        .await;

        assert_eq!(
            *eventos.lock().unwrap(),
            vec!["cycle", "wait:3600", "cycle", "wait:3600", "cycle"]
        );
    }

    // P1-a: um ciclo que "falha" (loga e retorna, como check_only_with já
    // faz) não interrompe a cadência -- o próximo wait/cycle roda igual.
    #[tokio::test]
    async fn run_loop_sobrevive_a_ciclo_com_falha() {
        let ciclos = Mutex::new(0);

        run_loop(
            || async {
                *ciclos.lock().unwrap() += 1;
            },
            |_interval| async {},
            Some(2),
        )
        .await;

        assert_eq!(*ciclos.lock().unwrap(), 2);
    }

    // T7: apply::run / run_with.

    use crate::update::manifest::{Manifest, PlatformEntry};
    use std::collections::HashMap;
    use std::fs;

    // Mesmo par chave pública/assinatura reais de minisign de `swap.rs` —
    // vetor de teste "pre-hashed mode" do próprio `rust-minisign-verify`.
    const PUBLIC_KEY: &str = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
    const DATA: &[u8] = b"test";
    const SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==\n";

    fn manifest_with_entry(version: &str, key: &str, url: &str, signature: &str) -> Manifest {
        let mut platforms = HashMap::new();
        platforms.insert(
            key.to_string(),
            PlatformEntry {
                url: url.to_string(),
                signature: signature.to_string(),
            },
        );
        Manifest {
            version: version.to_string(),
            notes: String::new(),
            platforms,
        }
    }

    fn nunca_baixa(
        _url: String,
    ) -> std::pin::Pin<Box<dyn Future<Output = Result<Vec<u8>, String>>>> {
        panic!("download não deveria ser chamado")
    }

    fn nunca_grava_registro(_version: &str) -> std::io::Result<()> {
        panic!("set_registry não deveria ser chamado")
    }

    #[cfg(windows)]
    fn deny_write(path: &std::path::Path) {
        let status = std::process::Command::new("icacls")
            .arg(path)
            .arg("/deny")
            .arg("*S-1-1-0:(OI)(CI)W")
            .status()
            .expect("falha ao invocar icacls");
        assert!(status.success(), "icacls /deny falhou");
    }

    #[cfg(windows)]
    fn allow_write(path: &std::path::Path) {
        let _ = std::process::Command::new("icacls")
            .arg(path)
            .arg("/remove:d")
            .arg("*S-1-1-0")
            .status();
    }

    // 1. pasta não gravável -> Err antes do fake de download ser acionado.
    #[tokio::test]
    async fn pasta_nao_gravavel_reprova_antes_do_download() {
        let exe_dir = tempfile::tempdir().unwrap();
        fs::write(exe_dir.path().join("app.exe"), b"antigo").unwrap();
        deny_write(exe_dir.path());
        let applying: Applying = Mutex::new(false);
        let m = manifest_with_entry("0.2.0", "chave", "https://exemplo/app.exe", SIGNATURE);

        let result = run_with(
            &applying,
            exe_dir.path(),
            "app.exe",
            "chave",
            PUBLIC_KEY,
            Flavor::Portable,
            || async { Ok(m) },
            nunca_baixa,
            nunca_grava_registro,
        )
        .await;

        allow_write(exe_dir.path());

        assert!(matches!(result, Err(ApplyError::NotWritable(_))));
    }

    // 2. manifesto sem entrada para a chave de plataforma -> Err, sem baixar.
    #[tokio::test]
    async fn chave_de_plataforma_ausente_devolve_platform_unavailable_sem_baixar() {
        let exe_dir = tempfile::tempdir().unwrap();
        let applying: Applying = Mutex::new(false);
        let m = manifest_with_entry("0.2.0", "outra-chave", "url", SIGNATURE);

        let result = run_with(
            &applying,
            exe_dir.path(),
            "app.exe",
            "chave",
            PUBLIC_KEY,
            Flavor::Portable,
            || async { Ok(m) },
            nunca_baixa,
            nunca_grava_registro,
        )
        .await;

        assert!(matches!(result, Err(ApplyError::PlatformUnavailable)));
    }

    // 3. caminho feliz: baixa, aplica a troca, devolve a versão aplicada.
    #[tokio::test]
    async fn caminho_feliz_baixa_aplica_a_troca_e_devolve_a_versao() {
        let exe_dir = tempfile::tempdir().unwrap();
        let exe_path = exe_dir.path().join("app.exe");
        fs::write(&exe_path, b"conteudo antigo").unwrap();
        let applying: Applying = Mutex::new(false);
        let m = manifest_with_entry("0.2.0", "chave", "https://exemplo/app.exe", SIGNATURE);

        let result = run_with(
            &applying,
            exe_dir.path(),
            "app.exe",
            "chave",
            PUBLIC_KEY,
            Flavor::Portable,
            || async { Ok(m) },
            |_url| async { Ok(DATA.to_vec()) },
            nunca_grava_registro,
        )
        .await;

        assert_eq!(result.unwrap(), "0.2.0");
        assert_eq!(fs::read(&exe_path).unwrap(), DATA);
    }

    // 4. segunda chamada com Applying já true -> retorna sem baixar.
    #[tokio::test]
    async fn segunda_chamada_com_applying_true_nao_baixa() {
        let applying: Applying = Mutex::new(true);

        let result = run_with(
            &applying,
            Path::new("."),
            "app.exe",
            "chave",
            PUBLIC_KEY,
            Flavor::Portable,
            || async { panic!("fetch_manifest não deveria ser chamado") },
            nunca_baixa,
            nunca_grava_registro,
        )
        .await;

        assert!(matches!(result, Err(ApplyError::AlreadyApplying)));
    }

    // 5. flavor instalado -> gravador de registro é acionado.
    #[tokio::test]
    async fn flavor_instalado_aciona_o_gravador_de_registro() {
        let exe_dir = tempfile::tempdir().unwrap();
        fs::write(exe_dir.path().join("app.exe"), b"conteudo antigo").unwrap();
        let applying: Applying = Mutex::new(false);
        let m = manifest_with_entry("0.2.0", "chave", "url", SIGNATURE);
        let chamado = Mutex::new(false);

        let result = run_with(
            &applying,
            exe_dir.path(),
            "app.exe",
            "chave",
            PUBLIC_KEY,
            Flavor::Installed,
            || async { Ok(m) },
            |_url| async { Ok(DATA.to_vec()) },
            |v| {
                *chamado.lock().unwrap() = true;
                assert_eq!(v, "0.2.0");
                Ok(())
            },
        )
        .await;

        assert!(result.is_ok());
        assert!(
            *chamado.lock().unwrap(),
            "set_registry deveria ser chamado no flavor instalado"
        );
    }

    // 6. flavor portátil -> gravador de registro NÃO é acionado.
    #[tokio::test]
    async fn flavor_portatil_nao_aciona_o_gravador_de_registro() {
        let exe_dir = tempfile::tempdir().unwrap();
        fs::write(exe_dir.path().join("app.exe"), b"conteudo antigo").unwrap();
        let applying: Applying = Mutex::new(false);
        let m = manifest_with_entry("0.2.0", "chave", "url", SIGNATURE);

        let result = run_with(
            &applying,
            exe_dir.path(),
            "app.exe",
            "chave",
            PUBLIC_KEY,
            Flavor::Portable,
            || async { Ok(m) },
            |_url| async { Ok(DATA.to_vec()) },
            nunca_grava_registro,
        )
        .await;

        assert!(result.is_ok());
    }
}
