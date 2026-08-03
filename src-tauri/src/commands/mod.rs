//! Comandos Tauri expostos ao frontend.

pub mod projects;
// SPEC: task-kanban (KAN-01, KAN-04)
pub mod tasks;
pub mod terminal;
pub mod update;
// SPEC: task-kanban (KAN-08)
// `kanban.rs` mora em `src-tauri/src/windows/` (ciclo de vida de janela, não
// lógica de comando de domínio) — declarado aqui via `#[path]` para não
// exigir uma segunda linha em `lib.rs` além da entrada já autorizada no
// `invoke_handler!` (ver o relatório da task T1).
#[path = "../windows/kanban.rs"]
pub mod kanban;
