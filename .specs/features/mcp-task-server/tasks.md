# Servidor MCP de tarefas — Tasks

**Design**: `.specs/features/mcp-task-server/design.md`
**Testing**: `.specs/codebase/TESTING.md`
**Status**: Draft
**Milestone**: M2

> ⚠️ **T0 é gate de bloqueio.** Nenhuma tarefa deste arquivo começa antes dela.

---

## Plano de execução

### Fase 0 — Desbloqueio (sequencial)
```
T0
```

### Fase 1 — Dados e domínio (sequencial: integration + dependência)
```
T0 → T1 → T2 → T3
```

### Fase 2 — Transporte (sequencial: socket compartilhado)
```
T3 → T4 → T5
```

### Fase 3 — Sidecar e ferramentas (sequencial)
```
T5 → T6 → T7
```

### Fase 4 — Similaridade (paralelo com a Fase 3 após T3)
```
T3 → T8 [P]
```

---

## Tarefas

### T0: Confirmar o contrato de ferramentas MCP 🚧 BLOQUEIO

**O quê**: Confirmar os nomes e assinaturas reais das ferramentas MCP contra a implementação de referência, e congelar o contrato num documento.
**Onde**: `.specs/features/mcp-task-server/TOOL-CONTRACT.md` (novo)
**Depende de**: nenhuma
**Reusa**: instruções globais do usuário como ponto de partida
**Requisito**: MCP-01..MCP-08 (todos)

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Cada ferramenta tem nome, parâmetros e formato de retorno confirmados
- [ ] Divergências entre o inferido e o real estão documentadas
- [ ] O bloqueio correspondente em `STATE.md` está marcado como resolvido

**Tests**: none *(documento, não código)* · **Gate**: none

**Verify**: revisão humana. Nenhuma tarefa T1+ inicia com este item aberto.

**Commit**: `docs(mcp): freeze tool contract`

> **Por que é bloqueio e não uma nota:** os nomes foram inferidos do `CLAUDE.md` global do usuário, não de documentação do protocolo. O `rmcp` gera o schema a partir das assinaturas Rust, então renomear no código é barato — mas os prompts que o usuário já tem espalhados quebram em silêncio. Errar aqui só aparece em produção.

---

### T1: Migração `002` — tarefas, projetos, status, atividade

**O quê**: Migração criando `tasks`, `projects`, `terminal_statuses`, `terminal_activity` com índices e FKs do design.
**Onde**: `src-tauri/src/db/migrations/002_tasks.sql`
**Depende de**: T0, `multi-terminal/T2`
**Reusa**: runner de migração (multi-terminal T2)
**Requisito**: MCP-02, MCP-08

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] As 4 tabelas criadas com os índices do design
- [ ] `project_id` com `ON DELETE SET NULL`; `terminal_id` sem FK
- [ ] `CHECK` restringe `status` aos 4 valores válidos
- [ ] Os 4 status padrão inseridos como seed
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 5 testes passam (cria schema, seed de status, cascade SET NULL, CHECK rejeita status inválido, idempotente)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test migrations::002` → 5 passam. Excluir um projeto e conferir que a tarefa sobrevive com `project_id NULL`.

**Commit**: `feat(db): tasks, projects and terminal status schema`

---

### T2: Máquina de estados de tarefa

**O quê**: Tipo que representa as transições válidas, com `in_progress → completed` inexistente por construção.
**Onde**: `src-tauri/src/tasks/state.rs`
**Depende de**: T1
**Reusa**: nenhum
**Requisito**: MCP-03

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `TaskStatus::try_transition(from, action) -> Result<TaskStatus>`
- [ ] `start` leva a `in_progress` **de qualquer estado**, inclusive `completed`
- [ ] `complete` mapeia `in_progress→in_testing` e `in_testing→completed`
- [ ] Não existe caminho de `in_progress` direto para `completed`
- [ ] Erro de transição inválida nomeia as transições válidas
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 8 testes passam (start de cada um dos 4 estados, complete×2 válidos, pulo de fase recusado, mensagem de erro lista válidas)

**Tests**: unit · **Gate**: quick

**Verify**: `cargo test tasks::state` → 8 passam. Deve existir um teste explícito provando que o pulo da fase de teste é impossível.

**Commit**: `feat(tasks): task state machine with mandatory testing phase`

---

### T3: `TaskService`

**O quê**: Serviço de domínio: criar, iniciar, concluir, gravar plano e implementação, com resolução de projeto pelo `cwd`.
**Onde**: `src-tauri/src/tasks/service.rs`
**Depende de**: T2
**Reusa**: máquina de estados (T2), camada de banco
**Requisito**: MCP-02, MCP-03, MCP-08

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `create` infere terminal e projeto — nenhum dos dois é parâmetro
- [ ] Projeto resolvido pelo caminho mais específico; fallback para nome da pasta
- [ ] `start`/`complete` delegam à máquina de estados
- [ ] `complete` em tarefa inexistente retorna erro e **não cria** a tarefa
- [ ] Plano e implementação truncados no teto, com sinalização
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 9 testes passam (create infere projeto, subpasta resolve, mais específico vence, fallback, start, complete×2, id inexistente, truncamento)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test tasks::service` → 9 passam.

**Commit**: `feat(tasks): task service with project resolution`

---

### T4: `TerminalMetaService`

**O quê**: Serviço de título, atividade e status de terminal, com a precedência do rename manual.
**Onde**: `src-tauri/src/terminal/meta.rs`
**Depende de**: T3
**Reusa**: camada de banco, tabelas `terminal_statuses` e `terminal_activity`
**Requisito**: MCP-04, MCP-05, MCP-06

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `set_title` **descarta** quando `title_source = 'user'`
- [ ] `push_activity` anexa ao log e **não altera** o título
- [ ] `set_status` valida contra o catálogo e, ao recusar, devolve a lista de válidos
- [ ] Status desativado é recusado como desconhecido
- [ ] Log corta acima de 200 entradas
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 8 testes passam (set_title, rename manual vence, activity não toca título, log ordenado, corte em 200, status válido, status inválido lista válidos, status desativado recusado)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test terminal::meta` → 8 passam.

**Commit**: `feat(terminal): title, activity and status services`

---

### T5: `IpcServer`

**O quê**: Servidor IPC local (named pipe no Windows, unix socket nos demais) que aceita os sidecars e valida o terminal de origem.
**Onde**: `src-tauri/src/ipc/server.rs`, `src-tauri/src/ipc/transport.rs`
**Depende de**: T4
**Reusa**: `TaskService` (T3), `TerminalMetaService` (T4), `TerminalManager`
**Requisito**: MCP-01

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Transporte abstraído atrás de um trait — pipe e socket atrás da mesma interface
- [ ] Requisição com `terminal_id` sem sessão viva é **recusada**
- [ ] Socket com escopo de usuário
- [ ] Toda mutação bem-sucedida emite `task_changed` para todas as janelas
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 6 testes passam (conecta, roteia create, terminal morto recusado, terminal inexistente recusado, evento emitido, cliente desconecta sem derrubar servidor)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test ipc::` → 6 passam. Teste com terminal falso deve provar a recusa.

**Commit**: `feat(ipc): local socket server with terminal validation`

---

### T6: Sidecar `swarmdeck-mcp` — esqueleto e `check_active`

**O quê**: Binário sidecar com `rmcp` sobre stdio, cliente IPC e a ferramenta `check_active`.
**Onde**: `crates/swarmdeck-mcp/src/main.rs`, `crates/swarmdeck-mcp/src/client.rs`
**Depende de**: T5
**Reusa**: `rmcp` (SDK oficial), transporte de T5
**Requisito**: MCP-01

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Servidor MCP stdio sobe e responde ao handshake do protocolo
- [ ] `check_active` retorna `true` + `terminal_id` quando a env var existe e o socket conecta
- [ ] Retorna `false` quando a env var falta — **sem tentar conectar**
- [ ] Retorna `false` quando o socket recusa (app fechado)
- [ ] Sidecar **não contém lógica de negócio** — só traduz MCP→IPC
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 4 testes passam (handshake, ativo, env ausente, app fechado)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test -p swarmdeck-mcp` → 4 passam. Rodar o binário com e sem a env var.

**Commit**: `feat(mcp): sidecar skeleton with check_active handshake`

---

### T7: Ferramentas MCP de tarefa e terminal

**O quê**: Expor as ferramentas do contrato via `#[tool]` do `rmcp`, encaminhando cada uma ao IPC.
**Onde**: `crates/swarmdeck-mcp/src/tools.rs`
**Depende de**: T6
**Reusa**: macros do `rmcp` para geração de schema, cliente IPC (T6)
**Requisito**: MCP-02, MCP-03, MCP-04, MCP-05

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Ferramentas do contrato (T0) registradas com schema gerado pelas macros
- [ ] Cada uma encaminha ao IPC e devolve a resposta do app sem reinterpretar
- [ ] Erro do app chega ao agente como erro MCP descritivo
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 7 testes passam (round-trip create, start, complete×2, set_status, set_title, erro propagado)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test -p swarmdeck-mcp tools` → 7 passam. Ciclo completo criar→iniciar→concluir→concluir pela interface MCP.

**Commit**: `feat(mcp): task and terminal tools over ipc`

---

### T8: Similaridade de tarefas [P]

**O quê**: Função de similaridade sobre título+descrição, com os limiares de 70% e 50%.
**Onde**: `src-tauri/src/tasks/similarity.rs`
**Depende de**: T3
**Reusa**: nenhum
**Requisito**: MCP-07

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Score normalizado em `0.0..1.0` por trigram/Levenshtein
- [ ] Acima de 0,70 → recomenda reutilizar
- [ ] Entre 0,50 e 0,70 → recomenda perguntar ao usuário
- [ ] Compara só tarefas **ativas**
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 6 testes passam (idêntico=1.0, sem relação≈0, faixa alta, faixa média, faixa baixa, ignora concluídas)

**Tests**: unit · **Gate**: quick

**Verify**: `cargo test similarity` → 6 passam. "Adicionar paginação" vs "Implementar paginação na lista" deve cair na faixa alta.

**Commit**: `feat(tasks): task similarity scoring`

---

## Check 1 — Granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T0 | 1 documento de contrato | ✅ |
| T1 | 1 migração | ✅ |
| T2 | 1 tipo/máquina de estados | ✅ |
| T3 | 1 serviço | ✅ |
| T4 | 1 serviço | ✅ |
| T5 | 1 servidor + 1 trait de transporte | ✅ coeso |
| T6 | 1 binário, escopo mínimo | ✅ |
| T7 | 1 módulo de ferramentas | ✅ coeso |
| T8 | 1 função | ✅ |

## Check 2 — Diagrama × definição

| Tarefa | `Depende de` | Diagrama | Status |
|---|---|---|---|
| T0 | — | raiz | ✅ |
| T1 | T0, multi-terminal/T2 | T0→T1 | ✅ (dep cross-feature anotada no corpo) |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T4 | T4→T5 | ✅ |
| T6 | T5 | T5→T6 | ✅ |
| T7 | T6 | T6→T7 | ✅ |
| T8 | T3 | T3→T8 [P] | ✅ |

T8 é `[P]` e não depende de nenhuma tarefa da Fase 3 — nem elas dele. Paralelismo válido.

## Check 3 — Co-locação de testes

| Tarefa | Camada criada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T0 | nenhuma (documento) | — | none | ✅ |
| T1 | migrações | integration | integration | ✅ |
| T2 | domínio | unit | unit | ✅ |
| T3 | serviço + banco | integration | integration | ✅ |
| T4 | serviço + banco | integration | integration | ✅ |
| T5 | servidor IPC | integration | integration | ✅ |
| T6 | sidecar MCP | integration | integration | ✅ |
| T7 | sidecar MCP | integration | integration | ✅ |
| T8 | domínio | unit | unit | ✅ |

Nenhuma violação.

## Paralelismo

Só T8 é `[P]` (`Tests: unit`, parallel-safe). Todas as demais têm `Tests: integration` — disputam arquivo SQLite ou o endpoint do socket, e por TESTING.md rodam sequencial mesmo quando o código permitiria concorrência.
