# Servidor MCP de tarefas — Tasks

**Design**: `.specs/features/mcp-task-server/design.md`
**Testing**: `.specs/codebase/TESTING.md`
**Status**: In Progress (T0–T8 `✅ Done` no gate, run `spec-loop` 004, 01/08/2026 — `.specs/runs/004-2026-08-01/JOURNAL.md`) — ⚠️ **T5 com `Verify` real pendente de `T9` (nova, triagem 005, 02/08/2026): `IpcServer` nunca é iniciado pelo app real**, ver T9 abaixo
**Milestone**: M2

> ⚠️ **T0 é gate de bloqueio.** Nenhuma tarefa deste arquivo começa antes dela.

| Tarefa | Status | Testes entregues |
|---|---|---|
| T0 Contrato de ferramentas MCP | ✅ Done | — (documento) |
| T1 Migração `003` — tarefas, projetos, status, atividade | ✅ Done | 5 integration (plano: 5) |
| T2 Máquina de estados de tarefa | ✅ Done | 8 unit (plano: 8) |
| T3 `TaskService` | ✅ Done | 9 integration (plano: 9) |
| T4 `TerminalMetaService` | ✅ Done | 10 — 9 unit + 1 integration (plano: 8; corrigido na triagem 005) |
| T5 `IpcServer` | ✅ Done (gate) — Verify real pendente de T9 (decisão tomada, triagem 005) | 16 — 1 unit + 15 integration (plano: 6, +1; corrigido na triagem 005 — a contagem antiga não batia com `tests/ipc_server.rs`, que sozinho tem 15) |
| T6 Sidecar `swarmdeck-mcp` — esqueleto e `check_active` | ✅ Done | ~11 (`client::tests::*` + o teste de handshake; ver nota abaixo) |
| T7 Ferramentas MCP de tarefa e terminal | ✅ Done | ~5 (`tools::tests::*` + o teste de registro do catálogo; ver nota abaixo) |
| T8 Similaridade de tarefas | ✅ Done | 6 unit (plano: 6) |
| T9 Iniciar `IpcServer` no app real | 🆕 Criada na triagem 005 (02/08/2026) — pronta para execução | — (fiação, gate build) |

**Desvio de numeração:** T1 rodou como migração **`003`**, não `002` como o título da seção ainda cita abaixo — `release-distribution/T14`, executada antes na mesma run, reservou a `002` primeiro (regra "quem chega primeiro pega o número", `EXECUTION.md`). O código e os testes usam `003` corretamente; só o texto do título ficou desatualizado, preservado como está para não reescrever histórico — a nota aqui é a correção.

Ver `.specs/runs/004-2026-08-01/JOURNAL.md` para o detalhe e os desvios de cada task (teto de truncamento de texto, algoritmo de similaridade trocado de Dice para overlap após bug real encontrado em verificação, bug de path verbatim do Windows corrigido na origem, gap de escopo do roteamento server-side de T7 fechado nesta run).

**Correção de contagem T6/T7 (triagem 005):** o crate `swarmdeck-mcp` tem **16** testes no total (`cargo test -p swarmdeck-mcp` → 16 passam), não os 6+21=27 que a tabela antiga somava — nenhuma leitura possível dos números antigos batia com a suíte real. A tabela acima usa uma divisão por módulo (`client::tests::*` + handshake → T6; `tools::tests::*` + registro do catálogo → T7) como a melhor aproximação disponível — o histórico de commits desta run foi um único commit grande (`2169884`), então não há como atribuir cada teste a uma task com certeza. Trate os números com `~` como aproximados; o número que não é aproximado, e o que importa para o gate, é o total real: **16**.

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

### T0: Escrever o contrato de ferramentas MCP 🚧 BLOQUEIO

**O quê**: Escrever o `TOOL-CONTRACT.md` congelando os nomes e assinaturas das ferramentas MCP.

> **✅ DECISÃO DO USUÁRIO — triagem 001, 28/07/2026.** A pergunta "congelar os nomes inferidos ou validar antes contra a implementação real?" foi feita e respondida: **congelar os inferidos**. A fonte do contrato é o `CLAUDE.md` global do usuário; **não** há validação prévia contra a implementação de referência. Quem executar esta task escreve o documento a partir dessa fonte e **não precisa perguntar nada** — o risco aceito está registrado como AD no `STATE.md` (28/07/2026, "Contrato de ferramentas MCP congelado").
>
> Isto revoga o `Depende de: validação externa` implícito e o Todo correspondente no `STATE.md`. O "Done when" abaixo foi reescrito de acordo.
**Onde**: `.specs/features/mcp-task-server/TOOL-CONTRACT.md` (novo)
**Depende de**: nenhuma
**Reusa**: instruções globais do usuário como ponto de partida
**Requisito**: MCP-01..MCP-08 (todos)

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Cada ferramenta tem nome, parâmetros e formato de retorno **escritos** no `TOOL-CONTRACT.md`, com o `CLAUDE.md` global citado como fonte
- [ ] ~~Divergências entre o inferido e o real estão documentadas~~ — **sem objeto**: não há comparação com o real, por decisão do usuário (triagem 001). Em lugar disso, o documento abre com um aviso de que o contrato é inferido e de qual é o procedimento se um nome se provar errado
- [x] ~~O bloqueio correspondente em `STATE.md` está marcado como resolvido~~ — **feito na triagem 001**, antes desta task rodar

**Tests**: none *(documento, não código)* · **Gate**: none

**Verify**: revisão humana. Nenhuma tarefa T1+ inicia com este item aberto.

**Commit**: `docs(mcp): freeze tool contract`

> **Por que é bloqueio e não uma nota:** os nomes foram inferidos do `CLAUDE.md` global do usuário, não de documentação do protocolo. O `rmcp` gera o schema a partir das assinaturas Rust, então renomear no código é barato — mas os prompts que o usuário já tem espalhados quebram em silêncio. Errar aqui só aparece em produção.

---

### T1: Migração `002` — tarefas, projetos, status, atividade

**O quê**: Migração criando `tasks`, `projects`, `terminal_statuses`, `terminal_activity` com índices e FKs do design.
**Onde**: `src-tauri/src/db/migrations/003_tasks.sql` (o título desta task ainda diz `002` — deviation de numeração explicada logo acima da tabela de status; o arquivo real, e o único que existe no disco, é `003_tasks.sql`)
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

**Verify**: `cargo test --test tasks_schema` → 5 passam (`migracao_cria_as_4_tabelas`, `seed_insere_os_4_status_padrao`, `deletar_projeto_deixa_project_id_nulo_na_task`, `insert_com_status_invalido_falha`, `migracao_003_e_idempotente`). Excluir um projeto e conferir que a tarefa sobrevive com `project_id NULL`.

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

**Verify**: `cargo test --test task_service` → 9 passam (funções soltas em `tests/task_service.rs`, sem prefixo de módulo — `cargo test tasks::service` não casa nenhum teste; corrigido na triagem 005).

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
- [ ] Contagem: 10 testes passam — 9 unit em `terminal::meta` (set_title, rename manual vence, activity não toca título, log ordenado, corte em 200, status válido, status inválido lista válidos, status desativado recusado, clear_status) + 1 integration em `tests/terminal_meta.rs` (corrigido na triagem 005 — a contagem antiga, 8, não batia com nenhuma leitura real)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test --lib terminal::meta` → 9 passam (unit); `cargo test --test terminal_meta` → 1 passa (integration). Total 10.

**Commit**: `feat(terminal): title, activity and status services`

---

### T5: `IpcServer`  — Verify real pendente de T9

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
- [ ] Contagem: 16 testes passam — 1 unit (`ipc::` em `src/ipc/server.rs`) + 15 integration em `tests/ipc_server.rs` (conecta, roteia create, terminal morto recusado, terminal inexistente recusado, evento emitido, cliente desconecta sem derrubar servidor, e mais — corrigido na triagem 005; a contagem antiga, 6, e a tabela de status, 7, não batiam com a suíte real)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test --lib ipc::` → 1 passa (unit); `cargo test --test ipc_server` → 15 passam (integration). Total 16. Teste com terminal falso deve provar a recusa.

> ✅ **NEEDS-DECISION resolvida na triagem 005 (02/08/2026).** Achado do auditor: todos os testes acima passam contra um `IpcServer` instanciado dentro do próprio teste. `IpcServer::for_app(...).serve()` **nunca é chamado em `src-tauri/src/lib.rs`** — o app real, hoje, não abre o socket/pipe; em uso real o sidecar tentaria conectar e `check_active` sempre devolveria `false`. O usuário escolheu criar uma task nova — ver **T9** ("Iniciar o `IpcServer` no app real", logo após T8 neste arquivo). O `Verify` real de T5 fica pendente dela.

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
- [ ] Contagem (aproximada, ver nota acima da tabela de status): ~11 testes cobrindo `client::tests::*` e o handshake — `cargo test -p swarmdeck-mcp` roda o crate inteiro (16, T6+T7 juntos), não isola T6 sozinho

**Tests**: integration · **Gate**: full

**Verify**: `cargo test -p swarmdeck-mcp client::` → cobre a maior parte de T6. Rodar o binário com e sem a env var. `cargo test -p swarmdeck-mcp` (16 no total) prova T6+T7 juntos.

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
- [ ] Contagem (aproximada, ver nota acima da tabela de status): `cargo test -p swarmdeck-mcp tools` → 4 passam (round-trip create/start/complete, set_status, set_title, erro propagado); mais o teste `todas_as_16_ferramentas_do_contrato_estao_registradas` fora do módulo `tools` — real é 4, não 7 como o texto antigo dizia

**Tests**: integration · **Gate**: full

**Verify**: `cargo test -p swarmdeck-mcp tools` → 4 passam (corrigido na triagem 005 — o número antigo, 7, não batia com o filtro documentado). Ciclo completo criar→iniciar→concluir→concluir pela interface MCP.

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

### T9: Iniciar o `IpcServer` no app real

> **Criada na triagem 005 (02/08/2026), decisão do usuário.** Resolve o `⛔ NEEDS-DECISION` aberto na mesma triagem em T5: `IpcServer::for_app(...).serve()` nunca é chamado em `src-tauri/src/lib.rs`, então o app real não abre o socket/pipe que o sidecar `swarmdeck-mcp` precisa para conectar — todo o round-trip de T5/T6/T7 só foi provado contra um `IpcServer` instanciado dentro do próprio teste. O usuário escolheu "criar task nova" entre as opções levantadas (a alternativa era reabrir T5). **O código já antecipa esta task**: o doc-comment de `IpcServer::for_app` em `src-tauri/src/ipc/server.rs:210-214` diz literalmente "wiring `IpcServer` into `run()`'s `setup` is out of this task's authorized file list — `lib.rs` isn't in it, but this is what that wiring will look like once a later task does it" — esta é essa task.

**O quê**: Chamar `IpcServer::for_app(...)` dentro do `.setup()` de `run()` (`src-tauri/src/lib.rs`), montando o transporte real (`LocalSocketTransport::bind`, `ipc::transport::socket_path`), e rodar `serve()` numa thread dedicada (mesmo padrão de `terminal::session`, um thread por servidor de longa duração) — não bloquear o `.setup()`, que precisa retornar para o app terminar de subir.
**Onde**: `src-tauri/src/lib.rs`
**Depende de**: T5, T6 (precisa do `IpcServer` e de saber contra qual nome de pipe/socket o sidecar vai tentar conectar)
**Reusa**: `IpcServer::for_app` (T5, já pronto para isso), `LocalSocketTransport::bind`, `ipc::transport::socket_path` (T5), `TerminalManager` e `Db` já geridos por `app.manage(...)` no mesmo `.setup()`
**Requisito**: MCP-01 (fecha a lacuna de produção — nenhum requisito novo, o handshake já está especificado)

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `run()` chama `IpcServer::for_app(...)` com o transporte real e o `AppHandle`
- [ ] `serve()` roda numa thread separada, sem bloquear a inicialização do app
- [ ] Falha ao abrir o socket/pipe (nome já em uso, permissão negada) é logada, não derruba o app
- [ ] Com o app rodando de verdade, o sidecar `swarmdeck-mcp` consegue conectar e `check_active` retorna `true` — isto é o `Verify`, não um teste automatizado (mesma natureza do `Verify` que T5/T6/T7 já não conseguiam cobrir sozinhos)
- [ ] Gate passa: `cargo build`
- [ ] `TerminalMetaService` — se `IpcServer::for_app` também exige uma instância dela — é gerida por `app.manage(...)` do mesmo jeito que `Db`/`TerminalManager`, não recriada a cada conexão

**Tests**: none *(fiação de inicialização — a lógica de roteamento já é testada em T5/T6/T7; ver `codebase/TESTING.md`)* · **Gate**: build

**Verify**: `uat-agent` — subir o app (`npm run tauri dev` ou o binário), rodar o sidecar `swarmdeck-mcp` apontando para o mesmo nome de socket/pipe, chamar `check_active` pela interface MCP e confirmar `true` + `terminal_id` de um terminal real aberto no app. Isto é o primeiro teste ponta-a-ponta de dois processos reais (app + sidecar) deste projeto — até aqui, só `tokio::io::duplex`/sockets de teste tinham sido exercitados (ver `JOURNAL.md` da run 004, seção "Não verificado").

**Commit**: `feat(ipc): start IpcServer inside the running app`

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
