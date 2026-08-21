// SPEC: terminal-boot-loading (BOOT-11)

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

use std::sync::Mutex;

use tauri::State;

use crate::db::Db;
use crate::shells::prefs;

/// SPEC: terminal-boot-loading (BOOT-11) — o perfil que um `cwd` implica.
///
/// Núcleo puro em `shells::profile_for_path` (WSLP-07/WSLP-08): um caminho
/// `\\wsl.localhost\<distro>\...` resolve para aquela distro, qualquer outro
/// cai no perfil padrão. Existe como comando para que o frontend não precise
/// reimplementar o reconhecimento do prefixo — duas cópias da mesma regra
/// divergiriam na primeira vez que o formato do caminho mudasse. Sem I/O além
/// da leitura da preferência padrão.
#[tauri::command]
pub fn shell_profile_for_path(db: State<'_, Mutex<Db>>, cwd: String) -> Result<String, String> {
    let default = {
        let db = db.lock().map_err(|e| e.to_string())?;
        prefs::resolve_default(db.conn())
    };
    Ok(crate::shells::profile_for_path(std::path::Path::new(&cwd), &default).id())
}
