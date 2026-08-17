// SPEC: agent-selection (AGT-01, AGT-03, AGT-04), session-restore (SESS-15)

//! Comandos Tauri que expõem `agents::catalog` e `agents::prefs` ao
//! frontend.
//!
//! Invólucros finos, no mesmo espírito de `commands/terminal.rs`: nenhuma
//! regra nova mora aqui — só serializa o que `detect_installed` /
//! `resolve_effective_default` (T1/T3, já testados) já calculam, para que
//! `NewTerminalDialog` (T4) deixe de receber `agents={[]}` /
//! `defaultAgentId={null}` fixos.

use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::agents::{detect_installed, resolve_effective_default};
use crate::db::Db;

/// Forma serializável de uma entrada do catálogo já com o status de
/// instalação — espelha `AgentDescriptor`
/// (`src/routes/settings/AgentPanel.tsx`) mais o campo `installed` que o
/// frontend usa para desabilitar opções não instaladas (AGT-04).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCatalogEntry {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub command: String,
    pub beta: bool,
    pub installed: bool,
    /// SPEC: session-restore (SESS-15) — `true` quando o CLI aceita retomar
    /// uma sessão fixada pelo app. É o que decide se o switch do modal de
    /// restauração fica ativo ou travado em "nova sessão".
    pub supports_session_resume: bool,
}

/// Invólucro fino sobre `agents::catalog::detect_installed` (T1): o
/// catálogo completo, cada entrada já com o status de instalação atual do
/// PATH (AGT-04).
#[tauri::command]
pub fn agent_catalog() -> Vec<AgentCatalogEntry> {
    detect_installed()
        .into_iter()
        .map(|status| AgentCatalogEntry {
            id: status.agent.id.to_string(),
            name: status.agent.name.to_string(),
            vendor: status.agent.vendor.to_string(),
            command: status.agent.command.to_string(),
            beta: status.agent.beta,
            installed: status.installed,
            supports_session_resume: status.agent.session_resume_flag.is_some(),
        })
        .collect()
}

/// Invólucro fino sobre `agents::prefs::resolve_effective_default` (T3): o
/// agente que uma nova sessão deve pré-selecionar (AGT-01), já resolvido
/// contra o que está instalado agora — `None` quando nada do catálogo está
/// instalado.
#[tauri::command]
pub fn agent_default(db: State<'_, Mutex<Db>>) -> Result<Option<String>, String> {
    let db = db.lock().expect("db mutex poisoned");
    resolve_effective_default(db.conn())
        .map(|effective| effective.agent_id)
        .map_err(|e| e.to_string())
}
