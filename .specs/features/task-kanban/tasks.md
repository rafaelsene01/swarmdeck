# Kanban de tarefas — Tasks

**Design**: `.specs/features/task-kanban/design.md`
**Testing**: `.specs/codebase/TESTING.md`
**Status**: In Progress (liberada na triagem 005, 02/08/2026 — ver `project/STATE.md`)
**Milestone**: M2

**Corrigido na triagem 006 (02/08/2026):** este arquivo tinha todos os checkboxes `[ ]` apesar de T1-T6 terem código real, testado e passando no gate — nenhuma task tinha sido marcada, mesmo tendo sido implementada (provavelmente na mesma leva de trabalho fora-da-skill que fechou `terminal-statuses/T1-T4`, ver `STATE.md` 02/08/2026). Marcadas `✅ Done no gate` abaixo, com a ressalva que se aplica a todas: **nenhuma é alcançável por um usuário real** — `KanbanBoard` nunca é montado (`src/main.tsx` sempre renderiza `<App/>`, sem `react-router`). `T7` e `T8` são novas desta triagem, para fechar essa e outras duas lacunas encontradas (payload vazio do evento `task_changed`; formulário de criação manual inexistente).

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

### Fase 4 — Integração real (nova, triagem 006)
```
T6 → T7 → T8
```
Mesma razão de `multi-terminal/T12`: T1-T6 passam seus gates isolados, mas nada monta o board real na tela. T8 depende de T7 ter o botão "adicionar tarefa" com onde morar.

---

## Tarefas

### T1: Janela secundária do Kanban — ✅ Done no gate (confirmado triagem 006)

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

### T2: Comando de listagem e contrato de evento — ✅ Done no gate (confirmado triagem 006), ⚠️ Verify real quebrado — ver T7

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
- [ ] Contagem: ~~4~~ **6** testes passam (lista com projeto, terminalAlive true, terminalAlive false para terminal morto, projeto nulo após exclusão, + 2 adicionados depois por `T6`/`task_get`: `task_get` para id inexistente, `task_get` devolve a mesma forma que `task_list`) — corrigido na triagem 006, `cargo test commands::tasks` mede 6, não 4

**Tests**: integration · **Gate**: full

**Verify**: `cargo test commands::tasks` → 6 passam (era 4 no texto original).

⚠️ **Achado na triagem 006, não corrigido aqui — é código, não spec:** os "Tipos TS espelham o contrato `TaskChangedEvent`" existem (`src/types/tasks.ts`), mas quem **emite** o evento (`src-tauri/src/ipc/server.rs::emit_task_changed`) manda payload vazio (`app.emit("task_changed", ())`) — o comentário do próprio código admite que é proposital ("é um nudge, não transporte de dado"). `useTaskStore.ts` (T3) consome `event.payload.op`/`.task`/`.taskId` sem guarda de nulo. Resultado: o evento real que chega ao frontend não bate com o tipo que T2 define, e o `switch` de T3 quebra em runtime a cada `task_changed` de verdade. KAN-02 (atualização em tempo real) está quebrado na prática apesar de T2 e T3 passarem seus gates isolados. Ver `T7`.

**Commit**: `feat(kanban): task list command and event contract`

---

### T3: `KanbanBoard` — estado e sincronização [P] — ✅ Done no gate (confirmado triagem 006), ⚠️ Verify real quebrado — ver T7

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

### T4: `Column` e `TaskCard` [P] — ✅ Done no gate (confirmado triagem 006)

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
- [ ] Contagem: ~~6~~ **11** testes passam (5 em `TaskCard.test.tsx` + 6 em `Column.test.tsx`) — corrigido na triagem 006

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test Column TaskCard` → 11 passam (era 6 no texto original).

**Commit**: `feat(kanban): columns and task cards`

---

### T5: Filtro por projeto e busca [P] — ✅ Done no gate (confirmado triagem 006)

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

### T6: Ações do card — excluir, detalhe e enviar-ao-terminal — ✅ Done no gate (confirmado triagem 006), ⚠️ Verify real pendente de T7

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
- [ ] Contagem: ~~6~~ **7** testes passam (send escreve no PTY, send foca janela, terminal morto desabilita, delete confirma, detalhe fecha ao excluir, criação manual usa TaskService, + `get_apos_delete_retorna_not_found_o_que_fecha_o_detalhe_aberto`) — corrigido na triagem 006

**Tests**: integration · **Gate**: full

**Verify**: `cargo test tasks::send` → 7 passam (era 6 no texto original). No app, enviar uma tarefa e ver o contexto aparecer no terminal certo — **não executado ainda**, pendente de `T7` (a janela não mostra o board real hoje).

**Commit**: `feat(kanban): card actions with send-to-terminal`

---

### T7: Montar `/kanban` de verdade e corrigir o payload do evento (nova, triagem 006)

**O quê**: Fechar os dois gaps de integração encontrados na auditoria desta triagem, mesma classe de problema que `multi-terminal/T12` resolveu antes: (1) a janela "Kanban" hoje renderiza `<App/>` (o grid de terminais) em vez de `KanbanBoard`, porque `src/main.tsx` monta `<App/>` incondicionalmente e não existe `react-router` nem qualquer outro roteamento no projeto; (2) `emit_task_changed` (`src-tauri/src/ipc/server.rs`) emite `task_changed` com payload vazio, mas `useTaskStore.ts` (T3) espera `{ op, task, taskId, previousStatus }` sem guarda de nulo — o board quebra em runtime a cada mudança real de tarefa. `design.md` já descreve a arquitetura pretendida (janela apontando para "rota `/kanban`", evento carregando "a tarefa afetada e a operação") — não há decisão de produto em aberto aqui, só falta implementar o que já está desenhado.
**Onde**: `src/main.tsx` (decide entre `<App/>` e `<KanbanBoard/>` pelo label da janela atual — `getCurrentWebviewWindow().label`, dispensa dependência nova de router já que só existem 2 janelas fixas, não rotas arbitrárias), `src/routes/kanban/KanbanBoard.tsx` (passar `onOpenTask`/`onDeleteTask`/`onSendTask` para `Column`/`TaskCard`, hoje não repassados), `src-tauri/src/ipc/server.rs` (`emit_task_changed` populado com o payload real: `op`, `task` serializado, `taskId`, `previousStatus` quando aplicável)
**Depende de**: T1, T2, T3, T4, T5, T6 (monta o que todas elas já construíram)
**Reusa**: `KanbanBoard`/`Column`/`TaskCard`/`TaskDetail` (T3-T6, já existem e testados isoladamente), `TaskChangedEvent` (T2, já tipado — só falta o backend preencher)
**Requisito**: KAN-02, KAN-08 (nenhum requisito novo — fecha o `Verify` real dos que já existem)

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Abrir a janela "Kanban" mostra `KanbanBoard` real, não uma segunda cópia do grid de terminais
- [ ] `emit_task_changed` envia `op`/`task`/`taskId`/`previousStatus` reais, não `()`
- [ ] `useTaskStore.ts` aplica o delta corretamente a partir do payload real (sem lançar exceção)
- [ ] `KanbanBoard` repassa as ações de abrir/excluir/enviar para `Column`/`TaskCard`, então clicar num card de verdade abre `TaskDetail`
- [ ] Gate passa: `cargo build && npm run build`, mais os gates de T2/T3/T6 reexecutados

**Tests**: none *(fiação — a lógica já é testada nas peças que compõe, mesmo padrão de `multi-terminal/T12`)* · **Gate**: build

**Verify**: `uat-agent` — abrir o board pela UI real (não pelo console do devtools), confirmar que ele mostra o Kanban de verdade; um agente MCP cria/move uma tarefa e o card migra de coluna em até 1s sem refresh manual (reexecuta o `Verify` original de T2/T3/T6, que nunca puderam ser confirmados de ponta a ponta); clicar num card abre o detalhe; enviar-ao-terminal escreve no PTY certo e foca a janela principal.

**Commit**: `feat(kanban): mount real board route and populate task_changed payload`

---

### T8: Formulário de criação manual de tarefa (nova, triagem 006)  ⛔ NEEDS-DECISION

**Estacionada na run 007 (spec-loop, 03/08/2026).** Não executar até haver decisão do usuário.

**Pergunta:** o único caminho de criação de tarefa que existe hoje (`tasks::service::create`, `src-tauri/src/tasks/service.rs:134-156`) exige um `TerminalContext { terminal_id, cwd }` e **deriva** `project_id` do `cwd` — não aceita projeto explícito, nem contempla tarefa sem terminal de origem. KAN-07 critério 1 exige que o formulário deixe o usuário escolher o projeto diretamente. Três caminhos:
1. Expandir o escopo de T8 para incluir um comando Tauri novo `task_create` (toca `src-tauri/src/commands/tasks.rs`/`src-tauri/src/tasks/service.rs`, e uma linha em `src-tauri/src/lib.rs` para registrá-lo) que aceite `project_id: Option<String>` direto — e decidir o que gravar em `terminal_id` para uma tarefa manual (`NULL`? exige migração de schema? sentinela `"manual"`?).
2. Quebrar em duas tasks: uma task de backend nova que resolve `task_create` + a semântica de `terminal_id` manual; T8 vira só a UI, dependente dela.
3. Reduzir o critério 1 desta rodada: formulário só com título/descrição (sem seletor de projeto), `project_id = NULL` até uma task futura resolver o back-end — descumpre KAN-07 critério 1 como está escrito, exigiria uma AD explícita em `STATE.md` admitindo a redução.

**Por que só o usuário responde:** é decisão de arquitetura — muda a semântica hoje assumida de "toda tarefa tem terminal de origem" (usada por `TaskDto.terminalAlive`/`task_send`), possivelmente exige migração de schema. Não é algo que um implementador de UI decida sozinho.

**Medições que sustentam a escolha:** `grep -n "task_create" src-tauri/src/lib.rs` → vazio (só `task_list`, `task_get`, `task_delete`, `task_send` registrados); `tasks::service::create` exige `TerminalContext` real, projeto sempre inferido do `cwd` (doc-comment do arquivo, linhas 9-19 e 129-133: "Project and terminal are both inferred from `ctx`, never passed loose by the caller"); nenhum seletor de projeto reusável isolado existe em `src/` (só `src/routes/settings/ProjectsPanel.tsx`, um painel de administração completo, não um componente de seleção).

**Estado do código:** nada alterado — nenhum arquivo tocado por esta tentativa (`git status --short` idêntico antes e depois da investigação; a única diferença em `KanbanBoard.tsx` é herança de `T7`, já implementada nesta mesma run).

---

**O quê**: Tela/formulário para criar uma tarefa manualmente (KAN-07, critérios 1-2) — hoje só o critério 3 (a tarefa manual entra em `Pending` pelo mesmo `TaskService`) está coberto, estruturalmente, por `T6`; não existe UI de criação nenhuma.
**Onde**: `src/routes/kanban/TaskForm.tsx` (novo), `src/routes/kanban/KanbanBoard.tsx` (modifica — botão "adicionar tarefa" abre o formulário)
**Depende de**: T7 (precisa do board real montado para o botão ter onde morar)
**Reusa**: `TaskService::create` (já existe, `mcp-task-server/T3`), seletor de projeto (`projects`)
**Requisito**: KAN-07

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Botão "adicionar tarefa" abre o formulário com título, descrição e projeto
- [ ] Envio sem título bloqueia e sinaliza o campo
- [ ] Tarefa criada entra em `Pending` e fica visível às ferramentas MCP
- [ ] Gate passa: `cargo build && npm run test`
- [ ] Contagem: 4 testes passam (abre formulário, título vazio bloqueia, envio válido cria e fecha, tarefa criada aparece na coluna Pending)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test TaskForm` → 4 passam.

**Commit**: `feat(kanban): manual task creation form`

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
