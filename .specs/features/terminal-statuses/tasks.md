# Status e atividade de terminal — Tasks

**Spec**: `.specs/features/terminal-statuses/spec.md`
**Testing**: `.specs/codebase/TESTING.md`
**Status**: In Progress (liberada na triagem 005, 02/08/2026 — ver `project/STATE.md`)
**Milestone**: M2

> O serviço de domínio já é entregue por `mcp-task-server/T4`. Este arquivo cobre o catálogo editável, o snapshot por sessão e a UI.

**Corrigido na triagem 006 (02/08/2026):** T1-T4 têm código real, testado e passando no gate (`✅ Done no gate`, marcado em cada task abaixo) — a tabela de rastreabilidade da spec dizia "0 mapeados", corrigido em `spec.md`. Mas `StatusBadge`/`ActivityLog` (T4) nunca são importados por `TerminalHeader.tsx` — existem isolados, testados isoladamente, nunca visíveis a um usuário real. `T5` é nova desta triagem para fechar esse gap.

**Corrigido em 08/08/2026:** `STAT-08` estava com o dono errado na tabela de rastreabilidade de `spec.md` (dizia pertencer ao Kanban). É requisito desta feature — `T6`, nova, implementa o que a história sempre descreveu (realçar terminais por status no grid).

---

## Plano de execução

```
mcp-task-server/T4 → T1 → T2 → ┬→ T3 [P]
                               └→ T4 [P] → T5 → T6
```

---

## Tarefas

### T1: CRUD do catálogo de status — ✅ Done no gate (confirmado triagem 006)

**O quê**: Serviço para criar, editar, desativar, reordenar e restaurar os status padrão.
**Onde**: `src-tauri/src/terminal/status_catalog.rs`
**Depende de**: `mcp-task-server/T4`
**Reusa**: tabela `terminal_statuses` (mcp-task-server/T1), camada de banco
**Requisito**: STAT-02, STAT-03

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `create` exige rótulo **e instrução**, e atribui cor não usada
- [ ] `update` permite alterar rótulo, cor e instrução
- [ ] `disable` mantém o registro e o remove do catálogo enviado aos agentes
- [ ] `reorder` persiste `sort_order`
- [ ] `restore_defaults` repõe os 4 originais
- [ ] `delete` de status em uso reporta quantos terminais foram afetados
- [ ] Cores visualmente próximas geram aviso na criação
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 8 testes passam (create, instrução obrigatória, update, disable preserva, reorder, restore, delete conta afetados, aviso de cor próxima)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test status_catalog` → 8 passam.

**Commit**: `feat(terminal): editable status catalog`

---

### T2: Snapshot de catálogo por sessão — ✅ Done no gate (confirmado triagem 006)

**O quê**: Congelar o catálogo no início de cada sessão de agente, para mudanças só valerem na sessão seguinte.
**Onde**: `src-tauri/src/terminal/status_snapshot.rs`
**Depende de**: T1
**Reusa**: catálogo (T1), `TerminalManager`
**Requisito**: STAT-04

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Sessão captura o catálogo ativo no spawn
- [ ] `set_status` valida contra o **snapshot**, não contra o catálogo atual
- [ ] Editar o catálogo durante uma sessão não afeta a sessão em curso
- [ ] Sessão nova enxerga o catálogo atualizado
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 5 testes passam (captura no spawn, valida contra snapshot, edição não afeta sessão viva, nova sessão vê mudança, status removido segue válido na sessão antiga)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test status_snapshot` → 5 passam.

**Commit**: `feat(terminal): per-session status catalog snapshot`

---

### T3: UI do catálogo de status [P] — ✅ Done no gate (confirmado triagem 006)

**O quê**: Painel de configurações com lista reordenável por arrasto, edição inline e restaurar padrões.
**Onde**: `src/routes/settings/StatusesPanel.tsx`
**Depende de**: T2
**Reusa**: contrato do catálogo (T1)
**Requisito**: STAT-02, STAT-03

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Linha mostra rótulo, cor, instrução truncada, toggle, editar e excluir
- [ ] Arrastar reordena e persiste
- [ ] Restaurar padrões pede confirmação
- [ ] Excluir status em uso avisa quantos terminais serão afetados
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 5 testes passam (renderiza catálogo, arrasto reordena, toggle desativa, confirmação de restaurar, aviso de status em uso)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test StatusesPanel` → 5 passam.

**Commit**: `feat(ui): terminal status catalog panel`

---

### T4: Badge, hover de atividade e log [P] — ✅ Done no gate (confirmado triagem 006), ⚠️ não integrado ao header real — ver T5

**O quê**: Exibir o badge no header do terminal, a atividade mais recente no hover e o log cronológico inverso.
**Onde**: `src/components/terminal/StatusBadge.tsx`, `src/components/terminal/ActivityLog.tsx`
**Depende de**: T2
**Reusa**: `TerminalHeader` (multi-terminal/T9)
**Requisito**: STAT-01, STAT-05, STAT-06

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Badge exibe rótulo e cor do status; sem status, **nenhum badge**
- [ ] Rótulo longo truncado, completo no hover
- [ ] Badge permanece visível na barra de terminal minimizado
- [ ] Hover no terminal mostra a atividade mais recente
- [ ] Log lista em ordem cronológica **inversa**, com horário
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 6 testes passam (renderiza badge, ausência sem status, truncamento, visível minimizado, hover mostra atividade, log em ordem inversa)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test StatusBadge ActivityLog` → 6 passam.

**Commit**: `feat(ui): status badge and activity log`

---

### T5: Integrar badge e log ao `TerminalHeader` real (nova, triagem 006)  🔀 FUNDIDA COM `mcp-task-server/T9`

**Fundida na run 008 (12/08/2026), decisão do usuário.** O escopo restante desta task (evento push de status/atividade real) não é executável isolado — depende de `IpcServer` rodando contra um `AppHandle` real, que nunca é iniciado no app (`grep -rn "IpcServer::new\|\.serve(" src-tauri/src` só acha usos em teste), e ligar isso é o escopo represado de `mcp-task-server/T9` (parada desde a run 005 com decisão de arquitetura própria). Como nenhuma das duas funciona sem a outra, o usuário escolheu fundi-las numa task só — não reduzir escopo, não apenas adiar. **A definição completa (Done when, Onde, decisão de arquitetura Arc-wrapping já resolvida) mora agora em `.specs/features/mcp-task-server/tasks.md::T9`. Não duplicar aqui — edite lá.**

**O que ESTA feature ainda documenta aqui** — a parte que já está pronta e não faz parte da fusão (integração do componente, sem dado real ainda):
**Onde**: `src/components/terminal/TerminalHeader.tsx` (já modificado — importa e renderiza `StatusBadge` e o hover/log de `ActivityLog`)
**Reusa**: `StatusBadge`, `ActivityLog` (T4, já existem e testados)
**Requisito**: STAT-01, STAT-06 (cumprimento final depende da task fundida, ver acima)

**Done when** *(componente integrado ✅ — os itens de dado real, antes listados aqui como "Novo", viraram parte do `Done when` de `mcp-task-server/tasks.md::T9`)*:
- [x] `TerminalHeader` renderiza `StatusBadge` quando o terminal tem status definido, nada quando não tem (STAT-01 critério 2)
- [x] Badge permanece visível na barra de terminal minimizado (reconfirma T4, agora no header real)
- [x] Hover no terminal mostra a atividade mais recente (`ActivityLog`)
- [ ] Dado real chegando do backend — **ver `mcp-task-server/tasks.md::T9`**, não marcar aqui até `T9` fechar

**Verify**: cumprido junto com o `Verify` de `mcp-task-server/tasks.md::T9` (parte 2, badge com dado real).

**Commit**: sem commit próprio — a implementação e o commit ficam inteiros em `mcp-task-server/tasks.md::T9`.

---

### T6: Realçar terminais por filtro de status (nova, correção 08/08/2026)

**O quê**: Implementar `STAT-08` ("P2: Status como filtro") como a história sempre descreveu — um controle que, ao escolher um status do catálogo, **realça** os terminais que o exibem e **atenua** os demais no grid; se nenhum terminal tiver aquele status, o sistema **informa** em vez de atenuar tudo. Uma triagem anterior tinha redirecionado este requisito para a UI do Kanban por engano (ver correção em `spec.md`) — este é o requisito certo, na feature certa.
**Onde**: `src/components/terminal/StatusFilter.tsx` (novo — dropdown com os status ativos do catálogo), `src/App.tsx` (monta o controle em `.app-toolbar`, ao lado dos demais botões), `src/components/grid/GridLayout.tsx` (aplica opacidade reduzida ao pane cujo terminal não corresponde ao status filtrado)
**Depende de**: T5 (precisa do badge já integrado ao `TerminalHeader` real para o filtro ter um status visível para comparar)
**Reusa**: catálogo de status (T1), `StatusBadge`/estado de status por terminal (T4/T5)
**Requisito**: STAT-08

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `StatusFilter` lista os status ativos do catálogo (mesma fonte de T1/T3), mais uma opção "Todos" que limpa o filtro
- [ ] Selecionar um status realça os terminais que o têm e atenua os demais (STAT-08 critério 1)
- [ ] Nenhum terminal com o status escolhido → mensagem informativa, não atenuação total (STAT-08 critério 2)
- [ ] Limpar o filtro ("Todos") remove realce/atenuação de todos os terminais
- [ ] Gate passa: `cargo build && npm run test`

**Tests**: unit *(lógica de derivação de realce/atenuação em React, mesmo padrão de `StatusBadge`)* · **Gate**: quick

**Verify**: `npm run test StatusFilter` → todos passam; `uat-agent` confirma visualmente o realce/atenuação no grid real com 2+ terminais em status diferentes.

**Commit**: `feat(ui): highlight terminals by status filter (STAT-08)`

---

## Check 1 — Granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T1 | 1 serviço | ✅ |
| T2 | 1 mecanismo | ✅ |
| T3 | 1 componente | ✅ |
| T4 | 2 componentes irmãos, mesmo header | ✅ coeso |
| T6 | 1 componente + fiação no toolbar e no grid | ✅ coeso |

## Check 2 — Diagrama × definição

| Tarefa | `Depende de` | Diagrama | Status |
|---|---|---|---|
| T1 | mcp-task-server/T4 | raiz da feature | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 [P] | ✅ |
| T4 | T2 | T2→T4 [P] | ✅ |
| T6 | T5 | T5→T6 | ✅ |

T3 e T4 são ambas Vitest (parallel-safe) e não dependem uma da outra. Paralelismo válido.

## Check 3 — Co-locação de testes

| Tarefa | Camada criada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T1 | serviço + banco | integration | integration | ✅ |
| T2 | serviço + banco | integration | integration | ✅ |
| T3 | componente React com lógica | unit | unit | ✅ |
| T4 | componente React com lógica | unit | unit | ✅ |
| T6 | componente React com lógica de derivação | unit | unit | ✅ |

Nenhuma violação. `StatusBadge` tem lógica de truncamento e ausência condicional — não é puramente apresentacional, por isso `unit` e não `none`.
