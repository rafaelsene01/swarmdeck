// SPEC: wsl-terminal-profile (WSLP-01, WSLP-02)
// SPEC: terminal-boot-loading (BOOT-11)

//! Comandos que expõem os perfis de terminal (host/WSL) ao frontend.
//! Invólucros finos, mesmo padrão de `commands/quota.rs`: a regra mora em
//! `shells::list` e `shells::prefs`, aqui só desserializa, delega para lá e
//! traduz erro para `String`.

use std::sync::Mutex;

use tauri::State;

use crate::db::Db;
use crate::shells::list::{list_profiles, ProfileEntry};
use crate::shells::{prefs, TerminalProfile};

/// Lista os perfis selecionáveis: `Host` sempre primeiro, seguido de uma
/// entrada por distro WSL registrada (vazia fora do Windows ou sem WSL).
#[tauri::command]
pub fn shell_profiles_list() -> Vec<ProfileEntry> {
    list_profiles()
}

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

/// Id do perfil salvo como padrão, se houver — bruto, não resolvido contra
/// a lista atual: a UI decide se marca como indisponível (WSLP-13).
#[tauri::command]
pub fn shell_profile_get(db: State<'_, Mutex<Db>>) -> Result<Option<String>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    Ok(prefs::default_profile(db.conn())
        .map_err(|e| e.to_string())?
        .map(|profile| profile.id()))
}

/// Grava `id` como o perfil padrão. Rejeita um id que `TerminalProfile`
/// não reconhece, em vez de gravar lixo que `resolve_default` teria que
/// silenciosamente descartar depois.
#[tauri::command]
pub fn shell_profile_set(db: State<'_, Mutex<Db>>, id: String) -> Result<(), String> {
    let profile =
        TerminalProfile::parse_id(&id).ok_or_else(|| format!("perfil `{id}` inválido"))?;
    let db = db.lock().map_err(|e| e.to_string())?;
    prefs::set_default_profile(db.conn(), &profile).map_err(|e| e.to_string())
}
