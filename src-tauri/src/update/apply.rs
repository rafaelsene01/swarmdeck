// SPEC: silent-update (SILENT-02, SILENT-03, SILENT-08, SILENT-14, SILENT-15, SILENT-16, SILENT-17, SILENT-27, SILENT-28, SILENT-36)

//! Checagem automática em segundo plano (`check_only`, T6): consulta e
//! avisa, nunca baixa. Aplicação confirmada (`run`): delega ao
//! `tauri-plugin-updater` em toda plataforma (SILENT-36) — ele baixa o
//! instalador da chave `{os}-{arch}` do manifesto, confere a assinatura
//! minisign e roda a instalação no modo configurado em `tauri.conf.json`
//! (`windows.installMode: "passive"`).
//!
//! Aposentados em T6: `PendingUpdate`, `handle_close`, `check_and_download`,
//! `check_and_download_with` — o download em segundo plano e a instalação
//! no fechamento da janela `main` saem do crate (AD-005).
//!
//! Aposentada em 16/08/2026 (SILENT-36): a troca de executável no lugar
//! (`swap::apply_swap`, o `run`/`run_with` exclusivos do Windows e a
//! reprovação de pasta não gravável). Ver `spec.md`, AD-008.

use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;

use crate::db::{auto_check, Db};
use crate::update::manifest;

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
    #[error("falha ao baixar o artefato de atualização: {0}")]
    Download(String),
    #[error("já existe uma atualização em andamento")]
    AlreadyApplying,
}

/// Guarda de acionamento duplo (SILENT-28): `true` enquanto uma troca está
/// em andamento — um segundo clique em "Baixar e atualizar" nesse meio
/// tempo é ignorado, não enfileirado.
pub type Applying = Mutex<bool>;

/// Delega ao `tauri-plugin-updater` (SILENT-08, SILENT-36) — o mesmo
/// caminho em toda plataforma desde que a troca de executável no lugar foi
/// aposentada. `Update` não tem construtor público e
/// `tauri::test::mock_builder` quebra neste binário de teste — por isso
/// este caminho não é testável isoladamente, mesmo padrão já documentado
/// para o resto do módulo antes desta feature.
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
}
