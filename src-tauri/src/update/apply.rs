// SPEC: release-distribution (REL-37, REL-38, REL-39, REL-40, REL-41, REL-42, REL-43, REL-44, REL-45, REL-46, REL-47)

//! Checagem automática em segundo plano, download silencioso e instalação
//! no próximo fechamento da janela `main` — ver `design.md` da feature para
//! o desenho completo.
//!
//! Desvio do pseudocódigo de `design.md`: lá o `Mutex` guarda só `Update`
//! ("que já carrega `.install()` pronto"). Na API real de
//! `tauri-plugin-updater` 2.10, `Update::download()` devolve os bytes
//! baixados (`Vec<u8>`) e `Update::install(bytes)` exige esses bytes como
//! argumento — nenhum dos dois "carrega" o outro. Por isso o `Mutex` guarda
//! a tupla `(Update, Vec<u8>)`: o handle (dono da URL/assinatura já
//! verificada) e os bytes já baixados, exatamente o par que
//! `Update::install` precisa.
//!
//! `Update` não tem construtor público (campos privados, só a lib do plugin
//! consegue criar um) e `tauri::test::mock_builder` quebra no binário de
//! teste deste ambiente Windows (`STATUS_ENTRYPOINT_NOT_FOUND`, linkagem
//! WebView2/wry — confirmado isolando o teste, não é bug do código). Por
//! isso `check_and_download` e `handle_close` (o fechamento de verdade) são
//! invólucros finos, sem lógica própria, em cima de núcleos genéricos em
//! `T`/injetados por closure — mesmo padrão que `update::check_with` já usa
//! neste módulo — que os testes abaixo exercitam de ponta a ponta com fakes.

use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Update baixado e pronto para instalar no próximo fechamento da `main`.
/// `None` enquanto não há nada pendente — também serve de guarda contra
/// download duplicado (REL-44): um ciclo só baixa se o slot estiver vazio.
pub type PendingUpdate = Mutex<Option<(Update, Vec<u8>)>>;

const CHECK_INTERVAL: Duration = Duration::from_secs(3600);

/// Inicia o checador em segundo plano (REL-37): roda uma vez no boot e
/// depois se repete a cada hora (REL-38), pelo resto da vida do processo.
pub fn spawn_background_checker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            check_and_download(&app).await;
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    });
}

/// Guarda de concorrência (REL-44): `true` se já há um update pendente no
/// `Mutex`, caso em que um novo ciclo não deve baixar por cima. Genérica em
/// `T` para ser reaproveitada tanto pelo núcleo testável quanto pelo tipo
/// real `(Update, Vec<u8>)`.
fn already_pending<T>(pending: &Mutex<Option<T>>) -> bool {
    pending.lock().expect("update mutex poisoned").is_some()
}

/// Invólucro fino: liga o núcleo testável (`check_and_download_with`) às
/// chamadas de rede de verdade — `update::check` (decisão pura já testada
/// via `check_with`) e `updater.check()`/`update.download()` (plugin, sem
/// como fakear).
async fn check_and_download(app: &AppHandle) {
    let pending = app.state::<PendingUpdate>();
    check_and_download_with(
        &pending,
        || super::check(app),
        |_version| async {
            let updater = app.updater().map_err(|e| e.to_string())?;
            let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
                return Ok(None);
            };
            let bytes = update
                .download(|_, _| {}, || {})
                .await
                .map_err(|e| e.to_string())?;
            Ok(Some((update, bytes)))
        },
        |version| {
            let _ = app.emit(
                "update://available",
                serde_json::json!({ "version": version }),
            );
        },
    )
    .await;
}

/// Núcleo testável de um ciclo de checagem — mesmo espírito de
/// `update::check_with`: rede e persistência entram por parâmetro, para o
/// teste substituir por fakes.
///
/// - `check`: decide se há versão nova/não pulada/`auto_check` ligado
///   (REL-39/40) — reaproveita `update::check`, nunca reimplementado aqui.
/// - `fetch_and_download`: recebe a versão encontrada por `check` e
///   devolve o que deve ficar pendente (REL-41); `Ok(None)` se o plugin não
///   confirmar a atualização, `Err` se rede/plugin falharem (REL-43).
/// - `emit`: avisa o frontend (REL-42) só quando algo ficou pendente.
async fn check_and_download_with<T, CheckFut, FetchFut>(
    pending: &Mutex<Option<T>>,
    check: impl FnOnce() -> CheckFut,
    fetch_and_download: impl FnOnce(&str) -> FetchFut,
    emit: impl FnOnce(&str),
) where
    CheckFut: Future<Output = Result<Option<crate::update::UpdateInfo>, crate::update::UpdateError>>,
    FetchFut: Future<Output = Result<Option<T>, String>>,
{
    if already_pending(pending) {
        return; // REL-44: já há um update baixado, não sobrescreve.
    }

    let info = match check().await {
        Ok(Some(info)) => info,
        Ok(None) => return,
        Err(err) => {
            eprintln!("swarmdeck: checagem automática de update falhou: {err}");
            return;
        }
    };

    match fetch_and_download(&info.version).await {
        Ok(Some(item)) => {
            *pending.lock().expect("update mutex poisoned") = Some(item);
            emit(&info.version); // REL-42: só avisa quando ficou algo pendente.
        }
        Ok(None) => {}
        Err(err) => {
            // REL-43: download/plugin falhou, loga e mantém o Mutex vazio —
            // não sobrescreve, não repete fora do próximo ciclo.
            eprintln!("swarmdeck: download de update falhou: {err}");
        }
    }
}

/// Decisão + efeito do fechamento da janela `main` (REL-45/46/47): sem
/// update pendente, não faz nada (o fechamento segue normal, sem
/// interceptar). Com update pendente, instala (erro só é logado — REL-47:
/// falha na instalação não pode travar o fechamento) e então chama `close`
/// para fechar de verdade. `install`/`close` entram como closures pelo
/// mesmo motivo de `already_pending`: `Update::install` e `WebviewWindow`
/// não são fakeáveis em teste.
pub fn handle_close(
    has_pending: bool,
    install: impl FnOnce() -> Result<(), String>,
    close: impl FnOnce(),
) -> bool {
    if !has_pending {
        return false;
    }
    if let Err(err) = install() {
        eprintln!("swarmdeck: falha ao instalar update, fechando sem instalar: {err}");
    }
    close();
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::update::{UpdateError, UpdateInfo};

    fn info(version: &str) -> UpdateInfo {
        UpdateInfo {
            version: version.to_string(),
            notes: String::new(),
            flavor: "windows-x86_64".to_string(),
            download_url: "https://exemplo/app.exe".to_string(),
            signature: "sig".to_string(),
        }
    }

    // REL-44: mutex vazio não bloqueia; mutex ocupado bloqueia.
    #[test]
    fn already_pending_reflete_o_estado_do_mutex() {
        let vazio: Mutex<Option<()>> = Mutex::new(None);
        assert!(!already_pending(&vazio));

        let ocupado: Mutex<Option<()>> = Mutex::new(Some(()));
        assert!(already_pending(&ocupado));
    }

    // REL-44: com update já pendente, um novo ciclo não chama check nem
    // fetch_and_download — o guard corta antes de qualquer rede.
    #[tokio::test]
    async fn ciclo_com_pendente_nao_chama_check_nem_fetch() {
        let pending: Mutex<Option<&str>> = Mutex::new(Some("0.2.0"));

        check_and_download_with(
            &pending,
            || async { panic!("check não deveria ser chamado com update já pendente") },
            |_v| async { panic!("fetch_and_download não deveria ser chamado") },
            |_v| panic!("emit não deveria ser chamado"),
        )
        .await;

        assert_eq!(*pending.lock().unwrap(), Some("0.2.0"));
    }

    // REL-39/40: check() sem novidade (Ok(None)) não chama fetch_and_download.
    #[tokio::test]
    async fn ciclo_sem_versao_nova_nao_baixa() {
        let pending: Mutex<Option<&str>> = Mutex::new(None);

        check_and_download_with(
            &pending,
            || async { Ok(None) },
            |_v| async { panic!("fetch_and_download não deveria ser chamado") },
            |_v| panic!("emit não deveria ser chamado"),
        )
        .await;

        assert_eq!(*pending.lock().unwrap(), None);
    }

    // check() falhou (rede/plugin no lado da decisão) -> loga, Mutex vazio,
    // fetch_and_download nunca chamado.
    #[tokio::test]
    async fn ciclo_com_erro_no_check_mantem_pendente_vazio() {
        let pending: Mutex<Option<&str>> = Mutex::new(None);

        check_and_download_with(
            &pending,
            || async { Err(UpdateError::Plugin("rede indisponível".to_string())) },
            |_v| async { panic!("fetch_and_download não deveria ser chamado") },
            |_v| panic!("emit não deveria ser chamado"),
        )
        .await;

        assert_eq!(*pending.lock().unwrap(), None);
    }

    // REL-41: versão nova encontrada, mas o plugin não confirma
    // (Ok(None)) -> Mutex continua vazio, sem emit.
    #[tokio::test]
    async fn ciclo_com_versao_nova_mas_plugin_nao_confirma_nao_baixa() {
        let pending: Mutex<Option<&str>> = Mutex::new(None);

        check_and_download_with(
            &pending,
            || async { Ok(Some(info("0.2.0"))) },
            |_v| async { Ok(None) },
            |_v| panic!("emit não deveria ser chamado"),
        )
        .await;

        assert_eq!(*pending.lock().unwrap(), None);
    }

    // REL-43: download/plugin falhou -> loga, Mutex fica vazio, sem emit.
    #[tokio::test]
    async fn ciclo_com_falha_no_download_mantem_pendente_vazio() {
        let pending: Mutex<Option<&str>> = Mutex::new(None);

        check_and_download_with(
            &pending,
            || async { Ok(Some(info("0.2.0"))) },
            |_v| async { Err("download falhou".to_string()) },
            |_v| panic!("emit não deveria ser chamado"),
        )
        .await;

        assert_eq!(*pending.lock().unwrap(), None);
    }

    // REL-41/42: download com sucesso -> guarda no Mutex e emite a versão certa.
    #[tokio::test]
    async fn ciclo_com_sucesso_guarda_pendente_e_emite_a_versao() {
        let pending: Mutex<Option<&str>> = Mutex::new(None);
        let mut emitida = None;

        check_and_download_with(
            &pending,
            || async { Ok(Some(info("0.2.0"))) },
            |_v| async { Ok(Some("update-baixado")) },
            |v| emitida = Some(v.to_string()),
        )
        .await;

        assert_eq!(*pending.lock().unwrap(), Some("update-baixado"));
        assert_eq!(emitida.as_deref(), Some("0.2.0"));
    }

    // T4 (REL-45/46): sem pendente, não intercepta — install e close nunca rodam.
    #[test]
    fn sem_pendente_nao_intercepta_nem_instala_nem_fecha() {
        let intercepted = handle_close(
            false,
            || panic!("não deveria instalar sem pendente"),
            || panic!("não deveria fechar por conta própria sem pendente"),
        );
        assert!(!intercepted);
    }

    // T4 (REL-45/46): com pendente, instala e fecha de verdade.
    #[test]
    fn com_pendente_instala_e_fecha() {
        let mut instalou = false;
        let mut fechou = false;
        let intercepted = handle_close(
            true,
            || {
                instalou = true;
                Ok(())
            },
            || fechou = true,
        );
        assert!(intercepted);
        assert!(instalou);
        assert!(fechou);
    }

    // T4 (REL-47): falha na instalação ainda fecha em seguida — só loga.
    #[test]
    fn falha_na_instalacao_ainda_fecha_em_seguida() {
        let mut fechou = false;
        let intercepted = handle_close(true, || Err("boom".to_string()), || fechou = true);
        assert!(intercepted);
        assert!(fechou);
    }
}
