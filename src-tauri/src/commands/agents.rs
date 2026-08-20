// SPEC: agent-selection (AGT-01, AGT-03, AGT-04), session-restore (SESS-15), agent-permission-mode (PERM-03)
// SPEC: wsl-terminal-profile (WSLP-06)

//! Comandos Tauri que expõem `agents::catalog` e `agents::prefs` ao
//! frontend.
//!
//! Invólucros finos, no mesmo espírito de `commands/terminal.rs`: nenhuma
//! regra nova mora aqui — só serializa o que `detect_installed` /
//! `resolve_effective_default` (T1/T3, já testados) já calculam, para que
//! a etapa AGENT do wizard deixe de receber `agents={[]}` /
//! `defaultAgentId={null}` fixos.

use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::agents::{detect_installed_in, resolve_effective_default, PERMISSION_MODES};
use crate::db::Db;
use crate::shells::prefs::resolve_default;

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
    /// SPEC: agent-permission-mode (PERM-03) — modos que este CLI aceita em
    /// `--permission-mode`, na ordem de exibição. Vetor **vazio** quando o
    /// agente não declara a flag: é o que faz o passo AGENT esconder o seletor
    /// sem precisar de um `if id === 'claude-code'` no frontend.
    pub permission_modes: Vec<String>,
}

/// Invólucro fino sobre `agents::catalog::detect_installed_in` (T1,
/// wsl-terminal-profile): o catálogo completo, cada entrada já com o
/// status de instalação atual do perfil ativo (PATH do host, ou dentro da
/// distro WSL escolhida — WSLP-06).
#[tauri::command]
pub fn agent_catalog(db: State<'_, Mutex<Db>>) -> Vec<AgentCatalogEntry> {
    let profile = {
        let db = db.lock().expect("db mutex poisoned");
        resolve_default(db.conn())
    };
    detect_installed_in(&profile)
        .into_iter()
        .map(|status| AgentCatalogEntry {
            id: status.agent.id.to_string(),
            name: status.agent.name.to_string(),
            vendor: status.agent.vendor.to_string(),
            command: status.agent.command.to_string(),
            beta: status.agent.beta,
            installed: status.installed,
            supports_session_resume: status.agent.session_resume_flag.is_some(),
            permission_modes: if status.agent.permission_mode_flag.is_some() {
                PERMISSION_MODES.iter().map(|m| m.to_string()).collect()
            } else {
                Vec::new()
            },
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
