// SPEC: silent-update (SILENT-02, SILENT-03, SILENT-08, SILENT-14, SILENT-15, SILENT-16, SILENT-17, SILENT-24, SILENT-27, SILENT-28, SILENT-37, SILENT-38, SILENT-39, SILENT-40)

//! Checagem automática em segundo plano (`check_only`): consulta e avisa,
//! nunca baixa.
//!
//! O fluxo confirmado tem **dois passos separados**, e nenhum deles fecha o
//! app (AD-009):
//!
//! 1. `download` — única porta de download do módulo (SILENT-03): resolve a
//!    entrada de plataforma, reprova pasta não gravável antes de baixar
//!    (SILENT-24), baixa emitindo `update://download-progress` (SILENT-37),
//!    confere a assinatura minisign e guarda os bytes em `Pending`
//!    (SILENT-38). Nada em disco ainda.
//! 2. `install` — troca o executável via `swap::apply_swap` e grava
//!    `DisplayVersion` no flavor instalado. O processo continua vivo com o
//!    binário antigo em memória; a versão nova vale na próxima abertura,
//!    que é decisão do usuário (SILENT-40) — nunca deste módulo.
//!
//! Fora do Windows os dois passos delegam ao `tauri-plugin-updater`
//! (SILENT-08): lá o instalador do plugin é o único caminho, e ele encerra
//! o processo por conta própria.

use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;

use crate::db::{auto_check, Db};
#[cfg(windows)]
use crate::paths::{self, Flavor};
use crate::update::manifest;
#[cfg(windows)]
use crate::update::swap;

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
    #[cfg(windows)]
    #[error("{0}")]
    Swap(#[from] swap::PortableUpdateError),
    #[error("nenhuma atualização baixada para instalar")]
    NothingDownloaded,
    #[error("já existe uma atualização em andamento")]
    AlreadyApplying,
}

/// Guarda de acionamento duplo (SILENT-28): `true` enquanto um download ou
/// uma instalação está em andamento — um segundo clique nesse meio tempo é
/// ignorado, não enfileirado.
pub type Applying = Mutex<bool>;

/// Artefato já baixado e com assinatura conferida, esperando o clique em
/// "Instalar" (SILENT-38). Vive em memória: fechar o app sem instalar
/// descarta o download, e nada foi escrito em disco.
#[derive(Debug, Clone)]
pub struct PendingUpdate {
    pub version: String,
    pub bytes: Vec<u8>,
    pub signature: String,
}

/// Estado do artefato baixado. `None` até o primeiro download terminar.
pub type Pending = Mutex<Option<PendingUpdate>>;

/// A cada quantos bytes o progresso é emitido para a UI. 14 MB em chunks de
/// ~8 KB dariam ~1750 eventos IPC; a cada 256 KB são ~56, o bastante para
/// uma barra fluida sem inundar a webview.
#[cfg(windows)]
const PROGRESS_STEP: u64 = 256 * 1024;

/// Baixa o artefato da versão nova, com progresso, sem tocar em disco
/// (SILENT-37). Os bytes ficam em `Pending`; instalar é um segundo passo,
/// explícito.
#[cfg(windows)]
pub async fn download(app: &AppHandle) -> Result<String, ApplyError> {
    let applying = app.state::<Applying>();
    let exe = std::env::current_exe().map_err(ApplyError::CurrentExe)?;
    let exe_dir = exe.parent().ok_or(ApplyError::NoExePath)?.to_path_buf();
    let flavor = paths::flavor(&exe_dir);
    let key = super::check::target_key(flavor);
    let endpoint_url = super::check::endpoint(app);
    let public_key = super::check::pubkey(app);
    let progress_app = app.clone();

    let pending = download_with(
        &applying,
        &exe_dir,
        &key,
        &public_key,
        || manifest::fetch(&endpoint_url),
        |url| async move {
            let mut emitted = 0u64;
            fetch_bytes(url, |downloaded, total| {
                let done = total == Some(downloaded);
                if downloaded - emitted < PROGRESS_STEP && !done {
                    return;
                }
                emitted = downloaded;
                let _ = progress_app.emit(
                    "update://download-progress",
                    serde_json::json!({ "downloaded": downloaded, "total": total }),
                );
            })
            .await
        },
    )
    .await?;

    let version = pending.version.clone();
    *app.state::<Pending>()
        .lock()
        .expect("pending mutex poisoned") = Some(pending);
    Ok(version)
}

/// GET com leitura em chunks, para o progresso existir. `Response::chunk`
/// não exige a feature `stream` do `reqwest` (nem `futures-util`) — por
/// isso o laço em vez de `bytes_stream`.
#[cfg(windows)]
async fn fetch_bytes(
    url: String,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> Result<Vec<u8>, String> {
    let mut response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let total = response.content_length();
    let mut bytes = Vec::with_capacity(total.unwrap_or(0) as usize);
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        bytes.extend_from_slice(&chunk);
        on_progress(bytes.len() as u64, total);
    }
    Ok(bytes)
}

/// Núcleo testável de `download`: manifesto, download e o mutex `Applying`
/// entram por parâmetro/closure — mesmo padrão do resto do módulo. A
/// assinatura é conferida aqui (SILENT-04), antes de os bytes virarem um
/// `PendingUpdate` instalável: bytes truncados ou adulterados nunca chegam
/// a habilitar o botão "Instalar".
#[cfg(windows)]
async fn download_with<Fetch, FetchFut, Download, DownloadFut>(
    applying: &Applying,
    exe_dir: &std::path::Path,
    key: &str,
    public_key: &str,
    fetch_manifest: Fetch,
    download: Download,
) -> Result<PendingUpdate, ApplyError>
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

    let result: Result<PendingUpdate, ApplyError> = async {
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

        swap::verify_signature(&bytes, &entry.signature, public_key)?;

        Ok(PendingUpdate {
            version: manifest.version,
            bytes,
            signature: entry.signature,
        })
    }
    .await;

    *applying.lock().expect("applying mutex poisoned") = false;
    result
}

/// Instala o que `download` deixou pronto: troca o executável e grava o
/// registro. **Não reinicia o app** (SILENT-40) — quem decide reabrir é o
/// usuário, porque fechar aqui mataria os terminais abertos.
#[cfg(windows)]
#[allow(clippy::unused_async)] // assinatura uniforme com o caminho não-Windows
pub async fn install(app: &AppHandle) -> Result<String, ApplyError> {
    let applying = app.state::<Applying>();
    let exe = std::env::current_exe().map_err(ApplyError::CurrentExe)?;
    let exe_dir = exe.parent().ok_or(ApplyError::NoExePath)?.to_path_buf();
    let exe_name = exe
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or(ApplyError::NoExePath)?
        .to_string();
    let flavor = paths::flavor(&exe_dir);
    let public_key = super::check::pubkey(app);

    {
        let mut guard = applying.lock().expect("applying mutex poisoned");
        if *guard {
            return Err(ApplyError::AlreadyApplying);
        }
        *guard = true;
    }

    // `take()`: instalar consome o download. Uma falha na troca devolve o
    // usuário ao botão "Baixar" em vez de deixá-lo reinstalar bytes que já
    // provaram não servir.
    let pending = app
        .state::<Pending>()
        .lock()
        .expect("pending mutex poisoned")
        .take();

    let result = install_with(
        pending,
        &exe_dir,
        &exe_name,
        &public_key,
        flavor,
        |version| swap::set_registry_display_version(swap::UNINSTALL_KEY, version),
    );

    *applying.lock().expect("applying mutex poisoned") = false;
    result
}

/// Núcleo testável de `install`: o `PendingUpdate` e o gravador de registro
/// entram por parâmetro. A troca em si roda de verdade via
/// `swap::apply_swap` (já testado em `swap.rs`), não injetada.
#[cfg(windows)]
fn install_with(
    pending: Option<PendingUpdate>,
    exe_dir: &std::path::Path,
    exe_name: &str,
    public_key: &str,
    flavor: Flavor,
    set_registry: impl FnOnce(&str) -> std::io::Result<()>,
) -> Result<String, ApplyError> {
    let pending = pending.ok_or(ApplyError::NothingDownloaded)?;

    swap::apply_swap(
        exe_dir,
        exe_name,
        &pending.bytes,
        &pending.signature,
        public_key,
    )?;

    // SILENT-18/19: só no flavor instalado; falha aqui é cosmética e não
    // invalida a troca (o binário novo já está no lugar).
    if flavor == Flavor::Installed {
        if let Err(err) = set_registry(&pending.version) {
            eprintln!("swarmdeck: falha ao atualizar DisplayVersion do registro: {err}");
        }
    }

    Ok(pending.version)
}

/// Fora do Windows não há troca de arquivo: o `tauri-plugin-updater` baixa
/// e instala num passo só, e encerra o processo por conta própria
/// (SILENT-08). `download` aqui só resolve a versão disponível — os bytes
/// vêm no `install`. `Update` não tem construtor público e
/// `tauri::test::mock_builder` quebra neste binário de teste, então este
/// caminho não é testável isoladamente.
#[cfg(not(windows))]
pub async fn download(app: &AppHandle) -> Result<String, ApplyError> {
    use tauri_plugin_updater::UpdaterExt;

    let update = app
        .updater()
        .map_err(|err| ApplyError::Download(err.to_string()))?
        .check()
        .await
        .map_err(|err| ApplyError::Download(err.to_string()))?
        .ok_or(ApplyError::PlatformUnavailable)?;
    Ok(update.version)
}

#[cfg(not(windows))]
pub async fn install(app: &AppHandle) -> Result<String, ApplyError> {
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
        let update = app
            .updater()
            .map_err(|err| ApplyError::Download(err.to_string()))?
            .check()
            .await
            .map_err(|err| ApplyError::Download(err.to_string()))?
            .ok_or(ApplyError::PlatformUnavailable)?;
        let version = update.version.clone();
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|err| ApplyError::Download(err.to_string()))?;
        Ok(version)
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

    // SILENT-37/38/39: download e instalação são dois passos. O módulo
    // inteiro é cfg(windows) porque `download_with`/`install_with` só
    // existem nesse cfg (fora dele o plugin é o caminho).
    #[cfg(windows)]
    mod download_install_tests {
        use super::*;

        use crate::update::manifest::{Manifest, PlatformEntry};
        use std::collections::HashMap;
        use std::fs;
        use std::path::Path;

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

        fn deny_write(path: &Path) {
            let status = std::process::Command::new("icacls")
                .arg(path)
                .arg("/deny")
                .arg("*S-1-1-0:(OI)(CI)W")
                .status()
                .expect("falha ao invocar icacls");
            assert!(status.success(), "icacls /deny falhou");
        }

        fn allow_write(path: &Path) {
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
            deny_write(exe_dir.path());
            let applying: Applying = Mutex::new(false);
            let m = manifest_with_entry("0.2.0", "chave", "https://exemplo/app.exe", SIGNATURE);

            let result = download_with(
                &applying,
                exe_dir.path(),
                "chave",
                PUBLIC_KEY,
                || async { Ok(m) },
                nunca_baixa,
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

            let result = download_with(
                &applying,
                exe_dir.path(),
                "chave",
                PUBLIC_KEY,
                || async { Ok(m) },
                nunca_baixa,
            )
            .await;

            assert!(matches!(result, Err(ApplyError::PlatformUnavailable)));
        }

        // 3. SILENT-38: download bem-sucedido devolve os bytes prontos para
        // instalar, e NÃO escreve nada em disco -- a pasta continua vazia.
        #[tokio::test]
        async fn download_guarda_os_bytes_sem_tocar_em_disco() {
            let exe_dir = tempfile::tempdir().unwrap();
            let applying: Applying = Mutex::new(false);
            let m = manifest_with_entry("0.2.0", "chave", "https://exemplo/app.exe", SIGNATURE);

            let pending = download_with(
                &applying,
                exe_dir.path(),
                "chave",
                PUBLIC_KEY,
                || async { Ok(m) },
                |_url| async { Ok(DATA.to_vec()) },
            )
            .await
            .expect("download deveria funcionar");

            assert_eq!(pending.version, "0.2.0");
            assert_eq!(pending.bytes, DATA);
            assert_eq!(
                fs::read_dir(exe_dir.path()).unwrap().count(),
                0,
                "download não pode escrever nada na pasta do app"
            );
        }

        // 4. SILENT-04/38: bytes que não batem com a assinatura nunca viram
        // um PendingUpdate instalável.
        #[tokio::test]
        async fn download_com_assinatura_que_nao_confere_falha_antes_de_habilitar_a_instalacao() {
            let exe_dir = tempfile::tempdir().unwrap();
            let applying: Applying = Mutex::new(false);
            let m = manifest_with_entry("0.2.0", "chave", "url", SIGNATURE);

            let result = download_with(
                &applying,
                exe_dir.path(),
                "chave",
                PUBLIC_KEY,
                || async { Ok(m) },
                |_url| async { Ok(b"bytes adulterados".to_vec()) },
            )
            .await;

            assert!(matches!(result, Err(ApplyError::Swap(_))));
        }

        // 5. segunda chamada com Applying já true -> retorna sem baixar.
        #[tokio::test]
        async fn segunda_chamada_com_applying_true_nao_baixa() {
            let applying: Applying = Mutex::new(true);

            let result = download_with(
                &applying,
                Path::new("."),
                "chave",
                PUBLIC_KEY,
                || async { panic!("fetch_manifest não deveria ser chamado") },
                nunca_baixa,
            )
            .await;

            assert!(matches!(result, Err(ApplyError::AlreadyApplying)));
        }

        fn pending() -> PendingUpdate {
            PendingUpdate {
                version: "0.2.0".to_string(),
                bytes: DATA.to_vec(),
                signature: SIGNATURE.to_string(),
            }
        }

        // 6. SILENT-39: instalar troca o executável e devolve a versão.
        #[test]
        fn install_troca_o_executavel_e_devolve_a_versao() {
            let exe_dir = tempfile::tempdir().unwrap();
            let exe_path = exe_dir.path().join("app.exe");
            fs::write(&exe_path, b"conteudo antigo").unwrap();

            let version = install_with(
                Some(pending()),
                exe_dir.path(),
                "app.exe",
                PUBLIC_KEY,
                Flavor::Portable,
                nunca_grava_registro,
            )
            .expect("instalação deveria funcionar");

            assert_eq!(version, "0.2.0");
            assert_eq!(fs::read(&exe_path).unwrap(), DATA);
        }

        // 7. instalar sem nada baixado -> Err explícito, sem tocar em disco.
        #[test]
        fn install_sem_download_devolve_nothing_downloaded() {
            let exe_dir = tempfile::tempdir().unwrap();

            let result = install_with(
                None,
                exe_dir.path(),
                "app.exe",
                PUBLIC_KEY,
                Flavor::Portable,
                nunca_grava_registro,
            );

            assert!(matches!(result, Err(ApplyError::NothingDownloaded)));
        }

        // 8. flavor instalado -> gravador de registro é acionado.
        #[test]
        fn flavor_instalado_aciona_o_gravador_de_registro() {
            let exe_dir = tempfile::tempdir().unwrap();
            fs::write(exe_dir.path().join("app.exe"), b"conteudo antigo").unwrap();
            let chamado = Mutex::new(false);

            let result = install_with(
                Some(pending()),
                exe_dir.path(),
                "app.exe",
                PUBLIC_KEY,
                Flavor::Installed,
                |v| {
                    *chamado.lock().unwrap() = true;
                    assert_eq!(v, "0.2.0");
                    Ok(())
                },
            );

            assert!(result.is_ok());
            assert!(
                *chamado.lock().unwrap(),
                "set_registry deveria ser chamado no flavor instalado"
            );
        }
    }
}
