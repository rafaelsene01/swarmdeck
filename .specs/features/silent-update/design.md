# Silent Update Design

**Spec**: `.specs/features/silent-update/spec.md`

## Visão geral

O fluxo de atualização deixa de ter dois donos (`tauri-plugin-updater` decidindo e instalando; `update/portable.rs` existindo sem chamador) e passa a ter um só caminho, em quatro etapas explícitas:

```
manifest::fetch  →  check::status  →  [clique "Baixar"]  →  apply::download  →  [clique "Instalar"]  →  apply::install
   (reqwest)        (semver + flavor)                       (progresso + minisign)                      (swap, sem fechar o app)
```

Nada entre `check::status` e `apply::download` roda sem o clique. O `tauri-plugin-updater` continua registrado, mas só é usado no caminho não-Windows (SILENT-08).

> **Atualizado em 16/08/2026 (AD-009, SILENT-37..41)**: o antigo `apply::run`
> (download + swap num passo só) virou dois — `download` guarda os bytes
> verificados em `Pending` e emite `update://download-progress`; `install`
> aplica a troca e **não** reinicia o app. Reabrir é botão do usuário
> (SILENT-40), porque fechar mataria os terminais PTY abertos.

## Estado atual do código (ponto de partida)

Quem for executar isto encontra, hoje, no `src-tauri/src/update/`:

| Arquivo | O que tem | Destino |
| ------- | --------- | ------- |
| `mod.rs` | Reexporta `apply::{handle_close, spawn_background_checker, PendingUpdate}` e `check::{check, UpdateError, UpdateInfo}` | Reescrito (T4, T6) |
| `check.rs` (417 linhas) | `check`/`check_with` (núcleo puro, 7 testes), `target_key`, `fetch_remote_manifest` via `UpdaterExt`, `parse_platforms` | Migrado para `manifest.rs` (T1, T2) |
| `apply.rs` (423 linhas) | `run_loop` (2 testes), `check_and_download_with` (5 testes), `handle_close` (3 testes), `PendingUpdate` | Reescrito (T6, T7) |
| `portable.rs` (338 linhas) | `verify_signature`, `apply_portable`/`apply_portable_with`, `cleanup_stale_old` — **8 testes, nenhum chamador em produção** | Renomeado para `swap.rs` (T4) |

Fora do módulo: `commands/update.rs` (98 linhas, 4 comandos), `lib.rs` (`manage(PendingUpdate)` + hook de `CloseRequested` no `setup`), `src/components/settings/UpdateSettings.tsx`, `src/routes/settings/SettingsShell.tsx` (linhas ~84-93, 129-189, ~370), `src/App.tsx` (listener de `update://available`, que **não muda**).

Fatos verificados no disco que sustentam o desenho:

- `%LOCALAPPDATA%\SwarmDeck\` contém `SwarmDeck.exe` (13,8 MB) e `uninstall.exe` — mais nada.
- `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SwarmDeck` existe, com `DisplayVersion = 0.1.6` e `InstallLocation` apontando para a pasta acima.
- `tauri.conf.json` não declara `bundle.resources`; `bundle.windows.nsis.installMode` é `currentUser`.
- `reqwest` e `minisign-verify` já são dependências diretas do crate. Nenhuma crate de zip existe no workspace.

## Decisões de arquitetura

### 1. Um único caminho HTTP para o manifesto (SILENT-01)

`UpdaterExt::check()` devolve `None` quando o app já está atualizado — ou seja, é estruturalmente incapaz de informar "a versão mais recente é X" quando X == versão instalada, que é metade do que a spec pede (SILENT-09). Em vez de manter duas fontes (plugin para atualizar, HTTP para exibir), o manifesto passa a ser lido por `reqwest` em `update/manifest.rs`, e `check.rs` consome esse módulo.

`reqwest` já é dependência direta do crate por AD-003 — nenhuma dependência nova entra.

**Trade-off**: perde-se a validação de manifesto que o plugin fazia de graça; ganha-se um `parse_manifest` puro, testável com fixture, que já era necessário de qualquer forma para a chave `windows-x86_64-silent`.

### 2. Payload = executável cru, não zip (SILENT-02, SILENT-20)

A pasta instalada real contém `SwarmDeck.exe` e `uninstall.exe`; `tauri.conf.json` não declara `bundle.resources`. O que precisa ser trocado é um arquivo. Publicar o `SwarmDeck.exe` cru assinado, sob a chave de manifesto `windows-x86_64-silent`, faz `apply_swap(&[u8])` funcionar sem uma crate de descompactação.

`scripts/patch-latest-json.mjs` já é parametrizado por `--key`, `--name` e `--signature-file`: a release ganha uma segunda invocação do mesmo script, não um script novo.

### 3. A troca vale para os dois flavors (SILENT-05, SILENT-18)

`paths::flavor` distingue portátil (marcador `.portable`) de instalado. A troca de arquivo é a mesma operação nos dois casos — `%LOCALAPPDATA%\SwarmDeck` é gravável sem admin porque o NSIS usa `installMode: "currentUser"`.

A única diferença real do flavor instalado é a chave de desinstalação do Windows, que passaria a informar uma versão que não é mais a do binário. `apply::run` fecha isso escrevendo `DisplayVersion` (SILENT-18) — falha ali é logada e não invalida a troca (SILENT-19), porque um registro desatualizado é cosmético e o binário novo já está no lugar.

### 4. Rename antes de escrever, não sobrescrita

O Windows não permite apagar nem sobrescrever a imagem de um executável em execução, mas permite **renomeá-la**. `apply_swap` já implementa exatamente isso: `rename(exe, exe.old)` → `write(exe, bytes)` → em caso de falha na escrita, `rename(exe.old, exe)` de volta. É a razão de a atualização valer "na próxima abertura" sem precisar matar o processo.

O módulo `update/portable.rs` é renomeado para `update/swap.rs` e `apply_portable` para `apply_swap`: aplicado também ao flavor instalado, o nome antigo passaria a mentir. Os testes existentes migram sem alteração de corpo.

### 5. O checador em segundo plano vira check-only (SILENT-15, SILENT-16)

`run_loop` (boot-fire + intervalo de 1h) é mantido intacto — é lógica testada e a spec continua querendo a cadência. O que sai é o corpo do ciclo: `check_and_download_with` vira `check_only`, que consulta e emite `update://available`, sem tocar em rede de download. Com isso somem `PendingUpdate`, `handle_close` e o hook de `CloseRequested` em `lib.rs`.

**Consequência deliberada**: a guarda de download duplicado (REL-44) deixa de ser necessária no loop, mas reaparece em outra forma — um `Mutex<bool>` de "aplicação em andamento" em `apply::run`, para o edge case de duplo clique (SILENT-28).

## Componentes

### C1 — `src-tauri/src/update/manifest.rs` (novo)

```rust
pub struct Manifest { pub version: String, pub notes: String, pub platforms: HashMap<String, PlatformEntry> }
pub struct PlatformEntry { pub url: String, pub signature: String }

pub fn parse_manifest(raw: &str) -> Result<Manifest, UpdateError>;   // puro, testável
pub async fn fetch(endpoint: &str) -> Result<Manifest, UpdateError>; // reqwest GET + parse
pub fn endpoint(app: &AppHandle) -> String;                          // lê tauri.conf.json
```

`parse_manifest` é a lógica; `fetch` é o invólucro de rede. Mesmo padrão que `quota.rs` já usa. `parse_platforms` de `check.rs` migra para cá sem mudança de comportamento.

### C2 — `src-tauri/src/update/check.rs` (modificado)

`UpdateInfo` dá lugar ao par completo, para a UI mostrar as duas versões mesmo sem update:

```rust
pub struct UpdateStatus {
    pub current: String,
    pub latest: Option<String>,   // None só quando a consulta falhou
    pub notes: String,
    pub has_update: bool,         // latest > current && !skipped && entrada de plataforma existe
    pub mode: &'static str,       // "installed" | "portable"
    pub platform_key: String,     // "windows-x86_64-silent" etc.
}
```

`check_with` continua sendo o núcleo puro com `fetch_remote`/`is_skipped` injetados — os sete testes atuais permanecem válidos, acrescidos do caso "versão igual ainda reporta `latest`".

`target_key(flavor)` passa a devolver `{os}-{arch}-silent` no Windows para os dois flavors, e mantém `{os}-{arch}` fora do Windows (caminho do plugin).

### C3 — `src-tauri/src/update/swap.rs` (renomeado de `portable.rs`)

`verify_signature`, `apply_swap` (ex-`apply_portable`), `apply_swap_with`, `cleanup_stale_old` — corpos inalterados. Acrescenta:

```rust
#[cfg(windows)]
pub fn set_registry_display_version(version: &str) -> std::io::Result<()>;
```

Implementada com `std::process::Command::new("reg").args(["add", KEY, "/v", "DisplayVersion", "/t", "REG_SZ", "/d", version, "/f"])`. Sem crate nova; `HKCU` não exige elevação. A chave entra como parâmetro do núcleo testável, para o teste escrever numa subchave descartável.

### C4 — `src-tauri/src/update/apply.rs` (reescrito)

```rust
pub fn spawn_background_checker(app: AppHandle);       // mantém run_loop, ciclo = check_only
async fn check_only(app: &AppHandle);                  // consulta + emit, nunca baixa
pub type Applying = Mutex<bool>;                       // guarda de duplo clique (SILENT-28)
pub async fn run(app: &AppHandle) -> Result<String, UpdateError>;  // devolve a versão aplicada
async fn run_with(...);                                // núcleo com download/swap injetados
```

Removidos: `PendingUpdate`, `handle_close`, `check_and_download`, `check_and_download_with`.

`run` no Windows: `status` → entrada de plataforma → `is_writable` (SILENT-24, antes de baixar) → download (`reqwest` bytes) → `swap::apply_swap` (verifica assinatura antes de tocar arquivo, SILENT-04/22) → `set_registry_display_version` se flavor instalado.
`run` fora do Windows: delega para `updater.check()` + `Update::install(bytes)` (SILENT-08).

O padrão de testabilidade é o já estabelecido no módulo: o invólucro fino toca rede/Tauri, o núcleo `*_with` recebe as dependências por closure. `Update` não tem construtor público e `tauri::test::mock_builder` quebra no binário de teste deste ambiente Windows (`STATUS_ENTRYPOINT_NOT_FOUND`, linkagem WebView2/wry) — por isso closures, nunca mock de framework.

### C5 — `src-tauri/src/commands/update.rs` (modificado)

| Comando | Substitui | Devolve |
| ------- | --------- | ------- |
| `update_status` | `update_check` | `UpdateStatus` |
| `update_apply` | — | `Result<String, String>` (versão aplicada) |
| `update_restart` | — | `()`, chama `app.restart()` |
| `update_skip_version` | inalterado | — |
| `update_auto_check_get` / `_set` | inalterados | — |

### C6 — `src/components/settings/UpdateSettings.tsx` (modificado)

`UpdateSettingsProps` troca `installedVersion` + `checkState` por um estado único:

```ts
type UpdateState =
  | { status: 'loading' }
  | { status: 'ready'; current: string; latest: string; hasUpdate: boolean; mode: 'installed' | 'portable' }
  | { status: 'unavailable'; current: string }        // consulta falhou (SILENT-25)
  | { status: 'applying'; current: string; latest: string }
  | { status: 'applied'; version: string }
  | { status: 'error'; current: string; message: string }
```

O componente permanece apresentacional (não chama `invoke`), como `GeneralPanel` e o próprio `UpdateSettings` já são. Callbacks: `onApply`, `onRestart`, `onToggleAutoCheck`. O toggle "Verificar atualizações automaticamente" e o texto explicativo permanecem, com o explicador reescrito: a instalação não acontece mais no fechamento.

### C7 — `src/routes/settings/SettingsShell.tsx` (modificado)

Chama `update_status` ao abrir a seção, `update_apply` na confirmação e `update_restart` no botão de reinício. Some o `import packageJson` (a versão instalada passa a vir do backend, que é a fonte real do binário em execução — o `package.json` do bundle não muda quando o exe é trocado). O `mode` deixa de ser o literal `'installed'` fixo.

### C8 — `src-tauri/src/lib.rs` (modificado)

Sai: `manage(PendingUpdate)` e o handler de `CloseRequested`.
Entra: `manage(Applying)`, `swap::cleanup_stale_old` no boot (SILENT-07), registro dos comandos novos.

### C9 — `.github/workflows/release.yml` (modificado)

No job Windows, após o bundle portátil:

```bash
cp target/release/SwarmDeck.exe "SwarmDeck_${VERSION}_x64.exe"
npx tauri signer sign "SwarmDeck_${VERSION}_x64.exe"
gh release upload "$TAG" "SwarmDeck_${VERSION}_x64.exe" "SwarmDeck_${VERSION}_x64.exe.sig" --clobber
```

No job `finalize`, segunda chamada do script já existente:

```bash
node scripts/patch-latest-json.mjs --manifest latest.json \
  --key windows-x86_64-silent --tag "$TAG" \
  --assets assets.json --name "SwarmDeck_${VERSION}_x64.exe" \
  --signature-file "SwarmDeck_${VERSION}_x64.exe.sig"
```

O `--tag` não é opcional: o asset é subido enquanto a release ainda é rascunho, e a URL de rascunho (`/releases/download/untagged-<hash>/`) deixa de existir na publicação.

## Riscos conhecidos

| Risco | Mitigação |
| ----- | --------- |
| Uma release publicada sem o asset cru deixa o "Baixar e atualizar" em 404 | SILENT-21: sem entrada de plataforma no manifesto, a UI diz "não disponível para esta instalação" em vez de tentar baixar |
| `rename` do executável falha se algum processo segurar handle nele | Improvável: os PTYs filhos não abrem o exe do app. `apply_swap` devolve `Err` sem tocar em nada se o rename falhar (SILENT-23) |
| Um instalador NSIS futuro rodando sobre um exe trocado | O NSIS sobrescreve o exe e regrava a chave de registro; o estado final é consistente |
| `DisplayVersion` divergente entre a troca e um `reg add` que falhou | SILENT-19 aceita explicitamente esse estado: cosmético, nunca invalida o binário |
| Versão nova ruim, sem rollback automático | Fora de escopo por decisão da spec: `<nome>.exe.old` some no boot seguinte e reverter é reinstalar |
