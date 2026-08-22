// SPEC: agent-selection (AGT-01, AGT-02, AGT-03, AGT-04)
// SPEC: wsl-terminal-profile (WSLP-06)

//! Catálogo de agentes de IA suportados, a detecção de qual deles está
//! instalado no PATH, e a resolução de qual comando uma sessão deve lançar
//! (T2). Ponto de entrada do módulo `agents` — a preferência padrão (T3)
//! também importa daqui.

pub mod catalog;
pub mod launch;
pub mod prefs;

// SPEC: providers-panel (PROV-07) — `clear_wsl_probe_cache`
pub use catalog::{
    catalog, clear_wsl_probe_cache, detect_installed, detect_installed_in,
    is_valid_permission_mode, AgentDescriptor, AgentStatus, PERMISSION_MODES,
};
pub use launch::{resolve_launch_command, LaunchResolution, SessionLaunch};
pub use prefs::{default_agent, resolve_effective_default, set_default_agent, EffectiveDefault};
