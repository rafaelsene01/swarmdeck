# Projetos — Tasks

**Spec**: `.specs/features/projects/spec.md` (sem design — feature pequena, design inline)
**Testing**: `.specs/codebase/TESTING.md`
**Status**: In Progress — T1–T4 Done (run `spec-loop` 004, 01/08/2026); T5–T9 novas (03/08/2026, observação ao vivo), Pending
**Milestone**: M1

---

## Plano de execução

```
mcp-task-server/T1 → T1 → T2 → ┬→ T3 [P]
                               └→ T4 [P]

T1 → T5 → ┬→ T6 → T8 [P]
          └→ T7 [P] (também depende de multi-terminal/T14)
T1 → T9 [P]
```
T5 é pré-requisito de T7 (o modal precisa dos parâmetros novos do serviço) e de T6 (recência é lida junto do resto do projeto). T8 depende de T6 (dado de recência) e reusa T7 para "New Project". T9 é independente do restante — só depende de T1.

| Tarefa | Status | Testes entregues |
|---|---|---|
| T1 `ProjectService` | ✅ Done | 8 integration (plano: 7, +1 — corrigido na triagem 005) |
| T2 Resolução de projeto por diretório | ✅ Done | 6 unit (plano: 6) |
| T3 Comandos Tauri de projeto | ✅ Done | — (invólucro fino) |
| T4 UI de gerenciamento de projetos | ✅ Done | 5 unit (plano: 4, +1 estado vazio) |

**Bug real encontrado e corrigido durante a run:** `ProjectService::create`/`update` gravavam o `path` canonicalizado com o prefixo verbatim `\\?\` do Windows, quebrando `projects::resolve` para qualquer `cwd` real (não canonicalizado) — isso quebraria a resolução de projeto (PROJ-03) inteiramente em produção no Windows. Corrigido na origem (`require_existing_dir`, `projects/service.rs`); ver `JOURNAL.md` da run 004.

---

## Tarefas

### T1: `ProjectService`

**O quê**: CRUD de projeto com atribuição de cor não usada e validação de diretório.
**Onde**: `src-tauri/src/projects/service.rs`
**Depende de**: `mcp-task-server/T1` (migração cria a tabela `projects`)
**Reusa**: camada de banco
**Requisito**: PROJ-01, PROJ-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `create` exige nome e diretório existente; recusa diretório já usado apontando o projeto dono
- [ ] Cor atribuída da paleta priorizando a menos usada quando esgotada
- [ ] `delete` retorna quantas tarefas serão afetadas e deixa `project_id NULL`
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 8 testes passam (create, diretório inexistente recusado, duplicado recusado, cores distintas, reciclagem de paleta, update propaga, delete conta e desvincula, regressão do bug de prefixo verbatim `\\?\` do Windows — corrigido na triagem 005, o teste extra tinha ficado de fora da contagem)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test --test projects` → 8 passam (funções soltas em `tests/projects.rs`, sem prefixo de módulo — `cargo test projects::service` não casa nenhum teste; corrigido na triagem 005).

**Commit**: `feat(projects): project service with color assignment`

---

### T2: Resolução de projeto por diretório

**O quê**: Função que mapeia um `cwd` para um projeto, com regra de caminho mais específico e fallback.
**Onde**: `src-tauri/src/projects/resolve.rs`
**Depende de**: T1
**Reusa**: `ProjectService` (T1)
**Requisito**: PROJ-03, PROJ-04

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Caminho exato resolve para o projeto
- [ ] Subpasta resolve para o projeto ancestral
- [ ] Com dois candidatos, o de caminho **mais específico** vence
- [ ] Sem candidato, devolve fallback com o nome da pasta — **nunca erro**
- [ ] Normaliza separadores para funcionar em Windows e POSIX
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 6 testes passam (exato, subpasta, mais específico vence, fallback, normalização de separador, case-insensitive no Windows)

**Tests**: unit · **Gate**: quick

**Verify**: `cargo test projects::resolve` → 6 passam.

**Commit**: `feat(projects): directory-based project resolution`

---

### T3: Comandos Tauri de projeto [P]

**O quê**: Expor `project_list`, `project_create`, `project_update`, `project_delete` como invólucros finos.
**Onde**: `src-tauri/src/commands/projects.rs`
**Depende de**: T2
**Reusa**: `ProjectService` (T1)
**Requisito**: PROJ-01

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Os 4 comandos registrados, sem lógica além de delegar
- [ ] Gate passa: `cargo build && npm run build`

**Tests**: none *(invólucro fino — a matriz exige `none`)* · **Gate**: build

**Verify**: chamar `project_list` pelo devtools e receber a lista.

**Commit**: `feat(projects): tauri commands`

---

### T4: UI de gerenciamento de projetos [P]

**O quê**: Tela de listagem com bolinha de cor, nome, caminho, contagem de tarefas, busca e ordenação.
**Onde**: `src/routes/settings/ProjectsPanel.tsx`
**Depende de**: T2
**Reusa**: comandos de T3 quando disponíveis; até lá, mock do contrato
**Requisito**: PROJ-05

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Linha exibe cor, nome, caminho absoluto e contagem de tarefas
- [ ] Ordenação por último uso funciona
- [ ] Busca filtra por nome **e** por caminho
- [ ] Caminho longo truncado no meio, preservando início e fim
- [ ] Estado vazio convida a criar o primeiro
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: ~~4~~ **5** testes passam (ordenação, busca por nome, busca por caminho, truncamento no meio, + estado vazio convida a criar o primeiro) — corrigido na triagem 006

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test ProjectsPanel` → 5 passam (era 4 no texto original).

**Commit**: `feat(ui): projects management panel`

---

### T5: `ProjectService::create` revisado — diretório-base, cor com override, git init

**Decisão do usuário (12/08/2026, run 008): opção (b)** — `create` original precisa ser migrada de verdade, não `create_with_options` como função paralela. Desestacionada; volta a valer o `Done when` original abaixo, tal como escrito.

**Estado herdado (não descartar, é a base do trabalho que falta)**: `create_with_options(conn, name, base_dir, color, git_init)` já existe em `src-tauri/src/projects/service.rs`, com toda a lógica de negócio desta task correta e testada (5 testes, validados adversarialmente — mutation test confirmou que não são decorativos; `cargo test --lib projects::service::` → 5 passando). O trabalho que falta é **migrar `create` para essa mesma assinatura/lógica** (ou absorver `create_with_options` para dentro de `create`) e atualizar os 2 chamadores que hoje só conhecem a `create` antiga:
- `commands::projects::project_create` (comando Tauri)
- os 8 testes de `tests/projects.rs` (T1, hoje intocados)

**Histórico da decisão (para contexto, não para reabrir):** estacionada nesta mesma run após validação encontrar a divergência entre `Done when` (fala em `create` 3x) e a entrega real (`create_with_options` nova, `create` intocada). Duas opções foram apresentadas — (a) aceitar `create_with_options` como função paralela, migrando só o chamador Tauri; (b) migrar `create` de verdade. Usuário escolheu (b): API final deve ter uma função só, não duas.

**O quê**: Estender `ProjectService::create` (T1) para tratar o diretório informado como **base** (cria subpasta nomeada a partir do nome do projeto dentro dele — PROJ-01 AC6), aceitar uma cor explícita opcional que sobrescreve a sugestão automática (PROJ-01 AC7, PROJ-02), e rodar `git init` local quando pedido (PROJ-09 AC1/AC2).
**Onde**: `src-tauri/src/projects/service.rs` (modifica)
**Depende de**: T1
**Reusa**: `ProjectService` (T1)
**Requisito**: PROJ-01, PROJ-02, PROJ-09

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `create` recebe `base_dir`, cria subpasta `base_dir/<nome>` e registra essa subpasta como `path` do projeto
- [ ] Subpasta já existente com esse nome é tratada como o erro "diretório já associado" (reaproveita a validação existente)
- [ ] `create` aceita `color: Option<String>` — presente usa esse valor (validando que está na paleta e não está em uso, mesma regra de unicidade); ausente mantém o comportamento antigo (sugestão automática)
- [ ] `create` aceita `git_init: bool` — quando `true`, roda `git init` na subpasta criada antes de retornar
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 5 testes passam (cria subpasta dentro da base, subpasta colidente recusa, cor explícita é respeitada, cor explícita já usada recusa, git_init cria `.git`)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test projects::service` → 5 novos + os 8 existentes de T1 continuam passando.

**Commit**: `feat(projects): base-dir subfolder, manual color override, local git init`

---

### T6: Rastrear última abertura por projeto

**O quê**: Coluna/tabela que registra quando um projeto foi usado por último (spawn de terminal), e comando `project_list_recent` ordenado por essa data, com tempo relativo (ex.: "5 days").
**Onde**: `src-tauri/src/projects/service.rs` (coluna `last_opened_at` ou tabela associada), migração nova, `src-tauri/src/commands/projects.rs` (novo comando ou parâmetro de ordenação)
**Depende de**: T2 (resolução de projeto já sabe quando um `cwd` resolve para um projeto — ponto natural para atualizar o carimbo)
**Reusa**: `ProjectService` (T1), resolução por diretório (T2)
**Requisito**: PROJ-06 (suporte de dados para a listagem com "há N dias")

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `last_opened_at` é atualizado sempre que um terminal nasce com aquele `project_id`
- [ ] `project_list_recent` devolve os projetos ordenados do mais recente para o mais antigo
- [ ] Tempo relativo (dias/horas) é calculado a partir de `last_opened_at`, não formatado como data absoluta
- [ ] Projeto nunca aberto (só criado) aparece por último, sem erro
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 4 testes passam (atualiza no spawn, ordena por recência, tempo relativo calculado, nunca aberto vai por último)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test projects::service -- recent` → 4 passam.

**Commit**: `feat(projects): track last-opened timestamp per project`

---

### T7: UI "Create New Project"

**O quê**: Modal de criação — nome, diretório-base (seletor nativo reaproveitado de `multi-terminal` TERM-10/11), paleta de 10 cores clicável com sugestão pré-selecionada, campo de ícone opcional, checkbox "Initialize as Git repository" marcado por padrão.
**Onde**: `src/components/project/CreateProjectModal.tsx` (novo)
**Depende de**: T5, `multi-terminal/T14` (plugin de diálogo nativo já registrado)
**Reusa**: `open()` de `@tauri-apps/plugin-dialog` (mesmo padrão de `NewTerminalDialog`), comandos de T3
**Requisito**: PROJ-01 (AC1, AC6, AC7), PROJ-08, PROJ-09

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Nome e diretório-base obrigatórios; "Create Project" desabilitado sem os dois
- [ ] Paleta mostra 10 cores, uma pré-selecionada (sugestão automática), clicar em outra troca a seleção
- [ ] Campo de ícone opcional não bloqueia a criação quando vazio
- [ ] Checkbox de git vem marcado por padrão, desmarcável
- [ ] Confirmar chama o comando de criação com `base_dir`, `color`, `git_init` e (se houver) ícone
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 5 testes passam (validação de campos obrigatórios, seleção de cor troca ao clicar, ícone opcional não bloqueia, checkbox de git parte marcado, submit chama comando com os parâmetros certos)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test CreateProjectModal` → 5 passam.

**Commit**: `feat(ui): create-new-project modal with color override and git init`

---

### T8: `ProjectPicker` — passo PROJECT

**O quê**: Painel do passo PROJECT: busca, lista de projetos (avatar, nome, caminho, "há N dias" de T6), e os três botões de ação (New/Import/No Project).
**Onde**: `src/components/project/ProjectPicker.tsx` (novo)
**Depende de**: T6 (dado de recência), T4 (padrão de listagem já usado em `ProjectsPanel`)
**Reusa**: comandos de T3/T6, `CreateProjectModal` (T7) para "New Project"
**Requisito**: PROJ-06

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Lista mostra avatar/cor, nome, caminho e tempo relativo de cada projeto
- [ ] Busca filtra por nome a cada tecla
- [ ] "New Project" abre `CreateProjectModal` (T7)
- [ ] "Import Project" abre o seletor nativo (reaproveita `multi-terminal` TERM-10/11) e emite o `cwd` escolhido
- [ ] "No Project" emite o pseudo-projeto Sandbox (T9) sem passar pela lista
- [ ] Selecionar uma linha emite o projeto escolhido para o passo seguinte
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 5 testes passam (lista renderiza, busca filtra, New Project abre modal, Import emite cwd do seletor, seleção de linha emite o projeto)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test ProjectPicker` → 5 passam.

**Commit**: `feat(ui): project picker for terminal creation`

---

### T9: Pseudo-projeto Sandbox (No Project)

**O quê**: Diretório fixo `<app_data_dir>/sandbox`, criado sob demanda, exposto como um projeto especial que nunca é persistido na tabela `projects` nem aparece em `project_list`/`project_list_recent`.
**Onde**: `src-tauri/src/projects/sandbox.rs` (novo)
**Depende de**: T1 (para saber onde fica `app_data_dir`)
**Reusa**: nenhum
**Requisito**: PROJ-07

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when** *(implementado e validado na run 008, retomada 12/08/2026)*:
- [x] `sandbox_dir()` devolve `<data_dir>/sandbox` (reusa `paths::data_dir()`, autoridade única do projeto para esse caminho — não `app_data_dir()` cru), criando a pasta se não existir
- [x] O pseudo-projeto não aparece em `project_list`/`project_list_recent`, não conta na contagem de projetos — provado por construção: `project_list` é invólucro 1:1 de `service::list_all` (`commands/projects.rs:18-21`), e o teste `never_registers_a_project_row` confirma que `sandbox.rs` nunca grava na tabela `projects`. `project_list_recent` ainda não existe no código (território do `T6`, independente deste `T9`)
- [x] Duas chamadas concorrentes de `sandbox_dir()` não duplicam nem falham (idempotente) — validador confirmou via leitura da stdlib (`DirBuilder::create_dir_all` trata `AlreadyExists` + `path.is_dir()` como sucesso) que isso vale para concorrência real, não só chamadas sequenciais; o teste em si (`resolving_twice_is_idempotent`) exercita só o caso sequencial
- [x] Gate passa: `cargo test` — `cargo test --workspace` → **192 passando / 0 falhas** (baseline 189 + 3 novos)
- [x] Contagem: 3 testes passam (`creates_sandbox_dir_when_absent`, `resolving_twice_is_idempotent`, `never_registers_a_project_row`) — confirmados individualmente por um validador que também quebrou a implementação de propósito (removeu `fs::create_dir_all`) e viu os 2 primeiros falharem de verdade, revertendo em seguida

**Tests**: integration · **Gate**: full

**Verify**: `cargo test projects::sandbox` → 3 passam. ✅ Validado por agente adversarial independente (rodou os gates ele mesmo, leu o código linha a linha, testou mutação) — veredito APROVADO, sem defeitos.

**Commit**: `feat(projects): fixed sandbox pseudo-project for "no project" terminals`

---

## Check 1 — Granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T1 | 1 serviço | ✅ |
| T2 | 1 função | ✅ |
| T3 | 4 invólucros finos, 1 arquivo | ✅ coeso |
| T4 | 1 componente | ✅ |
| T5 | 1 serviço, 3 comportamentos relacionados (subpasta, cor, git init) | ✅ coeso |
| T6 | 1 coluna + 1 comando | ✅ |
| T7 | 1 componente | ✅ |
| T8 | 1 componente | ✅ |
| T9 | 1 módulo pequeno | ✅ |

## Check 2 — Diagrama × definição

| Tarefa | `Depende de` | Diagrama | Status |
|---|---|---|---|
| T1 | mcp-task-server/T1 | raiz da feature | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 [P] | ✅ |
| T4 | T2 | T2→T4 [P] | ✅ |
| T5 | T1 | T1→T5 | ✅ |
| T6 | T2 | T2→T6 | ✅ |
| T7 | T5, multi-terminal/T14 | T5→T7 [P] | ✅ |
| T8 | T6 | T6→T8 [P] | ✅ |
| T9 | T1 | T1→T9 [P] | ✅ |

T3 e T4 não dependem uma da outra — T4 usa mock do contrato até T3 existir. Paralelismo válido. Mesma lógica vale para T7/T8/T9 entre si.

## Check 3 — Co-locação de testes

| Tarefa | Camada criada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T1 | serviço + banco | integration | integration | ✅ |
| T2 | domínio | unit | unit | ✅ |
| T3 | comandos Tauri (finos) | none | none | ✅ |
| T4 | componente React com lógica | unit | unit | ✅ |
| T5 | serviço + banco + processo externo (git) | integration | integration | ✅ |
| T6 | domínio/banco | integration | integration | ✅ |
| T7 | componente React com lógica | unit | unit | ✅ |
| T8 | componente React com lógica | unit | unit | ✅ |
| T9 | domínio + filesystem | integration | integration | ✅ |

Nenhuma violação.
