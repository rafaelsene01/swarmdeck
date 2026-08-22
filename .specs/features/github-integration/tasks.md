# github-integration Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Spec**: `.specs/features/github-integration/spec.md`
**Design**: `.specs/features/github-integration/design.md`
**Status**: Draft

---

## Pré-requisito de execução (não é task, roda antes da T1)

Provar o mecanismo de anexo antes de escrever código, porque toda a Fase 3
depende de um endpoint não documentado (AD-047):

1. Subir uma imagem para `https://uploads.github.com/user-attachments/assets?name=<n>&content_type=<mime>&repository_id=1315448729` com `Authorization: Bearer <PAT>` e os bytes no corpo. Esperado: HTTP 201 com `{"url": ...}`.
2. Criar uma issue descartável embutindo `![n](<url>)` e conferir no navegador que a imagem renderiza inline.
3. Privar o repositório e conferir que a imagem continua renderizando logado, e que a URL dá 404 deslogado.
4. Fechar a issue.

**Se o passo 2 ou 3 falhar**, CFG-18 muda para o fallback (subir a imagem pela
Contents API no próprio repositório privado e embutir link `blob/` clicável em
vez de imagem inline). Atualizar a spec antes de seguir; o resto do plano não
muda.

**Antes da T1**: gerar um PAT novo. O token usado na conversa de planejamento
passou por texto puro e deve ser revogado.

---

## Test Coverage Matrix

> Gerada do codebase, das regras do projeto e da spec. Guidelines encontradas:
> `.claude/rules/spec-driven-changes.md`, `.claude/rules/rust/security.md`,
> `.claude/rules/frontend-ui-ux-pro-max.md`. Não há configuração de cobertura
> (`vitest` roda sem `vitest.config`, `package.json:test` = `vitest run
> --passWithNoTests`) e `AGENTS.md` não existe — defaults fortes aplicados.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Lógica pura Rust (montagem de título/corpo, resolução de asset) | unit | Todos os ramos; 1:1 com as ACs da spec; todo edge case listado tem teste | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Cliente HTTP Rust (upload, criação de issue, fetch autenticado) | unit | Caminho feliz + 401/403 + 429 + falha de rede, com o transporte injetado como faz `quota.rs::real_http` | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Comando Tauri | unit | Serialização do payload e mapeamento de erro; sem rede real | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Componente React | unit | Toda AC de UI da spec + todo edge case de UI listado | `src/**/*.test.tsx` | `npm test` |
| Config, manifesto, workflow, spec | none | apenas o gate de build | - | build gate |

## Gate Check Commands

> Gerada do codebase. Não existe script de lint; `npm run build` é
> `tsc --noEmit && vite build` e faz o papel de typecheck.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Depois de task com teste unitário Rust | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Quick (front) | Depois de task com teste unitário React | `npm test` |
| Full | Depois de task que cruza Rust e front | `npm test && cargo test --manifest-path src-tauri/Cargo.toml` |
| Build | Depois de task de config, manifesto ou spec, e ao fim de cada fase | `npm run build && cargo test --manifest-path src-tauri/Cargo.toml` |

---

## Execution Plan

Fases rodam em sequência; tasks dentro de uma fase rodam em ordem.

### Phase 1: Acesso ao GitHub

### Phase 2: Updater autenticado

### Phase 3: Envio da issue

### Phase 4: Interface do feedback

### Phase 5: Rastreabilidade

```
T1 -> T2 -> T3 -> T4 -> T5
T4 -> T6 -> T8
T4 -> T7 -> T8
T8 -> T9 -> T10
T4 -> T11 -> T12 -> T13 -> T14
T14 -> T15 -> T16 -> T17 -> T18 -> T19
T14 -> T16
```

---

## Task Breakdown

### T1: Ignorar o `.env` no versionamento

**What**: Acrescentar `.env` e `.env.*` ao `.gitignore`, com exceção de `.env.example`.
**Where**: `.gitignore`
**Depends on**: None
**Reuses**: o arquivo existente (hoje sem nenhum padrão de segredo)
**Requirement**: CFG-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `git check-ignore -v .env` reporta o `.gitignore`
- [ ] `git check-ignore .env.example` não casa
- [ ] O arquivo termina com quebra de linha (hoje a última linha `print` não tem)

**Tests**: none
**Gate**: build

**Commit**: `chore(config): ignorar .env no versionamento`

---

### T2: Documentar a variável do PAT

**What**: Criar `.env.example` com `SWARMDECK_GITHUB_PAT=` e um comentário nomeando as três permissões exigidas.
**Where**: `.env.example`
**Depends on**: T1
**Reuses**: NONE
**Requirement**: CFG-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Arquivo lista `Metadata: Read`, `Contents: Read`, `Issues: Read and write`
- [ ] Nenhum valor real de token no arquivo
- [ ] Sem marcador `SPEC:` — arquivo de infraestrutura, sem requisito próprio a implementar

**Tests**: none
**Gate**: build

**Commit**: `chore(config): documentar SWARMDECK_GITHUB_PAT em .env.example`

---

### T3: Injetar o PAT em tempo de compilação

**What**: `build.rs` lê `SWARMDECK_GITHUB_PAT` do ambiente, com fallback para a linha correspondente do `.env` da raiz, e emite `cargo:rustc-env` mais `cargo:rerun-if-changed=../.env`.
**Where**: `src-tauri/build.rs`
**Depends on**: T2
**Reuses**: NONE — o arquivo hoje só chama `tauri_build::build()`
**Requirement**: CFG-01, CFG-03, CFG-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `// SPEC: github-integration (CFG-01, CFG-03, CFG-06)` no topo
- [ ] `cargo build` conclui sem `.env` presente
- [ ] `cargo build` conclui com `.env` presente e a constante chega ao binário
- [ ] `cargo:rerun-if-changed=../.env` e `cargo:rerun-if-env-changed=SWARMDECK_GITHUB_PAT` emitidos
- [ ] Nenhum `panic!` ou `expect` no caminho de ausência

**Tests**: none
**Gate**: build

**Commit**: `feat(build): injetar SWARMDECK_GITHUB_PAT em tempo de compilação`

---

### T4: Módulo de acesso ao GitHub

**What**: Criar `github.rs` com `OWNER`, `REPO`, `REPO_ID`, o newtype `Pat` com `Debug` redigido e sem `Serialize`, `pat()` via `option_env!` e `client()` com o User-Agent do app.
**Where**: `src-tauri/src/github.rs`
**Depends on**: T3
**Reuses**: padrão de `src-tauri/src/quota.rs:137` (`AccessToken`) e `quota.rs:367` (`real_http`)
**Requirement**: CFG-01, CFG-04, CFG-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `// SPEC: github-integration (CFG-01, CFG-04, CFG-05)` no topo
- [ ] `Pat` não implementa nem deriva `Serialize`
- [ ] Teste: `format!("{:?}", pat)` não contém o valor do token
- [ ] Teste: `pat()` devolve `None` quando a variável não foi injetada
- [ ] Módulo declarado em `src-tauri/src/lib.rs`
- [ ] Gate: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Contagem de testes sobe, nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(github): módulo de acesso com PAT redigido`

---

### T5: Passar o segredo ao workflow de release

**What**: Exportar `SWARMDECK_GITHUB_PAT` a partir de `secrets` no `env` dos jobs que compilam o app.
**Where**: `.github/workflows/release.yml`
**Depends on**: T4
**Reuses**: bloco `env` já usado por `TAURI_SIGNING_PRIVATE_KEY`
**Requirement**: CFG-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Variável presente nos jobs `build` (windows e ubuntu)
- [ ] Valor vem de `secrets`, nunca literal
- [ ] Sem marcador `SPEC:` — arquivo de infraestrutura

**Tests**: none
**Gate**: build

**Commit**: `ci(release): passar SWARMDECK_GITHUB_PAT aos jobs de build`

---

### T6: Apontar o endpoint do updater para a API

**What**: Trocar `plugins.updater.endpoints[0]` para `https://api.github.com/repos/rafaelsene01/swarmdeck/releases/latest`.
**Where**: `src-tauri/tauri.conf.json`
**Depends on**: T4
**Reuses**: `check::endpoint()` (`src-tauri/src/update/check.rs:178`) continua lendo essa chave sem alteração
**Requirement**: CFG-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `endpoints[0]` é a URL da API
- [ ] `pubkey` e `windows.installMode` inalterados
- [ ] Sem marcador `SPEC:` — a regra isenta `tauri.conf.json`; a rastreabilidade fica na tabela da spec

**Tests**: none
**Gate**: build

**Commit**: `feat(update): apontar o endpoint do manifesto para a API do GitHub`

---

### T7: Erro de autenticação distinto

**What**: Adicionar a variante `Auth` a `UpdateError`, com mensagem nomeando o token de acesso.
**Where**: `src-tauri/src/update/mod.rs`
**Depends on**: T4
**Reuses**: enum `UpdateError` existente
**Requirement**: CFG-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `SPEC:` do arquivo atualizado com `github-integration (CFG-12)`
- [ ] A mensagem não contém o valor do token
- [ ] Teste: a variante serializa para uma string distinta da de rede
- [ ] Gate: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Contagem de testes sobe, nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(update): erro de autenticação distinto de falha de rede`

---

### T8: Consulta autenticada do manifesto com resolução de asset

**What**: `fetch()` passa a buscar a release pela API, localizar o asset `latest.json`, baixá-lo com `Accept: application/octet-stream` e trocar a URL de cada entrada de plataforma pela URL de API do asset de mesmo nome.
**Where**: `src-tauri/src/update/manifest.rs`
**Depends on**: T6, T7
**Reuses**: `parse_manifest` (inalterada), `github::client()`, `FETCH_TIMEOUT`
**Requirement**: CFG-07, CFG-08, CFG-09, CFG-10, CFG-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `SPEC:` do arquivo atualizado
- [ ] `resolve_asset_urls` é pura e recebe manifesto e lista de assets
- [ ] Teste: entrada casa pelo último segmento do path e recebe a URL de API
- [ ] Teste: entrada cujo arquivo não está na release é removida (CFG-10)
- [ ] Teste: 401 e 403 viram `UpdateError::Auth`, não `Network`
- [ ] Teste: falha de rede continua virando `UpdateError::Network`
- [ ] `parse_manifest` não mudou de assinatura nem de comportamento
- [ ] Gate: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Contagem de testes sobe, nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(update): consultar o manifesto autenticado e resolver assets pela API`

---

### T9: Download autenticado do artefato

**What**: `fetch_bytes` envia `Authorization` e `Accept: application/octet-stream`, mantendo a política padrão de redirecionamento do `reqwest`.
**Where**: `src-tauri/src/update/apply.rs`
**Depends on**: T8
**Reuses**: `github::client()`; o laço de `chunk()` e os eventos de progresso ficam como estão
**Requirement**: CFG-11, CFG-13

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `SPEC:` do arquivo atualizado
- [ ] A política de redirecionamento não é sobrescrita (o `reqwest` remove `Authorization` cross-host sozinho)
- [ ] `swap::verify_signature` continua sendo chamada antes de qualquer escrita
- [ ] Teste: a requisição carrega os dois headers
- [ ] Teste: os eventos `update://download-progress` continuam sendo emitidos
- [ ] Gate: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Contagem de testes sobe, nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(update): baixar o artefato autenticado`

---

### T10: Recusar download fora do Windows

**What**: O ramo `#[cfg(not(windows))]` de `download` devolve erro nomeando a limitação, em vez de delegar ao `tauri-plugin-updater`.
**Where**: `src-tauri/src/update/apply.rs`
**Depends on**: T9
**Reuses**: o estado `error` que `UpdateSettings.tsx` já sabe exibir
**Requirement**: CFG-14

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A consulta de versão e as notas continuam funcionando fora do Windows
- [ ] Teste: o ramo devolve `Err` com a mensagem da limitação
- [ ] Teste: nenhum byte é baixado nesse caminho
- [ ] Gate: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Contagem de testes sobe, nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(update): informar que a atualização automática é só Windows`

---

### T11: Montagem de título e corpo da issue

**What**: Funções puras que compõem `[<CATEGORIA>] - <título>` e o corpo com descrição, imagens na ordem, linha de falha de anexo, rodapé de diagnóstico e truncamento em 65536.
**Where**: `src-tauri/src/feedback.rs`
**Depends on**: T4
**Reuses**: `env!("CARGO_PKG_VERSION")`, `std::env::consts::OS`
**Requirement**: CFG-16, CFG-17, CFG-18, CFG-19, CFG-28, CFG-32, CFG-34

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `// SPEC: github-integration (...)` no topo
- [ ] Teste: cada uma das quatro categorias produz sua tag em maiúsculas
- [ ] Teste: corpo sem imagem termina na descrição mais o rodapé, sem seção de anexos
- [ ] Teste: duas imagens saem na ordem em que entraram
- [ ] Teste: anexo que falhou vira uma linha nomeando o arquivo, e a issue segue sendo montada
- [ ] Teste: corpo acima de 65536 corta a descrição, preserva as imagens e marca o corte
- [ ] Gate: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Contagem de testes sobe, nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): montar título e corpo da issue`

---

### T12: Upload de anexo e criação da issue

**What**: `upload_asset` para `uploads.github.com/user-attachments/assets` e `create_issue` para `POST /repos/{owner}/{repo}/issues`, com o transporte injetável para teste.
**Where**: `src-tauri/src/feedback.rs`
**Depends on**: T11
**Reuses**: `github::client()`; padrão de transporte injetável de `quota.rs::real_http`
**Requirement**: CFG-15, CFG-18, CFG-19, CFG-21, CFG-31

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Query carrega `name`, `content_type` e `repository_id`; os bytes vão no corpo
- [ ] Teste: upload 201 devolve a URL e ela entra no corpo como `![nome](url)`
- [ ] Teste: upload falhando não impede a criação da issue (CFG-19)
- [ ] Teste: `POST /issues` falhando devolve `Err` com o motivo
- [ ] Teste: 429, e 403 com limite esgotado, viram mensagem de limite (CFG-31)
- [ ] Nenhuma mensagem de erro contém o valor do token
- [ ] Gate: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Contagem de testes sobe, nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): subir anexos e criar a issue no GitHub`

---

### T13: Comando `feedback_submit`

**What**: Comando Tauri assíncrono recebendo categoria, título, descrição e imagens, devolvendo o `html_url` da issue.
**Where**: `src-tauri/src/commands/feedback.rs`
**Depends on**: T12
**Reuses**: forma de `src-tauri/src/commands/update.rs`; contrato de bytes de `commands/screenshot.rs`
**Requirement**: CFG-15, CFG-24, CFG-30

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `SPEC:` no topo
- [ ] `FeedbackImage` deserializa `name`, `mime` e `bytes`
- [ ] Teste: PAT ausente devolve o erro de "não configurado" (CFG-30)
- [ ] Teste: retorno de sucesso é o `html_url` e nada mais
- [ ] Nenhum campo do retorno carrega o token
- [ ] Gate: `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Contagem de testes sobe, nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): comando feedback_submit`

---

### T14: Registrar o comando

**What**: Declarar o módulo e acrescentar `feedback_submit` ao `generate_handler!`.
**Where**: `src-tauri/src/lib.rs`
**Depends on**: T13
**Reuses**: a lista de 40 comandos já registrada
**Requirement**: CFG-15

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `SPEC:` imediatamente acima do bloco alterado, não no topo (exceção do item 3 da regra, como já é feito em `Cargo.toml`)
- [ ] `grep -rn "SPEC:" src-tauri/src` continua achando o arquivo
- [ ] Gate: `npm run build && cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: none
**Gate**: build

**Commit**: `feat(feedback): registrar feedback_submit no handler`

---

### T15: Prefixo de categoria no campo de título

**What**: Adorno estático com `[<CATEGORIA>] - ` dentro da moldura do campo, e teto do contador ajustado para `255` menos o prefixo.
**Where**: `src/routes/settings/FeedbackPanel.tsx`
**Depends on**: T14
**Reuses**: `FEEDBACK_CATEGORIES` (`FeedbackPanel.tsx:9`), o contador existente
**Requirement**: CFG-25, CFG-26, CFG-27, CFG-28

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Marcador `SPEC:` do arquivo lista `feedback-form` e `github-integration`
- [ ] O prefixo não é editável nem apagável pelo teclado
- [ ] `maxLength` do input acompanha o teto ajustado
- [ ] O rótulo continua associado ao controle e o campo continua marcado como obrigatório
- [ ] Gate: `npm test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): prefixo da categoria no campo de título`

---

### T16: Envio real do formulário

**What**: Trocar o aviso de "não implementado" pela chamada a `feedback_submit`, com estados de enviando, sucesso com link e erro que preserva o conteúdo.
**Where**: `src/routes/settings/FeedbackPanel.tsx`
**Depends on**: T14, T15
**Reuses**: contrato de bytes de `ScreenshotModal.tsx:48`; o `role="status"` já montado
**Requirement**: CFG-20, CFG-21, CFG-22, CFG-23, CFG-24, CFG-30

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `NOT_IMPLEMENTED` removido junto com o `onClick` que o usava
- [ ] Envio em andamento desabilita "Enviar feedback" e "Limpar" e barra o segundo clique
- [ ] Erro preserva texto, categoria e anexos
- [ ] Sucesso mostra o link da issue e limpa o formulário, revogando os object URLs
- [ ] PAT ausente desabilita o envio com aviso próprio
- [ ] Gate: `npm test`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): enviar o formulário como issue do GitHub`

---

### T17: Reescrever a suíte do painel

**What**: Inverter o teste de FEED-12 e cobrir prefixo, teto do contador, payload do `invoke` e os estados de envio.
**Where**: `src/routes/settings/FeedbackPanel.test.tsx`
**Depends on**: T16
**Reuses**: os mocks de `URL.createObjectURL` e o spy de `invoke` já montados no arquivo
**Requirement**: CFG-20, CFG-21, CFG-22, CFG-23, CFG-25, CFG-26, CFG-27, CFG-30

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] O teste de "nenhum invoke, nenhum fetch" vira "invoke chamado com o payload esperado"
- [ ] Teste: prefixo muda com a categoria e o texto digitado permanece
- [ ] Teste: contador e `maxLength` acompanham o prefixo
- [ ] Teste: payload leva nome, mime e bytes por imagem, na ordem
- [ ] Teste: erro do comando preserva o formulário; sucesso limpa e mostra o link
- [ ] Nenhum teste das outras ACs do `feedback-form` removido
- [ ] Gate: `npm test`

**Tests**: unit
**Gate**: quick

**Commit**: `test(feedback): cobrir prefixo do título e envio da issue`

---

### T18: Revogar FEED-12 na spec antiga

**What**: Marcar FEED-12 como revogado nomeando AD-047, anotar que AD-031 fica superada e atualizar a tabela de rastreabilidade do `feedback-form`.
**Where**: `.specs/features/feedback-form/spec.md`
**Depends on**: T17
**Reuses**: o formato de revogação de `silent-update/spec.md:326` (SILENT-36)
**Requirement**: CFG-15

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] FEED-12 marcado revogado, com a AD nomeada — texto original preservado
- [ ] AD-031 anotada como superada
- [ ] Tabela de rastreabilidade reflete o estado novo
- [ ] Nenhum outro requisito FEED alterado

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): revogar FEED-12 em favor do envio real`

---

### T19: Registrar as decisões

**What**: Acrescentar AD-046, AD-047 e AD-048 com os trade-offs, e anotar em `silent-update/spec.md` a restrição de SILENT-08 a repositório público.
**Where**: `.specs/project/STATE.md`
**Depends on**: T18
**Reuses**: o formato das ADs já registradas no arquivo
**Requirement**: CFG-14

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] AD-046 registra o PAT como constante de build e o trade-off de extração por `strings`
- [ ] AD-047 registra o endpoint não documentado e o dissenso sobre sua estabilidade
- [ ] AD-048 registra a resolução por API e a regressão em Linux e macOS
- [ ] SILENT-08 anotada como restrita a repositório público
- [ ] Gate: `npm run build && cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): registrar AD-046, AD-047 e AD-048`
