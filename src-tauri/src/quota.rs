// SPEC: quota-indicator (QUOTA-15, QUOTA-16, QUOTA-18, QUOTA-19, QUOTA-20, QUOTA-21, QUOTA-22, QUOTA-23, QUOTA-24, QUOTA-25)

//! Núcleo de cota do Claude: decodificação da resposta de uso (pura, sem
//! I/O — T4) e a leitura de credencial + busca HTTP (T5). O cache com piso
//! de 5 minutos entra em T6.

use std::future::Future;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde_json::Value;
use thiserror::Error;

/// Endpoint de uso da Anthropic. Contrato privado, não documentado
/// publicamente — comportamento verificado contra `JuanjoFuchs/ccburn`
/// (`src/ccburn/data/usage_client.py`) em 2026-08-15.
pub const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";

/// Header `anthropic-beta` exigido pelo endpoint OAuth de uso. Mesma fonte
/// e data de verificação de `USAGE_URL`.
pub const ANTHROPIC_BETA_HEADER: &str = "oauth-2025-04-20";

/// Uma janela de consumo decodificada (5 horas ou semanal).
#[derive(Debug, Clone, PartialEq)]
pub struct ClaudeWindow {
    /// Fração `0..=1` consumida. `None` quando a janela não tem dado —
    /// nunca 0 como substituto (QUOTA-19).
    pub used_fraction: Option<f64>,
    /// ISO 8601. `None` quando `resets_at` veio ausente ou inválido
    /// (QUOTA-25) — a fração acima é preservada mesmo assim.
    pub resets_at: Option<String>,
}

/// Cota decodificada das duas janelas usadas pelo indicador.
#[derive(Debug, Clone, PartialEq)]
pub struct ClaudeQuota {
    pub five_hour: ClaudeWindow,
    pub seven_day: ClaudeWindow,
    pub plan_label: String,
}

/// Decodifica o corpo JSON da resposta de uso. Pura — nenhum I/O.
///
/// `tier` é o `rateLimitTier`/`subscriptionType` lido do arquivo de
/// credencial pelo chamador — o corpo da resposta de uso não traz plano.
pub fn decode_usage(body: &Value, tier: Option<&str>) -> ClaudeQuota {
    ClaudeQuota {
        five_hour: decode_window(body.get("five_hour")),
        seven_day: decode_window(body.get("seven_day")),
        plan_label: plan_label(tier),
    }
}

/// Rótulo do plano a partir do tier da credencial (`pro`, `max_20x`,
/// `default_max_5x`...). Casamento por substring porque o campo já apareceu
/// com prefixo (`default_`) — contrato privado. Sem casamento, o rótulo
/// genérico.
fn plan_label(tier: Option<&str>) -> String {
    let Some(raw) = tier else {
        return "Assinatura".to_string();
    };
    let tier = raw.to_ascii_lowercase();
    let label = if tier.contains("max_20x") || tier.contains("max20x") {
        "Max 20x"
    } else if tier.contains("max_5x") || tier.contains("max5x") {
        "Max 5x"
    } else if tier.contains("max") {
        "Max"
    } else if tier.contains("pro") {
        "Pro"
    } else if tier.contains("team") {
        "Team"
    } else if tier.contains("enterprise") {
        "Enterprise"
    } else if tier.contains("free") {
        "Free"
    } else {
        "Assinatura"
    };
    label.to_string()
}

fn decode_window(value: Option<&Value>) -> ClaudeWindow {
    let Some(value) = value else {
        return ClaudeWindow {
            used_fraction: None,
            resets_at: None,
        };
    };

    // `utilization` vem em porcentagem `0..=100` (verificado contra
    // `JuanjoFuchs/ccburn`, `util_normalized = float(utilization) / 100.0`,
    // em 2026-08-16). Fora da faixa vira janela sem dado — nunca clamp.
    let used_fraction = value
        .get("utilization")
        .and_then(Value::as_f64)
        .filter(|f| (0.0..=100.0).contains(f))
        .map(|f| f / 100.0);

    let resets_at = value
        .get("resets_at")
        .and_then(Value::as_str)
        .filter(|s| chrono::DateTime::parse_from_rfc3339(s).is_ok())
        .map(str::to_string);

    ClaudeWindow {
        used_fraction,
        resets_at,
    }
}

/// Token OAuth extraído do arquivo de credencial do Claude Code. `Debug`
/// manual e sem `Serialize` (QUOTA-16): o token nunca cruza a fronteira
/// IPC nem aparece em log ou mensagem de erro.
#[derive(Clone, PartialEq, Eq)]
pub struct AccessToken(String);

impl AccessToken {
    fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for AccessToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AccessToken(<redacted>)")
    }
}

/// Erro de busca de cota. Nenhuma variante carrega o token nem a mensagem
/// bruta do `reqwest` (`e.to_string()`) — só variantes sanitizadas.
#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum QuotaError {
    #[error("Claude Code não está conectado")]
    NoCredential,
    #[error("sessão expirada")]
    Unauthorized,
    #[error("limite de requisições atingido")]
    RateLimited { retry_at_epoch_ms: i64 },
    #[error("sem conexão")]
    Offline,
}

/// Resultado de uma requisição HTTP ao endpoint de uso, já classificado —
/// nunca carrega o corpo bruto de um erro de transporte.
pub enum HttpOutcome {
    Success(Value),
    Unauthorized,
    RateLimited { retry_after_secs: Option<u64> },
}

const MAX_CREDENTIAL_BYTES: u64 = 64 * 1024;

/// Credencial do Claude Code: token e plano assinado. O tier fica no
/// arquivo (`claudeAiOauth.rateLimitTier`, ou `subscriptionType` nas
/// versões que gravam só esse), nunca na resposta de uso.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Credential {
    token: AccessToken,
    tier: Option<String>,
}

/// Lê a credencial de `~/.claude/.credentials.json`. `None` quando o
/// arquivo não existe, excede 64 KB (QUOTA-24 — a leitura é abortada pelo
/// tamanho do metadata, o conteúdo nunca chega a ser lido), não é JSON
/// válido, ou não tem `claudeAiOauth.accessToken` não vazio (QUOTA-20).
/// Aberto somente para leitura (QUOTA-18): `File::open` nunca habilita
/// escrita.
fn read_credential(path: &Path) -> Option<Credential> {
    let metadata = std::fs::metadata(path).ok()?;
    if metadata.len() > MAX_CREDENTIAL_BYTES {
        return None;
    }

    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;

    let value: Value = serde_json::from_slice(&buf).ok()?;
    let oauth = value.get("claudeAiOauth")?;
    let token = oauth.get("accessToken")?.as_str()?;
    if token.is_empty() {
        return None;
    }
    let tier = oauth
        .get("rateLimitTier")
        .or_else(|| oauth.get("subscriptionType"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    Some(Credential {
        token: AccessToken(token.to_string()),
        tier,
    })
}

fn credential_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".claude").join(".credentials.json"))
}

fn retry_at_from(retry_after_secs: Option<u64>, now_ms: i64) -> i64 {
    let floor_secs = retry_after_secs.unwrap_or(0).max(60);
    now_ms + (floor_secs as i64) * 1000
}

/// Núcleo testável da busca: leitor de token, cliente HTTP e relógio
/// injetados (mesmo padrão de `update::check::check_with`). Sem `enabled`
/// aqui — o guard de preferência desligada é responsabilidade do comando
/// (T8, QUOTA-17).
async fn fetch_with<R, H, HFut, N>(
    read_credential: R,
    http: H,
    now: N,
) -> Result<ClaudeQuota, QuotaError>
where
    R: Fn() -> Option<Credential>,
    H: Fn(AccessToken) -> HFut,
    HFut: Future<Output = Result<HttpOutcome, ()>>,
    N: Fn() -> i64,
{
    let Some(credential) = read_credential() else {
        return Err(QuotaError::NoCredential);
    };
    let token_str = credential.token.as_str().to_string();
    let tier = credential.tier;

    match http(credential.token)
        .await
        .map_err(|_| QuotaError::Offline)?
    {
        HttpOutcome::Success(body) => Ok(decode_usage(&body, tier.as_deref())),
        HttpOutcome::RateLimited { retry_after_secs } => Err(QuotaError::RateLimited {
            retry_at_epoch_ms: retry_at_from(retry_after_secs, now()),
        }),
        HttpOutcome::Unauthorized => {
            // Releitura única (QUOTA-21): token igual encerra sem 2ª
            // requisição; token novo tenta de novo, e essa segunda
            // resposta é final (sem 3ª tentativa).
            let Some(retry) = read_credential() else {
                return Err(QuotaError::Unauthorized);
            };
            if retry.token.as_str() == token_str {
                return Err(QuotaError::Unauthorized);
            }
            let retry_tier = retry.tier;

            match http(retry.token).await.map_err(|_| QuotaError::Offline)? {
                HttpOutcome::Success(body) => Ok(decode_usage(&body, retry_tier.as_deref())),
                HttpOutcome::RateLimited { retry_after_secs } => Err(QuotaError::RateLimited {
                    retry_at_epoch_ms: retry_at_from(retry_after_secs, now()),
                }),
                HttpOutcome::Unauthorized => Err(QuotaError::Unauthorized),
            }
        }
    }
}

async fn real_http(token: AccessToken) -> Result<HttpOutcome, ()> {
    let client = reqwest::Client::new();
    let response = client
        .get(USAGE_URL)
        .header("anthropic-beta", ANTHROPIC_BETA_HEADER)
        .header("authorization", format!("Bearer {}", token.as_str()))
        .header(
            "user-agent",
            format!("swarmdeck/{}", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .await
        .map_err(|_| ())?;

    match response.status().as_u16() {
        200..=299 => {
            let body = response.json::<Value>().await.map_err(|_| ())?;
            Ok(HttpOutcome::Success(body))
        }
        401 => Ok(HttpOutcome::Unauthorized),
        429 => {
            let retry_after_secs = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            Ok(HttpOutcome::RateLimited { retry_after_secs })
        }
        _ => Err(()),
    }
}

fn real_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn real_read_credential() -> Option<Credential> {
    read_credential(&credential_path()?)
}

/// Piso de cache: uma leitura com menos de 5 minutos é servida sem nova
/// requisição (QUOTA-14). `force` ignora o piso (mas não desliga o cache:
/// uma busca forçada com sucesso ainda atualiza a leitura guardada).
const CACHE_FLOOR_MS: i64 = 5 * 60 * 1000;

struct CachedReading {
    quota: ClaudeQuota,
    fetched_at_ms: i64,
}

/// Cache em memória da última leitura de cota bem-sucedida. Nunca
/// persistido em disco — o dado tem validade de 5 minutos e é irrelevante
/// entre execuções do app. Pensado para viver em `tauri::State`.
#[derive(Default)]
pub struct QuotaCache {
    last: std::sync::Mutex<Option<CachedReading>>,
}

impl QuotaCache {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Núcleo testável do cache: mesmas dependências injetadas de
/// `fetch_with`, mais o estado do cache e o `force`. Uma busca que falha
/// nunca sobrescreve a última leitura bem-sucedida guardada — ela só é
/// atualizada em caso de sucesso. O `i64` no `Ok` é o epoch ms da leitura
/// (nova ou servida do cache) — QUOTA-05 precisa dele para "atualizado há
/// N min".
async fn fetch_cached_with<R, H, HFut, N>(
    cache: &QuotaCache,
    force: bool,
    read_credential: R,
    http: H,
    now: N,
) -> Result<(ClaudeQuota, i64), QuotaError>
where
    R: Fn() -> Option<Credential>,
    H: Fn(AccessToken) -> HFut,
    HFut: Future<Output = Result<HttpOutcome, ()>>,
    N: Fn() -> i64,
{
    let now_ms = now();

    if !force {
        let cached = cache.last.lock().expect("quota cache mutex poisoned");
        if let Some(reading) = cached.as_ref() {
            if now_ms - reading.fetched_at_ms < CACHE_FLOOR_MS {
                return Ok((reading.quota.clone(), reading.fetched_at_ms));
            }
        }
    }

    let result = fetch_with(read_credential, http, || now_ms).await;

    if let Ok(quota) = &result {
        let mut cached = cache.last.lock().expect("quota cache mutex poisoned");
        *cached = Some(CachedReading {
            quota: quota.clone(),
            fetched_at_ms: now_ms,
        });
    }

    result.map(|quota| (quota, now_ms))
}

/// Versão de produção: caminho real, `reqwest` real, relógio real, cache
/// de `state`.
pub async fn fetch(state: &QuotaCache, force: bool) -> Result<(ClaudeQuota, i64), QuotaError> {
    fetch_cached_with(state, force, real_read_credential, real_http, real_now_ms).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn corpo_normal_produz_as_duas_janelas_com_fracao_e_reset_corretos() {
        let body = json!({
            "five_hour": { "utilization": 18, "resets_at": "2026-08-15T18:00:00Z" },
            "seven_day": { "utilization": 8, "resets_at": "2026-08-20T00:00:00Z" },
        });

        let quota = decode_usage(&body, Some("pro"));

        assert_eq!(
            quota.five_hour,
            ClaudeWindow {
                used_fraction: Some(0.18),
                resets_at: Some("2026-08-15T18:00:00Z".to_string()),
            }
        );
        assert_eq!(
            quota.seven_day,
            ClaudeWindow {
                used_fraction: Some(0.08),
                resets_at: Some("2026-08-20T00:00:00Z".to_string()),
            }
        );
        assert_eq!(quota.plan_label, "Pro");
    }

    #[test]
    fn utilization_fora_de_0_a_100_produz_janela_sem_dado() {
        let body = json!({
            "five_hour": { "utilization": 150, "resets_at": "2026-08-15T18:00:00Z" },
        });

        let quota = decode_usage(&body, None);

        assert_eq!(quota.five_hour.used_fraction, None);
    }

    #[test]
    fn tier_da_credencial_vira_rotulo_do_plano() {
        assert_eq!(plan_label(Some("default_max_20x")), "Max 20x");
        assert_eq!(plan_label(Some("max_5x")), "Max 5x");
        assert_eq!(plan_label(Some("Max")), "Max");
        assert_eq!(plan_label(Some("pro")), "Pro");
        assert_eq!(plan_label(Some("outro_plano")), "Assinatura");
    }

    #[test]
    fn tier_sai_do_arquivo_de_credencial_nao_do_corpo_da_resposta() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(".credentials.json");
        std::fs::write(
            &path,
            r#"{"claudeAiOauth":{"accessToken":"t","rateLimitTier":"default_max_20x"}}"#,
        )
        .expect("escrever credencial");

        assert_eq!(
            read_credential(&path).and_then(|c| c.tier).as_deref(),
            Some("default_max_20x")
        );

        // Versões que gravam só `subscriptionType` também servem.
        std::fs::write(
            &path,
            r#"{"claudeAiOauth":{"accessToken":"t","subscriptionType":"pro"}}"#,
        )
        .expect("escrever credencial");

        assert_eq!(
            read_credential(&path).and_then(|c| c.tier).as_deref(),
            Some("pro")
        );
    }

    #[test]
    fn seven_day_ausente_produz_janela_sem_dado_sem_panic() {
        let body = json!({
            "five_hour": { "utilization": 50, "resets_at": "2026-08-15T18:00:00Z" },
        });

        let quota = decode_usage(&body, None);

        assert_eq!(
            quota.seven_day,
            ClaudeWindow {
                used_fraction: None,
                resets_at: None,
            }
        );
    }

    #[test]
    fn resets_at_invalido_preserva_fracao_e_zera_reset() {
        let body = json!({
            "five_hour": { "utilization": 42, "resets_at": "not-a-date" },
        });

        let quota = decode_usage(&body, None);

        assert_eq!(quota.five_hour.used_fraction, Some(0.42));
        assert_eq!(quota.five_hour.resets_at, None);
    }

    #[test]
    fn rate_limit_tier_ausente_produz_o_rotulo_de_fallback() {
        let body = json!({});

        let quota = decode_usage(&body, None);

        assert_eq!(quota.plan_label, "Assinatura");
    }

    // T5: leitura de credencial e busca HTTP.

    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    fn write_credential(dir: &tempfile::TempDir, token: &str) -> PathBuf {
        let path = dir.path().join(".credentials.json");
        std::fs::write(
            &path,
            format!(r#"{{"claudeAiOauth":{{"accessToken":"{token}"}}}}"#),
        )
        .expect("escrever arquivo de credencial de teste");
        path
    }

    async fn panicking_http(_token: AccessToken) -> Result<HttpOutcome, ()> {
        panic!("cliente HTTP não deveria ser chamado")
    }

    #[test]
    fn arquivo_ausente_devolve_none() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("nao-existe.json");

        assert_eq!(read_credential(&path), None);
    }

    #[test]
    fn arquivo_sem_access_token_devolve_none() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(".credentials.json");
        std::fs::write(&path, r#"{"outraChave": true}"#).expect("escrever arquivo");

        assert_eq!(read_credential(&path), None);
    }

    #[tokio::test]
    async fn arquivo_de_65kb_devolve_no_credential_sem_chamar_o_cliente_http() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(".credentials.json");
        std::fs::write(&path, vec![b' '; 65 * 1024]).expect("escrever arquivo grande");

        let result = fetch_with(|| read_credential(&path), panicking_http, || 0).await;

        assert_eq!(result, Err(QuotaError::NoCredential));
    }

    #[tokio::test]
    async fn quatrocentos_e_um_com_token_inalterado_devolve_unauthorized_com_uma_requisicao() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_credential(&dir, "token-fixo");
        let calls = Arc::new(AtomicU32::new(0));
        let calls_clone = calls.clone();

        let result = fetch_with(
            || read_credential(&path),
            move |_token| {
                calls_clone.fetch_add(1, Ordering::SeqCst);
                async { Ok(HttpOutcome::Unauthorized) }
            },
            || 0,
        )
        .await;

        assert_eq!(result, Err(QuotaError::Unauthorized));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn quatrocentos_e_um_com_token_novo_emite_a_segunda_requisicao() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_credential(&dir, "token-velho");
        let calls = Arc::new(AtomicU32::new(0));
        let calls_clone = calls.clone();
        let path_clone = path.clone();

        let result = fetch_with(
            move || read_credential(&path_clone),
            move |token| {
                let n = calls_clone.fetch_add(1, Ordering::SeqCst);
                let path = dir.path().join(".credentials.json");
                async move {
                    if n == 0 {
                        // Simula o Claude Code renovando o token entre a
                        // primeira tentativa e a releitura.
                        assert_eq!(token.as_str(), "token-velho");
                        std::fs::write(&path, r#"{"claudeAiOauth":{"accessToken":"token-novo"}}"#)
                            .expect("renovar credencial");
                        Ok(HttpOutcome::Unauthorized)
                    } else {
                        assert_eq!(token.as_str(), "token-novo");
                        Ok(HttpOutcome::Success(json!({})))
                    }
                }
            },
            || 0,
        )
        .await;

        assert!(result.is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn quatrocentos_e_vinte_e_nove_com_retry_after_10_devolve_piso_de_60s() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_credential(&dir, "token");

        let result = fetch_with(
            || read_credential(&path),
            |_token| async {
                Ok(HttpOutcome::RateLimited {
                    retry_after_secs: Some(10),
                })
            },
            || 1_000,
        )
        .await;

        assert_eq!(
            result,
            Err(QuotaError::RateLimited {
                retry_at_epoch_ms: 1_000 + 60_000
            })
        );
    }

    #[tokio::test]
    async fn erro_de_transporte_devolve_offline() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_credential(&dir, "token");

        let result = fetch_with(|| read_credential(&path), |_token| async { Err(()) }, || 0).await;

        assert_eq!(result, Err(QuotaError::Offline));
    }

    #[test]
    fn nenhuma_variante_de_erro_contem_o_valor_do_token_no_debug() {
        let token = AccessToken("segredo-nao-pode-vazar".to_string());
        assert!(!format!("{token:?}").contains("segredo-nao-pode-vazar"));

        let variants = [
            QuotaError::NoCredential,
            QuotaError::Unauthorized,
            QuotaError::RateLimited {
                retry_at_epoch_ms: 123,
            },
            QuotaError::Offline,
        ];
        for variant in variants {
            assert!(!format!("{variant:?}").contains("segredo-nao-pode-vazar"));
        }
    }

    // T6: cache com piso de 5 minutos.

    fn counting_success_http(
        calls: Arc<AtomicU32>,
    ) -> impl Fn(AccessToken) -> std::pin::Pin<Box<dyn Future<Output = Result<HttpOutcome, ()>> + Send>>
    {
        move |_token| {
            calls.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Ok(HttpOutcome::Success(json!({}))) })
        }
    }

    #[tokio::test]
    async fn segunda_chamada_1_minuto_depois_nao_invoca_o_cliente_http() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_credential(&dir, "token");
        let cache = QuotaCache::new();
        let calls = Arc::new(AtomicU32::new(0));

        fetch_cached_with(
            &cache,
            false,
            || read_credential(&path),
            counting_success_http(calls.clone()),
            || 0,
        )
        .await
        .expect("primeira busca deve ter sucesso");

        fetch_cached_with(
            &cache,
            false,
            || read_credential(&path),
            counting_success_http(calls.clone()),
            || 60_000,
        )
        .await
        .expect("segunda chamada deve servir o cache");

        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn segunda_chamada_6_minutos_depois_invoca_o_cliente() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_credential(&dir, "token");
        let cache = QuotaCache::new();
        let calls = Arc::new(AtomicU32::new(0));

        fetch_cached_with(
            &cache,
            false,
            || read_credential(&path),
            counting_success_http(calls.clone()),
            || 0,
        )
        .await
        .expect("primeira busca deve ter sucesso");

        fetch_cached_with(
            &cache,
            false,
            || read_credential(&path),
            counting_success_http(calls.clone()),
            || 6 * 60_000,
        )
        .await
        .expect("segunda busca, cache expirado, deve ter sucesso");

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn force_true_a_1_minuto_invoca_o_cliente() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_credential(&dir, "token");
        let cache = QuotaCache::new();
        let calls = Arc::new(AtomicU32::new(0));

        fetch_cached_with(
            &cache,
            false,
            || read_credential(&path),
            counting_success_http(calls.clone()),
            || 0,
        )
        .await
        .expect("primeira busca deve ter sucesso");

        fetch_cached_with(
            &cache,
            true,
            || read_credential(&path),
            counting_success_http(calls.clone()),
            || 60_000,
        )
        .await
        .expect("busca forçada deve ter sucesso");

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}
