# Kanban de tarefas — Tasks

**Design**: `.specs/features/task-kanban/design.md`
**Testing**: `.specs/codebase/TESTING.md`
**Status**: In Progress (liberada na triagem 005, 02/08/2026 — ver `project/STATE.md`)
**Milestone**: M2

---

## Plano de execução

### Fase 1 — Janela e dados (sequencial)
```
mcp-task-server/T5 → T1 → T2
```

### Fase 2 — Board (paralelo)
```
      ┌→ T3 [P]
T2 ───┼→ T4 [P]
      └→ T5 [P]
```

### Fase 3 — Ações (sequencial)
```
T3, T4, T5 → T6
```

---

## Tarefas

### T1: Janela secundária do Kanban

**O quê**: Criar, focar e encerrar a janela do board apontando para a rota `/kanban`.
**Onde**: `src-tauri/src/windows/kanban.rs`
**Depende de**: `mcp-task-server/T5`
**Reusa**: `WebviewWindowBuilder` do Tauri 2
**Requisito**: KAN-08

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `open()` cria a janela; se já existe, **foca** em vez de criar outra
- [ ] Fechar a janela principal fecha o Kanban junto
- [ ] "Voltar aos terminais" foca a janela principal
- [ ] Gate passa: `cargo build && npm run build`

**Tests**: none *(invólucro sobre a API de janelas do Tauri — a matriz exige `none`)* · **Gate**: build

**Verify**: abrir o board duas vezes → uma janela só. Fechar a principal → o board fecha.

**Commit**: `feat(kanban): secondary window`

---

### T2: Comando de listagem e contrato de evento

**O quê**: Comando `task_list` devolvendo tarefas com projeto e `terminalAlive` derivado, e o tipo do evento `task_changed`.
**Onde**: `src-tauri/src/commands/tasks.rs`, `src/types/tasks.ts`
**Depende de**: T1
**Reusa**: `TaskService` (mcp-task-server/T3), `TerminalManager`
**Requisito**: KAN-01, KAN-04

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `task_list` devolve tarefas com projeto embutido (id, nome, cor)
- [ ] `terminalAlive` **derivado** do registro de sessões, não persistido
- [ ] Tipos TS espelham o contrato `TaskChangedEvent` do design
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 4 testes passam (lista com projeto, terminalAlive true, terminalAlive false para terminal morto, projeto nulo após exclusão)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test commands::tasks` → 4 passam.

**Commit**: `feat(kanban): task list command and event contract`

---

### T3: `KanbanBoard` — estado e sincronização [P]

**O quê**: Raiz do board com estado normalizado em `Map` e aplicação de delta a partir do evento.
**Onde**: `src/routes/kanban/KanbanBoard.tsx`, `src/routes/kanban/useTaskStore.ts`
**Depende de**: T2
**Reusa**: `listen('task_changed')` do Tauri
**Requisito**: KAN-01, KAN-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Carrega o estado uma vez no mount; depois **só reage ao evento** — sem polling
- [ ] `created`/`updated`/`moved`/`deleted` aplicados como delta, sem recarregar tudo
- [ ] Evento para tarefa desconhecida dispara busca pontual daquela tarefa
- [ ] Colunas **derivadas** do `Map`, não armazenadas
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 7 testes passam (carga inicial, created, updated, moved troca coluna, deleted remove, tarefa desconhecida busca, sem duplicata em transição concorrente)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test useTaskStore` → 7 passam.

**Commit**: `feat(kanban): board state with delta-based sync`

---

### T4: `Column` e `TaskCard` [P]

**O quê**: Coluna com contagem, ordenação e rolagem própria; card com chip de projeto, número, título e truncamentos.
**Onde**: `src/routes/kanban/Column.tsx`, `src/routes/kanban/TaskCard.tsx`
**Depende de**: T2
**Reusa**: cores de projeto (projects)
**Requisito**: KAN-01, KAN-03

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] 4 colunas com ícone, nome, badge de contagem e botão de ordenar
- [ ] Estado vazio **específico por fase** ("Nenhuma tarefa em teste")
- [ ] Rolagem independente por coluna; o board não rola verticalmente
- [ ] Título quebra em até 3 linhas e trunca; descrição truncada
- [ ] Ordenação escolhida é lembrada por coluna
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 6 testes passam (contagem, estado vazio por fase, ordenação alterna, ordenação persiste, título 3 linhas, descrição truncada)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test Column TaskCard` → 6 passam.

**Commit**: `feat(kanban): columns and task cards`

---

### T5: Filtro por projeto e busca [P]

**O quê**: Seletor de projeto e busca textual, recalculando as contagens das colunas.
**Onde**: `src/routes/kanban/BoardFilters.tsx`
**Depende de**: T2
**Reusa**: `useTaskStore` (T3) via seletor derivado
**Requisito**: KAN-06

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Selecionar um projeto filtra e **recalcula as contagens**
- [ ] "Todos os projetos" mantém os chips visíveis
- [ ] Busca filtra por título e descrição, incrementalmente, em todas as colunas
- [ ] Busca sem resultado mostra estado vazio **com o termo buscado**
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 5 testes passam (filtra por projeto, recalcula contagem, todos mostra chips, busca incremental, vazio mostra termo)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test BoardFilters` → 5 passam.

**Commit**: `feat(kanban): project filter and text search`

---

### T6: Ações do card — excluir, detalhe e enviar-ao-terminal

**O quê**: Ligar as três ações do card, com `send` resolvendo o terminal no backend.
**Onde**: `src-tauri/src/tasks/send.rs`, `src/routes/kanban/TaskDetail.tsx`
**Depende de**: T3, T4, T5
**Reusa**: `TerminalManager`, `TaskService`
**Requisito**: KAN-03, KAN-04, KAN-07

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Excluir pede confirmação antes de remover
- [ ] Detalhe mostra plano e implementação **íntegros**
- [ ] Tarefa excluída com o detalhe aberto → detalhe fecha com aviso
- [ ] `send` escreve o contexto no PTY e foca a janela principal
- [ ] Terminal morto → ação **desabilitada pelo backend**, com explicação, não erro no clique
- [ ] Criação manual entra em `pending` e passa pelo mesmo `TaskService`
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 6 testes passam (send escreve no PTY, send foca janela, terminal morto desabilita, delete confirma, detalhe fecha ao excluir, criação manual usa TaskService)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test tasks::send` → 6 passam. No app, enviar uma tarefa e ver o contexto aparecer no terminal certo.

**Commit**: `feat(kanban): card actions with send-to-terminal`

---

## Check 1 — Granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T1 | 1 módulo de janela | ✅ |
| T2 | 1 comando + 1 contrato de tipos | ✅ coeso |
| T3 | 1 store + sua raiz | ✅ coeso |
| T4 | 2 componentes acoplados | ✅ coeso |
| T5 | 1 componente | ✅ |
| T6 | 1 conjunto de ações do card | ✅ coeso |

## Check 2 — Diagrama × definição

| Tarefa | `Depende de` | Diagrama | Status |
|---|---|---|---|
| T1 | mcp-task-server/T5 | raiz da feature | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 [P] | ✅ |
| T4 | T2 | T2→T4 [P] | ✅ |
| T5 | T2 | T2→T5 [P] | ✅ |
| T6 | T3, T4, T5 | T3,T4,T5→T6 | ✅ |

⚠️ T5 declara `Reusa: useTaskStore (T3)` mas **não depende** de T3 — consome o store por seletor derivado, e nos testes usa store montado à mão. Reuso não é dependência. Paralelismo válido.

## Check 3 — Co-locação de testes

| Tarefa | Camada criada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T1 | invólucro de janela Tauri | none | none | ✅ |
| T2 | comando + banco | integration | integration | ✅ |
| T3 | React com lógica | unit | unit | ✅ |
| T4 | React com lógica | unit | unit | ✅ |
| T5 | React com lógica | unit | unit | ✅ |
| T6 | serviço Rust + React | integration | integration | ✅ (tipo mais alto) |

Nenhuma violação. T6 cria duas camadas e usa o tipo mais alto exigido, conforme a regra de precedência.

## Paralelismo

T3, T4 e T5 são `[P]` — todas Vitest, parallel-safe. T2 e T6 têm `Tests: integration` e rodam sequencial.
