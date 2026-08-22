# Silent Update Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Regra local obrigatória:** `.claude/rules/spec-driven-changes.md` exige o marcador `// SPEC: silent-update (SILENT-xx)` no topo de todo arquivo criado ou editado, em inglês, com os IDs reais. Nos arquivos que hoje carregam `// SPEC: release-distribution (REL-xx)` e passam a implementar esta feature, o marcador é **substituído**, não acrescentado — os REL correspondentes estão revogados (ver a seção "Requisitos revogados" da spec). Em `src-tauri/Cargo.toml` e `src-tauri/src/lib.rs` o marcador vai **acima do bloco** que implementa o requisito, não no topo (exceção de arquivo compartilhado). `.github/workflows/release.yml` usa `#` como comentário.

**Regra global obrigatória:** o agente nunca roda `git commit`. Cada task termina com o working tree pronto e a mensagem de commit sugerida; quem commita é o usuário.

---

**Design**: `.specs/features/silent-update/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerada do codebase, das guidelines do projeto e da spec — confirmar antes de Execute. Guidelines encontradas: `.github/workflows/ci.yml` (comandos de gate), `package.json` (scripts). Não há suíte e2e nem script de lint no lado JS; `tsc --noEmit` roda dentro de `npm run build`. Testes Rust ficam em `#[cfg(test)] mod tests` no próprio arquivo, e o padrão da base é injetar rede/IO por closure em vez de mock de framework (ver `check::check_with`, `apply::check_and_download_with`, `portable::apply_portable_with`, `paths::resolve_data_dir`) — `tauri::test::mock_builder` quebra neste ambiente Windows com `STATUS_ENTRYPOINT_NOT_FOUND`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domínio Rust de update (`manifest.rs`, `check.rs`, `swap.rs`, `apply.rs`) | unit | Todas as ramificações; 1:1 com os ACs da spec; todo edge case listado tem teste | `#[cfg(test)] mod tests` no mesmo arquivo | `cargo test` |
| Comandos Rust (`commands/update.rs`) | unit | Caminho feliz + tradução de erro para `String` + guarda de mutex poisoned | `#[cfg(test)] mod tests` no mesmo arquivo | `cargo test` |
| Integração de registro do Windows (`swap::set_registry_display_version`) | unit | Escrita e releitura em subchave descartável de `HKCU`; caminho de falha | `#[cfg(test)] #[cfg(windows)] mod tests` no mesmo arquivo | `cargo test` |
| Componentes React | unit | Todo estado de render (loading, ready, unavailable, applying, applied, error) + todo AC de UI | `*.test.tsx` co-locado ao lado do fonte | `npm run test` |
| Wiring do app (`lib.rs`) | none | — (build gate; a lógica que ele monta já é coberta por T6/T7) | — | build gate |
| Workflow de release (`release.yml`) | none | — (YAML de CI não é executável em teste local; o script que ele invoca já tem `scripts/patch-latest-json.test.mjs`) | — | build gate |

## Gate Check Commands

> Descobertas de `.github/workflows/ci.yml` e `package.json` — confirmar antes de Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| quick-rust | Depois de task Rust com teste unitário | `cargo test` |
| quick-ts | Depois de task React com teste unitário | `npm run test` |
| build | Depois do fim de uma fase, ou em task sem teste próprio | `npm run build && npm run test && npm run test:scripts && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test` |

---

## Execution Plan

As fases são ordenadas e rodam em sequência; dentro de cada fase as tasks rodam em ordem.

### Phase 1: Manifesto e status

Ler o manifesto por um caminho só e saber dizer as duas versões. Nada mais funciona sem isso.

```
T1 → T2 → T3
```

### Phase 2: Troca de arquivo

A operação de disco, isolada de rede e de Tauri.

```
T4 → T5
```

### Phase 3: Fluxo de aplicação e fiação

Aposenta o download automático e liga confirmação → download → troca.

```
T6 → T7 → T8 → T9
```

### Phase 4: Interface de Configurações

```
T10 → T11
```

### Phase 5: Pipeline de release

```
T12
```

---

## Task Breakdown

### T1: Criar `update/manifest.rs` com fetch e parse do `latest.json`

**What**: Módulo com `parse_manifest` puro (versão, notas, mapa de `platforms`) e `fetch` via `reqwest` contra o endpoint de `tauri.conf.json`.
**Where**: `src-tauri/src/update/manifest.rs`
**Depends on**: None
**Reuses**: `src-tauri/src/quota.rs` (padrão de cliente `reqwest` já no crate, AD-003); `update/check.rs::parse_platforms` (lógica de leitura de `platforms`, movida para cá)
**Requirement**: SILENT-01, SILENT-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `parse_manifest` devolve `version`, `notes` e todas as entradas de `platforms` de um JSON de fixture que inclui `windows-x86_64`, `windows-x86_64-portable` e `windows-x86_64-silent`
- [x] `parse_manifest` devolve `Err` para JSON sem `platforms`, e para entrada sem `url` ou sem `signature`
- [x] `fetch` existe e é o único ponto de rede do módulo
- [x] Marcador `// SPEC: silent-update (SILENT-01, SILENT-21)` no topo
- [x] Gate check passa: `cargo test`
- [x] Test count: 4 testes novos passam (nenhuma deleção silenciosa)

**Tests**: unit
**Gate**: quick-rust

**Commit**: `feat(update): ler o manifesto de atualização por um caminho HTTP único`

---

### T2: Trocar `UpdaterExt` por `manifest.rs` em `check.rs` e expor as duas versões

**What**: `check.rs` passa a consumir `manifest::fetch`, devolve `UpdateStatus { current, latest, notes, has_update, mode, platform_key }` mesmo quando não há atualização, e `target_key` passa a devolver `{os}-{arch}-silent` no Windows para os dois flavors.
**Where**: `src-tauri/src/update/check.rs`
**Depends on**: T1
**Reuses**: `check::check_with` (núcleo puro com `fetch_remote`/`is_skipped` injetados — os 7 testes atuais continuam valendo); `paths::flavor`
**Requirement**: SILENT-09, SILENT-10, SILENT-11, SILENT-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Versão remota igual à instalada devolve `has_update: false` **e** `latest: Some(versão)` — o teste assere os dois campos
- [x] Versão remota maior e não pulada devolve `has_update: true` com `platform_key` terminando em `-silent` no Windows
- [x] Versão pulada (`skipped_versions`) devolve `has_update: false` com `latest` preenchido
- [x] Falha na consulta devolve `latest: None` e `has_update: false`, sem propagar `Err`
- [x] Nenhuma referência a `UpdaterExt` permanece no arquivo
- [x] Marcador `// SPEC:` do arquivo atualizado de `release-distribution (REL-19, REL-21, REL-24)` para `silent-update`
- [x] Gate check passa: `cargo test`
- [x] Test count: 7 testes existentes migrados + 3 novos passam

**Retificação pós-Verifier (mesma sessão, depois de T12)**: T2 introduziu um shim de compatibilidade (`check()`/`UpdateInfo`/`UpdateError::Plugin`) para manter `apply.rs`/`commands/update.rs` compiláveis até T6/T7 os aposentarem — documentado no corpo do commit original. T6 e T7 aposentaram os dois únicos chamadores, mas o shim não foi removido depois; o Verifier pegou o código morto (nenhuma task tinha SPEC_DEVIATION cobrindo isso). Removido agora: `check()`, `UpdateInfo`, `UpdateError::Plugin` saíram de `check.rs`; `mod.rs` não reexporta mais `check`/`UpdateInfo`, e seu marcador (que ainda dizia `release-distribution`) virou `silent-update (SILENT-01, SILENT-09)`.

**Tests**: unit
**Gate**: quick-rust

**Commit**: `refactor(update): reportar a versão mais recente mesmo sem atualização pendente`

---

### T3: Substituir o comando `update_check` por `update_status`

**What**: `commands/update.rs` deixa de expor `update_check` e passa a expor `update_status`, devolvendo `UpdateStatus` completo.
**Where**: `src-tauri/src/commands/update.rs`
**Depends on**: T2
**Reuses**: `commands/update.rs::with_db` (tradução de mutex poisoned para `Err(String)`, já testada)
**Requirement**: SILENT-09, SILENT-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `update_status` devolve os seis campos de `UpdateStatus`
- [x] `update_check` não existe mais no arquivo (a remoção da linha no `invoke_handler!` acontece em T9)
- [x] `update_skip_version`, `update_auto_check_get` e `update_auto_check_set` seguem intactos, com os 2 testes atuais passando
- [x] Marcador `// SPEC:` atualizado para `silent-update`
- [x] Gate check passa: `cargo test`
- [x] Test count: 2 testes existentes passam. **SPEC_DEVIATION**: "1 novo" não escrito — `update_status` é passthrough puro (`update::status(&app).await.map_err(...)`), sem ramificação própria para extrair um núcleo testável (ao contrário de `quota_claude`/`quota_claude_with`, que tem um `enabled` para decidir). Um teste aqui seria tautológico (Check B) ou exigiria `AppHandle` real, que este crate não consegue montar em teste (`STATUS_ENTRYPOINT_NOT_FOUND`, ver `design.md`).

**Tests**: unit
**Gate**: quick-rust

**Commit**: `feat(update): expor update_status com versão instalada e mais recente`

---

### T4: Renomear `portable.rs` para `swap.rs` e `apply_portable` para `apply_swap`

**What**: Renomear o módulo e a função, porque a troca passa a valer também no flavor instalado; corpos e testes migram sem alteração de comportamento.
**Where**: `src-tauri/src/update/swap.rs`
**Depends on**: None
**Reuses**: o próprio `update/portable.rs` inteiro (rename, não reescrita)
**Requirement**: SILENT-04, SILENT-05, SILENT-22, SILENT-23, SILENT-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `update/portable.rs` não existe mais; `update/swap.rs` contém `verify_signature`, `apply_swap`, `apply_swap_with`, `cleanup_stale_old`
- [x] `update/mod.rs` reexporta a partir de `swap`
- [x] Os 9 testes atuais passam sem mudança de asserção — inclusive o de pasta somente-leitura, o de rollback e o de bytes truncados (tasks.md contava 8; a contagem real do arquivo original já era 9 — nada foi removido)
- [x] O doc-comment do módulo deixa de dizer que a troca é do modo portátil e passa a dizer que vale para os dois flavors
- [x] Marcador `// SPEC:` atualizado para `silent-update (SILENT-04, SILENT-05, SILENT-22, SILENT-23, SILENT-26)`
- [x] Gate check passa: `cargo test`
- [x] Test count: 9 testes passam

**Tests**: unit
**Gate**: quick-rust

**Commit**: `refactor(update): renomear o módulo portable para swap`

---

### T5: Gravar `DisplayVersion` no registro após a troca

**What**: `set_registry_display_version` sob `#[cfg(windows)]`, via `reg add` em `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SwarmDeck`.
**Where**: `src-tauri/src/update/swap.rs`
**Depends on**: T4
**Reuses**: padrão de `std::process::Command` já usado nos testes de `paths.rs` (`icacls`) — sem crate nova
**Requirement**: SILENT-18, SILENT-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A chave de registro é parâmetro do núcleo testável, para o teste escrever numa subchave descartável de `HKCU` e apagá-la ao final
- [x] Teste grava uma versão, relê com `reg query` e confere o valor
- [x] Teste de caminho de falha: chave inválida devolve `Err`, sem panicar
- [x] Marcador `// SPEC:` do arquivo inclui SILENT-18, SILENT-19
- [x] Gate check passa: `cargo test`
- [x] Test count: 9 testes existentes (ver nota de T4) + 2 novos = 11 passam

**Tests**: unit
**Gate**: quick-rust

**Commit**: `feat(update): atualizar DisplayVersion do registro após a troca`

---

### T6: Aposentar o download em segundo plano e a instalação no fechamento

**What**: `apply.rs` perde `PendingUpdate`, `handle_close`, `check_and_download` e `check_and_download_with`; o ciclo do `run_loop` passa a ser `check_only`, que consulta e emite `update://available` sem baixar nada.
**Where**: `src-tauri/src/update/apply.rs`
**Depends on**: None
**Reuses**: `apply::run_loop` (boot-fire + intervalo de 1h, com os 2 testes atuais preservados)
**Requirement**: SILENT-14, SILENT-15, SILENT-16, SILENT-17, SILENT-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nenhum símbolo chamado `PendingUpdate`, `handle_close` ou `check_and_download` permanece no crate
- [x] Teste: ciclo com versão nova emite `update://available` uma vez e **não** chama nenhuma função de download (o fake de download panica se acionado)
- [x] Teste: ciclo sem versão nova não emite nada
- [x] Teste: ciclo com falha de consulta loga e não emite, e o `run_loop` mantém a cadência (os 2 testes de `run_loop` continuam passando com `wait:3600`)
- [x] **SPEC_DEVIATION**: "verificação automática desligada não consulta" não ganhou teste próprio aqui. `check_only_with` sempre chama seu parâmetro `check` — o gate de `auto_check_enabled` mora dentro de `status_with` (uma camada abaixo, via `status_gated`), já provado por `check.rs:299` (`auto_check_desligado_nao_sai_para_a_rede`, reusada por `check_only` sem duplicar lógica). Escrever esse teste aqui exigiria ou duplicar a lógica de gate ou um fake que nunca é chamado (tautológico, Check B reprova).
- [x] Marcador `// SPEC:` atualizado para `silent-update`
- [x] Gate check passa: `cargo test`
- [x] Test count: 2 testes de `run_loop` preservados + 3 novos passam (ver SPEC_DEVIATION acima para o 4º)

**Tests**: unit
**Gate**: quick-rust

**Commit**: `refactor(update): remover download automático e instalação no fechamento`

---

### T7: Implementar `apply::run` — download confirmado, troca e registro

**What**: `run`/`run_with` em `apply.rs`: resolve a entrada de plataforma, reprova pasta não gravável antes de baixar, baixa os bytes, chama `swap::apply_swap`, grava `DisplayVersion` no flavor instalado, e guarda contra acionamento duplo com `Applying`.
**Where**: `src-tauri/src/update/apply.rs`
**Depends on**: T6
**Reuses**: `swap::apply_swap` (T4), `swap::set_registry_display_version` (T5), `check::status` (T2), `paths::is_writable`
**Requirement**: SILENT-02, SILENT-03, SILENT-06, SILENT-08, SILENT-21, SILENT-24, SILENT-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste: `run` é a única porta de download do módulo — nenhuma outra função do crate a chama sozinha (SILENT-03) — verificado por inspeção: único `reqwest::` do arquivo é `apply.rs:172`, dentro de `run`
- [x] Teste: pasta não gravável devolve `Err` **antes** de o fake de download ser acionado (o fake panica se chamado)
- [x] Teste: manifesto sem entrada para a chave de plataforma devolve o erro "não disponível para esta instalação", sem baixar
- [x] Teste: caminho feliz baixa, aplica a troca e devolve a versão aplicada
- [x] Teste: segunda chamada enquanto `Applying` está `true` retorna sem baixar
- [x] Teste: no flavor instalado o gravador de registro é acionado; no portátil, não
- [x] Nenhuma chamada a `Update::install` no caminho Windows — confirmado por inspeção (`#[cfg(windows)]` de `run` não referencia `Update::install`; a chamada só existe no ramo `#[cfg(not(windows))]`, necessário porque `release.yml` builda para `ubuntu-22.04` também — sem esse ramo o crate não compilaria fora do Windows)
- [x] Gate check passa: `cargo test`
- [x] Test count: 6 testes novos passam

**Tests**: unit
**Gate**: quick-rust

**Commit**: `feat(update): aplicar a atualização trocando o executável após confirmação`

---

### T8: Expor `update_apply` e `update_restart`

**What**: Dois comandos Tauri: `update_apply` delega para `apply::run` e devolve a versão aplicada; `update_restart` chama `app.restart()`.
**Where**: `src-tauri/src/commands/update.rs`
**Depends on**: T7
**Reuses**: `commands/update.rs` (padrão de invólucro fino já estabelecido em T3)
**Requirement**: SILENT-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `update_apply` traduz erro de `apply::run` para `Err(String)` sem panicar
- [x] `update_restart` existe e chama `app.restart()`
- [x] Teste do tradutor de erro (mesmo padrão de `with_db`, sem app Tauri montado)
- [x] Gate check passa: `cargo test`
- [x] Test count: 2 testes existentes + 1 novo = 3 totais passam (a versão anterior desta linha dizia "3 existentes + 1 novo", errado por aritmética — corrigido no re-verify)

**Tests**: unit
**Gate**: quick-rust

**Commit**: `feat(update): expor os comandos update_apply e update_restart`

---

### T9: Refiar `lib.rs` ao novo fluxo

**What**: Remover `manage(PendingUpdate)` e o handler de `CloseRequested`; registrar `Applying`, chamar `swap::cleanup_stale_old` no boot e registrar os comandos novos no `invoke_handler!`.
**Where**: `src-tauri/src/lib.rs`
**Depends on**: T8
**Reuses**: o bloco de `setup` existente
**Requirement**: SILENT-07, SILENT-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nenhum `on_window_event` de update permanece; a janela `main` fecha sem interceptação
- [x] `swap::cleanup_stale_old` roda no `setup`, com o erro apenas logado
- [x] `invoke_handler!` lista `update_status`, `update_apply`, `update_restart` e não lista `update_check`
- [x] `tauri_plugin_updater` segue registrado (o caminho não-Windows depende dele)
- [x] Marcador `// SPEC: silent-update (SILENT-07, SILENT-14)` **acima do bloco** de update, não no topo do arquivo
- [x] Gate check passa: `npm run build && npm run test && npm run test:scripts && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test`

**Tests**: none
**Gate**: build

**Commit**: `refactor(app): ligar o wiring de update ao fluxo confirmado`

---

### T10: Reescrever `UpdateSettings.tsx` com as duas versões e a confirmação

**What**: Componente apresentacional com o estado único `UpdateState` (loading, ready, unavailable, applying, applied, error), exibindo versão instalada e mais recente, botão "Baixar e atualizar" e botão "Reiniciar agora".
**Where**: `src/components/settings/UpdateSettings.tsx`
**Depends on**: None
**Reuses**: `src/routes/settings/GeneralPanel.tsx` (contrato apresentacional: recebe dados prontos, noticia intenção por callback, nunca chama `invoke`)
**Requirement**: SILENT-09, SILENT-10, SILENT-11, SILENT-12, SILENT-13, SILENT-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Estado `ready` com versões iguais mostra os dois números e "Você já está na versão mais recente", sem botão de atualizar
- [x] Estado `ready` com `hasUpdate` mostra o número da versão nova e o botão "Baixar e atualizar"
- [x] Estado `unavailable` mostra a versão instalada e a mensagem de falha de consulta, sem número de versão remota
- [x] Estado `applying` desabilita o botão de atualizar
- [x] Estado `applied` mostra "Atualizado para X. Reinicie para concluir." e o botão "Reiniciar agora"
- [x] Estado `error` mostra a mensagem com `role="alert"`
- [x] O texto explicativo não menciona mais instalação no fechamento do app
- [x] Marcador `// SPEC:` atualizado para `silent-update`
- [x] Gate check passa: `npm run test` (rodado junto com T11 — `SettingsShell.tsx` ainda passava as props antigas para este componente até T11 landar; os dois foram verificados no mesmo gate, ver nota em T11)
- [x] Test count: 7 testes em `UpdateSettings.test.tsx` passam (task previa 6; a task adicional veio do critério "texto explicativo", que ganhou teste próprio em vez de ser dobrado em outro caso)

**Tests**: unit
**Gate**: quick-ts

**Commit**: `feat(settings): mostrar versão instalada e mais recente com confirmação de update`

---

### T11: Ligar `SettingsShell.tsx` aos comandos novos

**What**: Trocar `update_check` por `update_status` ao abrir a seção, chamar `update_apply` na confirmação e `update_restart` no reinício; remover o `import packageJson`.
**Where**: `src/routes/settings/SettingsShell.tsx`
**Depends on**: T10
**Reuses**: o padrão de carregamento por seção já usado para `update_auto_check_get` e `quota_prefs_get` (falha de `invoke` mantém estado utilizável em vez de travar a seção)
**Requirement**: SILENT-09, SILENT-13, SILENT-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Abrir a seção Atualizações chama `update_status` e monta o estado `ready` com os campos devolvidos
- [x] Falha de `update_status` monta o estado `unavailable` com a versão instalada preservada (via `lastKnownVersionRef`)
- [x] Confirmação chama `update_apply` e transiciona `applying` → `applied`
- [x] "Reiniciar agora" chama `update_restart`
- [x] Nenhum `import packageJson` permanece no arquivo, e `mode` deixa de ser o literal `'installed'`
- [x] Gate check passa: `npm run test` — **nota**: T10 e T11 foram implementadas e gateadas juntas. `UpdateSettings.tsx` (T10) troca o contrato de props inteiro (`installedVersion`/`checkState` → `state: UpdateState`); `SettingsShell.tsx` é o único chamador do componente, então rodar o gate de T10 isolado (antes de T11 tocar `SettingsShell.tsx`) quebrava a suíte inteira em runtime (`state` chegava `undefined`) — não um erro de tipo (TS não valida a string do `invoke`), um crash de render real. T2/T3/T6 tiveram o mesmo problema do lado Rust (resolvido com shims de compatibilidade); aqui não há shim razoável porque a mudança é o formato do estado inteiro, não um símbolo isolado — por isso as duas tasks foram implementadas em sequência imediata e o gate rodou uma vez, ao final, cobrindo as duas. `npx tsc --noEmit` também confirmado limpo.
- [x] Test count: 4 testes novos em `SettingsShell.test.tsx` passam

**Tests**: unit
**Gate**: quick-ts

**Commit**: `feat(settings): ligar a seção de atualizações ao fluxo confirmado`

---

### T12: Publicar e registrar o executável cru assinado na release

**What**: No job Windows, copiar/assinar/subir `SwarmDeck_<versão>_x64.exe` + `.sig`; no `finalize`, segunda invocação de `patch-latest-json.mjs` com `--key windows-x86_64-silent`.
**Where**: `.github/workflows/release.yml`
**Depends on**: None
**Reuses**: `scripts/patch-latest-json.mjs` (já parametrizado por `--key`/`--name`/`--signature-file` — nenhum script novo) e o passo de assinatura `npx tauri signer sign` já usado pelo bundle portátil
**Requirement**: SILENT-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O job Windows sobe `SwarmDeck_<versão>_x64.exe` e `SwarmDeck_<versão>_x64.exe.sig` como assets da release
- [x] O `finalize` injeta `windows-x86_64-silent` no `latest.json`, apontando para o asset com a tag corrigida via `--tag`
- [x] `patch-latest-json.mjs` não é modificado — apenas invocado uma segunda vez
- [x] Marcador `# SPEC: silent-update (SILENT-20)` acima do passo novo
- [x] Gate check passa: `npm run build && npm run test && npm run test:scripts && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test`

**Tests**: none
**Gate**: build

**Commit**: `ci(release): publicar o executável cru assinado para a atualização silenciosa`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5
Phase 3:  T6 ------→ T7 ------→ T8 ------→ T9
Phase 4:  T10 -----→ T11
Phase 5:  T12
```

A execução é estritamente sequencial — não há paralelismo dentro de uma fase.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Criar `manifest.rs` | 1 módulo novo, 2 funções coesas | ✅ Granular |
| T2: Migrar `check.rs` | 1 arquivo | ✅ Granular |
| T3: `update_status` | 1 comando | ✅ Granular |
| T4: Renomear para `swap.rs` | 1 rename mecânico | ✅ Granular |
| T5: `DisplayVersion` no registro | 1 função | ✅ Granular |
| T6: Aposentar download automático | 1 arquivo, remoção coesa | ✅ Granular |
| T7: `apply::run` | 1 função + núcleo testável | ✅ Granular |
| T8: `update_apply` / `update_restart` | 2 comandos no mesmo arquivo | ⚠️ OK — coesos, mesmo arquivo |
| T9: Wiring de `lib.rs` | 1 arquivo | ✅ Granular |
| T10: `UpdateSettings.tsx` | 1 componente | ✅ Granular |
| T11: `SettingsShell.tsx` | 1 arquivo | ✅ Granular |
| T12: `release.yml` | 1 arquivo | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| ---- | ------------------ | --------------- | ------ |
| T1 | None | — (início da fase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | — (início da fase 2) | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | — (início da fase 3; é remoção de código, não depende das fases anteriores — a ordem das fases já garante o resto) | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | None | — (início da fase 4) | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | None | — (fase 5, task única) | ✅ Match |

Nenhuma dependência aponta para uma fase posterior.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| ---- | ------------------------ | ------------ | -------- | ------ |
| T1 | Domínio Rust de update | unit | unit | ✅ OK |
| T2 | Domínio Rust de update | unit | unit | ✅ OK |
| T3 | Comandos Rust | unit | unit | ✅ OK |
| T4 | Domínio Rust de update | unit | unit | ✅ OK |
| T5 | Integração de registro do Windows | unit | unit | ✅ OK |
| T6 | Domínio Rust de update | unit | unit | ✅ OK |
| T7 | Domínio Rust de update | unit | unit | ✅ OK |
| T8 | Comandos Rust | unit | unit | ✅ OK |
| T9 | Wiring do app | none | none | ✅ OK |
| T10 | Componentes React | unit | unit | ✅ OK |
| T11 | Componentes React | unit | unit | ✅ OK |
| T12 | Workflow de release | none | none | ✅ OK |

---

## Verificação manual obrigatória (fora do gate automático)

Nenhum teste local sobe uma release de verdade. Depois de T12, antes de considerar a feature pronta:

1. Publicar a versão N+1 pelo workflow e conferir que `latest.json` contém `windows-x86_64-silent`.
2. Abrir o app instalado na versão N, confirmar a atualização e observar que **nenhuma janela de instalador aparece**.
3. Conferir que `%LOCALAPPDATA%\SwarmDeck\SwarmDeck.exe` mudou e que `SwarmDeck.exe.old` existe.
4. Reabrir o app: a versão exibida é N+1 e o `.old` sumiu.
5. `reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SwarmDeck" /v DisplayVersion` devolve N+1.
