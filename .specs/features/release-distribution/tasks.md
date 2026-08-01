# Release e distribuição — Tasks

**Design**: `.specs/features/release-distribution/design.md`
**Testing**: `.specs/codebase/TESTING.md`
**Status**: In Progress
**Milestone**: Transversal — Fase A (T1–T3, T21) não depende de nenhuma feature e pode entrar hoje; Fase C em diante só faz sentido quando o M1 produzir um app que valha a pena instalar.

| Bloco | Tarefas | Entra quando |
|---|---|---|
| A — Validação | T1, T2, T3, T20, T21 | Agora. Nada aqui depende do estado do app |
| B — Empacotamento | T4, T5 | Agora. T5 é passo humano |
| C — Release | T6–T12 | Depois de A e B |
| D — Update no app | T13–T19 | Depende do M1 estar utilizável |

---

## Plano de execução

### Fase A — Validação (paralelo, depois sequencial)
```
T1 [P] ─┐
T3 [P] ─┴→ T2 → T21
T20 [P]
```

### Fase B — Empacotamento
```
T1 → T4
T5 [P]  (independente: passo humano)
```

### Fase C — Release
```
T1, T3, T4 → T6 ─┬→ T9 → T10 → T12
T4 → T7 [P] ─────┤        ↑
T4 → T8 [P] ─────┼────────┘
T5 ──────────────┤
T6 → T11 ────────┴→ T12
```

### Fase D — Update no app
```
T13 → T14 → T15 → T16 → T17 → T18 → T19
T4 ────────→ T15
T12 ───────────────────────────────→ T19
```

---

## Desvios de execução

- **T1 — `test:scripts` não podia ser `"node --test scripts/"`.** O `Done when` original exigia essa string literal, mas no Node 24 (fixado em `.github/workflows/ci.yml:27` e confirmado localmente com `node --version` → `v24.12.0`) o argumento posicional de `node --test` é tratado como **glob**, não como diretório: `node --test scripts/` casa a própria pasta `scripts` como se fosse um arquivo de teste e falha com `MODULE_NOT_FOUND: Cannot find module 'D:\ide\scripts'` (reproduzido nesta correção, `npm run test:scripts` → exit 1). A correção usa a forma glob explícita, `node --test "scripts/**/*.test.mjs"`, que restringe a busca aos arquivos `*.test.mjs` dentro de `scripts/` — 10/10 testes passam. Ficou decidido não usar `node --test` sem argumento posicional (que também funcionaria) porque essa forma varreria qualquer pasta de teste que o projeto ganhe fora de `scripts/` no futuro; o glob mantém o gate `scripts` restrito ao escopo da tarefa.

---

## Tarefas

### T1: Escritor único da versão

**O quê**: `scripts/bump-version.mjs` — calcula a próxima versão e a grava nos arquivos que a duplicam, com os testes das funções puras.
**Onde**: `scripts/bump-version.mjs`, `scripts/bump-version.test.mjs`, `package.json` (script `test:scripts`)
**Depende de**: nenhuma
**Reusa**: `local-mind/scripts/bump-version.mjs` como referência de estrutura — **adaptado**: aqui o alvo Rust é o `Cargo.toml` da **raiz**, em `[workspace.package]`
**Requisito**: REL-03, REL-04, REL-30

**Done when**:
- [x] `bumpVersion("0.1.0", "patch") === "0.1.1"`, idem `minor` e `major`
- [x] `setWorkspaceVersion` altera **só** a `version` dentro de `[workspace.package]` — um TOML com dependências versionadas passa intacto no resto
- [x] `setJsonVersion` cobre `package.json` e o `packages[""].version` do `package-lock.json`
- [x] `--dry-run` imprime só a versão, sem escrever arquivo
- [x] Versão fora de `X.Y.Z` e incremento desconhecido falham com erro explícito
- [x] `package.json` ganha `"test:scripts": "node --test \"scripts/**/*.test.mjs\""` — ver Desvios de execução: a forma sem argumento posicional não funciona no Node 24
- [x] Gate passa: `npm run test:scripts`
- [x] Contagem de testes: 11 unit — inclui o caso de `setWorkspaceVersion` que mata o mutante `inWorkspacePackage = true` (correção pós-Verifier)

**Tests**: unit · **Gate**: scripts

**Verify**: `node scripts/bump-version.mjs patch --base 0.1.0 --dry-run` imprime `0.1.1` e `git status` fica limpo.

**Commit**: `feat(release): add single writer for the project version`

---

### T2: Workflow de CI

> 🚧 **BLOQUEADA.** Gate `pipeline` — depende de push humano ao GitHub para produzir um run real na aba Actions. Nenhum item do `Done when` abaixo tem essa evidência ainda; permanece com todas as caixas desmarcadas até o disparo real.

**O quê**: `.github/workflows/ci.yml` com os três jobs (frontend, rust, commits), concorrência com cancelamento e nenhuma capacidade de publicar.
**Onde**: `.github/workflows/ci.yml`
**Depende de**: T1 (o job frontend roda `npm run test:scripts`)
**Reusa**: `local-mind/.github/workflows/ci.yml` — **sem** o passo de `protoc`
**Requisito**: REL-27, REL-28, REL-29, REL-30, REL-31

**Done when**:
- [ ] Job `frontend` (ubuntu-latest, Node 24, cache npm): `npm ci` → `npm run build` → `npm run test` → `npm run test:scripts`
- [ ] Job `rust` (`ubuntu-22.04`): deps de sistema do Tauri + `build-essential` → `cargo fmt --all -- --check` → `cargo test`
- [ ] Job `commits` roda **só** em `pull_request`, avalia `origin/$base..HEAD` e ignora commits de merge
- [ ] `concurrency` com `cancel-in-progress: true`
- [ ] O arquivo não contém `gh release`, `git tag` nem `tauri-action` — a busca por esses termos retorna vazio
- [ ] Gate passa: run verde na aba Actions

**Tests**: none · **Gate**: pipeline

**Verify**: abrir um PR com erro de tipo em TS → check vermelho; corrigir → verde. Abrir um PR com commit `wip` → job `commits` vermelho.

**Commit**: `ci: add validation workflow for push and pull requests`

---

### T3: Configuração do git-cliff

**O quê**: `cliff.toml` com os grupos de commit em português, validado contra o histórico real.
**Onde**: `cliff.toml`
**Depende de**: nenhuma
**Reusa**: `local-mind/cliff.toml`
**Requisito**: REL-05

**Done when**:
- [ ] `git cliff --config cliff.toml --unreleased` gera saída sem erro no histórico atual — **sem evidência**: `git-cliff` não está instalado neste ambiente de execução, não foi rodado
- [x] Tipos `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` mapeados para grupos legíveis — confirmado por leitura de `cliff.toml:44-56`, os 9 tipos mais `style` e o catch-all `Outros`
- [ ] Commits de merge e o commit inicial não convencional não quebram a geração — **sem evidência**: mesma limitação, não executado
- [x] Gate passa: `cargo build && npm run build` (nada de código muda; o gate confirma que a árvore segue sã) — `cargo build` finished dev profile; `npm run build` (`tsc --noEmit && vite build`) ✓ built in 964ms, 31/07/2026

**Tests**: none · **Gate**: build

**Verify**: rodar o git-cliff local e ler a saída — a seção da versão não sai vazia depois de um commit `feat:` de teste.

**Commit**: `chore(release): add git-cliff configuration`

---

### T4: Configuração de empacotamento do Tauri

**O quê**: fazer o `tauri.conf.json` derivar a versão, fixar o nome do binário, restringir os alvos de bundle, ligar os artefatos de update e criar a capability padrão que hoje não existe.
**Onde**: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
**Depende de**: T1
**Reusa**: config atual do Tauri
**Requisito**: REL-10, REL-11

**Done when**:
- [x] `"version": "../package.json"` — confirmado em `src-tauri/tauri.conf.json:4`; comportamento de falha em caminho inválido não foi exercitado (não há evidência de teste desse caso)
- [x] `mainBinaryName: "SwarmDeck"` — confirmado em `src-tauri/tauri.conf.json:5`
- [x] `bundle.targets` explícito: `["msi", "nsis", "deb", "appimage"]` — confirmado em `src-tauri/tauri.conf.json:31`
- [x] `bundle.createUpdaterArtifacts: true` — confirmado em `src-tauri/tauri.conf.json:32`
- [x] `bundle.windows.nsis.installMode: "currentUser"` — confirmado em `src-tauri/tauri.conf.json:35`
- [x] `src-tauri/capabilities/default.json` criado com `core:default` — confirmado em `src-tauri/capabilities/default.json:6`
- [x] Gate passa: `cargo build && npm run build` — `cargo build` finished dev profile; `npm run build` ✓ built in 964ms, 31/07/2026

**Tests**: none · **Gate**: build

**Verify**: `npm run tauri build -- --bundles nsis` local produz `SwarmDeck_0.1.0_x64-setup.exe`; instalar numa conta sem administrador não abre prompt de UAC.

**Commit**: `build(tauri): derive version, pin binary name and enable updater artifacts`

---

### T5: Chave de assinatura e secrets 🧑 passo humano

**O quê**: gerar o par de chaves do updater e cadastrar os secrets no repositório.
**Onde**: GitHub → Settings → Secrets and variables → Actions; `src-tauri/tauri.conf.json` (chave **pública**)
**Depende de**: nenhuma
**Requisito**: REL-11, REL-15 (habilitador)

**Done when**:
- [ ] `npx tauri signer generate -w ~/.tauri/swarmdeck.key` executado pelo mantenedor
- [ ] `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` cadastrados como secrets
- [ ] Chave **pública** commitada em `plugins.updater.pubkey` — a privada **nunca** entra no repositório
- [ ] Gate: não se aplica (nenhum código muda além da chave pública)

**Tests**: none · **Gate**: build

**Verify**: `npx tauri signer sign <arquivo qualquer>` com a chave gerada produz um `.sig`.

> ⚠️ **Bloqueante para T9 e T10.** Nenhuma tarefa automatizada substitui este passo, e sem ele o build de release falha na assinatura.

---

### T6: Job `prepare` do release

**O quê**: o job que calcula a versão, gera o CHANGELOG, commita e tagueia — com as duas guardas antes de qualquer escrita.
**Onde**: `.github/workflows/release.yml`
**Depende de**: T1, T3, T4
**Reusa**: `local-mind/.github/workflows/release.yml`
**Requisito**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06, REL-07

**Done when**:
- [ ] `on:` contém **apenas** `workflow_dispatch` com o input `bump` (choice de 3 valores)
- [ ] Guarda de branch é o **primeiro** step, antes do checkout
- [ ] Guarda de tag existente (local **e** remota) roda antes de gravar arquivo
- [ ] Versão calculada da última tag `v*`; sem tag, base é o `package.json`
- [ ] `cargo metadata` atualiza o `Cargo.lock` sem compilar
- [ ] CHANGELOG e notas gerados pelo git-cliff; as notas viram output do job
- [ ] Commit `chore(release): vX.Y.Z` incluindo `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, `CHANGELOG.md` — e **não** `tauri.conf.json`
- [ ] Output `release_sha` exposto para o `cleanup`
- [ ] Gate passa: disparo real com resultado esperado

**Tests**: none · **Gate**: pipeline

**Verify**: disparar de uma branch que não é `master` → falha no primeiro step, sem commit nenhum criado.

**Commit**: `ci(release): add manual version and tag preparation job`

---

### T7: Montador do bundle portátil [P]

**O quê**: `scripts/make-portable.mjs` — monta a pasta portátil, escreve o marcador e comprime, com os testes das funções puras.
**Onde**: `scripts/make-portable.mjs`, `scripts/make-portable.test.mjs`
**Depende de**: T4 (o nome do executável dentro do zip depende do `mainBinaryName`)
**Reusa**: `local-mind/scripts/make-portable.mjs`
**Requisito**: REL-14, REL-18

**Done when**:
- [ ] `portableArchiveName("0.1.1")` devolve `SwarmDeck_0.1.1_x64-portable.zip`; versão inválida lança
- [ ] Versão fora de `X.Y.Z` é rejeitada antes de qualquer I/O
- [ ] A pasta montada contém executável, recursos e o marcador `.portable`
- [ ] Um `LEIA-ME.txt` explica que apagar o marcador tira o app do modo portátil
- [ ] Gate passa: `npm run test:scripts`
- [ ] Contagem de testes: 6 unit

**Tests**: unit · **Gate**: scripts

**Verify**: rodar contra um build local e descompactar o zip — o executável abre a partir da pasta descompactada.

**Commit**: `feat(release): build the windows portable bundle`

---

### T8: Patch do manifesto de update [P]

**O quê**: `scripts/patch-latest-json.mjs` — injeta a entrada portátil no `latest.json` com a URL corrigida para a tag, com testes.
**Onde**: `scripts/patch-latest-json.mjs`, `scripts/patch-latest-json.test.mjs`
**Depende de**: T4
**Reusa**: `local-mind/scripts/patch-latest-json.mjs`
**Requisito**: REL-11, REL-15

**Done when**:
- [ ] `pickAssetUrlByName` acha o asset por nome exato e falha quando não existe
- [ ] `withReleaseTag` troca a ref `untagged-<hash>` pela tag, preservando dono, repositório e nome de arquivo
- [ ] `patchManifest` acrescenta `windows-x86_64-portable` sem remexer nas chaves existentes
- [ ] Manifesto sem `platforms` falha com erro explícito
- [ ] Gate passa: `npm run test:scripts`
- [ ] Contagem de testes: 8 unit

**Tests**: unit · **Gate**: scripts

**Verify**: rodar contra um `latest.json` real de uma release de rascunho e conferir que a URL resultante responde 200 depois da publicação.

**Commit**: `feat(release): add the portable entry to the updater manifest`

---

### T9: Job `build` do release (matriz Windows + Linux)

**O quê**: a matriz que compila e empacota nos dois sistemas, e que no Windows também monta, assina e anexa o zip portátil.
**Onde**: `.github/workflows/release.yml`
**Depende de**: T5, T6, T7
**Requisito**: REL-09, REL-12, REL-13, REL-15

**Done when**:
- [ ] Matriz `windows-latest` (`msi,nsis`) e `ubuntu-22.04` (`deb,appimage`), com `fail-fast: false`
- [ ] Checkout **na tag** criada pelo `prepare`, não em `master`
- [ ] Deps de sistema do Linux incluem `libfuse2` (AppImage) e `build-essential`; **nenhum passo instala `protoc`**
- [ ] `tauri-action` com `releaseDraft: true` e as env de assinatura
- [ ] Passo do Windows: `make-portable.mjs` → `tauri signer sign` → `gh release upload` do `.zip` e do `.sig`
- [ ] Gate passa: os 5 artefatos aparecem na release de rascunho de um disparo real

**Tests**: none · **Gate**: pipeline

**Verify**: na release de rascunho, contar 5 artefatos + `latest.json` + os `.sig` correspondentes.

**Commit**: `ci(release): build installers and the portable bundle`

---

### T10: Job `finalize`

**O quê**: injetar a entrada portátil no manifesto publicado e tirar a release do rascunho.
**Onde**: `.github/workflows/release.yml`
**Depende de**: T8, T9
**Requisito**: REL-11

**Done when**:
- [ ] Baixa `latest.json` e o `.sig` do portátil da release de rascunho
- [ ] Lê a URL do asset **da própria release** (`gh release view --json assets`), nunca remontando o nome
- [ ] Roda `patch-latest-json.mjs` com `--tag` e reenvia o manifesto
- [ ] `gh release edit --draft=false` só depois disso
- [ ] Gate passa: release publicada com `latest.json` contendo as 5 entradas, todas com URL que responde 200

**Tests**: none · **Gate**: pipeline

**Verify**: `curl -sL <url da entrada portable>` devolve o zip, não 404.

**Commit**: `ci(release): publish the release after patching the manifest`

---

### T11: Job `cleanup`

**O quê**: desfazer tag, rascunho e commit de versão quando o run não chega a publicar.
**Onde**: `.github/workflows/release.yml`
**Depende de**: T6
**Requisito**: REL-08

**Done when**:
- [ ] Condição `always() && needs.prepare.result == 'success' && (build != success || finalize != success)`
- [ ] Apaga **primeiro** a release, depois a tag remota — a ordem inversa deixa release órfã
- [ ] `git revert` do `release_sha`, com push normal; **nenhum** `push --force` no arquivo
- [ ] Revert que não aplica limpo falha com mensagem pedindo correção manual
- [ ] Gate passa: um disparo com falha proposital (ex.: cancelar o run) deixa o repositório no estado anterior e a numeração livre

**Tests**: none · **Gate**: pipeline

**Verify**: depois do cancelamento, `git tag` não lista a tag, a release não existe e um novo disparo `patch` calcula **o mesmo** número.

**Commit**: `ci(release): revert an interrupted release`

---

### T12: Primeira release real (v0.1.1) 🧑 verificação

**O quê**: disparar o pipeline de verdade e registrar o que foi verificado — não é tarefa de código.
**Onde**: GitHub Actions
**Depende de**: T9, T10, T11
**Requisito**: verificação de REL-01, REL-02, REL-06, REL-08, REL-09, REL-12

**Done when**:
- [ ] Tag `v0.1.1`, commit `chore(release): v0.1.1` e release publicada, todos do mesmo run
- [ ] 5 artefatos + `latest.json` anexados, com tamanhos registrados no `STATE.md`
- [ ] O histórico de execuções do `release.yml` não contém nenhum evento que não seja `workflow_dispatch`
- [ ] `.msi` instalado numa conta Windows **sem** administrador, sem prompt de UAC
- [ ] Rastreabilidade da spec atualizada de `Pending` para `Verified` **só** nos requisitos com evidência

**Tests**: none · **Gate**: pipeline

**Commit**: `docs(specs): record evidence from the first published release`

---

### T13: Resolução de caminhos e modo portátil

**O quê**: `src-tauri/src/paths.rs` — a única autoridade sobre onde os dados moram, ligada ao `Db::open`.
**Onde**: `src-tauri/src/paths.rs`, `src-tauri/src/lib.rs`
**Depende de**: nenhuma
**Reusa**: `Db::open(path)` existente em `src-tauri/src/db/mod.rs`
**Requisito**: REL-16, REL-17, REL-18

**Done when**:
- [x] `flavor(dir)` devolve `Portable` quando existe `.portable` ao lado do executável, `Installed` caso contrário — `src-tauri/src/paths.rs:122-134` (2 testes)
- [x] `data_dir` devolve `<exe_dir>/data` no portátil e `app_data_dir()` no instalado — testado via `resolve_data_dir` em `paths.rs:137-160` (2 testes)
- [x] `db_path` devolve `data_dir()/swarmdeck.sqlite` e cria o diretório se faltar — `paths.rs:163-179`
- [x] `is_writable` reprova diretório somente-leitura — `paths.rs:182-194`
- [x] Nenhum outro ponto do código monta caminho de dados — `grep -rn app_data_dir src-tauri/src` retorna só `paths.rs`
- [x] Arquivo abre com `// SPEC: release-distribution (REL-16, REL-17, REL-18)` — `paths.rs:1`
- [x] Gate passa: `cargo test --lib && npm run test` — `cargo test --lib`: 11 passed (6 em `paths::tests`), 0 failed; `npm run test`: verde-porém-vazio, 31/07/2026
- [x] Contagem de testes: 6 unit — confirmado (6 testes em `paths::tests`)

**Tests**: unit · **Gate**: quick

**Commit**: `feat(paths): resolve data directory by installation flavor`

---

### T14: Persistência das preferências de update

**O quê**: tabela de configurações com `updates.auto_check` e as versões puladas, mais a migração correspondente.
**Onde**: `src-tauri/src/db/migrations/NNN_settings.sql`, `src-tauri/src/db/mod.rs`
**Depende de**: T13
**Requisito**: REL-34 (persistência), REL-23 (persistência)

**Done when**:
- [ ] O número da migração é **o próximo livre no momento da execução** — `mcp-task-server/T1` também reivindica a `002`; quem chegar depois pega a seguinte, e a `EXECUTION.md` registra o desempate
- [ ] `auto_check` nasce ligado
- [ ] Versão pulada é persistida individualmente; pular `0.1.3` não afeta `0.1.4`
- [ ] Migração roda uma vez só — segunda chamada é no-op
- [ ] Gate passa: `cargo test && npm run test`
- [ ] Contagem de testes: 4 integration

**Tests**: integration · **Gate**: full

**Commit**: `feat(db): persist update preferences`

---

### T15: Verificação de atualização

**O quê**: `src-tauri/src/update/{mod.rs,check.rs}` + dependência do `tauri-plugin-updater` + permissão na capability.
**Onde**: `src-tauri/src/update/`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`
**Depende de**: T4, T14
**Requisito**: REL-19, REL-21, REL-24 (metade instalada)

**Done when**:
- [ ] A versão corrente de `tauri-plugin-updater` é **reconfirmada** antes de ser fixada (pergunta em aberto nº 2 do design)
- [ ] `check()` roda fora da thread da UI e devolve `Ok(None)` em erro de rede, registrando log
- [ ] Versão publicada ≤ instalada devolve `Ok(None)`
- [ ] Versão presente em `skippedVersions` devolve `Ok(None)`
- [ ] Escolha da entrada do manifesto segue o `flavor` de T13
- [ ] `auto_check` desligado faz `check()` nem sair para a rede
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem de testes: 7 unit

**Tests**: unit · **Gate**: quick

**Commit**: `feat(update): check for a published version on boot`

---

### T16: Atualização do modo portátil

**O quê**: `src-tauri/src/update/portable.rs` — download, verificação minisign, troca de arquivos com rollback e limpeza do `.old`.
**Onde**: `src-tauri/src/update/portable.rs`, `src-tauri/Cargo.toml`
**Depende de**: T15
**Requisito**: REL-22, REL-24 (metade portátil), REL-25

**Done when**:
- [ ] Assinatura válida passa; assinatura adulterada **e** arquivo adulterado falham, cada um com seu teste
- [ ] Pasta somente-leitura é reprovada **antes** do download
- [ ] Falha no meio da troca restaura o executável anterior
- [ ] `.old` remanescente é apagado no boot seguinte
- [ ] Download interrompido descarta o parcial
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem de testes: 8 unit
- [ ] **Verificação manual declarada**: a troca real e o relançamento não são automatizáveis aqui — ficam para T19

**Tests**: unit · **Gate**: quick

**Commit**: `feat(update): apply updates in portable mode without elevation`

---

### T17: Aviso de nova versão

**O quê**: `UpdateBanner.tsx` e os comandos Tauri que o alimentam, com as três ações.
**Onde**: `src/components/UpdateBanner.tsx`, `src-tauri/src/commands/update.rs`
**Depende de**: T16
**Requisito**: REL-20, REL-23, REL-26

**Done when**:
- [ ] Banner não bloqueante com versão, notas e as ações Atualizar / Depois / Pular
- [ ] "Depois" some na sessão; "Pular" persiste só aquela versão
- [ ] Atualizar com PTY ativo pede confirmação antes de prosseguir, avisando que os terminais serão encerrados
- [ ] Progresso do download visível
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem de testes: 5 unit (React)

**Tests**: unit · **Gate**: quick

**Commit**: `feat(update): show a non-blocking banner for a new version`

---

### T18: Seção "Atualizações"

**O quê**: superfície mínima de configuração com versão instalada, modo, "Verificar agora" e o toggle de verificação automática.
**Onde**: `src/components/settings/UpdateSettings.tsx`
**Depende de**: T17
**Requisito**: REL-32, REL-33, REL-34

**Done when**:
- [ ] Mostra versão instalada e o modo (instalado/portátil)
- [ ] "Verificar agora" informa o resultado **inclusive** quando já está atualizado
- [ ] Toggle persiste e continua permitindo a verificação manual quando desligado
- [ ] Sem rede, o botão manual mostra erro explícito
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem de testes: 4 unit (React)

**Tests**: unit · **Gate**: quick

**Commit**: `feat(settings): add the updates section`

---

### T19: Atualização ponta a ponta nos dois modos 🧑 verificação

**O quê**: publicar uma versão nova e atualizar de verdade, instalado e portátil — não é tarefa de código.
**Onde**: máquina Windows real
**Depende de**: T12, T18
**Requisito**: verificação de REL-14 a REL-26

**Done when**:
- [ ] Com vX instalada e vY publicada, o app avisa sozinho no boot
- [ ] Aceitar leva o app a vY, com progresso, sem prompt de elevação — repetido no modo portátil
- [ ] No portátil, os dados continuam ao lado do executável depois da atualização
- [ ] Com o toggle desligado, nenhuma requisição sai no boot (rede monitorada)
- [ ] Rastreabilidade atualizada só onde houve evidência

**Tests**: none · **Gate**: pipeline

**Commit**: `docs(specs): record end-to-end update verification`

---

### T20: Perfil de release enxuto [P]

**O quê**: `[profile.release]` com `strip` e LTO, e a medição do antes/depois.
**Onde**: `Cargo.toml` (raiz)
**Depende de**: nenhuma
**Requisito**: REL-35

**Done when**:
- [x] `strip = true`, `lto = "thin"`, `codegen-units = 1` — `Cargo.toml:22-25`
- [x] Tamanho do binário medido **duas vezes** — com e sem o perfil, em `CARGO_TARGET_DIR` separado — e a diferença registrada em bytes no `STATE.md` — `.specs/project/STATE.md:67`: sem perfil 9.849.344 bytes, com perfil 7.805.440 bytes, redução de 2.043.904 bytes (~20,8%)
- [x] O número é comparado à meta de **binário < 20MB** do `PROJECT.md`, e a conclusão (atingida ou não) fica escrita — `STATE.md:67` registra meta atingida nos dois casos
- [x] Gate passa: `cargo build && npm run build` — `cargo build` finished dev profile; `npm run build` ✓ built in 964ms, 31/07/2026

**Tests**: none · **Gate**: build

**Commit**: `build: strip and LTO in the release profile`

---

### T21: Clippy no CI

> 🚧 **BLOQUEADA.** Gate `pipeline` — depende de push humano ao GitHub para produzir um run real na aba Actions, e depende de `T2` já estar publicado. Nenhum item do `Done when` abaixo tem essa evidência ainda; permanece com todas as caixas desmarcadas até o disparo real.

**O quê**: zerar os warnings existentes e acrescentar o job de lint.
**Onde**: código Rust conforme necessário, `.github/workflows/ci.yml`
**Depende de**: T2
**Requisito**: REL-36

**Done when**:
- [ ] `cargo clippy --all-targets -- -D warnings` passa localmente — a limpeza vem **antes** do job
- [ ] O número de warnings encontrados antes da limpeza é registrado no `STATE.md` (hoje ninguém mediu)
- [ ] Job acrescentado ao `ci.yml`
- [ ] Gate passa: run verde na aba Actions
- [ ] Nenhum `#[allow]` novo sem comentário explicando a razão

**Tests**: none · **Gate**: pipeline

**Commit**: `ci: fail the build on clippy warnings`

---

## Checagem de granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T1 | 1 script + testes | ✅ |
| T2 | 1 workflow | ✅ |
| T3 | 1 arquivo de config | ✅ |
| T4 | 1 config + 1 capability (coeso: é a configuração de empacotamento) | ✅ |
| T5 | 1 passo humano | ✅ |
| T6, T9, T10, T11 | 1 job cada — o `release.yml` é escrito em quatro tarefas, não numa | ✅ |
| T7, T8 | 1 script + testes cada | ✅ |
| T12, T19 | verificação, sem código | ✅ |
| T13–T16 | 1 módulo cada | ✅ |
| T17, T18 | 1 componente cada | ✅ |
| T20, T21 | 1 mudança de config cada | ✅ |

## Cruzamento diagrama × definição

| Tarefa | `Depende de` | Diagrama mostra | Status |
|---|---|---|---|
| T1 | — | raiz da Fase A | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | — | raiz da Fase A | ✅ |
| T4 | T1 | T1 → T4 | ✅ |
| T5 | — | independente | ✅ |
| T6 | T1, T3, T4 | T1, T3, T4 → T6 | ✅ |
| T7 | T4 | T4 → T7 | ✅ |
| T8 | T4 | T4 → T8 | ✅ |
| T9 | T5, T6, T7 | T5, T6, T7 → T9 | ✅ |
| T10 | T8, T9 | T8, T9 → T10 | ✅ |
| T11 | T6 | T6 → T11 | ✅ |
| T12 | T9, T10, T11 | T10, T11 → T12 | ✅ |
| T13 | — | raiz da Fase D | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T4, T14 | T4 → T15, T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T12, T18 | T12 → T19, T18 → T19 | ✅ |
| T20 | — | independente | ✅ |
| T21 | T2 | T2 → T21 | ✅ |

## Validação de co-localização de teste

| Tarefa | Camada tocada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T1 | Scripts de release | unit | unit | ✅ |
| T2 | Workflow | none (gate pipeline) | none | ✅ |
| T3 | Config sem lógica | none | none | ✅ |
| T4 | Config de bundle | none | none | ✅ |
| T5 | — | none | none | ✅ |
| T6, T9, T10, T11 | Workflow | none (gate pipeline) | none | ✅ |
| T7, T8 | Scripts de release | unit | unit | ✅ |
| T12, T19 | — (verificação) | none | none | ✅ |
| T13 | `paths.rs` | unit | unit | ✅ |
| T14 | Camada de banco + migração | integration | integration | ✅ |
| T15, T16 | `update/` | unit | unit | ✅ |
| T17 | Componente React com lógica | unit | unit | ✅ |
| T18 | Componente React com lógica (toggle + estado) | unit | unit | ✅ |
| T20, T21 | Config / lint | none | none | ✅ |

**Paralelismo**: T14 é `integration` de banco → **não** recebe `[P]`, conforme a avaliação de paralelismo da `TESTING.md`. As tarefas com gate `pipeline` (T2, T6, T9–T12, T19, T21) também não são paralelizáveis entre si: disputam a mesma branch e o mesmo histórico de runs.

---

## Cobertura de requisitos

| Requisito | Tarefa |
|---|---|
| REL-01, REL-02, REL-06, REL-07 | T6 |
| REL-03, REL-04 | T1 |
| REL-05 | T3, T6 |
| REL-08 | T11 |
| REL-09, REL-12, REL-13 | T9 |
| REL-10 | T4 |
| REL-11 | T4, T8, T10 |
| REL-14, REL-18 | T7, T13 |
| REL-15 | T5, T8, T9 |
| REL-16, REL-17 | T13 |
| REL-19, REL-21 | T15 |
| REL-20, REL-26 | T17 |
| REL-22, REL-25 | T16 |
| REL-23 | T14, T17 |
| REL-24 | T15, T16 |
| REL-27 a REL-31 | T2 (REL-30 também em T1) |
| REL-32, REL-33 | T18 |
| REL-34 | T14, T18 |
| REL-35 | T20 |
| REL-36 | T21 |

**36 requisitos, 36 mapeados.** T12 e T19 não implementam requisito — elas **verificam**, e são o que move a rastreabilidade de `Implemented` para `Verified`.
