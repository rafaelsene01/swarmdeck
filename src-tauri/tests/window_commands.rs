// SPEC: settings-shell (SET-01), task-kanban (KAN-08)

//! Guarda de regressão do deadlock da thread principal.
//!
//! Um `#[tauri::command]` **síncrono** roda na thread principal. Como
//! `WebviewWindowBuilder::build()` e `set_focus()` despacham o trabalho para o
//! event loop e bloqueiam esperando a resposta, chamá-los de dentro do próprio
//! event loop trava o processo: a janela nascia em `about:blank` (branca) e o X
//! não fechava, porque nenhum evento de janela voltava a ser processado.
//!
//! Estes comandos precisam ser `async` para rodar fora da thread principal.
//! A checagem é de tipo, em tempo de compilação — tirar o `async` de qualquer
//! um deles quebra este teste na compilação, sem precisar subir o app.

use std::future::Future;

use swarmdeck_lib::commands::{kanban, settings};
use tauri::AppHandle;

fn exige_comando_async<F, Fut>(_comando: F)
where
    F: Fn(AppHandle) -> Fut,
    Fut: Future<Output = Result<(), String>>,
{
}

#[test]
fn comandos_de_janela_sao_async() {
    exige_comando_async(settings::settings_open);
    exige_comando_async(settings::settings_focus_main);
    exige_comando_async(kanban::kanban_open);
    exige_comando_async(kanban::kanban_focus_main);
}
