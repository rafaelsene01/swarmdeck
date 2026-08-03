// SPEC: task-kanban (KAN-08)

//! Ciclo de vida da janela secundária do board Kanban ("P3: Janela
//! dedicada", `.specs/features/task-kanban/spec.md`).
//!
//! Este arquivo não é declarado como módulo de topo em `lib.rs` — é
//! incluído dentro de `commands` via `#[path]` em `commands/mod.rs`, para
//! não exigir uma segunda linha em `lib.rs` além da entrada já autorizada
//! no `invoke_handler!` (ver o relatório da task T1 para o raciocínio
//! completo). Por isso os comandos `#[tauri::command]` moram no mesmo
//! arquivo que a lógica de janela, em vez de num `commands/kanban.rs`
//! separado como seria o padrão de `commands/projects.rs`.
//!
//! A rota de frontend `/kanban` (KAN-08 critério 1) ainda não existe —
//! `src/main.tsx` monta `<App/>` direto em `#root`, sem `react-router` no
//! `package.json`. Até essa rota chegar (task futura desta feature), a
//! janela aponta para o mesmo `index.html` da janela principal: o ciclo de
//! vida da janela (criar/focar/fechar em cascata) já fica correto hoje; o
//! conteúdo específico do board chega com o roteador, em T3+.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Label da janela principal, definida em `tauri.conf.json` (`app.windows[0].label`).
const MAIN_LABEL: &str = "main";
/// Label da janela do board — única, reaproveitada em toda abertura.
const KANBAN_LABEL: &str = "kanban";

/// Evita registrar o listener de "fechar em cascata" mais de uma vez por
/// processo: `open()` pode ser chamado várias vezes ao longo da sessão
/// (abrir → fechar manualmente → abrir de novo), mas só é preciso um hook
/// na janela `main` viva.
static CASCADE_CLOSE_REGISTERED: AtomicBool = AtomicBool::new(false);

/// KAN-08 (1): abre o board em janela própria; se já existe, **foca** em
/// vez de criar outra.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(existing) = app.get_webview_window(KANBAN_LABEL) {
        return existing.set_focus();
    }

    WebviewWindowBuilder::new(app, KANBAN_LABEL, WebviewUrl::App("index.html".into()))
        .title("SwarmDeck — Kanban")
        .inner_size(1100.0, 720.0)
        .min_inner_size(700.0, 500.0)
        .build()?;

    register_cascade_close(app);

    Ok(())
}

/// KAN-08 (2): fechar a janela principal fecha o Kanban junto. O listener é
/// anexado à janela `main` na primeira abertura do board (ver
/// `CASCADE_CLOSE_REGISTERED`) e reage a `WindowEvent::Destroyed` — não a
/// `CloseRequested`, que pode ser cancelado por outro handler antes de a
/// janela fechar de verdade.
fn register_cascade_close(app: &AppHandle) {
    if CASCADE_CLOSE_REGISTERED.swap(true, Ordering::SeqCst) {
        return;
    }

    let Some(main) = app.get_webview_window(MAIN_LABEL) else {
        // Sem janela principal não há o que encadear. Não deveria acontecer
        // em execução normal (a `main` é criada por `tauri.conf.json` antes
        // de qualquer comando rodar), mas isso não é motivo para a abertura
        // do board falhar — só não há cascata de fechamento nesta sessão.
        CASCADE_CLOSE_REGISTERED.store(false, Ordering::SeqCst);
        return;
    };

    let app_handle = app.clone();
    main.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            if let Some(kanban) = app_handle.get_webview_window(KANBAN_LABEL) {
                let _ = kanban.close();
            }
        }
    });
}

/// KAN-08 (3): "voltar aos terminais" foca a janela principal. A ação em si
/// mora aqui; o botão que a dispara é responsabilidade de uma task futura
/// desta feature (T3+) — `kanban_focus_main` abaixo é o comando que ele vai
/// chamar.
pub fn focus_main(app: &AppHandle) -> tauri::Result<()> {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        main.set_focus()?;
    }
    Ok(())
}

/// Invólucro fino chamado pelo frontend para abrir/focar o board — mesmo
/// padrão de tradução de erro para `String` usado em `commands/projects.rs`
/// e `commands/update.rs`.
#[tauri::command]
pub fn kanban_open(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|e| e.to_string())
}

/// Invólucro fino chamado pelo botão "voltar aos terminais" (task futura).
#[tauri::command]
pub fn kanban_focus_main(app: AppHandle) -> Result<(), String> {
    focus_main(&app).map_err(|e| e.to_string())
}
