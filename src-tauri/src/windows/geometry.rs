// SPEC: window-geometry (WGEO-01, WGEO-02, WGEO-03, WGEO-04, WGEO-05, WGEO-06, WGEO-07, WGEO-08, WGEO-09)

//! Geometria persistida da janela `main`: restaura no boot, grava ao mover,
//! redimensionar e fechar.
//!
//! Este arquivo mora em `src-tauri/src/windows/` (ciclo de vida de janela,
//! como `kanban.rs` e `settings.rs`) e é declarado em `lib.rs` via `#[path]`
//! — não tem `#[tauri::command]` nenhum, então não entra por `commands/`.
//!
//! A decisão de "onde abrir" vive em `resolve`, uma função pura sobre
//! retângulos: é ela que os testes exercitam, sem janela nem monitor de
//! verdade. O resto do módulo só converte tipos do Tauri e fala com o banco.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

use crate::db::{set_window_state, Db};

/// Label da janela principal, definida em `tauri.conf.json` (`app.windows[0].label`).
const MAIN_LABEL: &str = "main";

/// Fração do monitor que a janela ocupa no padrão de fallback (WGEO-05).
const FALLBACK_NUMERATOR: u32 = 9;
const FALLBACK_DENOMINATOR: u32 = 10;

/// Intervalo entre flushes da geometria suja (WGEO-02).
const FLUSH_INTERVAL: Duration = Duration::from_secs(1);

/// Sinaliza que a janela mudou de posição ou tamanho desde o último flush.
///
/// Um `static` e não estado gerido pelo Tauri porque há exatamente uma janela
/// `main` por processo — mesmo raciocínio do `CASCADE_CLOSE_REGISTERED` de
/// `kanban.rs`.
static DIRTY: AtomicBool = AtomicBool::new(false);

/// Retângulo em pixels físicos. Serve tanto para a janela quanto para o monitor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// O que está gravado no banco: o retângulo mais o estado maximizado.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Saved {
    pub rect: Rect,
    pub maximized: bool,
}

/// Decide onde a janela deve abrir. `None` = não há decisão possível (nenhum
/// monitor principal reportado e nada de válido salvo), e nesse caso o
/// chamador deixa a geometria de `tauri.conf.json` como está (WGEO-09).
///
/// Três desfechos, na ordem em que são testados:
///
/// 1. Retângulo salvo não maximizado que encosta em algum monitor vivo →
///    restaurado exatamente (WGEO-03).
/// 2. Qualquer outro retângulo salvo — maximizado (WGEO-07) ou fora de todo
///    monitor (WGEO-05) — → 90% centralizado no monitor que contém o centro
///    do retângulo salvo, ou no principal quando esse monitor sumiu. O caso
///    "fora de todo monitor" cai no principal por construção: se o retângulo
///    não intersecta monitor nenhum, monitor nenhum contém o centro dele.
/// 3. Nada salvo → 90% centralizado no principal (WGEO-06).
pub fn resolve(saved: Option<Saved>, monitors: &[Rect], primary: Option<Rect>) -> Option<Rect> {
    match saved {
        Some(saved)
            if !saved.maximized
                && monitors
                    .iter()
                    .any(|monitor| intersects(monitor, &saved.rect)) =>
        {
            Some(saved.rect)
        }
        Some(saved) => monitors
            .iter()
            .copied()
            .find(|monitor| contains(monitor, center(&saved.rect)))
            .or(primary)
            .map(centered_fallback),
        None => primary.map(centered_fallback),
    }
}

/// 90% da largura e da altura do monitor, centralizado nele (WGEO-05).
///
/// Se o resultado ficar abaixo do `minWidth`/`minHeight` de
/// `tauri.conf.json`, quem corrige é o gerenciador de janelas — esta função
/// não conhece o mínimo e não deve inventá-lo.
fn centered_fallback(monitor: Rect) -> Rect {
    let width = monitor.width * FALLBACK_NUMERATOR / FALLBACK_DENOMINATOR;
    let height = monitor.height * FALLBACK_NUMERATOR / FALLBACK_DENOMINATOR;
    Rect {
        x: monitor.x + ((monitor.width - width) / 2) as i32,
        y: monitor.y + ((monitor.height - height) / 2) as i32,
        width,
        height,
    }
}

/// Sobreposição de área maior que zero. Intervalos meio-abertos: um monitor
/// que termina exatamente onde a janela começa não conta como sobreposição.
fn intersects(a: &Rect, b: &Rect) -> bool {
    a.x < b.x + b.width as i32
        && b.x < a.x + a.width as i32
        && a.y < b.y + b.height as i32
        && b.y < a.y + a.height as i32
}

fn center(rect: &Rect) -> (i32, i32) {
    (
        rect.x + (rect.width / 2) as i32,
        rect.y + (rect.height / 2) as i32,
    )
}

fn contains(rect: &Rect, (x, y): (i32, i32)) -> bool {
    x >= rect.x && x < rect.x + rect.width as i32 && y >= rect.y && y < rect.y + rect.height as i32
}

/// Aplica a geometria decidida por `resolve` na janela `main`.
///
/// Chamada dentro do `setup`, antes de o loop de eventos rodar, para que a
/// janela não seja pintada primeiro na posição padrão (WGEO-04).
///
/// Nenhuma falha aqui é fatal: sem monitor legível ou sem linha no banco, a
/// janela abre com a geometria de `tauri.conf.json`, que é exatamente o
/// comportamento anterior a esta feature.
pub fn restore(window: &WebviewWindow, saved: Option<Saved>) {
    let monitors: Vec<Rect> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(monitor_rect)
        .collect();
    let primary = window
        .primary_monitor()
        .ok()
        .flatten()
        .as_ref()
        .map(monitor_rect);

    let Some(target) = resolve(saved, &monitors, primary) else {
        return;
    };

    let _ = window.set_position(PhysicalPosition::new(target.x, target.y));
    let _ = window.set_size(PhysicalSize::new(target.width, target.height));
}

fn monitor_rect(monitor: &tauri::Monitor) -> Rect {
    let position = monitor.position();
    let size = monitor.size();
    Rect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }
}

/// Liga a gravação: marca a geometria como suja em cada `Moved`/`Resized`
/// (WGEO-02) e grava na hora no `CloseRequested` (WGEO-01).
///
/// Só marca a flag no mover/redimensionar em vez de gravar: um arrasto emite
/// dezenas de eventos por segundo, e cada um seria um `UPDATE` no SQLite.
/// Quem grava é o laço de `spawn_flusher`.
pub fn watch(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            DIRTY.store(true, Ordering::Relaxed);
        }
        WindowEvent::CloseRequested { .. } => {
            DIRTY.store(false, Ordering::Relaxed);
            flush(&app);
        }
        _ => {}
    });
}

/// Grava a geometria suja a cada `FLUSH_INTERVAL` (WGEO-02).
///
/// Existe para o caso em que `CloseRequested` nunca chega — crash, `kill`, o
/// restart do updater. Perde-se no máximo o último segundo de mudança.
pub fn spawn_flusher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(FLUSH_INTERVAL).await;
            if DIRTY.swap(false, Ordering::Relaxed) {
                flush(&app);
            }
        }
    });
}

/// Lê a geometria atual da janela `main` e grava no banco.
///
/// Toda falha é só logada (WGEO-08): uma falha de banco no fechamento não
/// pode travar a saída nem virar erro na cara do usuário — mesma regra que
/// `projects::service::touch_from_cwds` já segue no `RunEvent::Exit`.
fn flush(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };

    let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) else {
        return;
    };

    let saved = Saved {
        rect: Rect {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        },
        maximized: window.is_maximized().unwrap_or(false),
    };

    let db = app.state::<Mutex<Db>>();
    let Ok(db) = db.lock() else {
        eprintln!("swarmdeck: db mutex envenenado ao gravar a geometria da janela");
        return;
    };
    if let Err(err) = set_window_state(db.conn(), &saved) {
        eprintln!("swarmdeck: falha ao gravar a geometria da janela: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRIMARY: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };
    const SECOND: Rect = Rect {
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
    };

    fn saved(x: i32, y: i32, width: u32, height: u32, maximized: bool) -> Option<Saved> {
        Some(Saved {
            rect: Rect {
                x,
                y,
                width,
                height,
            },
            maximized,
        })
    }

    // WGEO-03
    #[test]
    fn retangulo_valido_restaura_exato() {
        let alvo = resolve(
            saved(300, 120, 1400, 900, false),
            &[PRIMARY, SECOND],
            Some(PRIMARY),
        );

        assert_eq!(
            alvo,
            Some(Rect {
                x: 300,
                y: 120,
                width: 1400,
                height: 900
            })
        );
    }

    // WGEO-03: janela no monitor secundário volta para o secundário.
    #[test]
    fn retangulo_no_monitor_secundario_restaura_exato() {
        let alvo = resolve(
            saved(2200, 300, 1400, 900, false),
            &[PRIMARY, SECOND],
            Some(PRIMARY),
        );

        assert_eq!(
            alvo,
            Some(Rect {
                x: 2200,
                y: 300,
                width: 1400,
                height: 900
            })
        );
    }

    // WGEO-05: monitor secundário desconectado — o retângulo salvo não
    // encosta em nada, então cai no principal a 90% centralizado.
    #[test]
    fn monitor_removido_cai_no_principal_a_90_por_cento() {
        let alvo = resolve(
            saved(2200, 300, 1400, 900, false),
            &[PRIMARY],
            Some(PRIMARY),
        );

        assert_eq!(
            alvo,
            Some(Rect {
                x: 96,
                y: 54,
                width: 1728,
                height: 972
            })
        );
    }

    // WGEO-06
    #[test]
    fn primeira_execucao_cai_no_principal_a_90_por_cento() {
        let alvo = resolve(None, &[PRIMARY], Some(PRIMARY));

        assert_eq!(
            alvo,
            Some(Rect {
                x: 96,
                y: 54,
                width: 1728,
                height: 972
            })
        );
    }

    // WGEO-07: fechou maximizada no secundário e o secundário continua lá —
    // 90% centralizado **nele**, não no principal.
    #[test]
    fn maximizada_usa_90_por_cento_do_monitor_onde_estava() {
        let alvo = resolve(
            saved(1920, 0, 2560, 1440, true),
            &[PRIMARY, SECOND],
            Some(PRIMARY),
        );

        assert_eq!(
            alvo,
            Some(Rect {
                x: 1920 + 128,
                y: 72,
                width: 2304,
                height: 1296
            })
        );
    }

    // WGEO-07: fechou maximizada num monitor que sumiu → principal.
    #[test]
    fn maximizada_em_monitor_removido_cai_no_principal() {
        let alvo = resolve(saved(1920, 0, 2560, 1440, true), &[PRIMARY], Some(PRIMARY));

        assert_eq!(
            alvo,
            Some(Rect {
                x: 96,
                y: 54,
                width: 1728,
                height: 972
            })
        );
    }

    // WGEO-09: sem monitor principal reportado, nada é aplicado.
    #[test]
    fn sem_monitor_principal_nao_decide_nada() {
        assert_eq!(resolve(None, &[], None), None);
        assert_eq!(resolve(saved(2200, 300, 1400, 900, true), &[], None), None);
    }

    // Borda: uma janela que apenas encosta na borda do monitor, por qualquer
    // um dos quatro lados, está fora da área visível e cai no fallback. Os
    // quatro casos existem porque `intersects` tem uma comparação por lado —
    // cobrir só um lado deixa os outros três livres para inverter o sinal.
    #[test]
    fn encostar_por_qualquer_borda_nao_conta_como_visivel() {
        let fallback = Some(Rect {
            x: 96,
            y: 54,
            width: 1728,
            height: 972,
        });

        for (lado, (x, y)) in [
            ("direita", (1920, 0)),
            ("esquerda", (-800, 0)),
            ("acima", (0, -600)),
            ("abaixo", (0, 1080)),
        ] {
            let alvo = resolve(saved(x, y, 800, 600, false), &[PRIMARY], Some(PRIMARY));
            assert_eq!(alvo, fallback, "janela encostada à {lado}");
        }
    }

    // Borda: a área de um monitor é meio-aberta nos quatro lados — o canto
    // superior-esquerdo pertence a ele, o inferior-direito não. Hoje
    // `resolve` nunca produz um centro exatamente numa borda (o retângulo de
    // uma janela maximizada tem o centro no meio do monitor), mas `resolve` é
    // público e o limite precisa ficar preso ao teste, não à sorte do
    // chamador.
    #[test]
    fn area_do_monitor_e_meio_aberta_nos_quatro_lados() {
        let fallback_no_second = Some(Rect {
            x: 1920 + 128,
            y: 72,
            width: 2304,
            height: 1296,
        });

        // Centro em (1920, 0): a origem exata de `SECOND`, logo dentro dele.
        assert_eq!(
            resolve(
                saved(1120, -720, 1600, 1440, true),
                &[PRIMARY, SECOND],
                Some(PRIMARY),
            ),
            fallback_no_second,
            "canto superior-esquerdo pertence ao monitor"
        );

        // Centro em (960, 1080): uma linha **abaixo** do fim de `PRIMARY`,
        // logo fora dele. Sem monitor que o contenha, cai no principal — que
        // aqui é `SECOND` justamente para o resultado distinguir os dois.
        assert_eq!(
            resolve(
                saved(160, 360, 1600, 1440, true),
                &[PRIMARY, SECOND],
                Some(SECOND),
            ),
            fallback_no_second,
            "canto inferior-direito não pertence ao monitor"
        );
    }

    // Borda: um pixel de sobreposição já basta para restaurar exato — a
    // janela é alcançável pelo usuário.
    #[test]
    fn um_pixel_de_sobreposicao_restaura_exato() {
        let alvo = resolve(saved(1919, 0, 800, 600, false), &[PRIMARY], Some(PRIMARY));

        assert_eq!(
            alvo,
            Some(Rect {
                x: 1919,
                y: 0,
                width: 800,
                height: 600
            })
        );
    }
}
