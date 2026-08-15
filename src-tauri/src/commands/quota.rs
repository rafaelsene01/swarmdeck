// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-11, QUOTA-17)

//! Comandos do indicador de cota. Invólucros finos, mesmo padrão de
//! `commands/update.rs`: regra de negócio mora em `db::quota_prefs` e
//! `quota`, aqui só desserializa, delega, traduz erro para `String` e — só
//! em `quota_claude` — monta o `QuotaSnapshot` que a UI consome.

use std::future::Future;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::quota_prefs::{self, QuotaPrefs};
use crate::db::Db;
use crate::quota::{self, ClaudeQuota, QuotaCache, QuotaError};

const VALID_WINDOWS: [&str; 3] = ["five_hour", "weekly", "both"];

/// Lê a preferência de cota atual.
#[tauri::command]
pub fn quota_prefs_get(db: State<'_, Mutex<Db>>) -> Result<QuotaPrefs, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    quota_prefs::get(db.conn()).map_err(|e| e.to_string())
}

/// Núcleo testável de `quota_prefs_set`: recebe `&Db` direto em vez de
/// `State<Mutex<Db>>`, que exige um app Tauri montado — mesmo motivo de
/// `commands::update::with_db`.
fn set_validated(db: &Db, prefs: &QuotaPrefs) -> Result<(), String> {
    if !VALID_WINDOWS.contains(&prefs.window.as_str()) {
        return Err(format!("janela de cota inválida: {}", prefs.window));
    }
    quota_prefs::set(db.conn(), prefs).map_err(|e| e.to_string())
}

/// Persiste a preferência de cota e avisa a janela principal (QUOTA-11) —
/// a janela de Configurações é um `WebviewWindow` separado, então a
/// mudança não chega lá por estado React compartilhado.
#[tauri::command]
pub fn quota_prefs_set(
    app: AppHandle,
    db: State<'_, Mutex<Db>>,
    prefs: QuotaPrefs,
) -> Result<(), String> {
    {
        let db = db.lock().map_err(|e| e.to_string())?;
        set_validated(&db, &prefs)?;
    }

    let _ = app.emit_to("main", "quota://prefs-changed", &prefs);

    Ok(())
}

/// Uma janela de consumo já pronta para a UI — nenhum campo derivado da
/// credencial, só o que `Header`/`QuotaIndicator` desenham.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindowSnapshot {
    pub kind: &'static str,
    pub label: String,
    pub used_fraction: Option<f64>,
    pub resets_at: Option<String>,
}

/// Retorno de `quota_claude`. `state` cobre os estados sem dado descritos
/// em design.md (Error Handling Strategy) — nenhum deles carrega o token
/// nem qualquer outro campo derivado da credencial.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSnapshot {
    pub state: &'static str,
    pub windows: Vec<QuotaWindowSnapshot>,
    pub plan_label: Option<String>,
    pub fetched_at: Option<i64>,
    pub retry_at: Option<i64>,
}

impl QuotaSnapshot {
    fn empty(state: &'static str) -> Self {
        Self {
            state,
            windows: Vec::new(),
            plan_label: None,
            fetched_at: None,
            retry_at: None,
        }
    }

    fn ok(quota: ClaudeQuota, fetched_at_ms: i64) -> Self {
        Self {
            state: "ok",
            windows: vec![
                QuotaWindowSnapshot {
                    kind: "five_hour",
                    label: "5 horas".to_string(),
                    used_fraction: quota.five_hour.used_fraction,
                    resets_at: quota.five_hour.resets_at,
                },
                QuotaWindowSnapshot {
                    kind: "weekly",
                    label: "Semanal".to_string(),
                    used_fraction: quota.seven_day.used_fraction,
                    resets_at: quota.seven_day.resets_at,
                },
            ],
            plan_label: Some(quota.plan_label),
            fetched_at: Some(fetched_at_ms),
            retry_at: None,
        }
    }

    /// Converte o resultado de `quota::fetch` no snapshot que a UI
    /// consome. `state: "disabled"` nunca passa por aqui — é devolvido
    /// direto pelo guard de `quota_claude`, antes de qualquer fetch.
    fn from_result(result: Result<(ClaudeQuota, i64), QuotaError>) -> Self {
        match result {
            Ok((quota, fetched_at_ms)) => Self::ok(quota, fetched_at_ms),
            Err(QuotaError::NoCredential) => Self::empty("no_credential"),
            Err(QuotaError::Unauthorized) => Self::empty("unauthorized"),
            Err(QuotaError::Offline) => Self::empty("offline"),
            Err(QuotaError::RateLimited { retry_at_epoch_ms }) => Self {
                retry_at: Some(retry_at_epoch_ms),
                ..Self::empty("rate_limited")
            },
        }
    }
}

/// Núcleo testável de `quota_claude`: o guard de `enabled` decide antes de
/// `fetch` ser sequer chamado (QUOTA-17) — com `enabled = false`, `fetch`
/// nunca roda, então pode ser um closure que dá `panic!` se invocado.
async fn quota_claude_with<F, Fut>(enabled: bool, fetch: F) -> QuotaSnapshot
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<(ClaudeQuota, i64), QuotaError>>,
{
    if !enabled {
        return QuotaSnapshot::empty("disabled");
    }
    QuotaSnapshot::from_result(fetch().await)
}

/// Snapshot de cota do Claude. `state: "disabled"` sem tocar disco nem
/// rede quando a preferência está desligada (QUOTA-17).
#[tauri::command]
pub async fn quota_claude(app: AppHandle, force: bool) -> Result<QuotaSnapshot, String> {
    let enabled = {
        let db_state = app.state::<Mutex<Db>>();
        let db = db_state.lock().map_err(|e| e.to_string())?;
        quota_prefs::get(db.conn())
            .map_err(|e| e.to_string())?
            .enabled
    };

    let cache_state = app.state::<QuotaCache>();
    Ok(quota_claude_with(enabled, || quota::fetch(&cache_state, force)).await)
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

    #[test]
    fn window_invalida_e_rejeitada_sem_gravar() {
        let (_dir, mutex) = temp_db();
        let db = mutex.lock().unwrap();
        let before = quota_prefs::get(db.conn()).unwrap();

        let result = set_validated(
            &db,
            &QuotaPrefs {
                enabled: true,
                window: "monthly".to_string(),
            },
        );

        assert!(result.is_err());
        assert_eq!(
            quota_prefs::get(db.conn()).unwrap(),
            before,
            "valor inválido não deve ter sido gravado"
        );
    }

    #[test]
    fn set_seguido_de_get_devolve_o_valor_gravado() {
        let (_dir, mutex) = temp_db();
        let db = mutex.lock().unwrap();

        let prefs = QuotaPrefs {
            enabled: false,
            window: "weekly".to_string(),
        };
        set_validated(&db, &prefs).unwrap();

        assert_eq!(quota_prefs::get(db.conn()).unwrap(), prefs);
    }

    #[tokio::test]
    async fn enabled_falso_devolve_disabled_sem_chamar_fetch() {
        let snapshot = quota_claude_with(false, || async {
            panic!("fetch não deveria ser chamado com enabled = false")
        })
        .await;

        assert_eq!(snapshot.state, "disabled");
        assert!(snapshot.windows.is_empty());
    }

    #[tokio::test]
    async fn enabled_verdadeiro_exercita_o_caminho_de_busca() {
        let snapshot = quota_claude_with(true, || async { Err(QuotaError::Offline) }).await;

        assert_eq!(snapshot.state, "offline");
    }
}
