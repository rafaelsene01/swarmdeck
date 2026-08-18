//! Comandos Tauri expostos ao frontend.

// SPEC: agent-selection (AGT-01, AGT-03, AGT-04)
pub mod agents;
// SPEC: editor-launch (EDITOR-02, EDITOR-04)
pub mod editors;
pub mod projects;
// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-11)
pub mod quota;
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
// SPEC: settings-shell (SET-01)
// Mesmo mecanismo de `kanban.rs` acima: `settings.rs` mora em
// `src-tauri/src/windows/` e é declarado aqui via `#[path]`.
#[path = "../windows/settings.rs"]
pub mod settings;
