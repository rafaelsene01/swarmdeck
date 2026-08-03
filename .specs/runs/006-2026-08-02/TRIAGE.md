# Triagem 006 — 02/08/2026

**Status:** pronta
**Revisão ao fechar:** `git rev-parse --short HEAD` → `259b96e` (local; `origin/master` avançou para `5c81ed2`/`v0.1.1` fora desta skill durante a auditoria — ver Divergência #1). `git status --short` ao fechar: 17 arquivos de `.specs/` modificados + `AGENTS.md` + 2 diretórios novos (`.specs/features/settings-shell/`, `.specs/runs/006-2026-08-02/`) — todos produto desta triagem, nada commitado (agente não commita neste repositório).
**Perguntas em aberto:** 0 — as 3 levantadas na Fase 3 foram todas respondidas e gravadas (ver tabela abaixo)

> Sessão anterior (mesmo dia, antes desta triagem) rodou `tlc-spec-driven` para especificar o seletor nativo de pasta ao criar terminal (`TERM-10`, `TERM-11` em `multi-terminal/spec.md`, tasks `T13-T15`). Essas mudanças estão na árvore de trabalho, **não commitadas** (ver `git status` abaixo) — fazem parte do estado auditado nesta triagem.

---

## Perfil do projeto (Fase 0)

- **Conjunto de specs:** `.specs/` — estado: `project/STATE.md` | roadmap: `project/ROADMAP.md` | ordem/dependências: `project/EXECUTION.md` | codebase: `codebase/TESTING.md` (único arquivo na pasta `codebase/`) | índice: `README.md` | pesquisa/observação de UI: `research/UI-INVENTORY.md` + screenshots
- **Features com `spec.md`:** 14 — `agent-selection, conversation-cleanup, mcp-management, mcp-task-server, multi-terminal, notifications, onboarding-agent, projects, release-distribution, settings-shell, skills-manager, task-kanban, terminal-statuses, worktrees` (`settings-shell` nasceu **nesta triagem**, Fase 3, decisão do usuário)
- **Tasks moram em:** markdown no repositório, `features/<f>/tasks.md` — **8 arquivos** (`agent-selection, mcp-task-server, multi-terminal, projects, release-distribution, settings-shell, task-kanban, terminal-statuses`). As outras 6 features só têm `spec.md` (ainda em Specify, sem tasks planejadas — `mcp-management, skills-manager, worktrees, conversation-cleanup, notifications, onboarding-agent`).
  - Não existe rastreador externo — tudo vive no repositório.
  - Decisão do usuário é gravada em: o próprio `spec.md`/`tasks.md` da feature **e** na tabela de Decisões de `project/STATE.md`. Não existe `context.md` por feature neste projeto (nenhum arquivo com esse nome em `features/*/`) — decisões de gray-area são escritas direto no corpo da spec/tasks.
  - Tasks **declaram os arquivos que tocam** (campo `Onde` em cada task) — confirmado em `multi-terminal/tasks.md`, `mcp-task-server/tasks.md`, etc. A `spec-loop` consegue montar onda por colisão de arquivo.
- **Controle de versão:** git.
  - Revisão: `git rev-parse --short HEAD` → `259b96e`
  - Estado da árvore **no início** desta triagem: `git status --short` → 5 arquivos modificados, não commitados: `.specs/features/multi-terminal/{design,spec,tasks}.md`, `.specs/project/{ROADMAP,STATE}.md` (produto da sessão `tlc-spec-driven` anterior a esta triagem). Estado **ao fechar**: ver "Revisão ao fechar" no topo deste arquivo.
- **Regras do repositório:**
  - `AGENTS.md` (raiz) — importado por `CLAUDE.md` via `@AGENTS.md` — **está vazio (0 bytes)** desde que foi criado (commit `94b9fcc`, 30/07/2026). Ver Divergência nesta triagem.
  - `.claude/rules/spec-driven-changes.md` — marcador de rastreabilidade obrigatório: comentário `// SPEC: <feature> (<IDs>)` no topo do arquivo (ou localizado, para arquivo compartilhado como `Cargo.toml`/`lib.rs`), **em inglês**. IDs por feature: `SHELL, CHAT, CONN, DOC, EMBED, SELF, SIDE, REL, CFG, ACTIVE, MEM` citados na regra genérica (parece vir de outro projeto/template) — na prática, este projeto usa os prefixos próprios de cada feature, confirmados por esta auditoria: `TERM-`, `AGT-`, `PROJ-`, `REL-`, `KAN-`, `STAT-`, `MCP-`, e agora `SET-` (settings-shell, nova nesta triagem).
  - Política de commit: **este agente nunca commita** — `.claude/settings.json` tem `git commit`/`git push` no `deny` (bloqueio estrutural, não só convenção da skill). Mantenedor commita à mão (AD de 31/07/2026 em `STATE.md`).
  - Idioma: documentação (`.specs/**`) em **português**; código, comentários e mensagens de commit em **inglês** (confirmado pelos marcadores `// SPEC:` existentes e pelas mensagens de commit do `git log`).
- **Gates medidos nesta run (baseline real, não copiado de sessão anterior):**

  | Escopo | Comando | Resultado medido agora |
  |---|---|---|
  | rust — formato | `cargo fmt --all -- --check` | exit 0 — limpo |
  | rust — lint | `cargo clippy --all-targets -- -D warnings` | exit 0 — `Finished`, 0 linhas de `warning` |
  | rust — testes (workspace: `src-tauri` + `crates/swarmdeck-mcp`) | `cargo test` | **180 passando, 0 falhas**, 16 suítes |
  | front — build | `npm run build` (`tsc --noEmit && vite build`) | OK — `dist/` gerado, sem erro de tipo |
  | front — testes | `npm run test` (`vitest run --passWithNoTests`) | **67 testes, 15 arquivos, 0 falhas** |
  | scripts de release | `npm run test:scripts` (`node --test "scripts/**/*.test.mjs"`) | **27 testes, 0 falhas** |
  | pipeline | execução real em `.github/workflows/ci.yml` | não medido nesta triagem — precisa de push (`human-only`); último resultado conhecido: `STATE.md` registra 2 runs reais, ambas falharam por motivos já corrigidos localmente (não reprovados de novo em CI) |

  Não há monorepo com múltiplos `package.json`/`Cargo.toml` de pacote — um `Cargo.toml` de workspace (`src-tauri` + `crates/swarmdeck-mcp`) e um `package.json` na raiz. `cargo test` cobre os dois crates Rust numa chamada só.

- **Território compartilhado (o que a `spec-loop` não pode paralelizar):**
  | Padrão | Onde | Por que colide |
  |---|---|---|
  | Migrações numeradas | `src-tauri/src/db/migrations/NNN_*.sql` — hoje até `004` | duas tasks reivindicando o mesmo número não quebram o build; a segunda migração simplesmente nunca roda (já aconteceu: `mcp-task-server/T1` "roubou" o número `002` de `release-distribution/T14`, ver `STATE.md` 01/08/2026) |
  | Registro central de comandos Tauri | `src-tauri/src/lib.rs` (`invoke_handler![...]`, `.plugin(...)`, `.setup(...)`) | toda feature nova que expõe comando adiciona uma linha aqui — duas tasks em paralelo tocando `lib.rs` colidem em merge, mesmo sem colidir em lógica |
  | Módulos-índice (`mod.rs`) | `src-tauri/src/{terminal,commands,tasks,projects}/mod.rs` | mesma natureza do `lib.rs`, em escala menor |
  | Capabilities do Tauri | `src-tauri/capabilities/default.json` | lista de permissions da janela `main`; duas tasks adicionando permission em paralelo colidem no array |
  | Lockfiles | `package-lock.json`, `Cargo.lock` | qualquer dependência nova regenera o lockfile inteiro — merge de duas edições é sempre conflito |
  | App.tsx | `src/App.tsx` | monta toda a árvore de componentes de terminal — hoje já é o ponto de integração real (T12 de `multi-terminal` o montou); qualquer feature nova que precise aparecer na tela toca este arquivo |

- **`human-only` neste projeto:**
  - Publicar release (`release.yml`, `workflow_dispatch`) — requer push e permissão de publicar no GitHub
  - Gerar o par de chaves de assinatura do updater (`tauri signer generate`) e cadastrar o secret — feito uma vez, fora do agente
  - Confirmar um run real do GitHub Actions (`ci.yml`/`release.yml`) — o agente não tem conta/push autorizado nesta sessão
  - `Verify` que exige clicar num **diálogo nativo do SO** (fora do DOM/webview) — não é CDP-dirigível; ex.: o seletor de pasta que `multi-terminal/T15` está prestes a introduzir
  - Qualquer coisa que dependa de hardware/segunda máquina — não identificado ainda neste projeto

---

## Divergências encontradas (Fase 1)

Dois subagents somente-leitura auditaram o repositório em paralelo (Auditor A: `multi-terminal`, `agent-selection`, `projects`, `release-distribution`; Auditor B: `mcp-task-server`, `task-kanban`, `terminal-statuses` + as 6 features Draft). **Todas as correções abaixo já foram aplicadas** nos arquivos de spec/tasks/roadmap/state citados — esta tabela é o registro do que mudou e por quê, não uma lista de pendências.

| # | Afirmação (verbatim/resumida) | Onde | O que o código/ambiente diz | Gravidade | Corrigido? |
|---|---|---|---|---|---|
| 1 | `origin/master` estaria travado em `T2/T21` vermelhos, release nunca publicada | `STATE.md`, `ROADMAP.md`, `release-distribution/tasks.md` | `origin/master` em `5c81ed2` (`chore(release): v0.1.1`, tag `v0.1.1`), publicado fora desta skill entre a triagem 005 e esta. `gh run list`: `CI` verde em `259b96e`, `Release` verde via `workflow_dispatch` (03/08/2026 02:05 UTC) | **ALTA** | ✅ `STATE.md` (AD nova), `ROADMAP.md`, `release-distribution/spec.md` (tabela de rastreabilidade quase toda reescrita) |
| 2 | REL-06 bug real (`git add` de `src-tauri/Cargo.toml` inexistente) bloqueava toda a Fase C | `release-distribution/spec.md`, `tasks.md` T6 | Corrigido no commit `bc7ab64`; confirmado pelo release real publicado com sucesso | ALTA | ✅ `spec.md` linha REL-06 |
| 3 | REL-14/REL-18 bug real (caminho *default* do binário errado em `make-portable.mjs`) | `release-distribution/spec.md`, `tasks.md` T7 | Corrigido — `defaultBinaryPath()` resolve sob `<raiz>/target/release/`; 2 testes novos (8/8, era 6/6) | ALTA | ✅ `spec.md` REL-14/18, `tasks.md` T7 |
| 4 | REL-19–26, REL-27–31, REL-32–34, REL-36 = "Design/Pending" | `release-distribution/spec.md` | Código e testes existem para todos (16 testes Rust em `update/`, 9 Vitest em `UpdateBanner`/`UpdateSettings`, CI já tem os 4 jobs) | ALTA | ✅ tabela de rastreabilidade inteira reescrita, resumo recalculado (36/36 com código, 0 `Pending`) |
| 5 | `task-kanban/spec.md`, `terminal-statuses/spec.md`: "8 requisitos, 0 mapeados ⚠️" | ambas specs | `tasks.md` de ambas tem código real, testado, gate verde para a maioria dos requisitos | ALTA | ✅ as duas tabelas de rastreabilidade |
| 6 | `task-kanban/tasks.md`: todos os checkboxes `[ ]`, nenhuma task marcada, apesar de T1-T6 terem código e testes passando | `task-kanban/tasks.md` | Confirmado: código e testes existem para T1-T6 | ALTA | ✅ nota no topo + marcador `✅ Done no gate` em cada heading de T1-T6 |
| 7 | `emit_task_changed` deveria carregar a tarefa e a operação (design.md linha ~39) | `task-kanban/design.md`, `ipc/server.rs` | `emit_task_changed` emite `app.emit("task_changed", ())` — payload vazio, por design (comentário do próprio código). `useTaskStore.ts` consome `event.payload.op`/`.task`/`.taskId` sem guarda de nulo → quebra em runtime a cada evento real | **ALTA** | ✅ anotado em `task-kanban/tasks.md` (T2) + nova task **T7** para corrigir |
| 8 | `KanbanBoard` seria alcançável pela janela "Kanban" | `task-kanban/design.md`, `windows/kanban.rs` | `src/main.tsx` sempre monta `<App/>` (grid de terminais) — não existe `react-router` nem outro roteamento; abrir "Kanban" mostra uma 2ª cópia do grid, não o board | **ALTA** | ✅ nova task **T7** em `task-kanban/tasks.md` |
| 9 | KAN-07 (criação manual) coberta por T6 | `task-kanban/spec.md` | Só o critério 3 (entra em `Pending` via `TaskService`) é garantido, estruturalmente. Não existe `TaskForm.tsx` nem equivalente — critérios 1-2 sem task | ALTA | ✅ `spec.md` linha KAN-07 + nova task **T8** |
| 10 | Contagens de teste: `task-kanban` T2 (4→6), T4 (6→11), T6 (6→7) | `task-kanban/tasks.md` | Confirmado por execução direta de cada suíte | MÉDIA | ✅ as 3 linhas |
| 11 | `TerminalHeader` renderizaria `StatusBadge`/`ActivityLog` | `terminal-statuses/tasks.md` T4 | `grep -n "StatusBadge\|ActivityLog" TerminalHeader.tsx` → vazio; componentes existem isolados, nunca montados no header real | **ALTA** | ✅ `spec.md` STAT-01/06 + nova task **T5** em `terminal-statuses/tasks.md` |
| 12 | STAT-07 (rename manual vence) e STAT-08 (filtro por status) mapeados | `terminal-statuses/spec.md` | Nenhuma task, em nenhuma das duas features, implementa qualquer um dos dois. STAT-07 é duplicata do gap já conhecido `TERM-06` (mesma regra, duas specs) | MÉDIA | ✅ `spec.md` — marcados "Não coberto", explicitamente não criada task nova (ver Fase 3, pergunta sobre duplicata) |
| 13 | `AgentPanel`/`ProjectsPanel`/`StatusesPanel`/`UpdateSettings` seriam UI "Done" e utilizável | 4 specs diferentes | Nenhum dos 4 é importado fora do próprio teste — **não existe janela/rota de Settings em lugar nenhum do app** | **ALTA** | ✅ `ROADMAP.md` (3 linhas), `STATE.md` (AD nova), `release-distribution/spec.md` REL-32/33/34 anotados. Vira pergunta na Fase 3 (onde a UI mora) |
| 14 | `NewTerminalDialog` sobrescreve o agente por sessão (AGT-03) | `agent-selection/spec.md` | `App.tsx::handleCreate(cwd, _agentId)` descarta o parâmetro — nunca chega a `pty_spawn` | **ALTA** | ✅ nova task **T5** em `agent-selection/tasks.md` (independente da pergunta de Settings) |
| 15 | Contagens de teste: agent-selection T4 ("4 em AgentPanel"), projects T4 (4→5) | 2 arquivos | `npm run test AgentPanel` → 3 (o 4º vive em `NewTerminalDialog.test.tsx`); `npm run test ProjectsPanel` → 5, não 4 | MÉDIA | ✅ as 2 linhas |
| 16 | T16 (release-distribution): "8 testes unit" | `release-distribution/tasks.md` | `cargo test --lib update::portable::` → 9 | MÉDIA | ✅ linha corrigida |
| 17 | `ROADMAP.md:32` (antiga): `App.tsx` "hoje ainda o placeholder do scaffolding" | `ROADMAP.md` | Falso desde a run 005 — `App.tsx` já monta a árvore real, e `multi-terminal/tasks.md` T12 já tem seção "Verify (executado)" | MÉDIA | ✅ reescrita |
| 18 | `multi-terminal/tasks.md:26`: "40 testes... `cargo test` = 31 (11 lib...)" | `multi-terminal/tasks.md` | Número congelado de uma época anterior a T12/mcp-task-server/task-kanban existirem; "11 lib" nunca correspondeu a uma suíte real desta feature | MÉDIA | ✅ linha reescrita, com o baseline atual do workspace (180/67) anotado como o número certo a usar |
| 19 | `EXECUTION.md:5`: "38 tarefas" | `EXECUTION.md` | Contagem real de `### T` nos 6 `tasks.md` de M1/M2 antes desta triagem: 43. Com as tasks novas desta triagem (`task-kanban` T7/T8, `terminal-statuses` T5): 46 | MÉDIA | ⚠️ **não corrigido** — `EXECUTION.md` também tem uma lista enumerada de tasks `[P]`/sequenciais no fim que precisaria ser re-derivada, não só o número da linha 5; registrado em `STATE.md` para a próxima passada |
| 20 | `AGENTS.md` definiria as convenções de código do projeto | `CLAUDE.md` (`@AGENTS.md`), `.claude/rules/spec-driven-changes.md` | `AGENTS.md` tem 0 bytes desde a criação (commit `94b9fcc`, 30/07/2026) — nunca editado | MÉDIA | ⚠️ **não corrigido** (populá-lo é decisão do usuário — ver Fase 3) |
| 21 | Bytes do binário com/sem o perfil `strip+lto` (`STATE.md`, T20) | `release-distribution/tasks.md` T20 | NÃO VERIFICADO nesta triagem — exigiria 2 builds `--release` completos, caro para o escopo. Flags do perfil confirmadas presentes em `Cargo.toml` | — | NÃO VERIFICADO, sem alteração |

---

## Inventário (Fase 2)

| Item | Feature | Escopo/gate | Declara arquivos | Classificação | Pronto p/ execução | Por quê (se não) |
|---|---|---|---|---|---|---|
| `multi-terminal/T13` — migração + persistência do último diretório | multi-terminal | rust integration/full | sim | `code` | **sim** | — |
| `multi-terminal/T14` — plugin de diálogo nativo + comandos | multi-terminal | build | sim | `code` | **sim** | depende de T13 |
| `multi-terminal/T15` — `NewTerminalDialog` seletor de pasta | multi-terminal | front unit/quick | sim | `code` | **sim** | depende de T14; `Verify` do diálogo nativo em si é `human-only` (não CDP-dirigível), já anotado na própria task |
| `agent-selection/T5` — expor catálogo + usar agente escolhido no spawn | agent-selection | build | sim | `code` | **sim** | independente da pergunta de Settings |
| `task-kanban/T7` — montar `/kanban` real + corrigir payload de `task_changed` | task-kanban | build | sim | `code` | **sim** | depende de T1-T6 (já implementadas) |
| `task-kanban/T8` — formulário de criação manual | task-kanban | front unit/quick | sim | `code` | **sim** | depende de T7 |
| `terminal-statuses/T5` — integrar badge/log ao `TerminalHeader` real | terminal-statuses | build | sim | `code` | **sim** | depende de T4 (já implementada) |
| `release-distribution/T3` — instalar/configurar `git-cliff` | release-distribution | scripts/pipeline | sim | `code` | **sim** | 2 de 4 itens `[ ]`, sem bloqueio novo encontrado — só não foi feito |
| `release-distribution/T5` — gerar par de chaves de assinatura do updater | release-distribution | — | sim | `human-only` | não | requer `tauri signer generate` + cadastro de secret no GitHub, fora do alcance do agente |
| `release-distribution/T19` — verificação ponta a ponta do updater real | release-distribution | — | sim | `human-only` | não | exige instalar/rodar o app publicado numa máquina real |
| `release-distribution` — reconciliar `T5-T12`/`T19` linha a linha contra o release `v0.1.1` real | release-distribution | pipeline | não | `needs-decision`* | não | *não é bem uma decisão de produto — é uma auditoria dedicada que não coube no orçamento desta triagem; fica reportado como "não verificado" e não como pergunta ao usuário |
| `EXECUTION.md` — recontar tasks (38→46) e re-derivar a lista `[P]`/sequencial | (transversal) | — | — | `code` | **sim** | bookkeeping puro, sem decisão |
| `T20` (release-distribution) — remedir bytes do binário com/sem perfil | release-distribution | build | sim | `code` | **sim** | exige 2 builds `--release`, não feito nesta triagem por custo, mas não há decisão pendente |
| `multi-terminal/T16` — rename manual (comando + UI), absorve `STAT-07` revogado | multi-terminal | build | sim | `code` | **sim** | resolvido na Fase 3 (pergunta 2) — `TERM-06` fica dono único |
| `STAT-08` — filtro por status no Kanban | task-kanban | front unit | não | `code`, não agendado | não formalizado em task ainda | P2, sem ambiguidade — só não tem task própria; pode esperar próxima rodada de tasks |
| `settings-shell/T1` — janela dedicada de Configurações | settings-shell | build | sim | `code` | **sim** | resolvido na Fase 3 (pergunta 1) — feature nova criada nesta triagem |
| `settings-shell/T2` — navegação + monta os 4 painéis reais | settings-shell | build | sim | `code` | **sim** | depende de T1; destrava o `Verify` real de `agent-selection/T4`, `projects/T4`, `terminal-statuses/T3`, `release-distribution/T17` |
| `AGENTS.md` — popular com as convenções reais | (transversal) | — | — | (bookkeeping, não é task) | ✅ já feito | resolvido na Fase 3 (pergunta 3) — arquivo reescrito nesta própria triagem |
| 6 features Draft (`mcp-management`, `skills-manager`, `worktrees`, `conversation-cleanup`, `notifications`, `onboarding-agent`) | — | — | — | `moot`/sem ação | não | confirmado: nenhuma tem código ainda (`grep` vazio para os 6 nomes); specs não desatualizadas em relação a features irmãs — nada a corrigir, nada a executar ainda (fase Specify apenas) |

---

## Decisões do usuário (Fase 3)

Perguntas levantadas nesta triagem, escritas aqui **antes** de perguntar ao usuário.

| # | Pergunta | Por que só o usuário responde | Resposta | Data | Onde ficou gravada |
|---|---|---|---|---|---|
| 1 | Onde deve morar a UI de Configurações (Settings) — hoje `AgentPanel`, `ProjectsPanel`, `StatusesPanel`, `UpdateSettings` existem testados mas nenhum é alcançável, porque não há janela/rota nenhuma para eles? | Mais de um lugar razoável (feature nova `settings-shell` vs. dentro de `agent-selection`, que foi a primeira a precisar) — afeta 4 features e a forma como o app se organiza | **Feature nova: `settings-shell`** | 03/08/2026 | `.specs/features/settings-shell/{spec,tasks}.md` (criados, `SET-01/02`, `T1/T2`); `project/STATE.md` (AD); `project/ROADMAP.md` (nova entrada + notas em `agent-selection`/`projects`/`terminal-statuses`/`release-distribution`); `agent-selection/tasks.md` (nota `⛔ NEEDS-DECISION` resolvida) |
| 2 | `STAT-07` (`terminal-statuses`) e `TERM-06` (`multi-terminal`) descrevem a mesma regra ("rename manual do terminal vence o agente") em duas specs, e nenhuma tem task implementando-a. Qual spec fica dona do requisito (a outra é revogada e o histórico registrado), e onde a task de implementação entra? | Duplicata entre specs — decisão de organização de spec, não técnica | **`TERM-06` fica; `STAT-07` revogado** | 03/08/2026 | `terminal-statuses/spec.md` (STAT-07 riscado, traceability + AC5 da história, com motivo e data); `multi-terminal/spec.md` (TERM-06 atualizado); `multi-terminal/tasks.md::T16` (task nova de implementação); `project/STATE.md` (AD) |
| 3 | `AGENTS.md` está vazio desde que foi criado, mas é citado como fonte das convenções de código (comentários em inglês, etc.). Quer que eu popule com as convenções reais já em uso, ou prefere deixar vazio (sem consequência prática medida até agora)? | Decisão do usuário sobre um arquivo de convenções — não há "resposta certa" derivável do código | **Popular com as convenções reais** | 03/08/2026 | `AGENTS.md` (reescrito — idioma, marcador `SPEC:`, política de commit, tabela de gates, princípio "specs descrevem o hoje"); `project/STATE.md` (AD) |

---

## Fora da execução

| Item | Rótulo | Por quê |
|---|---|---|
| `release-distribution/T5` (chave de assinatura) | `human-only` | Requer `tauri signer generate` + secret no GitHub |
| `release-distribution/T19` (verificação ponta a ponta) | `human-only` | Requer instalar/rodar o app publicado numa máquina real |
| Reconciliação task-a-task de `release-distribution/T5-T12,T19` contra o release `v0.1.1` real | fora do orçamento desta triagem | Precisa de uma passada dedicada, comparando cada `Done when` contra o artefato publicado — não coube aqui |
| Bytes do binário com/sem perfil (`T20`) | não verificado, não bloqueado | Exigiria 2 builds `--release` completos; sem decisão pendente, só custo |
| `STAT-08` (filtro por status no Kanban) | `code`, não agendado | P2, sem ambiguidade, mas nenhuma task ainda o inclui — fica para quando o board receber mais tasks |
| As 6 features Draft | sem tasks ainda | Ainda em fase Specify — não é escopo da `spec-loop` até ganharem `tasks.md` |

---

## Não verificado

- Bytes do binário com/sem o perfil `strip+lto` (`T20`) — não remedido nesta triagem.
- Execução real do GitHub Actions **depois** desta triagem — o release `v0.1.1` já saiu, mas nenhuma das tasks de `release-distribution` (`T5-T12`, `T19`) foi reconciliada uma a uma contra esse release real (ver "Fora da execução").
- `COLOR_WARNING_THRESHOLD` (40, distância RGB) em `terminal-statuses` nunca foi validado com o usuário — achado herdado do `JOURNAL.md` 005, ainda sem resposta.
- `EXECUTION.md` não foi corrigido (só o número da linha 5 foi medido — a lista `[P]`/sequencial no fim do arquivo precisaria ser re-derivada por completo).
- Threshold e cores do catálogo de status, formulário de criação manual do Kanban (antes de `T8` existir), e qualquer comportamento visual que dependa de um seletor de pasta nativo do SO (`multi-terminal/T15`) — nenhum automatizável por CDP, ficam como verificação manual declarada nas próprias tasks.
