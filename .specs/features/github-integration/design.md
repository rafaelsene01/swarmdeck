# github-integration — Design

**Spec**: `.specs/features/github-integration/spec.md`

## Decisões de arquitetura

Registradas em `.specs/project/STATE.md` como AD-046, AD-047 e AD-048. Resumo:

**AD-046 — o PAT é constante de build, não configuração de usuário.**
`src-tauri/build.rs` lê `SWARMDECK_GITHUB_PAT` do ambiente, com fallback para a
linha correspondente no `.env` da raiz, e emite `cargo:rustc-env`. O Rust lê com
`option_env!`, então uma build sem o segredo compila e apenas reporta a
funcionalidade como não configurada. Alternativa rejeitada: guardar o PAT no
SQLite como preferência editável — o token é do projeto, não do usuário, e uma
coluna de banco é mais fácil de vazar num dump que uma constante de binário.
Trade-off aceito: o valor é extraível do binário com `strings`; a mitigação é o
escopo mínimo do token, não escondê-lo.

**AD-047 — anexos de issue pelo endpoint `uploads.github.com/user-attachments`.**
Com o repositório privado, nenhum dos caminhos documentados renderiza imagem
inline numa issue: `data:` URI é removido pelo sanitizador de markdown, e
`raw.githubusercontent.com` de repo privado não é buscável pelo proxy camo.
O endpoint não documentado devolve uma URL em `github.com/user-attachments/`,
servida pelo permissionamento do próprio GitHub — verificado em 22/08/2026:
HTTP 201 com PAT fine-grained, 404 sem autenticação. Alternativa rejeitada:
repositório público de assets — screenshot de bug carrega dado interno, e
publicá-lo para satisfazer um requisito cosmético anula o motivo de privar o
repo. Trade-off aceito: o endpoint é não documentado e pode sumir sem aviso;
CFG-19 garante que a issue nasce mesmo quando o upload falha.

**AD-048 — updater resolve asset pela API, sem mexer na CI.**
`https://api.github.com/repos/{owner}/{repo}/releases/latest` é URL estável e a
mesma resposta traz `assets[]` com nome e URL de API de cada arquivo. Isso
resolve o problema de o id de asset só existir depois do publish: nada fixo
precisa apontar para um id. Alternativas rejeitadas: reescrever `latest.json` na
CI (a URL do manifesto continuaria sem endereço estável, e clientes já
instalados apontariam para a release anterior para sempre); publicar artefatos
num repositório público separado (mais um repo para sincronizar, e o usuário
pediu um PAT só). Trade-off aceito: Linux e macOS perdem o botão "Baixar e
atualizar" — o ramo `#[cfg(not(windows))]` delega ao `tauri-plugin-updater`, que
exige uma URL servindo o manifesto, e repositório privado não tem uma.

## Componentes

```
                         ┌────────────────────────────┐
  .env (gitignored) ───► │ src-tauri/build.rs         │
  env do CI       ───►   │ cargo:rustc-env=..._PAT    │
                         └────────────┬───────────────┘
                                      │ option_env!
                         ┌────────────▼───────────────┐
                         │ src-tauri/src/github.rs    │
                         │  OWNER / REPO / REPO_ID    │
                         │  Pat (Debug redigido)      │
                         │  client() → reqwest        │
                         └──────┬──────────────┬──────┘
                                │              │
        ┌───────────────────────▼──┐        ┌──▼────────────────────────┐
        │ update/manifest.rs       │        │ feedback.rs               │
        │  fetch()  CFG-07..10     │        │  compose_title  CFG-16    │
        │ update/apply.rs          │        │  compose_body   CFG-17,19 │
        │  fetch_bytes  CFG-11     │        │  upload_asset   CFG-18    │
        │ update/mod.rs            │        │  create_issue   CFG-15    │
        │  UpdateError::Auth CFG-12│        └──▲────────────────────────┘
        └──────────────────────────┘           │ invoke
                                     ┌─────────┴─────────────────────┐
                                     │ commands/feedback.rs          │
                                     │  feedback_submit  CFG-24      │
                                     └─────────▲─────────────────────┘
                                               │
                                     ┌─────────┴─────────────────────┐
                                     │ FeedbackPanel.tsx             │
                                     │  prefixo + contador CFG-25..28│
                                     │  submit + estados  CFG-21..23 │
                                     └───────────────────────────────┘
```

## Contratos

**`github.rs`**

```rust
pub const OWNER: &str = "rafaelsene01";
pub const REPO: &str = "swarmdeck";
pub const REPO_ID: u64 = 1315448729;

/// Newtype no molde de `quota::AccessToken` (AD-001): sem `Serialize`,
/// `Debug` redigido, nunca cruza a fronteira IPC.
pub struct Pat(&'static str);
impl Pat { pub fn as_str(&self) -> &str }
impl std::fmt::Debug for Pat // -> "Pat(<redacted>)"

pub fn pat() -> Option<Pat>;          // None quando não injetado (CFG-03)
pub fn client() -> Result<reqwest::Client, String>;   // UA swarmdeck/<versão>
```

**Resolução de asset (CFG-09), função pura e testável:**

```rust
/// Troca cada `PlatformEntry.url` pela URL de API do asset de mesmo nome.
/// Entrada cujo arquivo não está na release é removida (CFG-10).
pub fn resolve_asset_urls(manifest: Manifest, assets: &[(String, String)]) -> Manifest;
```

O casamento é pelo último segmento do path da URL original — o `latest.json`
publicado hoje aponta para `.../releases/download/<tag>/<arquivo>`, e `<arquivo>`
é exatamente o `name` do asset na resposta da API.

**Comando Tauri (CFG-24):**

```rust
#[derive(serde::Deserialize)]
pub struct FeedbackImage { pub name: String, pub mime: String, pub bytes: Vec<u8> }

#[tauri::command]
pub async fn feedback_submit(
    category: String, title: String, description: String, images: Vec<FeedbackImage>,
) -> Result<String, String>;   // Ok = html_url da issue
```

Nenhum campo de retorno carrega o PAT (CFG-04).

**Montagem do corpo (CFG-17, 18, 19, 28, 32):**

```
<descrição>

![<nome1>](<url1>)
![<nome2>](<url2>)
> Falha ao anexar `<nome3>`.

---
SwarmDeck <versão> · <SO>
```

Sem imagem nenhuma, o bloco do meio some e o corpo vai da descrição direto ao
rodapé (CFG-34). Se o total passar de 65536 caracteres, a descrição é cortada e
marcada; as imagens e o rodapé sobrevivem (CFG-32).

## Fluxo de erro

| Origem | Mapeamento | Requisito |
| --- | --- | --- |
| 401 / 403 sem cabeçalho de rate limit | `UpdateError::Auth` → "token de acesso expirado ou sem permissão" | CFG-12 |
| 429, ou 403 com `x-ratelimit-remaining: 0` | mensagem de limite atingido | CFG-31 |
| Falha de rede na consulta | comportamento atual de SILENT-25, inalterado | CFG-33 |
| PAT ausente na build | "Enviar feedback" desabilitado com aviso | CFG-30 |
| Upload de imagem falha | issue criada, linha nomeando o arquivo | CFG-19 |
| `POST /issues` falha | erro exibido, formulário preservado | CFG-21 |

## Redirecionamento

`GET /repos/{o}/{r}/releases/assets/{id}` com `Accept: application/octet-stream`
responde 302 para um host de storage assinado, que rejeita a requisição se o
`Authorization` for junto. `reqwest` remove `Authorization` em redirecionamento
cross-host por padrão, então CFG-11 não pede código de redirect próprio — pede
que a política padrão não seja sobrescrita.

## Não muda

`parse_manifest`, `swap::verify_signature`, `swap::apply_swap`, o pubkey
minisign em `tauri.conf.json`, `patch-latest-json.mjs` e a estrutura do
`latest.json` publicado.
