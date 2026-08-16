// SPEC: settings-shell (SET-01)

//! Ciclo de vida da janela secundária de Configurações ("P1: Abrir
//! Configurações em janela própria", `.specs/features/settings-shell/spec.md`).
//!
//! Este arquivo não é declarado como módulo de topo em `lib.rs` — é
//! incluído dentro de `commands` via `#[path]` em `commands/mod.rs`, mesmo
//! mecanismo já usado para `windows/kanban.rs` (task-kanban/T1), para não
//! exigir uma segunda linha em `lib.rs` além da entrada já autorizada no
//! `invoke_handler!`. Por isso os comandos `#[tauri::command]` moram no
//! mesmo arquivo que a lógica de janela, em vez de num `commands/settings.rs`
//! separado.
//!
//! A navegação entre as 4 seções (SET-02) ainda não existe — esta task só
//! entrega o ciclo de vida da janela (criar/focar/fechar em cascata), igual
//! ao que `windows/kanban.rs` fez para o board antes do roteador chegar.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Label da janela principal, definida em `tauri.conf.json` (`app.windows[0].label`).
const MAIN_LABEL: &str = "main";
/// Label da janela de Configurações — única, reaproveitada em toda abertura.
const SETTINGS_LABEL: &str = "settings";

/// Evita registrar o listener de "fechar em cascata" mais de uma vez por
/// processo: `open()` pode ser chamado várias vezes ao longo da sessão
/// (abrir → fechar manualmente → abrir de novo), mas só é preciso um hook
/// na janela `main` viva.
static CASCADE_CLOSE_REGISTERED: AtomicBool = AtomicBool::new(false);

/// SET-01 (1, 2): abre Configurações em janela própria; se já existe, **foca**
/// em vez de criar outra.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(existing) = app.get_webview_window(SETTINGS_LABEL) {
        return existing.set_focus();
    }

    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
        .title("SwarmDeck — Configurações")
        .inner_size(900.0, 640.0)
        .min_inner_size(600.0, 400.0)
        .build()?;

    register_cascade_close(app);

    Ok(())
}

/// SET-01 (3): fechar a janela principal fecha Configurações junto. O
/// listener é anexado à janela `main` na primeira abertura da janela de
/// Configurações (ver `CASCADE_CLOSE_REGISTERED`) e reage a
/// `WindowEvent::Destroyed` — não a `CloseRequested`, que pode ser cancelado
/// por outro handler antes de a janela fechar de verdade.
fn register_cascade_close(app: &AppHandle) {
    if CASCADE_CLOSE_REGISTERED.swap(true, Ordering::SeqCst) {
        return;
    }

    let Some(main) = app.get_webview_window(MAIN_LABEL) else {
        // Sem janela principal não há o que encadear. Não deveria acontecer
        // em execução normal (a `main` é criada por `tauri.conf.json` antes
        // de qualquer comando rodar), mas isso não é motivo para a abertura
        // de Configurações falhar — só não há cascata de fechamento nesta
        // sessão.
        CASCADE_CLOSE_REGISTERED.store(false, Ordering::SeqCst);
        return;
    };

    let app_handle = app.clone();
    main.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            if let Some(settings) = app_handle.get_webview_window(SETTINGS_LABEL) {
                let _ = settings.close();
            }
        }
    });
}

/// Foca a janela principal — mesmo papel de `kanban::focus_main`, disponível
/// aqui para uma futura ação "voltar aos terminais" dentro de Configurações.
pub fn focus_main(app: &AppHandle) -> tauri::Result<()> {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        main.set_focus()?;
    }
    Ok(())
}

/// Invólucro fino chamado pelo botão "Configurações" da toolbar principal —
/// mesmo padrão de tradução de erro para `String` usado em
/// `commands::kanban::kanban_open`.
///
/// `async` é obrigatório, não estilo: um `#[tauri::command]` síncrono roda na
/// **thread principal**, e `WebviewWindowBuilder::build()` (como `set_focus`)
/// despacha a criação para o event loop e bloqueia esperando a resposta —
/// esperar o event loop de dentro dele trava o processo inteiro. O sintoma era
/// a janela nascer em `about:blank` (branca) e o X não fechar, porque nenhum
/// evento de janela voltava a ser processado.
#[tauri::command]
pub async fn settings_open(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|e| e.to_string())
}

/// Invólucro fino para "voltar aos terminais" a partir de Configurações
/// (task futura desta feature). `async` pelo mesmo motivo de `settings_open`.
#[tauri::command]
pub async fn settings_focus_main(app: AppHandle) -> Result<(), String> {
    focus_main(&app).map_err(|e| e.to_string())
}
