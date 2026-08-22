// SPEC: quota-indicator (QUOTA-15, QUOTA-16, QUOTA-19, QUOTA-20, QUOTA-21, QUOTA-22, QUOTA-23, QUOTA-24, QUOTA-25;
// QUOTA-18 — REVOKED by AD-043: o arquivo de credencial deixou de ser somente leitura),
// quota-token-refresh (QTR-01, QTR-02, QTR-03, QTR-04, QTR-05, QTR-06, QTR-07, QTR-08, QTR-09, QTR-13, QTR-14, QTR-15),
// quota-provider-source (QSRC-05, QSRC-06 — a cadeia de candidatos de QUOTA-15 passa a valer só sem escolha gravada)

//! Núcleo de cota do Claude: decodificação da resposta de uso (pura, sem
//! I/O — T4) e a leitura de credencial + busca HTTP (T5). O cache com piso
//! de 5 minutos entra em T6.

use std::future::Future;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde_json::Value;
use thiserror::Error;

use crate::shells::TerminalProfile;

/// Endpoint de uso da Anthropic. Contrato privado, não documentado
/// publicamente — comportamento verificado contra `JuanjoFuchs/ccburn`
/// (`src/ccburn/data/usage_client.py`) em 2026-08-15.
pub const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";

/// Header `anthropic-beta` exigido pelo endpoint OAuth de uso. Mesma fonte
/// e data de verificação de `USAGE_URL`.
pub const ANTHROPIC_BETA_HEADER: &str = "oauth-2025-04-20";

/// Endpoint de troca de token OAuth (QTR-01). Mesmo endpoint que o próprio
/// Claude Code usa; contrato privado, confirmado no rastreador de issues do
/// CLI (anthropics/claude-code #47754, #53063) em 21/08/2026.
pub const OAUTH_TOKEN_URL: &str = "https://platform.claude.com/v1/oauth/token";

/// `client_id` público do Claude Code. Cliente público, então o `client_id`
/// acompanha o `grant_type=refresh_token`. Se este valor estiver errado a
/// requisição falha e QTR-05 transforma isso em no-op — nunca em perda da
/// credencial.
pub const OAUTH_CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/// Margem de expiração (QTR-01): um token que vence nos próximos 60 s é
/// tratado como vencido, senão ele seria enviado e recusado em voo. Sessenta
/// segundos são desprezíveis diante das ~8 h de vida do token.
const EXPIRY_SKEW_MS: i64 = 60 * 1000;

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

/// Refresh token OAuth (QTR-09). Tipo próprio, e não `String`, pelo mesmo
/// motivo de `AccessToken`: `Debug` redigido e nenhum `Serialize`, para que
/// ele não escape por log nem por IPC.
#[derive(Clone, PartialEq, Eq)]
pub struct RefreshToken(String);

impl RefreshToken {
    fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for RefreshToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RefreshToken(<redacted>)")
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
    /// SPEC: quota-token-refresh (QTR-06) — `None` quando o arquivo não traz
    /// `claudeAiOauth.refreshToken` (login por API key, Bedrock, Vertex).
    /// Sem ele não há o que trocar, e a renovação é pulada.
    refresh: Option<RefreshToken>,
    /// SPEC: quota-token-refresh (QTR-13) — epoch ms de expiração. `None`
    /// quando o arquivo não diz: ausência **não** é prova de vencimento, e o
    /// token é usado como está.
    expires_at_ms: Option<i64>,
}

/// Extrai a credencial do JSON já parseado. Pura. `None` quando não há
/// `claudeAiOauth.accessToken` não vazio (QUOTA-20).
fn parse_credential(value: &Value) -> Option<Credential> {
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
    let refresh = oauth
        .get("refreshToken")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(|s| RefreshToken(s.to_string()));
    let expires_at_ms = oauth.get("expiresAt").and_then(Value::as_i64);

    Some(Credential {
        token: AccessToken(token.to_string()),
        tier,
        refresh,
        expires_at_ms,
    })
}

/// Lê `~/.claude/.credentials.json` e devolve **o JSON inteiro** junto da
/// credencial. O JSON cru é o que QTR-02 precisa para regravar só os três
/// campos OAuth e preservar todo o resto do arquivo.
///
/// `None` quando o arquivo não existe, excede 64 KB (QUOTA-24 — a leitura é
/// abortada pelo tamanho do metadata, o conteúdo nunca chega a ser lido),
/// não é JSON válido, ou não tem `accessToken` utilizável.
fn read_credential_file(path: &Path) -> Option<(Value, Credential)> {
    let metadata = std::fs::metadata(path).ok()?;
    if metadata.len() > MAX_CREDENTIAL_BYTES {
        return None;
    }

    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;

    let value: Value = serde_json::from_slice(&buf).ok()?;
    let credential = parse_credential(&value)?;
    Some((value, credential))
}

/// Caminho da credencial **num** perfil. `Host` é `dirs::home_dir()`, como
/// sempre; numa distro WSL é o `HOME` de lá em forma UNC
/// (`shells::home::wsl_home`).
fn credential_path_in(profile: &TerminalProfile) -> Option<PathBuf> {
    let home = match profile {
        TerminalProfile::Host => dirs::home_dir()?,
        TerminalProfile::Wsl { distro } => crate::shells::home::wsl_home(distro)?,
    };
    Some(home.join(".claude").join(".credentials.json"))
}

/// Ordem em que os perfis são tentados: o padrão primeiro, depois os demais
/// que `list_profiles` conhece, sem repetir. Puro — recebe a lista já pronta.
///
/// O fallback existe porque a credencial descreve uma **conta**, não uma
/// máquina: a cota que o endpoint devolve é a mesma independentemente de o
/// `claude login` ter rodado no Windows ou dentro da distro. Então achar em
/// qualquer perfil é melhor que não mostrar nada — o caso real que motivou
/// isto é um Windows com tudo configurado no Ubuntu da WSL, onde
/// `dirs::home_dir()` nunca teve `.claude/`.
///
/// O padrão vem primeiro, e não é só estética: se host e distro tiverem
/// contas **diferentes** logadas, a cota mostrada tem de ser a do perfil que
/// o usuário escolheu para rodar os agentes.
fn credential_candidates(
    default_profile: &TerminalProfile,
    available: &[String],
    chosen: Option<&TerminalProfile>,
) -> Vec<TerminalProfile> {
    // SPEC: quota-provider-source (QSRC-05) — escolha explícita encerra a
    // lista: o usuário disse de qual terminal a cota vem, e cair em outro
    // mostraria a cota de outra conta como se fosse a dele. Sem escolha
    // (QSRC-06) a cadeia é a de sempre, e é ela que cobre o Windows cujo
    // `.claude/` só existe dentro da distro.
    if let Some(profile) = chosen {
        return vec![profile.clone()];
    }
    let mut candidates = vec![default_profile.clone()];
    for id in available {
        if let Some(profile) = TerminalProfile::parse_id(id) {
            if profile != *default_profile {
                candidates.push(profile);
            }
        }
    }
    candidates
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

/// Percorre os candidatos e devolve a primeira credencial legível. `None`
/// quando nenhum perfil tem `.claude/.credentials.json` utilizável — é o que
/// vira `state: "no_credential"` na UI.
fn real_read_credential(
    default_profile: &TerminalProfile,
    chosen: Option<&TerminalProfile>,
) -> Option<Credential> {
    locate_credential(default_profile, chosen).map(|(_, _, credential)| credential)
}

/// Só a credencial, sem o JSON cru. `#[cfg(test)]` porque o código de
/// produção sempre precisa do caminho e do arquivo inteiro (QTR-02) e entra
/// por `locate_credential`; os testes de leitura, que só olham a credencial,
/// continuam legíveis com este atalho.
#[cfg(test)]
fn read_credential(path: &Path) -> Option<Credential> {
    read_credential_file(path).map(|(_, credential)| credential)
}

/// Igual a `real_read_credential`, mas devolve **onde** a credencial estava e
/// o JSON inteiro do arquivo. É o que a renovação precisa: regravar o mesmo
/// arquivo que foi lido, e não outro candidato (QTR-02).
fn locate_credential(
    default_profile: &TerminalProfile,
    chosen: Option<&TerminalProfile>,
) -> Option<(PathBuf, Value, Credential)> {
    // QSRC-05: com escolha explícita a lista viva de perfis não é sequer
    // consultada — um `wsl.exe -l -v` que não decide nada.
    let available: Vec<String> = if chosen.is_some() {
        Vec::new()
    } else {
        crate::shells::list::list_profiles()
            .into_iter()
            .map(|entry| entry.id)
            .collect()
    };

    credential_candidates(default_profile, &available, chosen)
        .iter()
        .filter_map(credential_path_in)
        .find_map(|path| {
            read_credential_file(&path).map(|(raw, credential)| (path, raw, credential))
        })
}

/// Resposta do endpoint de troca, já decodificada.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Refreshed {
    /// String crua de propósito: ela vai direto para o JSON do arquivo, não
    /// para uma requisição. Quem usa o token como token recebe um
    /// `AccessToken` na releitura do arquivo.
    access_token: String,
    /// `None` quando o endpoint não rotacionou — aí o `refreshToken` do
    /// arquivo é preservado (QTR-14).
    refresh_token: Option<String>,
    expires_at_ms: Option<i64>,
}

/// Decide se vale trocar o token (QTR-01). Falso — sem tocar rede — quando
/// não há `refreshToken` (QTR-06) ou quando o arquivo não diz quando o token
/// vence (QTR-13): ausência de `expiresAt` não é prova de vencimento.
fn needs_refresh(credential: &Credential, now_ms: i64) -> bool {
    credential.refresh.is_some()
        && credential
            .expires_at_ms
            .is_some_and(|expires| expires <= now_ms + EXPIRY_SKEW_MS)
}

/// Decodifica o corpo da troca. Pura. `None` quando não há `access_token`
/// não vazio — é o que QTR-05 trata como falha.
///
/// A expiração aceita `expires_in` (segundos, forma padrão do OAuth) e,
/// como alternativa, um epoch ms já pronto — o endpoint é contrato privado e
/// custa três linhas não depender de qual das duas formas ele manda.
fn parse_refresh_response(body: &Value, now_ms: i64) -> Option<Refreshed> {
    let access_token = body
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())?
        .to_string();

    let refresh_token = body
        .get("refresh_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let expires_at_ms = body
        .get("expires_in")
        .and_then(Value::as_i64)
        .map(|secs| now_ms + secs * 1000)
        .or_else(|| body.get("expires_at").and_then(Value::as_i64))
        .or_else(|| body.get("expiresAt").and_then(Value::as_i64));

    Some(Refreshed {
        access_token,
        refresh_token,
        expires_at_ms,
    })
}

/// Aplica a troca sobre o JSON original (QTR-02). Pura: devolve uma cópia
/// com só os três campos OAuth trocados, e todo o resto do arquivo intacto —
/// inclusive chaves que este app não conhece. `None` quando `claudeAiOauth`
/// não é um objeto, caso em que não há onde escrever.
fn apply_refreshed(existing: &Value, refreshed: &Refreshed) -> Option<Value> {
    let mut merged = existing.clone();
    let oauth = merged.get_mut("claudeAiOauth")?.as_object_mut()?;

    oauth.insert(
        "accessToken".to_string(),
        Value::String(refreshed.access_token.clone()),
    );
    if let Some(refresh) = &refreshed.refresh_token {
        oauth.insert("refreshToken".to_string(), Value::String(refresh.clone()));
    }
    if let Some(expires) = refreshed.expires_at_ms {
        oauth.insert("expiresAt".to_string(), Value::Number(expires.into()));
    }

    Some(merged)
}

/// Grava o arquivo de credencial de forma atômica (QTR-03): temporário no
/// mesmo diretório, `sync_all`, depois `rename` por cima do original.
/// `std::fs::rename` substitui o destino nos dois sistemas — no Windows via
/// `MoveFileEx` com `MOVEFILE_REPLACE_EXISTING`.
///
/// AD-043 revoga QUOTA-18: este é o único ponto do app que **escreve** no
/// arquivo de credencial do Claude Code.
fn write_credential_atomic(path: &Path, value: &Value) -> std::io::Result<()> {
    let dir = path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "caminho de credencial sem diretório pai",
        )
    })?;

    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;

    let temp = dir.join(".credentials.json.swarmdeck-tmp");
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
    }

    // A credencial é um segredo: o temporário nasce com o modo do original
    // (0600 na prática) em vez do padrão do umask.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(path)
            .map(|meta| meta.permissions().mode() & 0o777)
            .unwrap_or(0o600);
        let _ = std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(mode));
    }

    match std::fs::rename(&temp, path) {
        Ok(()) => Ok(()),
        Err(err) => {
            let _ = std::fs::remove_file(&temp);
            Err(err)
        }
    }
}

/// Núcleo testável da renovação: localizador, HTTP e escritor injetados —
/// mesmo padrão de `fetch_with`. Devolve `true` só quando o arquivo foi
/// efetivamente regravado.
///
/// Toda saída antecipada é um requisito, não uma otimização: sem credencial
/// (QTR-07), token ainda válido (QTR-04), sem `refreshToken` (QTR-06), troca
/// que falhou (QTR-05) ou escrita que falhou (QTR-15) — em todos, o arquivo
/// fica como estava e a busca segue com o token que já havia.
async fn ensure_fresh_with<L, H, HFut, W>(locate: L, http: H, write: W, now_ms: i64) -> bool
where
    L: Fn() -> Option<(PathBuf, Value, Credential)>,
    H: Fn(RefreshToken) -> HFut,
    HFut: Future<Output = Result<Value, ()>>,
    W: Fn(&Path, &Value) -> Result<(), String>,
{
    let Some((path, raw, credential)) = locate() else {
        return false;
    };
    if !needs_refresh(&credential, now_ms) {
        return false;
    }
    let Some(refresh) = credential.refresh else {
        return false;
    };
    let Ok(body) = http(refresh).await else {
        return false;
    };
    let Some(refreshed) = parse_refresh_response(&body, now_ms) else {
        return false;
    };
    let Some(merged) = apply_refreshed(&raw, &refreshed) else {
        return false;
    };

    match write(&path, &merged) {
        Ok(()) => true,
        Err(err) => {
            // QTR-09: `err` é a mensagem do `io::Error`, que fala de caminho
            // e permissão — nunca de token.
            eprintln!("swarmdeck: falha ao gravar a credencial renovada: {err}");
            false
        }
    }
}

async fn real_refresh_http(refresh: RefreshToken) -> Result<Value, ()> {
    let client = reqwest::Client::new();
    let response = client
        .post(OAUTH_TOKEN_URL)
        .header(
            "user-agent",
            format!("swarmdeck/{}", env!("CARGO_PKG_VERSION")),
        )
        .json(&serde_json::json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh.as_str(),
            "client_id": OAUTH_CLIENT_ID,
        }))
        .send()
        .await
        .map_err(|_| ())?;

    if !response.status().is_success() {
        return Err(());
    }
    response.json::<Value>().await.map_err(|_| ())
}

/// Serializa as renovações do processo (QTR-08). Sem esta trava, o tick do
/// anel e um hover simultâneos trocariam o **mesmo** `refreshToken` duas
/// vezes; a segunda troca usaria um token já rotacionado pela primeira e
/// falharia — pior, gastaria a rotação.
fn refresh_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

/// Versão de produção da renovação. Best-effort por construção: não devolve
/// erro porque nenhum desfecho dela muda o que a busca de cota faz em
/// seguida — ela apenas pode ter deixado um token melhor no disco.
async fn ensure_fresh(default_profile: &TerminalProfile, chosen: Option<&TerminalProfile>) {
    let _guard = refresh_lock().lock().await;
    let profile = default_profile.clone();
    let chosen = chosen.cloned();
    ensure_fresh_with(
        move || locate_credential(&profile, chosen.as_ref()),
        real_refresh_http,
        |path, value| write_credential_atomic(path, value).map_err(|err| err.to_string()),
        real_now_ms(),
    )
    .await;
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
///
/// `default_profile` decide de onde a credencial é lida (QUOTA-15): num
/// Windows cujo Claude Code vive dentro da distro, o `.claude/` do host não
/// existe — ver `credential_candidates`.
pub async fn fetch(
    state: &QuotaCache,
    force: bool,
    default_profile: &TerminalProfile,
    chosen: Option<&TerminalProfile>,
) -> Result<(ClaudeQuota, i64), QuotaError> {
    // SPEC: quota-token-refresh (QTR-01) — a renovação vem **antes** da
    // busca: é ela que faz a cota já estar pronta quando o overlay de boot
    // solta (BOOT-09), em vez de o boot mandar um token vencido, tomar 401 e
    // o anel nascer em "sessão expirada".
    ensure_fresh(default_profile, chosen).await;

    fetch_cached_with(
        state,
        force,
        || real_read_credential(default_profile, chosen),
        real_http,
        real_now_ms,
    )
    .await
}

// SPEC: quota-token-refresh (QTR-01, QTR-02, QTR-03, QTR-04, QTR-05, QTR-06,
// QTR-07, QTR-13, QTR-14, QTR-15)
#[cfg(test)]
mod refresh_tests {
    use super::*;

    const NOW: i64 = 1_700_000_000_000;

    fn credential(expires_at_ms: Option<i64>, with_refresh: bool) -> Credential {
        Credential {
            token: AccessToken("access-antigo".to_string()),
            tier: Some("pro".to_string()),
            refresh: with_refresh.then(|| RefreshToken("refresh-antigo".to_string())),
            expires_at_ms,
        }
    }

    fn file_json() -> Value {
        serde_json::json!({
            "claudeAiOauth": {
                "accessToken": "access-antigo",
                "refreshToken": "refresh-antigo",
                "expiresAt": NOW - 1,
                "scopes": ["user:inference"],
                "subscriptionType": "pro"
            },
            "outraChaveQueNaoConhecemos": { "manter": true }
        })
    }

    // QTR-01
    #[test]
    fn token_vencido_com_refresh_precisa_renovar() {
        assert!(needs_refresh(&credential(Some(NOW - 1), true), NOW));
    }

    // QTR-01: a margem de 60 s conta como vencido.
    #[test]
    fn token_que_vence_dentro_da_margem_precisa_renovar() {
        assert!(needs_refresh(
            &credential(Some(NOW + EXPIRY_SKEW_MS), true),
            NOW
        ));
        assert!(!needs_refresh(
            &credential(Some(NOW + EXPIRY_SKEW_MS + 1), true),
            NOW
        ));
    }

    // QTR-04
    #[test]
    fn token_valido_nao_precisa_renovar() {
        assert!(!needs_refresh(
            &credential(Some(NOW + 8 * 3600 * 1000), true),
            NOW
        ));
    }

    // QTR-06
    #[test]
    fn sem_refresh_token_nao_renova_mesmo_vencido() {
        assert!(!needs_refresh(&credential(Some(NOW - 1), false), NOW));
    }

    // QTR-13: ausência de `expiresAt` não é prova de vencimento.
    #[test]
    fn sem_expires_at_nao_renova() {
        assert!(!needs_refresh(&credential(None, true), NOW));
    }

    // QTR-01: `expires_in` em segundos vira epoch ms.
    #[test]
    fn parse_usa_expires_in_em_segundos() {
        let body = serde_json::json!({
            "access_token": "access-novo",
            "refresh_token": "refresh-novo",
            "expires_in": 28800
        });

        assert_eq!(
            parse_refresh_response(&body, NOW),
            Some(Refreshed {
                access_token: "access-novo".to_string(),
                refresh_token: Some("refresh-novo".to_string()),
                expires_at_ms: Some(NOW + 28_800_000),
            })
        );
    }

    #[test]
    fn parse_aceita_epoch_pronto_quando_nao_ha_expires_in() {
        let body = serde_json::json!({ "access_token": "a", "expiresAt": NOW + 500 });
        assert_eq!(
            parse_refresh_response(&body, NOW).and_then(|r| r.expires_at_ms),
            Some(NOW + 500)
        );
    }

    // QTR-05
    #[test]
    fn parse_recusa_corpo_sem_access_token_utilizavel() {
        assert_eq!(parse_refresh_response(&serde_json::json!({}), NOW), None);
        assert_eq!(
            parse_refresh_response(&serde_json::json!({ "access_token": "" }), NOW),
            None
        );
    }

    // QTR-02: o resto do arquivo sobrevive intacto.
    #[test]
    fn apply_troca_os_tres_campos_e_preserva_o_resto() {
        let merged = apply_refreshed(
            &file_json(),
            &Refreshed {
                access_token: "access-novo".to_string(),
                refresh_token: Some("refresh-novo".to_string()),
                expires_at_ms: Some(NOW + 1000),
            },
        )
        .expect("claudeAiOauth é objeto");

        let oauth = &merged["claudeAiOauth"];
        assert_eq!(oauth["accessToken"], "access-novo");
        assert_eq!(oauth["refreshToken"], "refresh-novo");
        assert_eq!(oauth["expiresAt"], NOW + 1000);
        assert_eq!(oauth["scopes"], serde_json::json!(["user:inference"]));
        assert_eq!(oauth["subscriptionType"], "pro");
        assert_eq!(merged["outraChaveQueNaoConhecemos"]["manter"], true);
    }

    // QTR-14: endpoint que não rotacionou preserva o refreshToken do arquivo.
    #[test]
    fn apply_sem_refresh_novo_preserva_o_do_arquivo() {
        let merged = apply_refreshed(
            &file_json(),
            &Refreshed {
                access_token: "access-novo".to_string(),
                refresh_token: None,
                expires_at_ms: None,
            },
        )
        .expect("claudeAiOauth é objeto");

        assert_eq!(merged["claudeAiOauth"]["accessToken"], "access-novo");
        assert_eq!(merged["claudeAiOauth"]["refreshToken"], "refresh-antigo");
        assert_eq!(merged["claudeAiOauth"]["expiresAt"], NOW - 1);
    }

    #[test]
    fn apply_recusa_arquivo_sem_objeto_oauth() {
        let refreshed = Refreshed {
            access_token: "a".to_string(),
            refresh_token: None,
            expires_at_ms: None,
        };
        assert_eq!(
            apply_refreshed(&serde_json::json!({ "claudeAiOauth": 7 }), &refreshed),
            None
        );
        assert_eq!(apply_refreshed(&serde_json::json!({}), &refreshed), None);
    }

    // QTR-03: escrita atômica sobrescreve e não deixa temporário para trás.
    #[test]
    fn escrita_atomica_substitui_o_arquivo_e_limpa_o_temporario() {
        let dir = tempfile::tempdir().expect("diretório temporário");
        let path = dir.path().join(".credentials.json");
        std::fs::write(&path, br#"{"claudeAiOauth":{"accessToken":"velho"}}"#).unwrap();

        write_credential_atomic(&path, &serde_json::json!({ "a": 1 })).expect("gravar");

        let raw = std::fs::read(&path).unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&raw).unwrap(),
            serde_json::json!({ "a": 1 })
        );
        assert!(!dir.path().join(".credentials.json.swarmdeck-tmp").exists());
    }

    /// Escritor espião: guarda o que recebeu em vez de tocar disco.
    fn spy() -> std::sync::Arc<std::sync::Mutex<Vec<(PathBuf, Value)>>> {
        std::sync::Arc::new(std::sync::Mutex::new(Vec::new()))
    }

    fn locate_ok() -> Option<(PathBuf, Value, Credential)> {
        Some((
            PathBuf::from("/tmp/.claude/.credentials.json"),
            file_json(),
            credential(Some(NOW - 1), true),
        ))
    }

    // QTR-01 + QTR-02 pela ponta: vencido, troca ok, arquivo regravado.
    #[tokio::test]
    async fn renova_e_grava_quando_o_token_esta_vencido() {
        let written = spy();
        let sink = written.clone();

        let wrote = ensure_fresh_with(
            locate_ok,
            |_| async {
                Ok(serde_json::json!({
                    "access_token": "access-novo",
                    "refresh_token": "refresh-novo",
                    "expires_in": 28800
                }))
            },
            move |path: &Path, value: &Value| {
                sink.lock()
                    .unwrap()
                    .push((path.to_path_buf(), value.clone()));
                Ok(())
            },
            NOW,
        )
        .await;

        assert!(wrote);
        let calls = written.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, PathBuf::from("/tmp/.claude/.credentials.json"));
        assert_eq!(calls[0].1["claudeAiOauth"]["accessToken"], "access-novo");
    }

    // QTR-07
    #[tokio::test]
    async fn sem_credencial_nao_toca_rede_nem_disco() {
        let written = spy();
        let sink = written.clone();

        let wrote = ensure_fresh_with(
            || None,
            |_| async { panic!("não deveria trocar token sem credencial") },
            move |path: &Path, value: &Value| {
                sink.lock()
                    .unwrap()
                    .push((path.to_path_buf(), value.clone()));
                Ok(())
            },
            NOW,
        )
        .await;

        assert!(!wrote);
        assert!(written.lock().unwrap().is_empty());
    }

    // QTR-04
    #[tokio::test]
    async fn token_valido_nao_toca_rede_nem_disco() {
        let written = spy();
        let sink = written.clone();

        let wrote = ensure_fresh_with(
            || {
                Some((
                    PathBuf::from("/tmp/.claude/.credentials.json"),
                    file_json(),
                    credential(Some(NOW + 3_600_000), true),
                ))
            },
            |_| async { panic!("não deveria trocar token ainda válido") },
            move |path: &Path, value: &Value| {
                sink.lock()
                    .unwrap()
                    .push((path.to_path_buf(), value.clone()));
                Ok(())
            },
            NOW,
        )
        .await;

        assert!(!wrote);
        assert!(written.lock().unwrap().is_empty());
    }

    // QTR-05: troca que falha no transporte deixa o arquivo intacto.
    #[tokio::test]
    async fn troca_que_falha_nao_grava() {
        let written = spy();
        let sink = written.clone();

        let wrote = ensure_fresh_with(
            locate_ok,
            |_| async { Err(()) },
            move |path: &Path, value: &Value| {
                sink.lock()
                    .unwrap()
                    .push((path.to_path_buf(), value.clone()));
                Ok(())
            },
            NOW,
        )
        .await;

        assert!(!wrote);
        assert!(written.lock().unwrap().is_empty());
    }

    // QTR-05: resposta 200 mas sem `access_token` também não grava.
    #[tokio::test]
    async fn resposta_sem_access_token_nao_grava() {
        let written = spy();
        let sink = written.clone();

        let wrote = ensure_fresh_with(
            locate_ok,
            |_| async { Ok(serde_json::json!({ "error": "invalid_grant" })) },
            move |path: &Path, value: &Value| {
                sink.lock()
                    .unwrap()
                    .push((path.to_path_buf(), value.clone()));
                Ok(())
            },
            NOW,
        )
        .await;

        assert!(!wrote);
        assert!(written.lock().unwrap().is_empty());
    }

    // QTR-15: escrita que falha não é fatal — devolve `false`, não panica.
    #[tokio::test]
    async fn escrita_que_falha_devolve_false() {
        let wrote = ensure_fresh_with(
            locate_ok,
            |_| async { Ok(serde_json::json!({ "access_token": "access-novo" })) },
            |_: &Path, _: &Value| Err("permissão negada".to_string()),
            NOW,
        )
        .await;

        assert!(!wrote);
    }

    // QTR-09: nem o access token nem o refresh token vazam pelo `Debug`.
    #[test]
    fn debug_da_credencial_nao_mostra_token() {
        let rendered = format!("{:?}", credential(Some(NOW), true));
        assert!(rendered.contains("AccessToken(<redacted>)"));
        assert!(rendered.contains("RefreshToken(<redacted>)"));
        assert!(!rendered.contains("access-antigo"));
        assert!(!rendered.contains("refresh-antigo"));
    }

    // QTR-06 pela leitura: um arquivo sem `refreshToken` não vira credencial
    // renovável, e um com vira.
    #[test]
    fn parse_credential_le_refresh_e_expiracao() {
        let sem = serde_json::json!({ "claudeAiOauth": { "accessToken": "a" } });
        let parsed = parse_credential(&sem).expect("accessToken presente");
        assert!(parsed.refresh.is_none());
        assert_eq!(parsed.expires_at_ms, None);

        let com = parse_credential(&file_json()).expect("accessToken presente");
        assert!(com.refresh.is_some());
        assert_eq!(com.expires_at_ms, Some(NOW - 1));
    }
}

#[cfg(test)]
mod credential_profile_tests {
    use super::*;

    fn wsl(distro: &str) -> TerminalProfile {
        TerminalProfile::Wsl {
            distro: distro.to_string(),
        }
    }

    // QUOTA-15: o caso que motivou a mudança — Windows com tudo configurado
    // na distro. O padrão é a distro, e ela é o primeiro lugar procurado.
    #[test]
    fn candidatos_comecam_pelo_perfil_padrao() {
        let candidates = credential_candidates(
            &wsl("Ubuntu-24.04"),
            &[
                "host".to_string(),
                "wsl:Ubuntu-24.04".to_string(),
                "wsl:Debian".to_string(),
            ],
            None,
        );

        assert_eq!(
            candidates,
            vec![wsl("Ubuntu-24.04"), TerminalProfile::Host, wsl("Debian")]
        );
    }

    // O padrão nunca é tentado duas vezes, mesmo estando na lista.
    #[test]
    fn candidatos_nao_repetem_o_perfil_padrao() {
        let candidates = credential_candidates(
            &TerminalProfile::Host,
            &["host".to_string(), "wsl:Ubuntu-24.04".to_string()],
            None,
        );

        assert_eq!(candidates, vec![TerminalProfile::Host, wsl("Ubuntu-24.04")]);
    }

    // Sem WSL registrada, o comportamento é exatamente o de antes desta
    // mudança: um candidato só, o host.
    #[test]
    fn sem_wsl_registrada_o_unico_candidato_e_o_host() {
        let candidates = credential_candidates(&TerminalProfile::Host, &["host".to_string()], None);

        assert_eq!(candidates, vec![TerminalProfile::Host]);
    }

    // SPEC: quota-provider-source (QSRC-05) — escolha explícita: um candidato
    // só, e nem o perfil padrão entra na lista.
    #[test]
    fn candidatos_com_escolha_explicita_tem_so_o_escolhido() {
        let candidates = credential_candidates(
            &TerminalProfile::Host,
            &["host".to_string(), "wsl:Ubuntu-24.04".to_string()],
            Some(&wsl("Ubuntu-24.04")),
        );

        assert_eq!(candidates, vec![wsl("Ubuntu-24.04")]);
    }

    // SPEC: quota-provider-source (QSRC-06) — sem escolha nada muda: padrão
    // primeiro, demais depois. É o que não regride quem nunca abriu a tela.
    #[test]
    fn candidatos_sem_escolha_mantem_padrao_e_demais() {
        let candidates = credential_candidates(
            &TerminalProfile::Host,
            &["host".to_string(), "wsl:Ubuntu-24.04".to_string()],
            None,
        );

        assert_eq!(candidates, vec![TerminalProfile::Host, wsl("Ubuntu-24.04")]);
    }

    // Id ilegível na lista é descartado, não vira candidato nem derruba a
    // busca — `list_profiles` monta os ids, então isto é cinto de segurança.
    #[test]
    fn id_invalido_na_lista_e_ignorado() {
        let candidates = credential_candidates(
            &TerminalProfile::Host,
            &["lixo".to_string(), "wsl:Ubuntu-24.04".to_string()],
            None,
        );

        assert_eq!(candidates, vec![TerminalProfile::Host, wsl("Ubuntu-24.04")]);
    }
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
