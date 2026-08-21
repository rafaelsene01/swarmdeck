// SPEC: terminal-boot-loading (BOOT-11), wsl-terminal-profile (WSLP-02, WSLP-07, WSLP-08)

//! Comando que traduz um `cwd` no perfil de terminal em que ele roda.
//!
//! Invólucro fino, mesmo padrão de `commands/quota.rs`: a regra mora em
//! `shells::profile_for_path` e `shells::prefs`, aqui só desserializa,
//! delega e traduz erro para `String`.
//!
//! AD-035 revogou `shell_profiles_list`, `shell_profile_get` e
//! `shell_profile_set`, que serviam ao seletor "Perfil de terminal" de
//! Configurações › Geral (WSLP-01, WSLP-02, WSLP-13, WSLP-19). O perfil é
//! derivado do caminho, então a preferência global não tinha o que decidir.
//! `shells::list::list_profiles` continua vivo — `agent_catalog_all` e
//! `prefs::resolve_default` o chamam direto, sem passar por IPC.

/// SPEC: terminal-boot-loading (BOOT-11) — o perfil que um `cwd` implica.
///
/// Núcleo puro em `shells::profile_for_path` (WSLP-07/WSLP-08): um caminho
/// `\\wsl.localhost\<distro>\...` resolve para aquela distro, qualquer outro
/// cai em `Host` — mesmo default fixo que `projects::service::git_init_command`
/// já usa. Nunca `prefs::resolve_default`: aquele valor é um resquício da
/// preferência global que a AD-035 revogou, e usá-lo aqui fazia um caminho
/// puramente Windows (sem prefixo `\\wsl.localhost\` ou `\\wsl$\`) herdar
/// perfil WSL de uma escolha salva antes do seletor sair da UI.
#[tauri::command]
pub fn shell_profile_for_path(cwd: String) -> Result<String, String> {
    Ok(crate::shells::profile_for_path(
        std::path::Path::new(&cwd),
        &crate::shells::TerminalProfile::Host,
    )
    .id())
}
