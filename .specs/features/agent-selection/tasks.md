# Seleção de agente — Tasks

**Spec**: `.specs/features/agent-selection/spec.md` (sem design — feature pequena, design inline)
**Testing**: `.specs/codebase/TESTING.md`
**Status**: Done (T1–T4 implementadas na run `spec-loop` 004, 01/08/2026 — `.specs/runs/004-2026-08-01/JOURNAL.md`)
**Milestone**: M1

---

## Plano de execução

```
multi-terminal/T5 → T1 → T2 → ┬→ T3 [P]
                              └→ T4 [P]
```

| Tarefa | Status | Testes entregues |
|---|---|---|
| T1 Catálogo de agentes e detecção no PATH | ✅ Done | 5 unit (plano: 5) |
| T2 Lançamento do agente na sessão | ✅ Done | 6 integration (plano: 5, +1 ponta-a-ponta) |
| T3 Preferência de agente padrão | ✅ Done | 4 integration (plano: 4) |
| T4 UI de seleção de agente | ✅ Done | 4 unit (plano: 4) |
| T5 Expor catálogo ao frontend + usar agente escolhido | ✅ Done, confirmado na triagem 008 (11/08/2026) — `commands/agents.rs` existe e registrado, `App.tsx` busca catálogo real e repassa `agentId` a `pty_spawn` | — (fiação, gate build) |
| T6 Resume Session | Pending — sem código (`AGT-06`) | — |

**Desvios registrados:** nomes de comando `antigravity`/`kimi` (T1) inferidos por convenção, sem confirmação de instalação real — catálogo estático, fácil de corrigir depois. Ver `JOURNAL.md` da run 004 para o detalhe de cada task.

---

## Tarefas

### T1: Catálogo de agentes e detecção no PATH

**O quê**: Catálogo estático dos 5 agentes (id, nome, fornecedor, comando, flag de beta) e função que verifica se cada CLI existe no PATH.
**Onde**: `src-tauri/src/agents/catalog.rs`
**Depende de**: `multi-terminal/T5`
**Reusa**: nenhum
**Requisito**: AGT-01, AGT-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Catálogo com Claude Code, Codex CLI, Antigravity CLI, opencode e Kimi Code (este com `beta: true`)
- [ ] `detect_installed()` devolve, para cada agente, se o comando resolve no PATH
- [ ] Detecção usa a resolução do SO, respeitando `PATHEXT` no Windows
- [ ] Ausência de um CLI **nunca** é erro — é um campo do resultado
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 5 testes passam (catálogo completo, flag beta, detecta existente, detecta ausente, PATHEXT no Windows)

**Tests**: unit · **Gate**: quick

**Verify**: `cargo test agents::catalog` → 5 passam.

**Commit**: `feat(agents): agent catalog with PATH detection`

---

### T2: Lançamento do agente na sessão

**O quê**: Estender `SessionConfig` para lançar o CLI do agente escolhido, com fallback para shell puro.
**Onde**: `src-tauri/src/terminal/manager.rs` (modifica), `src-tauri/src/agents/launch.rs`
**Depende de**: T1
**Reusa**: `TerminalManager` (multi-terminal/T5), catálogo (T1)
**Requisito**: AGT-03, AGT-04

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Sessão com agente lança o CLI correspondente no `cwd` escolhido
- [ ] Sessão sem agente lança o shell puro
- [ ] CLI ausente no PATH → **abre com shell puro** e devolve o aviso, sem falhar o spawn
- [ ] Trocar o agente padrão não afeta sessões já abertas
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 6 testes passam (4 unit em `agents::launch` + 2 integration em `tests/agent_launch.rs`, ponta-a-ponta — corrigido na triagem 005; a versão anterior contava 5 e citava um comando que só cobre os 4 unit)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test -p swarmdeck agents::launch` → 4 passam (unit); `cargo test -p swarmdeck --test agent_launch` → 2 passam (integration). Total 6.

**Commit**: `feat(agents): launch selected agent CLI in session`

---

### T3: Preferência de agente padrão [P]

**O quê**: Persistir e ler o agente padrão, pré-selecionado em toda sessão nova.
**Onde**: `src-tauri/src/agents/prefs.rs`, migração `004_agent_prefs.sql` (o arquivo real é `004`, não `003` — `003` já estava ocupado por `mcp-task-server/T1`; mesmo padrão de desvio de numeração, corrigido na triagem 005)
**Depende de**: T2
**Reusa**: camada de banco
**Requisito**: AGT-01

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Padrão persiste entre reinícios
- [ ] Sem preferência gravada, usa o primeiro agente instalado
- [ ] Agente padrão removido do sistema → cai para o primeiro disponível e avisa
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 4 testes passam (grava, lê, sem preferência usa primeiro instalado, padrão sumido cai e avisa)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test agents::prefs` → 4 passam.

**Commit**: `feat(agents): default agent preference`

---

### T4: UI de seleção de agente [P]

**O quê**: Cards selecionáveis nas configurações e seletor no fluxo de novo terminal.
**Onde**: `src/routes/settings/AgentPanel.tsx`, `src/components/terminal/NewTerminalDialog.tsx`
**Depende de**: T2
**Reusa**: contrato do catálogo (T1)
**Requisito**: AGT-01, AGT-03, AGT-04

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Cards mostram nome, fornecedor e selo de beta quando aplicável
- [ ] Card de agente não instalado é marcado, com explicação
- [ ] Diálogo de novo terminal pré-seleciona o padrão e permite sobrescrever só naquela sessão
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 4 testes passam (renderiza catálogo, selo de beta, marca não instalado — 3 em `AgentPanel.test.tsx`; sobrescrita não altera o padrão — 1 em `NewTerminalDialog.test.tsx`, não em `AgentPanel.test.tsx` como o `Verify` original sugeria) — esclarecido na triagem 006: `npm run test AgentPanel` sozinho mostra só 3

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test AgentPanel` → 3 passam; `npm run test NewTerminalDialog` → 1 passa (o 4º teste). Texto original dizia "4 passam" só com o filtro `AgentPanel` — corrigido na triagem 006.

**Commit**: `feat(ui): agent selection panel and new terminal dialog`

---

### T5: Expor o catálogo de agentes ao frontend e usar o agente escolhido de verdade (nova, triagem 006)

**O quê**: Dois gaps reais achados na auditoria desta triagem, independentes da questão de onde a UI de configurações vai morar (ver `⛔ NEEDS-DECISION` abaixo — essa parte fica de fora desta task): (1) nenhum comando Tauri expõe `agents::catalog`/`detect_installed`/`prefs::resolve_effective_default` ao frontend — `App.tsx` hoje passa `agents={[]}`, `installedIds={new Set()}`, `defaultAgentId={null}` fixos ao `NewTerminalDialog`, então a pré-seleção do padrão (AGT-01) e a marcação de "não instalado" (AGT-04) nunca acontecem de verdade; (2) mesmo quando o usuário troca o agente no diálogo, `App.tsx::handleCreate` descarta a escolha (`_agentId`, parâmetro nunca repassado) — a sobrescrita por sessão (AGT-03) não chega ao `pty_spawn`, que já aceita um campo `agent` (`commands/terminal.rs::pty_spawn`).
**Onde**: `src-tauri/src/commands/agents.rs` (novo — `agent_catalog`, `agent_default` ou equivalente, invólucros finos sobre `agents::catalog`/`agents::prefs`), `src-tauri/src/lib.rs` (registra os comandos novos no `invoke_handler!`), `src/App.tsx` (busca o catálogo real no mount, repassa `agentId` de `handleCreate` para `pty_spawn`)
**Depende de**: nenhuma (não depende da UI de Settings existir — só do diálogo de novo terminal, que já está montado)
**Reusa**: `agents::catalog::detect_installed`, `agents::prefs::resolve_effective_default` (T1-T3, já existem e testados), `pty_spawn` (multi-terminal/T6, já aceita `agent: Option<String>`)
**Requisito**: AGT-01, AGT-03, AGT-04

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when** *(confirmado ✅ na triagem 008, 11/08/2026 — código real lido, gate verde)*:
- [x] `App.tsx` busca o catálogo real e o padrão efetivo no mount, e passa isso ao `NewTerminalDialog` em vez de `[]`/`null` fixos
- [x] `handleCreate` repassa o `agentId` escolhido para `pty_spawn`
- [x] Terminal criado com um agente específico realmente inicia esse agente (não só o shell puro)
- [x] Gate passa: `cargo build && npm run build`

**Tests**: none *(fiação — a lógica de catálogo/preferência já é testada em T1/T3; comandos são invólucro fino)* · **Gate**: build

**Verify**: `uat-agent` — abrir "novo terminal", confirmar que a lista de agentes reflete o catálogo real (não vazia) e que o padrão vem pré-selecionado; trocar para outro agente instalado e confirmar que o terminal criado roda esse agente, não o shell puro.

**Commit**: `feat(agents): expose catalog to frontend and honor chosen agent on spawn`

---

> ✅ **Resolvida na triagem 006 (03/08/2026, decisão do usuário).** `AgentPanel.tsx` (T4) segue sem janela real, mas a decisão foi: cria-se uma feature nova, `settings-shell`, dona do container — não entra dentro desta feature. `T5` (acima) resolve a sobrescrita por sessão via `NewTerminalDialog`, que já está na tela, independente disso.
>
> **Atualizado na triagem 008 (11/08/2026): `settings-shell/T2` já fechou** — `AgentPanel` está montado de verdade na janela `settings` (`SettingsShell.tsx`, roteada por `main.tsx`). O `Verify` de `AGT-04` (identificação visual do agente padrão) já é confirmável num app real. **Ressalva nova**: `AgentPanel` continua sem persistir a troca de agente padrão — nenhum comando Tauri expõe `agents::prefs::set_default_agent` ao frontend (`grep -rn "set_default_agent" src-tauri/src/commands/` → vazio); mudar o padrão na UI não sobrevive a um restart. Sem task própria ainda.

---

### T6: Resumir ou iniciar nova sessão do agente (nova, sessão de 03/08/2026)

**O quê**: Implementa AGT-06 — persistir o identificador da última sessão (conversa) de cada par projeto+agente, oferecer "Resume Session"/"New Session" na tela de agente, e lançar o CLI com a flag/mecanismo de retomada equivalente a `--resume` quando o usuário escolhe retomar.
**Onde**: `src-tauri/src/agents/session.rs` (novo — persistência do último `session_id`/`conversation_id` por `(project_id, agent_id)`), migração nova (número a confirmar), `src-tauri/src/agents/launch.rs` (modifica — aceita `resume: bool`), `src/components/terminal/NewTerminalDialog.tsx` (passo AGENT — botões "Resume Session"/"New Session")
**Depende de**: T2 (lançamento do agente), `projects/T1` (projeto precisa existir para ter `project_id`)
**Reusa**: `agents::launch` (T2), catálogo (T1, cada agente precisa de um campo indicando se suporta retomada)
**Requisito**: AGT-06

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Migração cria tabela de sessão por `(project_id, agent_id)` guardando o identificador necessário para retomar
- [ ] Depois de uma sessão nova, o par projeto+agente passa a ter uma sessão retomável
- [ ] "Resume Session" só aparece habilitado quando existe sessão anterior **e** o agente escolhido suporta retomada
- [ ] Escolher "Resume Session" lança o CLI com a flag de retomada (ex.: `--resume`) apontando para a sessão persistida
- [ ] Escolher "New Session" lança normalmente (AGT-03) e a sessão resultante vira a nova candidata de retomada
- [ ] Retomada que falha cai para "New Session" automaticamente e avisa (ver Casos de borda da spec)
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 6 testes passam (grava sessão nova, sem sessão anterior desabilita Resume, agente sem suporte a resume desabilita Resume, resume lança com flag correta, resume atualiza sessão candidata, falha na retomada cai para New Session)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test agents::session` → 6 passam.

**Commit**: `feat(agents): resume or start new agent session per project`

---

## Check 1 — Granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T1 | 1 catálogo + 1 função | ✅ coeso |
| T2 | 1 comportamento de lançamento | ✅ |
| T3 | 1 preferência + 1 migração | ✅ coeso |
| T4 | 2 componentes irmãos, mesmo fluxo | ✅ coeso |
| T5 | 2 gaps de fiação, mesmo componente | ✅ coeso |
| T6 | 1 migração + 1 comportamento de retomada | ✅ coeso |

## Check 2 — Diagrama × definição

| Tarefa | `Depende de` | Diagrama | Status |
|---|---|---|---|
| T1 | multi-terminal/T5 | raiz da feature | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 [P] | ✅ |
| T4 | T2 | T2→T4 [P] | ✅ |
| T5 | — (nenhuma, gap de fiação) | não diagramada | ⚠️ nota |
| T6 | T2, projects/T1 | não diagramada | ⚠️ nota |

⚠️ T3 tem `Tests: integration`, que **não é parallel-safe** por TESTING.md. O `[P]` vale para o código, mas na execução T3 e T4 não devem rodar suítes ao mesmo tempo — T4 é Vitest e T3 é `cargo test`, suítes distintas sem recurso compartilhado, então o par específico é seguro. **Regra**: T3 nunca em paralelo com outra tarefa `integration` de Rust.

## Check 3 — Co-locação de testes

| Tarefa | Camada criada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T1 | domínio | unit | unit | ✅ |
| T2 | gerência PTY | integration | integration | ✅ |
| T3 | banco/prefs | integration | integration | ✅ |
| T4 | componente React com lógica | unit | unit | ✅ |
| T5 | comandos Tauri (finos) + fiação de App.tsx | none | none | ✅ |
| T6 | banco/sessão | integration | integration | ✅ |

Nenhuma violação.
