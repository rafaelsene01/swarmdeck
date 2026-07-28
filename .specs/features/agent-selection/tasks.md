# Seleção de agente — Tasks

**Spec**: `.specs/features/agent-selection/spec.md` (sem design — feature pequena, design inline)
**Testing**: `.specs/codebase/TESTING.md`
**Status**: Draft
**Milestone**: M1

---

## Plano de execução

```
multi-terminal/T5 → T1 → T2 → ┬→ T3 [P]
                              └→ T4 [P]
```

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
- [ ] Contagem: 5 testes passam (lança agente, shell puro, CLI ausente cai para shell, aviso presente, sessão existente não muda)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test agents::launch` → 5 passam.

**Commit**: `feat(agents): launch selected agent CLI in session`

---

### T3: Preferência de agente padrão [P]

**O quê**: Persistir e ler o agente padrão, pré-selecionado em toda sessão nova.
**Onde**: `src-tauri/src/agents/prefs.rs`, migração `003_agent_prefs.sql`
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
- [ ] Contagem: 4 testes passam (renderiza catálogo, selo de beta, marca não instalado, sobrescrita não altera o padrão)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test AgentPanel` → 4 passam.

**Commit**: `feat(ui): agent selection panel and new terminal dialog`

---

## Check 1 — Granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T1 | 1 catálogo + 1 função | ✅ coeso |
| T2 | 1 comportamento de lançamento | ✅ |
| T3 | 1 preferência + 1 migração | ✅ coeso |
| T4 | 2 componentes irmãos, mesmo fluxo | ✅ coeso |

## Check 2 — Diagrama × definição

| Tarefa | `Depende de` | Diagrama | Status |
|---|---|---|---|
| T1 | multi-terminal/T5 | raiz da feature | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 [P] | ✅ |
| T4 | T2 | T2→T4 [P] | ✅ |

⚠️ T3 tem `Tests: integration`, que **não é parallel-safe** por TESTING.md. O `[P]` vale para o código, mas na execução T3 e T4 não devem rodar suítes ao mesmo tempo — T4 é Vitest e T3 é `cargo test`, suítes distintas sem recurso compartilhado, então o par específico é seguro. **Regra**: T3 nunca em paralelo com outra tarefa `integration` de Rust.

## Check 3 — Co-locação de testes

| Tarefa | Camada criada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T1 | domínio | unit | unit | ✅ |
| T2 | gerência PTY | integration | integration | ✅ |
| T3 | banco/prefs | integration | integration | ✅ |
| T4 | componente React com lógica | unit | unit | ✅ |

Nenhuma violação.
