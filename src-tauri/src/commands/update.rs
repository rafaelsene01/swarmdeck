// SPEC: release-distribution (REL-20, REL-23, REL-35, REL-36)

//! Comandos Tauri que alimentam a seção "Atualizações" de `UpdateSettings.tsx`.
//!
//! Invólucros finos, mesmo padrão de `commands/terminal.rs` e
//! `commands/projects.rs`: nenhuma regra de negócio mora aqui — só
//! desserializa o argumento, delega para `update::check` / `db::settings` e
//! traduz o erro para `String`.

use std::sync::Mutex;

use tauri::{AppHandle, State};

use crate::db::{self, skip_version, Db};
use crate::update::{self, UpdateInfo};

/// Verificação sob demanda: mesmo núcleo de `update::check` usado no boot
/// (T15), aqui acionável a qualquer momento (ex.: um botão futuro em T18).
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    update::check(&app).await.map_err(|e| e.to_string())
}

/// Marca `version` como pulada (REL-23) — só essa versão para de gerar
/// aviso; qualquer versão futura continua sendo avisada normalmente.
#[tauri::command]
pub fn update_skip_version(db: State<'_, Mutex<Db>>, version: String) -> Result<(), String> {
    let db = db.lock().expect("db mutex poisoned");
    skip_version(db.conn(), &version).map_err(|e| e.to_string())
}

/// Trava `db`, traduzindo mutex poisoned para `Err(String)` (spec
/// `01-auto-check-toggle-commands` AC3) em vez de panicar através do IPC —
/// separado da função `#[tauri::command]` só para poder ser exercitado por
/// teste sem precisar de um `State<Mutex<Db>>` de verdade (que exige app
/// Tauri montado).
fn with_db<T>(db: &Mutex<Db>, f: impl FnOnce(&Db) -> Result<T, db::DbError>) -> Result<T, String> {
    let guard = db.lock().map_err(|e| e.to_string())?;
    f(&guard).map_err(|e| e.to_string())
}

/// Lê o toggle de verificação automática (REL-35) para o toggle da UI.
#[tauri::command]
pub fn update_auto_check_get(db: State<'_, Mutex<Db>>) -> Result<bool, String> {
    with_db(db.inner(), |db| db::auto_check(db.conn()))
}

/// Persiste o toggle de verificação automática (REL-36).
#[tauri::command]
pub fn update_auto_check_set(db: State<'_, Mutex<Db>>, enabled: bool) -> Result<(), String> {
    with_db(db.inner(), |db| db::set_auto_check(db.conn(), enabled))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> (tempfile::TempDir, Mutex<Db>) {
        let dir = tempfile::tempdir().expect("criar diretório temporário");
        let path = dir.path().join("swarmdeck.db");
        let db = Db::open(&path).expect("abrir banco");
        (dir, Mutex::new(db))
    }

    // AC1/AC2: get lê o que set gravou.
    #[test]
    fn with_db_le_o_valor_atual_e_reflete_o_que_foi_gravado() {
        let (_dir, mutex) = temp_db();

        assert!(
            with_db(&mutex, |db| db::auto_check(db.conn())).unwrap(),
            "auto_check nasce ligado (REL-34)"
        );

        with_db(&mutex, |db| db::set_auto_check(db.conn(), false)).unwrap();

        assert!(
            !with_db(&mutex, |db| db::auto_check(db.conn())).unwrap(),
            "set_auto_check(false) deve refletir na próxima leitura"
        );
    }

    // AC3: mutex poisoned vira Err(String), nunca panica através do IPC.
    #[test]
    fn with_db_com_mutex_poisoned_retorna_err_em_vez_de_panicar() {
        let (_dir, mutex) = temp_db();

        // Panic durante o unwind com o guard vivo já marca o Mutex como
        // poisoned, mesmo capturado na mesma thread via catch_unwind.
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = mutex.lock().unwrap();
            panic!("poison de propósito para o teste");
        }));

        let result = with_db(&mutex, |db| db::auto_check(db.conn()));
        assert!(result.is_err(), "mutex poisoned deve virar Err, não panic");
    }
}
