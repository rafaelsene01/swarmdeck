# Projects Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and
follow its Execute flow and Critical Rules.** Do not search for skill files by
filesystem path.

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**AD-013 override (active project decision):** agents never run `git commit` in
this repository. The Critical Rule "one atomic commit per task" is **suspended**.
Each task still marks itself complete in this file and updates the spec's
traceability table when done — the user commits.

---

**Spec**: `.specs/features/projects/spec.md`
**Design**: `.specs/features/projects/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase sampling and spec. Guidelines found: **none** — no `AGENTS.md`
> (`CLAUDE.md` references one that does not exist on disk), no `CONTRIBUTING.md`, no coverage
> threshold in `vite.config.ts` or `package.json`. Strong defaults applied, floored by the
> repo's observed practice: every React component under `src/` has a co-located `*.test.tsx`
> (31 files), and every Rust domain module carries both a `#[cfg(test)] mod tests` and an
> integration file under `src-tauri/tests/`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Rust domain service (`src-tauri/src/projects/**`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `#[cfg(test)] mod tests` in the same file | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Rust terminal manager (`src-tauri/src/terminal/**`) | integration | Every changed method: happy path + each error variant it can return | `src-tauri/tests/manager.rs` | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Rust Tauri commands (`src-tauri/src/commands/**`) | integration | Every command added or changed: happy path + each error variant it can return | `src-tauri/tests/projects.rs`, `src-tauri/tests/manager.rs` | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Rust app lifecycle wiring (`src-tauri/src/lib.rs`) | none | — (build gate only; the testable core is `touch_from_cwds`, covered by T1) | — | build gate only |
| Pure TS helpers (`src/lib/**`, `src/state/**`) | unit | Every boundary of every branch | `src/**/*.test.ts` | `npm test` |
| React presentational components (`src/components/**`, `src/routes/**`) | unit | Every AC the component owns + every listed edge case | `src/**/*.test.tsx` | `npm test` |
| App shell wiring (`src/App.tsx`) | unit (RTL) | Happy path + every state-integrity AC (draft never persisted, draft close never kills) | `src/App.test.tsx` | `npm test` |
| File deletion (no new code) | none | — (build gate only) | — | build gate only |
| Spec artifacts / `SPEC:` markers | none | — (build gate only) | — | build gate only |

## Gate Check Commands

> Generated from `package.json` scripts and `src-tauri/Cargo.toml`.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks touching only frontend TS/TSX | `npm test` |
| Rust | After tasks touching only `src-tauri/` | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Build | After phase completion, wiring-only tasks, deletions, and spec tasks | `npm run build && npm test && cargo test --manifest-path src-tauri/Cargo.toml` |

---

## Execution Plan

Fases correm em sequência; dentro de cada fase as tasks correm na ordem numérica.

### Phase 1: Domínio Rust

```
T1
T2
T3
T4
```

### Phase 2: Comandos e ganchos

```
T5 → T10
T6 → T10
T7 → T10
```

### Phase 3: Peças puras do frontend

```
T11 → T13
T12 → T15
T13 → T15
T14 → T15
```

### Phase 4: Integração no shell

```
T16 → T18
T17 → T18
T18 → T19
T18 → T20
T19 → T21
```

### Phase 5: Configurações

```
T22 → T23
```

### Phase 6: Rastreabilidade

```
T24
```

---

## Task Breakdown

### Phase 1: Domínio Rust

#### T1: Escrever `last_used`, por id e por `cwd`

**What**: `touch_last_used(conn, id)` grava o instante atual em `projects.last_used`; `touch_from_cwds(conn, cwds)` resolve cada `cwd` contra `list_all` e toca cada projeto casado uma única vez.
**Where**: `src-tauri/src/projects/service.rs`
**Depends on**: None
**Reuses**: `get`, `require_existing_dir` (`service.rs:345`), `list_all` (`service.rs:227`), `resolve::resolve` (`resolve.rs:41`), padrão de `update` (`service.rs:262`)
**Requirement**: PROJ-14, PROJ-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `touch_last_used` grava um epoch em milissegundos e devolve o `Project` atualizado
- [x] Id inexistente devolve `ProjectError::NotFound`
- [x] `path` ausente no disco devolve `ProjectError::PathNotFound` sem gravar nada (P1 AC15)
- [x] Chamar duas vezes gera dois valores, o segundo maior ou igual ao primeiro
- [x] `touch_from_cwds` toca por `cwd` exato e por `cwd` em subpasta (P1 AC10, AC16, AC17)
- [x] `touch_from_cwds` com dois `cwd` do mesmo projeto executa um `UPDATE` só e devolve `1` (edge case do encerramento)
- [x] `touch_from_cwds` com `cwd` que não casa com projeto nenhum devolve `0` e não falha (edge case)
- [x] `touch_from_cwds` com o caminho da sandbox devolve `0` (P2 AC3)
- [x] `touch_from_cwds` com lista vazia devolve `0` sem consultar o banco
- [x] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: unit
**Gate**: Rust

---

#### T2: Cor deixa de ser exclusiva

**What**: remover de `validate_explicit_color` a rejeição de cor já usada por outro projeto, mantendo a checagem de pertencer à `PALETTE`; apagar a variante de erro `ColorAlreadyUsed` e o teste que a exigia.
**Where**: `src-tauri/src/projects/service.rs`
**Depends on**: None
**Reuses**: `PALETTE` (`service.rs:29`)
**Requirement**: PROJ-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Criar nove projetos escolhendo cores explícitas repetidas passa, sem erro (P2 AC12)
- [x] Cor fora da paleta continua devolvendo `ColorNotInPalette`
- [x] `ColorAlreadyUsed` não existe mais em nenhum ponto do crate
- [x] `pick_least_used_color` segue inalterado e continua preferindo a menos usada
- [x] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: unit
**Gate**: Rust

---

#### T3: Não deixar pasta órfã quando `git init` falha

**What**: em `create_with_options`, remover a subpasta recém-criada antes de propagar erro de `run_git_init` ou de `INSERT`.
**Where**: `src-tauri/src/projects/service.rs`
**Depends on**: None
**Reuses**: `run_git_init` (`service.rs:435`), `fs::remove_dir_all`
**Requirement**: PROJ-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `git init` com saída não-zero remove a subpasta e propaga `GitInitFailed` (P2 AC11)
- [x] `git` ausente do PATH remove a subpasta e propaga `Io`
- [x] Depois da falha, repetir a criação com o mesmo nome funciona (não trava em `AlreadyExists`)
- [x] Criação bem-sucedida não remove nada
- [x] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

> Os dois primeiros itens são cobertos por composição, não por um teste ponta a ponta:
> `create_with_options` trata todo `Err` do bloco pós-`create_dir` no mesmo `match`
> (`service.rs`), então a origem do erro não muda a remoção. A remoção mais a propagação
> são provadas por `falha_depois_de_criar_a_pasta_remove_a_pasta_e_propaga_o_erro`, que
> roda com `git_init: true` e exige remoção recursiva com `.git` dentro. O mapeamento de
> cada falha de `git` é provado direto em `run_git_init`:
> `git_init_falho_devolve_erro_git_init_failed_como_antes` (saída não-zero, sabotando
> `.git` como arquivo) e `git_init_que_nao_consegue_rodar_vira_io` (spawn falha no nível
> do SO, mesmo caminho de `git` fora do `PATH`). Forçar a falha *dentro* de
> `create_with_options` exigiria trocar o `PATH` do processo — global, e deixaria os
> testes paralelos do binário de lib instáveis — ou injetar um ponto de falha só para
> teste, o que não acrescentaria linha coberta nenhuma.

**Tests**: unit
**Gate**: Rust

---

#### T4: `kill` devolve o `cwd` da sessão encerrada

**What**: mudar `TerminalManager::kill` para devolver o `PathBuf` da `Entry` removida, em vez de `()`.
**Where**: `src-tauri/src/terminal/manager.rs`
**Depends on**: None
**Reuses**: a `Entry` já removida do mapa em `manager.rs:183-187`, que carrega o `cwd`
**Requirement**: PROJ-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `kill` devolve `Ok(cwd)` com o diretório que a sessão usava
- [x] Id desconhecido continua devolvendo `ManagerError::UnknownId`
- [x] Matar duas vezes o mesmo id continua falhando na segunda
- [x] O único chamador existente (`commands::terminal::pty_kill`) e `src-tauri/tests/manager.rs` compilam com a assinatura nova
- [x] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: integration
**Gate**: Rust

---

### Phase 2: Comandos e ganchos

#### T5: Comandos `project_touch` e `project_touch_cwds`

**What**: dois comandos Tauri, invólucros finos sobre `touch_last_used` e `touch_from_cwds`.
**Where**: `src-tauri/src/commands/projects.rs`
**Depends on**: T1
**Reuses**: `service::touch_last_used` e `service::touch_from_cwds` (T1), o padrão de invólucro fino de `project_update` (`commands/projects.rs:33`)
**Requirement**: PROJ-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `project_touch(id)` grava `last_used` e devolve o `Project` (P1 AC9)
- [x] `project_touch(id)` com id inexistente devolve a mensagem de `NotFound`
- [x] `project_touch_cwds` toca os projetos casados e devolve a contagem (P1 AC10)
- [x] `project_touch_cwds` com lista sem nenhum casamento devolve `0` e não falha
- [x] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: integration
**Gate**: Rust

---

#### T6: Comando `project_create_in`

**What**: comando Tauri que expõe `create_with_options(name, base_dir, color, git_init)`, traduzindo cada variante de `ProjectError` para uma `String` legível.
**Where**: `src-tauri/src/commands/projects.rs`
**Depends on**: T2, T3
**Reuses**: `service::create_with_options` (`service.rs:180`), o `map_err(|e| e.to_string())` já usado nos quatro comandos vizinhos
**Requirement**: PROJ-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cria a subpasta dentro do diretório-base e registra o `path` dela (P2 AC7)
- [x] `git_init: true` deixa `.git` na subpasta (P2 AC8)
- [x] Nome em branco devolve a mensagem de `NameRequired` sem criar pasta (P2 AC9)
- [x] Subpasta já registrada devolve a mensagem de `PathAlreadyUsed` nomeando o projeto existente (P2 AC10)
- [x] Diretório-base inexistente devolve a mensagem de `PathNotFound` com o caminho (edge case)
- [x] `project_create` de 3 argumentos segue existindo e inalterado (é o Import de PROJ-17)
- [x] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: integration
**Gate**: Rust

---

#### T7: Comando `project_sandbox_dir`

**What**: comando Tauri que devolve o caminho da pasta-sandbox, criando-a se ainda não existir.
**Where**: `src-tauri/src/commands/projects.rs`
**Depends on**: None
**Reuses**: `sandbox::sandbox_dir` (`projects/sandbox.rs`), inteiro e sem alteração
**Requirement**: PROJ-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Devolve um caminho existente no disco (P2 AC1)
- [x] Duas chamadas devolvem o mesmo caminho e não falham (idempotente)
- [x] Depois de chamar, `project_list` continua sem a sandbox (P2 AC2)
- [x] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: integration
**Gate**: Rust

---

#### T8: Fechar terminal escreve `last_used`

**What**: `pty_kill` passa a receber o estado do banco, usar o `cwd` que `manager.kill` devolve e chamar `touch_from_cwds` com ele, descartando o erro.
**Where**: `src-tauri/src/commands/terminal.rs`
**Depends on**: T1, T4
**Reuses**: `service::touch_from_cwds` (T1), o `cwd` devolvido por `manager.kill` (T4), o padrão `State<'_, Mutex<Db>>` já usado em `commands/projects.rs:18`
**Requirement**: PROJ-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Encerrar um terminal cujo `cwd` é o de um projeto grava `last_used` daquele projeto (P1 AC16)
- [x] Encerrar um terminal cujo `cwd` é subpasta de um projeto grava `last_used` daquele projeto
- [x] Encerrar um terminal na pasta-sandbox não grava nada (edge case)
- [x] Encerrar um terminal cujo `cwd` não casa com projeto nenhum não grava nada e devolve `Ok` (edge case)
- [x] Falha de banco na gravação não impede o `pty_kill` de devolver `Ok`
- [x] Id desconhecido continua devolvendo erro, sem gravar nada
- [x] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: integration
**Gate**: Rust

---

#### T9: Gancho de encerramento do app

**What**: trocar o encerramento do builder para `build(...)?.run(closure)` e, em `RunEvent::Exit`, tocar `last_used` dos projetos com sessão viva.
**Where**: `src-tauri/src/lib.rs`
**Depends on**: T1
**Reuses**: `TerminalManager::list()` (`manager.rs:196`) para os `cwd` vivos, `service::touch_from_cwds` (T1), o padrão de `on_window_event` de `windows/kanban.rs:74` caso o recuo seja necessário
**Requirement**: PROJ-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Em `RunEvent::Exit`, os `cwd` de `manager.list()` são passados a `touch_from_cwds` (P1 AC17)
- [x] O `Result` é descartado com `let _ =`: falha de gravação não impede a saída nem imprime erro ao usuário (P1 AC19)
- [x] `TerminalManager::shutdown()` **não** é chamado — a saída continua deixando os PTYs para o teardown do SO (Out of Scope)
- [x] Se `RunEvent::Exit` não expuser o estado gerenciado, o recuo documentado em `design.md` (`WindowEvent::Destroyed` na janela principal) é usado e o desvio é registrado no relatório da task
- [x] Verificação manual registrada: abrir um terminal num projeto, fechar o app, reabrir e confirmar que o projeto aparece no topo com idade `agora`
- [x] Gate check passes: `npm run build && npm test && cargo test --manifest-path src-tauri/Cargo.toml`

> `RunEvent::Exit` expõe o estado gerenciado normalmente (`handle.state::<...>()`),
> então o recuo `WindowEvent::Destroyed` **não** foi necessário — sem desvio.
> `.build(ctx)?` virou `.build(ctx).expect(...)` porque `run()` devolve `()` e o
> `?` não teria para onde propagar, exatamente o risco previsto em `design.md`.
>
> Verificação manual **executada em 22/08/2026**, depois que a Phase 3
> (`ProjectStep`, `formatAge`) entregou a lista com idade. Roteiro: abrir um
> terminal num projeto, fechar o app, reabrir. Resultado confirmado pelo
> usuário: o projeto aparece no topo da lista com idade `agora`. O gancho em
> si compila e roda no gate de Build; o núcleo que ele chama
> (`touch_from_cwds`) é coberto por T1, e a formatação da idade por
> `src/lib/relativeTime.test.ts`.

**Tests**: none
**Gate**: Build

---

#### T10: Registrar os comandos novos

**What**: acrescentar `project_touch`, `project_touch_cwds`, `project_create_in` e `project_sandbox_dir` ao `invoke_handler`.
**Where**: `src-tauri/src/lib.rs`
**Depends on**: T5, T6, T7
**Reuses**: o bloco `commands::projects::*` já existente (`lib.rs:127-130`)
**Requirement**: PROJ-14, PROJ-16, PROJ-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os quatro comandos aparecem no `invoke_handler`
- [x] Gate check passes: `npm run build && npm test && cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: none
**Gate**: Build

---

### Phase 3: Peças puras do frontend

#### T11: Formatar a idade do último uso

**What**: função pura `formatAge(lastUsed, now)` devolvendo `agora` / `Nmin` / `Nh` / `Nd` / `Nsem` / `Nmes` / `Na` / `nunca`.
**Where**: `src/lib/relativeTime.ts`
**Depends on**: None
**Reuses**: nada — `Intl.RelativeTimeFormat` produz "há 1 hora", não o formato compacto do mockup
**Requirement**: PROJ-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `null` devolve `nunca` (P1 AC11, AD-004)
- [x] Cada uma das sete faixas tem teste no limite inferior e no limite superior
- [x] Um instante no futuro (relógio adiantado) devolve `agora` em vez de número negativo
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T12: Formulário de projeto (criar e editar)

**What**: componente apresentacional com modo `create` (nome, diretório-base, 8 cores, checkbox git) e modo `edit` (nome e cor apenas), exibindo erro do backend sem fechar.
**Where**: `src/components/project/ProjectFormModal.tsx`
**Depends on**: None
**Reuses**: `.app-dialog-backdrop` (`App.tsx:973`), o padrão `open({ directory: true })` de `NewTerminalDialog.tsx:57`, o bloco `<style>` próprio como nos 14 componentes existentes
**Requirement**: PROJ-18, PROJ-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Modo `create` renderiza os quatro campos (P2 AC6)
- [x] Modo `edit` renderiza nome e cor e **não** renderiza campo de caminho nem checkbox de git (P3 AC4)
- [x] Confirmar com nome em branco não dispara `onSubmit` (P2 AC9, P3 AC6)
- [x] A prop `error` aparece na tela e o formulário continua aberto
- [x] Cancelar o seletor de diretório deixa o campo como estava
- [x] Teste compara a lista de 8 cores com a `PALETTE` de `src-tauri/src/projects/service.rs:29`, falhando se divergirem
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T13: Etapa "PROJECT" do wizard

**What**: componente apresentacional com busca, contador "N / M projects", lista de projetos (cor + inicial, nome, caminho truncado, idade) e rodapé New / Import / No Project / fechar.
**Where**: `src/components/terminal/ProjectStep.tsx`
**Depends on**: T11
**Reuses**: `sortByLastUsed`, `filterProjects`, `truncatePath` (`ProjectsPanel.tsx:36,46,26`), `formatAge` (T11)
**Requirement**: PROJ-10, PROJ-16, PROJ-17, PROJ-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Lista ordenada do mais recente para o mais antigo, nunca-abertos por último (P1 AC2)
- [x] Contador mostra "N / M projects" com N pós-filtro e M total (P1 AC3)
- [x] Busca filtra por nome e por caminho, sem diferenciar caixa (P1 AC4)
- [x] Lista vazia mostra "0 / 0 projects" com os três botões de rodapé ativos (edge case)
- [x] Caminho longo aparece truncado com o caminho completo em `title` (edge case)
- [x] Clicar numa linha chama `onSelect` com aquele projeto; cada botão do rodapé chama seu próprio callback
- [x] A prop `error` aparece acima da lista
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T14: Etapa "AGENT" do wizard

**What**: componente apresentacional com o cartão do projeto escolhido, botão "Voltar", grade dos agentes do catálogo e botão "Nova sessão".
**Where**: `src/components/terminal/AgentStep.tsx`
**Depends on**: None
**Reuses**: `ProviderIcon` / `providerMeta` (`src/components/shell/ProviderIcon.tsx:28,64`, que já cobre os 5 ids do catálogo), a leitura `installedIds.has(id)` de `AgentPanel.tsx:41`
**Requirement**: PROJ-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os agentes aparecem na ordem recebida, com o padrão pré-selecionado (P1 AC7)
- [x] Agente não instalado fica desabilitado e não responde ao clique (P1 AC7)
- [x] "Voltar" chama `onBack` (P1 AC6)
- [x] Cartão mostra nome, caminho e cor do projeto (P1 AC5)
- [x] Com zero agentes instalados, "Nova sessão" continua habilitada (edge case)
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T15: Compor o wizard

**What**: componente que guarda passo, busca e seleção, chama `project_list` / `project_create` / `project_create_in` / `project_sandbox_dir`, e emite `onConfirm(cwd, agentId, projectId)`.
**Where**: `src/components/terminal/PaneWizard.tsx`
**Depends on**: T12, T13, T14
**Reuses**: `ProjectStep` (T13), `AgentStep` (T14), `ProjectFormModal` (T12); as mesmas props `agents`/`installedIds`/`defaultAgentId` que `NewTerminalDialog` recebia (`App.tsx:1160-1163`)
**Requirement**: PROJ-13, PROJ-16, PROJ-17, PROJ-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Selecionar projeto avança para a etapa "AGENT" (P1 AC5); "Voltar" retorna preservando a busca digitada (P1 AC6)
- [x] "Nova sessão" emite `onConfirm` com o caminho do projeto, o agente e o id do projeto (P1 AC8)
- [x] "No Project" avança com o caminho de `project_sandbox_dir` e `projectId` nulo (P2 AC1)
- [x] "Import Project" com pasta nova chama `project_create` com o nome da última pasta e avança (P2 AC4)
- [x] "Import Project" com pasta já registrada seleciona o projeto existente e avança (P2 AC5)
- [x] "New Project" abre o formulário; confirmar chama `project_create_in` e avança com o projeto criado (P2 AC7)
- [x] Erro de qualquer um dos comandos mantém a etapa "PROJECT" e é exibido (P1 AC15, P2 AC10, P2 AC11)
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

### Phase 4: Integração no shell

#### T16: Estado de rascunho no terminal

**What**: campo `draft?: boolean` em `TerminalState` e exclusão dos rascunhos em `toLayoutEntries`.
**Where**: `src/state/terminals.ts`
**Depends on**: None
**Reuses**: `toLayoutEntries` (`terminals.ts:123`), o padrão do campo não-persistido `resumeSession` (`terminals.ts:33`)
**Requirement**: PROJ-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `toLayoutEntries` não devolve entrada para terminal com `draft: true` (P1 AC12)
- [x] Os `slot` das entradas restantes ficam contíguos, sem buraco onde o rascunho estava
- [x] `close`, `maximize`, `minimize` e `moveTerminal` seguem funcionando com um rascunho na lista
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T17: Cabeçalho do painel em modo rascunho

**What**: prop que reduz as ações do cabeçalho enquanto o painel é rascunho — sem captura, sem clonar, sem reiniciar, sem minimizar; fechar continua.
**Where**: `src/components/terminal/TerminalHeader.tsx`
**Depends on**: None
**Reuses**: as props de ação já existentes do componente
**Requirement**: PROJ-11, PROJ-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Em modo rascunho, os botões de captura, clonar, reiniciar e minimizar não são renderizados (AD-016: minimizar um painel sem PTY não faz sentido)
- [x] O botão de fechar continua renderizado e chamando `onClose` (P1 AC13)
- [x] Fora do modo rascunho o cabeçalho fica idêntico ao de hoje
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T18: Gatilhos criam rascunho e o painel escolhe o que renderizar

**What**: substituir `dialogOpen`/`NewTerminalDialog` por um `TerminalState` com `draft: true` nos três gatilhos, e trocar o corpo do painel por `terminal.draft ? <PaneWizard/> : <TerminalPane/>`.
**Where**: `src/App.tsx`
**Depends on**: T16, T17
**Reuses**: `defaultTerminal()` (`App.tsx:131`), `evenWidths` (`App.tsx:154`), o invólucro de painel e o `TerminalHeader` já irmãos (`App.tsx:738-776`)
**Requirement**: PROJ-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os três gatilhos (ícone do header, CTA do `EmptyState`, Ctrl+T) inserem um painel de rascunho e não chamam `pty_spawn` (P1 AC1)
- [x] O painel de rascunho renderiza `PaneWizard` e não monta `TerminalPane`
- [x] O rascunho conta no total que desabilita o gatilho em 4 painéis (P1 AC14)
- [x] Fechar o painel de rascunho remove-o sem chamar `pty_kill`, e portanto sem gravar `last_used` (P1 AC13, AC18)
- [x] Fechar a aba inteira com um rascunho dentro não chama `pty_kill` (edge case)
- [x] `dialogOpen` não existe mais em `App.tsx`
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T19: Confirmação do wizard vira terminal vivo

**What**: handler que recebe `(cwd, agentId)`, limpa o `draft` e grava o agente da sessão.

> **SPEC_DEVIATION (fix pass pós-Verifier, 19/08/2026)**: o `project_touch`
> saiu daqui e foi para a **seleção** do projeto no `PaneWizard`. Motivo: é o
> mesmo comando que valida a existência do caminho, e PROJ-13 AC15 exige que
> a pasta ausente seja descoberta **na etapa PROJECT** — tocar na confirmação
> descobria tarde, com o painel já virado terminal vivo. `design.md:254` já
> descrevia esse desenho; o diagrama de `:49` é que estava desatualizado, e
> foi corrigido. Consequência registrada em AD-020: selecionar e desistir
> grava `last_used` sem terminal aberto.
**Where**: `src/App.tsx`
**Depends on**: T18
**Reuses**: `handleCreate` (`App.tsx:664`) como ponto de partida, `agentByTerminalId` (`App.tsx:203`)
**Requirement**: PROJ-13, PROJ-14, PROJ-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Confirmar limpa `draft`, fixa o `cwd` e o agente, e `TerminalPane` monta com eles (P1 AC8)
- [x] Com projeto selecionado, `project_touch` é chamado uma vez com aquele id (P1 AC9) — hoje pelo `PaneWizard`, ver desvio acima; provado ponta a ponta em `src/App.test.tsx`
- [x] Com "No Project", `project_touch` não é chamado (P2 AC3)
- [x] O id de sessão do agente nasce novo, como em `defaultTerminal()` (SESS-10 preservado)
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T20: Rascunho fora da persistência e toque na restauração

**What**: filtrar `draft` antes de montar o payload de `terminal_workspace_set`, e chamar `project_touch_cwds` com os `cwd` restaurados ao fim de `applyWorkspace`.
**Where**: `src/App.tsx`
**Depends on**: T18
**Reuses**: o efeito de salvamento com debounce (`App.tsx:410-432`), `applyWorkspace` (`App.tsx:313`), `toLayoutEntries` já filtrado em T16
**Requirement**: PROJ-12, PROJ-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Abrir o wizard e deixá-lo aberto não põe nenhum terminal no payload de `terminal_workspace_set` (P1 AC12)
- [x] Uma aba que contém só um rascunho é persistida vazia, não some
- [x] Restaurar terminais chama `project_touch_cwds` uma vez com os `cwd` restaurados (P1 AC10)
- [x] "Start Fresh" não chama `project_touch_cwds`
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T21: Remover o diálogo antigo

**What**: apagar `NewTerminalDialog.tsx` e `NewTerminalDialog.test.tsx`, agora sem nenhum chamador.
**Where**: `src/components/terminal/NewTerminalDialog.tsx`
**Depends on**: T19
**Reuses**: nada — é remoção
**Requirement**: PROJ-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os dois arquivos não existem mais
- [x] `grep -rn "NewTerminalDialog" src/` não devolve nenhuma importação nem uso (comentários históricos podem ficar, desde que corrigidos)
- [x] `.app-dialog-backdrop` continua definida — `RestoreSessionDialog` a usa (`App.tsx:1125`)
- [x] Gate check passes: `npm run build && npm test && cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: none
**Gate**: Build

---

### Phase 5: Configurações

#### T22: Painel de Configurações ganha criar e editar

**What**: props `onCreate`/`onEdit`, botão de edição por linha, CTA do estado vazio ligado, e remoção da linha de contagem de tarefas.
**Where**: `src/routes/settings/ProjectsPanel.tsx`
**Depends on**: None
**Reuses**: `sortByLastUsed`, `filterProjects`, `truncatePath` do próprio arquivo; o ícone de lápis de `lucide-react`, já dependência
**Requirement**: PROJ-19, PROJ-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada linha mostra cor, nome e caminho truncado, e **não** mostra contagem de tarefas (P3 AC1, AD-004)
- [x] `taskCount` sai de `ProjectRow`
- [x] O botão de edição de uma linha chama `onEdit` com aquele projeto (P3 AC4)
- [x] "Criar projeto" chama `onCreate`, tanto na lista quanto no estado vazio (P3 AC2)
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

#### T23: Ligar o formulário em Configurações

**What**: estado do `ProjectFormModal` no shell de Configurações, chamadas `project_create_in` e `project_update`, e recarga da lista via `project_list`.
**Where**: `src/routes/settings/SettingsShell.tsx`
**Depends on**: T22
**Reuses**: `ProjectFormModal` (T12), o carregamento de `project_list` já existente (`SettingsShell.tsx:138-152`)
**Requirement**: PROJ-19, PROJ-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] "Criar projeto" abre o formulário em modo `create`; confirmar chama `project_create_in` (P3 AC2)
- [x] Editar abre em modo `edit` com nome e cor atuais; confirmar chama `project_update` com os dois campos e sem `path` (P3 AC4, AC5)
- [x] Criar e editar recarregam a lista a partir de `project_list` (P3 AC3, AC5)
- [x] Erro do backend aparece no formulário e ele não fecha
- [x] O mapeamento não passa mais `taskCount: 0` (`SettingsShell.tsx:149` removido)
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: Quick

---

### Phase 6: Rastreabilidade

#### T24: Marcadores, decisões e rastreabilidade

**What**: escrever/atualizar o marcador `SPEC:` no topo de cada arquivo tocado, registrar AD-019, AD-020 e AD-021 em `.specs/STATE.md`, marcar TERM-10 e TERM-11 como revogados na spec de `multi-terminal`, e fechar a tabela de rastreabilidade de `projects/spec.md`.
**Where**: `.specs/STATE.md`
**Depends on**: None
**Reuses**: o formato de decisão já usado por AD-001..AD-018 (`.specs/STATE.md:5-166`)
**Requirement**: PROJ-10, PROJ-11, PROJ-12, PROJ-13, PROJ-14, PROJ-15, PROJ-16, PROJ-17, PROJ-18, PROJ-19, PROJ-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Todo arquivo criado ou editado nas tasks T1–T23 tem marcador `SPEC:` no topo, em inglês, com o nome exato da pasta da feature e IDs reais
- [x] `grep -rn "SPEC:" src/ src-tauri/src/` encontra os arquivos novos
- [x] AD-019, AD-020 e AD-021 estão em `.specs/STATE.md` `## Decisions` com decisão, razão, trade-off e escopo; AD-020 registra o empate no encerramento como trade-off aceito pelo usuário
- [x] `.specs/features/multi-terminal/spec.md` registra TERM-10 e TERM-11 como revogados por AD-019, com o motivo — sem apagar o texto original
- [x] A rastreabilidade de `projects/spec.md` traz PROJ-10..PROJ-20 com status `Implementing`
- [x] Gate check passes: `npm run build && npm test && cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: none
**Gate**: Build

---

## Phase Execution Map

Fases correm em sequência: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6.
As setas abaixo são as dependências reais — a ordem de execução é simplesmente
T1, T2, ... T24.

```
Phase 1:
T1
T2
T3
T4

Phase 2:
T5 → T10
T6 → T10
T7 → T10

Phase 3:
T11 → T13
T12 → T15
T13 → T15
T14 → T15

Phase 4:
T16 → T18
T17 → T18
T18 → T19
T18 → T20
T19 → T21

Phase 5:
T22 → T23

Phase 6:
T24
```

Dependências entre fases apontam sempre para trás e são cobertas pela ordem das
fases, não por seta: T5→T1, T6→T2/T3, T8→T1/T4, T9→T1, T18→T15, T23→T12.

**Empacotamento sugerido** (24 tasks, orçamento ~7 por worker):

| Batch | Fases | Tasks |
| ----- | ----- | ----- |
| 1 | Phase 1 | T1–T4 (4) |
| 2 | Phase 2 | T5–T10 (6) |
| 3 | Phase 3 | T11–T15 (5) |
| 4 | Phase 4 | T16–T21 (6) |
| 5 | Phase 5 + Phase 6 | T22–T24 (3) |

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 2 funções coesas, mesmo arquivo, mesmo requisito | ⚠️ OK — `touch_from_cwds` é um laço em volta de `touch_last_used`; separá-las daria uma task que não compila sozinha |
| T2 | 1 função + remoção de 1 variante de erro | ✅ Granular |
| T3 | 1 função | ✅ Granular |
| T4 | 1 método | ✅ Granular |
| T5 | 2 comandos coesos, mesmo arquivo, mesmo requisito | ⚠️ OK — os dois são o mesmo write por dois caminhos |
| T6 | 1 comando | ✅ Granular |
| T7 | 1 comando | ✅ Granular |
| T8 | 1 comando | ✅ Granular |
| T9 | 1 gancho | ✅ Granular |
| T10 | 1 bloco de registro | ✅ Granular |
| T11 | 1 função | ✅ Granular |
| T12 | 1 componente | ✅ Granular |
| T13 | 1 componente | ✅ Granular |
| T14 | 1 componente | ✅ Granular |
| T15 | 1 componente | ✅ Granular |
| T16 | 1 campo + 1 função | ✅ Granular |
| T17 | 1 componente | ✅ Granular |
| T18 | 1 arquivo, 1 troca de render + 3 gatilhos que chamam o mesmo handler | ✅ Granular |
| T19 | 1 handler | ✅ Granular |
| T20 | 1 efeito + 1 chamada | ✅ Granular |
| T21 | remoção de 1 componente | ✅ Granular |
| T22 | 1 componente | ✅ Granular |
| T23 | 1 arquivo de fiação | ✅ Granular |
| T24 | 1 varredura de rastreabilidade | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| ---- | ------------------ | --------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | None | — | ✅ Match |
| T3 | None | — | ✅ Match |
| T4 | None | — | ✅ Match |
| T5 | T1 (fase anterior) | — (entre fases) | ✅ Match |
| T6 | T2, T3 (fase anterior) | — (entre fases) | ✅ Match |
| T7 | None | — | ✅ Match |
| T8 | T1, T4 (fase anterior) | — (entre fases) | ✅ Match |
| T9 | T1 (fase anterior) | — (entre fases) | ✅ Match |
| T10 | T5, T6, T7 | T5 → T10, T6 → T10, T7 → T10 | ✅ Match |
| T11 | None | — | ✅ Match |
| T12 | None | — | ✅ Match |
| T13 | T11 | T11 → T13 | ✅ Match |
| T14 | None | — | ✅ Match |
| T15 | T12, T13, T14 | T12 → T15, T13 → T15, T14 → T15 | ✅ Match |
| T16 | None | — | ✅ Match |
| T17 | None | — | ✅ Match |
| T18 | T16, T17 | T16 → T18, T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T18 | T18 → T20 | ✅ Match |
| T21 | T19 | T19 → T21 | ✅ Match |
| T22 | None | — | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | None | — | ✅ Match |

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| ---- | ------------------------ | ------------ | -------- | ------ |
| T1 | Rust domain service | unit | unit | ✅ OK |
| T2 | Rust domain service | unit | unit | ✅ OK |
| T3 | Rust domain service | unit | unit | ✅ OK |
| T4 | Rust terminal manager | integration | integration | ✅ OK |
| T5 | Rust Tauri commands | integration | integration | ✅ OK |
| T6 | Rust Tauri commands | integration | integration | ✅ OK |
| T7 | Rust Tauri commands | integration | integration | ✅ OK |
| T8 | Rust Tauri commands | integration | integration | ✅ OK |
| T9 | Rust app lifecycle wiring | none | none | ✅ OK |
| T10 | Rust app lifecycle wiring | none | none | ✅ OK |
| T11 | Pure TS helper | unit | unit | ✅ OK |
| T12 | React component | unit | unit | ✅ OK |
| T13 | React component | unit | unit | ✅ OK |
| T14 | React component | unit | unit | ✅ OK |
| T15 | React component | unit | unit | ✅ OK |
| T16 | Pure TS helper | unit | unit | ✅ OK |
| T17 | React component | unit | unit | ✅ OK |
| T18 | App shell wiring | unit (RTL) | unit | ✅ OK |
| T19 | App shell wiring | unit (RTL) | unit | ✅ OK |
| T20 | App shell wiring | unit (RTL) | unit | ✅ OK |
| T21 | File deletion | none | none | ✅ OK |
| T22 | React component | unit | unit | ✅ OK |
| T23 | React component | unit | unit | ✅ OK |
| T24 | Spec artifacts / markers | none | none | ✅ OK |

T9 é a única task com lógica real e `Tests: none`. A matriz é honesta aqui: o
núcleo testável é `touch_from_cwds`, coberto por unit em T1; o que sobra em T9 é
amarração de ciclo de vida do Tauri, que o gate de Build exercita e o
`Done when` cobre com uma verificação manual registrada.
