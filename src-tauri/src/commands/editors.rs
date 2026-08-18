// SPEC: editor-launch (EDITOR-02, EDITOR-04)

//! Comandos Tauri que expõem o catálogo de editores ao frontend.
//!
//! Invólucros finos, no mesmo espírito de `commands/agents.rs`: nenhuma
//! regra mora aqui — `editors::detect_installed` e `editors::open` (já
//! testados) fazem o trabalho, isto só serializa o resultado.

use serde::Serialize;

use crate::editors;

/// Uma entrada instalada, na forma que o popover consome. O caminho
/// resolvido não é exposto: o front não precisa dele e não deve poder
/// mandá-lo de volta — quem traduz id em comando é o backend (EDITOR-05).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorEntry {
    pub id: String,
    pub name: String,
}

/// Os editores de código detectados no PATH agora (EDITOR-02).
#[tauri::command]
pub fn editor_catalog() -> Vec<EditorEntry> {
    editors::detect_installed()
        .into_iter()
        .map(|status| EditorEntry {
            id: status.editor.id.to_string(),
            name: status.editor.name.to_string(),
        })
        .collect()
}

/// Abre `cwd` no editor `id` (EDITOR-04).
#[tauri::command]
pub fn editor_open(id: String, cwd: String) -> Result<(), String> {
    editors::open(&id, &cwd)
}
