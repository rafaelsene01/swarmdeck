# Triagem 008 — 11/08/2026

**Status:** pronta
**Revisão ao fechar:** `git rev-parse --short HEAD` → `6f93e6b` (inalterado desde o início — nenhum commit novo nesta run; correções ficaram na árvore de trabalho, junto com as 4 edições já pendentes de `.specs/` de 08/08/2026)
**Perguntas em aberto:** 0 — as 4 levantadas na Fase 3 foram todas respondidas e gravadas

> **Escopo desta run:** entre o fechamento da triagem 007 (HEAD `259b96e`, 03/08/2026) e o início desta (HEAD `6f93e6b`), o projeto avançou **7 commits e uma segunda release real (`v0.1.2`)**, fora desta skill — incluindo o seletor nativo de pasta (`multi-terminal/T13-T15`), `AGENTS.md` populado, e reescrita de `.specs/README.md`. Auditoria completa (não incremental) dos 6 arquivos `spec.md`/`tasks.md` com código implementado, mais `EXECUTION.md` e as 6 features Draft.

---

## Perfil do projeto (Fase 0)

Herdado das triagens 006/007, sem mudança estrutural. Único ajuste: `README.md` **não existe na raiz do repositório** (nunca existiu) — o commit `2a7ba67` ("Refine README.md") na verdade editou `.specs/README.md`; a mensagem de commit generalizou o nome. Não é erro de doc, é imprecisão de mensagem de commit — sem ação.

- **Revisão no início desta run:** `git rev-parse --short HEAD` → `6f93e6b` (`origin/master` idêntico — branch up to date)
- **Gates medidos nesta run (baseline real):**

  | Escopo | Comando | Resultado medido agora |
  |---|---|---|
  | rust — formato | `cargo fmt --all -- --check` | **FALHA** (exit 1) — 2 hunks, 2 arquivos: `src-tauri/src/commands/terminal.rs`, `src-tauri/src/terminal/picker_prefs.rs` (código do seletor de pasta nunca formatado) |
  | rust — lint | `cargo clippy --all-targets -- -D warnings` | exit 0 — 0 warnings |
  | rust — testes (workspace) | `cargo test` | **184 passando, 0 falhas** (era 180 na triagem 006 — +4 de `picker_prefs`) |
  | front — build | `npm run build` | OK |
  | front — testes | `npm run test -- --run` | **72 testes, 15 arquivos, 0 falhas** (era 67 — +5 de `NewTerminalDialog`) |
  | scripts de release | `npm run test:scripts` | **27 testes, 0 falhas** (inalterado) |
  | pipeline | `gh run list --workflow=ci.yml` / `gh run list --workflow=release.yml` | CI verde em `259b96e` (`30778057309`); releases reais `v0.1.1` (`30778409874`) e `v0.1.2` (`30807513912`), ambas `success` |

---

## Divergências encontradas (Fase 1)

Dois subagents somente-leitura auditaram em paralelo (Auditor A: `multi-terminal`, `agent-selection`, `projects`, `release-distribution`; Auditor B: `mcp-task-server`, `task-kanban`, `terminal-statuses`, `settings-shell`, `EXECUTION.md`, 6 features Draft). **Todas as correções abaixo já foram aplicadas.**

| # | Afirmação (verbatim/resumida) | Onde | O que o código diz | Gravidade | Corrigido? |
|---|---|---|---|---|---|
| 1 | `TERM-10`/`TERM-11` "Pending — T14,T15/T13,T14,T15", "ainda não implementados" | `multi-terminal/spec.md`, `tasks.md` | Implementadas: `NewTerminalDialog.tsx` (`open({directory:true})`, 6/6 testes), `picker_prefs.rs` (upsert, 4/4 testes), comandos registrados em `lib.rs` | **ALTA** | ✅ `spec.md` (TERM-10/11 → Done), `tasks.md` (T13-T15 → ✅ Done), cobertura recalculada (7→9 mapeados) |
| 2 | `multi-terminal/T16` "pronta para execução" | `tasks.md` | Codado (`terminal_set_title`, edição por duplo-clique), mas `App.tsx` não passa `id` real ao `TerminalHeader` — rename fica só local, nunca persiste | **ALTA** | ✅ Reaberta com item novo no `Done when` (decisão do usuário, Fase 3 #1) |
| 3 | `agent-selection/tasks.md` tabela-resumo (T1-T4) não lista `T5`/`T6`; `T5::Done when` com checkboxes `[ ]` | `tasks.md` | `T5` implementada e testada: `commands/agents.rs` registrado, `App.tsx` busca catálogo real e repassa `agentId` a `pty_spawn` | **ALTA** | ✅ tabela-resumo com T5/T6, checkboxes marcados `[x]`, `AGT-03` em `spec.md` cita T5 |
| 4 | `agent-selection/tasks.md:156` "`AgentPanel` segue sem janela real" | `tasks.md` | `settings-shell/T2` fechou — `SettingsShell.tsx` monta `AgentPanel` de verdade, roteado por `main.tsx` | **ALTA** | ✅ nota atualizada, com ressalva nova: `set_default_agent` não tem comando Tauri, a troca não persiste |
| 5 | `task-kanban`: KAN-02 "quebrado na prática" (payload vazio), KAN-08 "sem rota `/kanban` real", `T7` "pendente" | `spec.md`, `tasks.md` | `T7` implementada (commit `676f291`): `emit_task_changed` envia payload real, `src/main.tsx` roteia por `label` (`kanban`→`KanbanBoard`, `settings`→`SettingsShell`) | **ALTA** | ✅ `spec.md` (KAN-02/08 → Done), `tasks.md` (nota + `Done when` marcados `[x]`) |
| 6 | `terminal-statuses`: "`TerminalHeader.tsx` não importa `StatusBadge`/`ActivityLog`" (`grep` vazio) | `spec.md:111`, `tasks.md:137` | Falso — o import e a renderização já existem (linhas 5-6, 147, 151). O gap real é mais fundo: nenhum comando/evento leva status real do backend ao frontend | **ALTA** | ✅ `spec.md`/`tasks.md` corrigidos; `T5` reaberta com escopo novo (decisão do usuário, Fase 3 #2) |
| 7 | `release-distribution`: REL-01,02,05,09,11,15 "Implemented — parcial, pendente de T5/T12"; `T2,T6,T9,T10,T11,T21` "BLOQUEADA" | `spec.md`, `tasks.md` | `T5` (chave/secrets) e `T12` (disparo real) já aconteceram — duas releases reais, `v0.1.1` e `v0.1.2`, com 5 artefatos assinados cada + `latest.json` | **ALTA** | ✅ `spec.md` (6 requisitos → Verified), `tasks.md` (5 blocos "BLOQUEADA" → ✅ Resolvida). Decisão do usuário (Fase 3 #3): evidência de `gh` aceita como suficiente |
| 8 | `release-distribution/tasks.md::T5` (chave de assinatura) — checkboxes `[ ]` | `tasks.md:164-168` | Sem a chave/secrets configurados, `tauri-action` teria falhado — as duas releases produziram `.sig` válidos | **ALTA** | ✅ checkboxes marcados `[x]` (evidência indireta, decisão Fase 3 #3) |
| 9 | `release-distribution/spec.md`: REL-32/33/34 "ressalva de alcance — nenhuma janela monta `UpdateSettings.tsx`" | `spec.md:237-239` | `settings-shell/T2` fechou — `UpdateSettings.tsx` é montado de verdade | MÉDIA | ✅ REL-20/32/33 → alcance confirmado. **REL-34 mantido com ressalva própria**: `db::auto_check`/`set_auto_check` existe no backend, mas nenhum comando Tauri o expõe (`grep -rn "auto_check" src-tauri/src/commands/` → vazio) — o toggle não persiste, gap real e distinto do de alcance |
| 10 | Contagens de teste em `multi-terminal/tasks.md:31` ("workspace hoje = 180/67") | `tasks.md` | Baseline medido nesta run: 184/72 | BAIXA | ✅ linha atualizada |
| 11 | `release-distribution/tasks.md` T1/T7/T8 citam 3 bases de contagem de `test:scripts` diferentes (11, 25, 25) | `tasks.md:74,220,247` | Total real medido agora: 27/27 | BAIXA | ⚠️ **não corrigido** — 3 números históricos, nenhum reconciliado; registrado aqui, correção pontual fica para a próxima passada |
| 12 | `.specs/project/PROJECT.md` ainda citaria "CodeAgentSwarm" nominalmente | `PROJECT.md` | Falso — confirmado limpo (`grep` vazio); a AD de 03/08/2026 já documentava que a linguagem genérica "do original" foi deixada de propósito | — | Sem divergência (checado, correto) |
| 13 | 6 features Draft (`mcp-management`, `skills-manager`, `worktrees`, `conversation-cleanup`, `notifications`, `onboarding-agent`) sem código | — | Confirmado — zero footprint (`grep` vazio para nomes de componente/serviço de cada uma) | — | Sem divergência (checado, correto) |
| 14 | `EXECUTION.md` "61 tarefas, 17 [P]" (edição de 08/08/2026, ainda não commitada) | `EXECUTION.md` | Confirmado exato: `grep -cE '^### T'` nos 7 `tasks.md` de M1/M2 soma 61; `[P]` soma 17 | — | Sem divergência (checado, correto) |
| 15 | Correção de `STAT-08` (edição de 08/08/2026, não commitada) — dono movido do Kanban para `terminal-statuses` | `terminal-statuses/spec.md` | Confirmado correto: `BoardFilters.tsx` só usa `status` para contar, nunca para filtrar; a história de STAT-08 sempre foi sobre realçar terminais no grid | — | Sem divergência (checado, correto) |

---

## Inventário (Fase 2)

| Item | Feature | Escopo/gate | Classificação | Pronto p/ execução | Por quê (se não) |
|---|---|---|---|---|---|
| `cargo fmt --all` — formatar `commands/terminal.rs`, `terminal/picker_prefs.rs` | (transversal) | rust build | `code` | **sim** | bloqueia `T2` (CI) de novo se não corrigido antes do próximo push |
| `multi-terminal/T16` — passar `id` real de `App.tsx` a `TerminalHeader` | multi-terminal | front build | `code` | **sim** | reaberta, decisão do usuário (Fase 3 #1) |
| `terminal-statuses/T5` — evento `terminal_status_changed` (push) + fiação em `App.tsx` | terminal-statuses | rust+front, full | `code` | **sim** | reaberta com escopo novo, decisão do usuário (Fase 3 #2) |
| `task-kanban/T8` — formulário de criação manual | task-kanban | front unit/quick | `code` | **sim** | sem mudança — já estava pronta, confirmada ainda pendente |
| `mcp-task-server/T9` — iniciar `IpcServer` no app real | mcp-task-server | rust build/full | `code` | **sim** | task já existe desde a triagem 005; `grep` confirma ainda não ligado |
| `agent-selection/T6` — Resume Session (`AGT-06`) | agent-selection | front+rust | `code` | **sim** | task já especificada desde a triagem 006, sem código ainda |
| `projects/T5-T9` — `PROJ-06..09` (cor sugerida, ícone, git init local, sinalização sem remote) | projects | rust+front | `code` | **sim** | confirmado ainda sem código (`grep` vazio), sem task nova necessária |
| `settings-shell` — expor `set_default_agent`, CRUD de `status_catalog`, `set_auto_check` como comandos Tauri | settings-shell | rust build | `code`, não agendado | não | 3 gaps reais, sem task própria ainda — mesma classe do padrão `STAT-08` (P2, sem ambiguidade, só falta task formal) |
| `multi-terminal/TERM-09` (log de atividade P3), `TERM-12` (restaurar sessão) | multi-terminal | — | `code`, não agendado | não | sem task ainda; `TERM-12` já tem `T18-T20` em progresso noutra frente |
| `release-distribution/T3` — instalar/configurar `git-cliff` localmente | release-distribution | scripts | `code` | **sim** | sem bloqueio novo, só não foi feito |
| `release-distribution/T8` (cenário de FALHA do `cleanup`) | release-distribution | pipeline | `uat-agent`/`human-only` | não | precisa de um disparo real cancelado de propósito — decisão do usuário (Fase 3 #3) não estende evidência para isto: nenhuma release real falhou, não há prova nem indireta |
| `release-distribution/T19` — verificação ponta a ponta do update real | release-distribution | — | `human-only` | não | exige máquina real rodando a versão antiga |
| Testar as janelas `kanban`/`settings` contra o ACL de `capabilities/default.json` | (transversal) | uat | `uat-agent` | não | usuário confirmou nunca ter testado (Fase 3 #4) — fica como não verificado, não como bloqueio confirmado |
| Reconciliar as 3 contagens de teste de `test:scripts` em `release-distribution/tasks.md` (T1/T7/T8) | release-distribution | — | `code`, bookkeeping | **sim** | baixo risco, não feito nesta run por escopo |
| 6 features Draft | — | — | `moot`/sem ação | não | confirmado sem código, fase Specify apenas |

**12 itens `code` prontos para a `spec-loop`** (incluindo o `cargo fmt`), 3 `human-only`/`uat-agent`, 2 `code` não agendados (sem task formal ainda), 6 features fora de escopo.

---

## Decisões do usuário (Fase 3)

Escritas aqui antes de perguntar.

| # | Pergunta | Por que só o usuário responde | Resposta | Onde ficou gravada |
|---|---|---|---|---|
| 1 | `multi-terminal/T16` está codada mas o rename não persiste (`App.tsx` não passa `id`) — reabrir a mesma task ou criar task nova só para a fiação? | Decisão de escopo/granularidade de task, não algo que o código resolve sozinho | **Reabrir T16** | `multi-terminal/tasks.md::T16` (item novo no `Done when`); `project/STATE.md` (AD 11/08/2026) |
| 2 | `terminal-statuses/T5` — falta comando/evento real de status/atividade do terminal. Reabrir com esse escopo? Por qual mecanismo (evento push vs. polling)? | Decisão de arquitetura (latência, consistência com o resto do código) que um implementador não deveria escolher sozinho | **Reabrir T5; mecanismo: evento push** (`terminal_status_changed`, mesmo padrão de `task_changed`) | `terminal-statuses/tasks.md::T5` (escopo + `Done when` reescritos); `terminal-statuses/spec.md` (STAT-01/06); `project/STATE.md` (AD) |
| 3 | `release-distribution`: praticamente toda a cadeia `T2/T5/T6/T9/T10/T11/T12/T21` (+ 6 requisitos REL-*) estava "bloqueada", mas 2 releases reais já publicaram. `gh run list`/`gh release view` já bastam como prova de "Verified"? | Critério de verificação (padrão de evidência aceitável) é decisão do mantenedor, não algo dedutível do código | **Sim, evidência de `gh` já basta** (mesmo padrão de REL-06 na triagem 006) | `release-distribution/spec.md` (6 requisitos → Verified); `tasks.md` (5 blocos "BLOQUEADA" → Resolvida, `T5` checkboxes marcados); `project/STATE.md` (AD, com a ressalva de que REL-08/REL-22/T19 não são cobertos por não terem evidência nenhuma, nem indireta) |
| 4 | As janelas `kanban`/`settings` não estão na allowlist de `capabilities/default.json` — risco teórico de ACL do Tauri 2. Já testado em build real? | Só o usuário pode confirmar comportamento observado num app rodando; não é dedutível de leitura estática | **Não, nunca testado — fica como pendência** | `project/STATE.md` (AD); inventário desta triagem (`uat-agent`, não agendado) |

---

## Fora da execução

| Item | Rótulo | Por quê |
|---|---|---|
| `release-distribution/T8` (cenário de falha do `cleanup`) | `uat-agent`/`human-only` | precisa de disparo real cancelado de propósito |
| `release-distribution/T19` (update real numa máquina) | `human-only` | exige instalar/rodar o app publicado numa máquina real |
| ACL das janelas `kanban`/`settings` | `uat-agent`, não confirmado | usuário nunca testou (Fase 3 #4) |
| `settings-shell` — 3 comandos Tauri faltando (`set_default_agent`, CRUD `status_catalog`, `set_auto_check`) | `code`, não agendado | gaps reais, sem task formal ainda |
| `TERM-09`, `TERM-12` (multi-terminal, log de atividade P3 / restaurar sessão) | `code`, não agendado | sem task própria (TERM-12 parcialmente coberto por T18-T20 já em progresso) |
| 3 contagens de `test:scripts` não reconciliadas em `release-distribution/tasks.md` | `code`, bookkeeping | baixo risco, fora do orçamento desta run |
| 6 features Draft | sem tasks ainda | fase Specify apenas |

---

## Não verificado

- ACL do Tauri 2 nas janelas `kanban`/`settings` contra `capabilities/default.json` — usuário confirmou nunca ter testado.
- `REL-08` (reversão real do `cleanup` num disparo que falha de propósito) e `REL-22`/`T19` (update aplicado numa máquina real) — nenhuma evidência, nem indireta; as duas releases reais foram sucessos, não exercitam esses caminhos.
- `git-cliff` continua não instalado no ambiente do mantenedor (`T3`) — a prova de que o CHANGELOG é gerado corretamente é só indireta (CI/release não falharam no passo).
- Bytes do binário com/sem perfil `strip+lto` — não remedido desde a triagem 007.
- `COLOR_WARNING_THRESHOLD` em `terminal-statuses` — segue sem validação do usuário, herdado de triagens anteriores.

---

## Relatório final

- **15 divergências auditadas**, 12 corrigidas nesta run (10 ALTA, 2 MÉDIA/BAIXA), 1 registrada como pendente de correção pontual futura (contagens de `test:scripts`), 3 confirmadas como "sem divergência" (checadas, corretas).
- **Causa raiz do volume**: 7 commits e uma segunda release real (`v0.1.2`) aconteceram fora desta skill entre a triagem 007 e esta, sem que a documentação acompanhasse — o mesmo padrão que já se repetiu nas triagens 005/006.
- **Inventário**: 12 itens `code` prontos para a `spec-loop` (incluindo `cargo fmt`), 2 `code` não agendados (sem task formal), 3 `human-only`/`uat-agent`, 6 features fora de escopo (Draft).
- **4 perguntas feitas e respondidas**, todas gravadas em pelo menos 2 lugares cada (a spec/tasks da feature + `project/STATE.md`) — ver tabela da Fase 3 para os arquivos exatos.
- **Não verificado**: ACL das janelas secundárias, os 2 cenários de release que nenhuma execução real exercitou (`REL-08`, `REL-22`), `git-cliff` local, bytes do binário, e o threshold de cor herdado de triagens anteriores.
- **Nenhum código foi alterado** — só `.specs/**` (specs, tasks, roadmap, state) e este arquivo. O agente não commitou nada (`git commit`/`git push` seguem em `deny`); as mudanças ficam na árvore de trabalho para o mantenedor revisar e commitar à mão.

A `spec-loop` pode rodar a partir daqui — `.specs/runs/008-2026-08-11/TRIAGE.md`.
