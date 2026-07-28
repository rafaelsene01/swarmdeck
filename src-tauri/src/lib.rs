//! SwarmDeck — orquestrador desktop de múltiplos agentes de IA em terminal.
//!
//! `commands` (T6) entra na tarefa seguinte.

pub mod db;
pub mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o SwarmDeck");
}
