# Triagem 004 — 01/08/2026

**Status:** pronta
**Revisão ao fechar:** `b8dc34c` (git) — nenhuma mudança em `src/` ou `src-tauri/src/` durante esta triagem; só `.specs/` foi editado. Árvore de trabalho **não commitada** ao fechar esta triagem — ver nota no fim.
**Perguntas em aberto:** 0

> ⚠️ **Salto de numeração 002 → 004, de propósito.** `.specs/project/STATE.md` e `.claude/rules/spec-driven-changes.md` citam decisões "da run 003" (datadas de 31/07/2026), mas **não existe** `.specs/runs/003-*` — nenhuma pasta, nenhum `JOURNAL.md`. Uma execução da `spec-loop` claramente aconteceu (T5, T13, T20, e parte de T1/T3/T4 de `release-distribution` foram implementadas depois da triagem 002, e há três commits documentando isso), mas quem rodou não seguiu a convenção de pasta numerada desta skill — ou rodou fora dela. Reusar o número **003** para esta triagem misturaria duas coisas diferentes sob o mesmo rótulo (as decisões de 31/07 já *são* "run 003" na prosa existente). Por isso esta triagem nasce como **004**, e o buraco fica documentado aqui em vez de preenchido às cegas — ver a divergência #7 abaixo.

---

## Perfil do projeto (Fase 0)

- **Conjunto de specs:** `.specs/` — estado: `project/STATE.md` | roadmap: `project/ROADMAP.md` | ordem/dependências: `project/EXECUTION.md` | codebase: `codebase/TESTING.md` (único arquivo da pasta) | índice: `README.md`
- **Tasks moram em:** markdown no repositório, `features/<f>/tasks.md` (7 arquivos com tasks.md; 6 features adicionais só têm `spec.md`, ainda sem tasks)
  - decisão do usuário é gravada em: o próprio `tasks.md`/`spec.md` da feature + `project/STATE.md` (não existe `context.md` dedicado)
  - espelhada em: — (sem rastreador externo)
  - tasks declaram os arquivos que tocam: **sim** — campo `**Onde**` em 100% das tasks conferidas
- **Controle de versão:** git — `git rev-parse --short HEAD` | `git status --short`
  - branch `master`, remote `git@github.com:rafaelsene01/swarmdeck.git`
  - **HEAD local `b8dc34c`, 2 commits à frente do `origin/master`** (`12222fe`, `b8dc34c` não publicados) — nenhum push desde a triagem 002. Todo item com gate `pipeline` depende disso.
  - árvore limpa no início desta triagem
- **Regras do repositório:** `.claude/rules/spec-driven-changes.md` (não existe `AGENTS.md` nem `CLAUDE.md` na raiz deste conjunto de specs — o `CLAUDE.MD` da raiz do repo é global, sem conteúdo específico do projeto)
  - marcador de rastreabilidade: **exigido** — `// SPEC: <pasta-da-feature> (ID-01, ID-02)` no topo, em inglês; exceção para arquivo compartilhado (marcador imediatamente acima do bloco, não no topo) — usada corretamente em `Cargo.toml:19` e `src-tauri/src/lib.rs:19,29,36`
- **Idioma:** código e comentários em **inglês** (docstrings do Rust em português foram observadas, ex. `db/mod.rs`, `throttle.rs` — não é uma violação desta regra, que fala de identificadores/comentários de código; specs e documentação em **português**)
- **Gates por escopo** (medidos nesta triagem, HEAD `b8dc34c`, 01/08/2026):

  | escopo | comando | resultado medido |
  |---|---|---|
  | rust — unit | `cargo test --lib` | **11 passando / 0 falhas** |
  | rust — completo | `cargo test` | **31 passando** (11 lib + 5 db + 4 layout + 6 manager + 5 session), 0 falhas, 0 doc-tests |
  | rust — formato | `cargo fmt --all -- --check` | **exit 1 — 4 arquivos com diff**: `src-tauri/src/commands/terminal.rs`, `src-tauri/src/terminal/manager.rs`, `src-tauri/tests/layout.rs`, `src-tauri/tests/manager.rs` |
  | rust — lint | `cargo clippy --all-targets -- -D warnings` | **exit 0, zero warnings** |
  | front — testes | `npm test` | **9 passando** (5 `GridLayout.test.tsx` + 4 `terminals.test.ts`) |
  | front — build | `npm run build` | **ok**, `tsc --noEmit && vite build`, sem erro |
  | scripts | `npm run test:scripts` | **11 passando / 0 falhas** — script existe desde `release-distribution/T1` (31/07/2026); `codebase/TESTING.md` ainda dizia "não existe" (corrigido nesta triagem — ver divergência #1) |
  | pipeline | run real no GitHub Actions | `.github/workflows/ci.yml` existe e implementa os 3 jobs esperados (`frontend`, `rust`, `commits`) **mais** um job `clippy` não documentado no `tasks.md` de T2 (pertence a T21); nenhum run publicado ainda — HEAD não está no `origin` |
- **Território compartilhado:** `src-tauri/src/db/mod.rs` (const `MIGRATIONS`, disputa da migração `002` entre `mcp-task-server/T1` e `release-distribution/T14` — ainda não colidiu, `mcp-task-server` segue `Draft`), `Cargo.toml` da raiz, `package.json`, `src-tauri/src/lib.rs` (registro de comandos), `Cargo.lock`/`package-lock.json`, testes de integração Rust (**nunca `[P]`**), gate `pipeline` (nenhuma tarefa desse gate roda em paralelo com outra do mesmo gate).
- **`human-only` neste projeto:** chave de assinatura e secrets (`release-distribution/T5`); qualquer `git push` para o `origin` (nenhum foi autorizado desde a triagem 002 — ver decisão 1 abaixo); `workflow_dispatch` de release; qualquer prova que dependa de run real do GitHub Actions; publicar release; instalar sem direitos de administrador.

---

## Divergências encontradas (Fase 1)

Auditoria feita por subagent somente-leitura (brief completo, cross-check código↔documentação nos 4 papéis). Achados, na ordem de gravidade:

| # | Afirmação | Onde | O que o código diz | Evidência | Grav. | Corrigido? |
|---|---|---|---|---|---|---|
| 1 | "`npm run test:scripts` — ⚠️ este script ainda não existe" | `codebase/TESTING.md:15` (e linha 18, forma do comando) | O script existe desde `release-distribution/T1` e passa 11/11 | `npm run test:scripts` → `# pass 11 / # fail 0`; `package.json` tem a entrada | ALTA | ✅ — texto reescrito, forma do comando corrigida para o glob real |
| 2 | "Multi-terminal em grid — IN PROGRESS (T1–T4 de 11 entregues)" | `project/ROADMAP.md:32` | `multi-terminal/tasks.md` mostra as 11 tarefas `✅ Done` (5 com Verify visual não confirmado) | `multi-terminal/tasks.md:10-20` — tabela de status | ALTA | ✅ — reescrito para refletir 11/11 |
| 3 | "`cargo fmt --check` ... 7 hunks em 3 arquivos (`db/mod.rs`, `throttle.rs`, `tests/session.rs`)" | `project/STATE.md:28` | Hoje são **outros 4 arquivos** — nenhum dos 3 antigos aparece mais na lista | `cargo fmt --all -- --check \| grep '^Diff in'` → 4 linhas, arquivos diferentes | ALTA | ✅ — remedido no mesmo registro, sem apagar o histórico anterior |
| 4 | Marcador `// SPEC:` ausente em `db/mod.rs`, `throttle.rs`, `session.rs`, apesar de `multi-terminal/T2, T3, T4` estarem `✅ Done` e o campo `Onde` apontar para lá | `src-tauri/src/db/mod.rs:1`, `src-tauri/src/terminal/throttle.rs:1`, `src-tauri/src/terminal/session.rs:1` | Só têm doc-comment `//!`, sem a linha `// SPEC:` exigida pela regra do repositório | `head -3` de cada arquivo; comparado com `manager.rs:1`, `layout.rs:1`, `commands/terminal.rs:1`, que têm o marcador corretamente | ALTA | ❌ **não corrigido** — é edição de código, fora do escopo desta skill. Vira item `code` no inventário |
| 5 | T21 "🚧 BLOQUEADA... nenhum item do Done when tem evidência ainda; todas as caixas desmarcadas" | `release-distribution/tasks.md` (T21) | Falso para a maioria: `cargo clippy` já passa localmente (o próprio `STATE.md:72` já registrava isso), e o job `clippy` já está em `ci.yml`. Só falta o run verde | `cargo clippy --all-targets -- -D warnings` → exit 0; `.github/workflows/ci.yml` tem o job `clippy`; `STATE.md:72` | ALTA | ✅ — checkboxes corrigidas, callout reescrito para "implementado, prova de pipeline pendente" |
| 6 | T2 "🚧 BLOQUEADA... nenhum item tem evidência" | `release-distribution/tasks.md` (T2) | O `ci.yml` já implementa a estrutura inteira descrita no `Done when` (3 jobs, concorrência, ausência de `gh release`/`git tag`/`tauri-action`). Só falta o run verde | Leitura de `.github/workflows/ci.yml` linha a linha contra cada item | MÉDIA | ✅ — checkboxes corrigidas, mesmo tratamento do #5 |
| 7 | Decisões "da run 003" (31/07/2026) citadas em `STATE.md` e em `.claude/rules/spec-driven-changes.md` como se houvesse uma run rastreável | `project/STATE.md:30-36`; rodapé de `spec-driven-changes.md` | Não existe `.specs/runs/003-*` nem `JOURNAL.md` em lugar nenhum do repositório | `find .specs/runs -maxdepth 2` → só lista `001-2026-07-28` e `002-2026-07-28`; busca por `JOURNAL*` no repo inteiro → vazia | MÉDIA | ❌ **não corrigido** — não é possível reconstruir um journal que nunca existiu sem fabricar evidência. Documentado aqui como o motivo do salto de numeração para 004 |
| 8 | "Tasks concluídas para M1 + M2..." — 59 tarefas atômicas | `README.md:40` | Ambíguo: as 59 têm `tasks.md` escrito (correto), mas a maioria não está `✅ Done` — só `multi-terminal` (11/11) e parte de `release-distribution` estão | Contagem de `### T` = 59 (matematicamente correto); mas `agent-selection`, `projects`, `mcp-task-server`, `terminal-statuses`, `task-kanban` = 0 tasks `Done`, todas `Draft` | BAIXA | ✅ — "concluídas" → "definidas", com a ressalva no mesmo parênteses |

**Padrão que se repete pela terceira triagem seguida:** uma correção aplicada num lugar não se propaga para os outros lugares que fazem a mesma afirmação (#1 tinha 2 ocorrências; #5/#6 são o mesmo padrão dentro da própria feature que a triagem 002 já tinha corrigido noutro arquivo). A lição registrada na triagem 002 ("depois de corrigir um número, grep pelo valor antigo no conjunto inteiro") vale igualmente para *estados* ("BLOQUEADA"/"Done"), não só para números.

**Confirmado sem divergência** (o auditor tentou derrubar e não conseguiu): contagem de 112 requisitos (`README.md:30`), 38 tarefas M1/M2 com 13 `[P]` (`EXECUTION.md`), os 4 comandos Tauri em `lib.rs`, o marcador de `paths.rs`, a exceção de marcador em `Cargo.toml`/`lib.rs`, a medição de binário (7.805.440 bytes) contra a meta do `PROJECT.md` (<20MB), e a contagem "cargo test = 31" do próprio `multi-terminal/tasks.md:22`.

---

## Inventário (Fase 2)

**59 tarefas em 7 `tasks.md`** + 6 features só com `spec.md` (sem tasks, sem seção de decisão pendente — confirmado pelo auditor) + 2 itens achados em auditoria.

| Item | Feature | Escopo/gate | Declara arquivos | Classificação | Pronto | Por quê (se não) |
|---|---|---|---|---|---|---|
| formatar os 4 arquivos que `cargo fmt --check` acusa | — (auditoria) | rust fmt | não (auditoria) | `code` | **sim** | pré-requisito de `release-distribution/T2` fechar (o job `rust` do CI roda `cargo fmt --all -- --check`) |
| marcador `SPEC:` ausente em `db/mod.rs`, `throttle.rs`, `session.rs` | multi-terminal | rust build | não (auditoria) | `code` | **sim** | a regra do repositório exige e os 3 arquivos são de tasks `Done` |
| **T14** Persistência das preferências de update | release-distribution | rust full (integration) | sim | `code` | **sim** | depende só de T13 (`✅ Done`). Migração `002` livre — `mcp-task-server/T1` ainda não rodou (`Draft`) |
| **T6, T7, T9, T10, T11** — `Verify` visual | multi-terminal | build/quick/full | sim | `uat-agent` | **sim** | gate automatizado já passa em todas; falta o `Verify` com o app aberto. Tentativa anterior (run "003" sem journal) registrou **NÃO CONFIRMADO** por falta de screenshot/clique no ambiente de execução — por AD de 31/07/2026, isso é resultado válido, não bloqueio. **Nenhuma dupla `uat-agent` em paralelo** (regra já escrita em `multi-terminal/tasks.md`) |
| **T2** Workflow de CI (fechar) | release-distribution | pipeline | sim | `human-only` | não | implementado e correto por leitura; só falta run verde, que exige push — decisão 1 abaixo |
| **T21** Clippy no CI (fechar) | release-distribution | pipeline | sim | `human-only` | não | implementado, `clippy` já passa local; só falta run verde — decisão 1 abaixo |
| **T5** Chave de assinatura e secrets | release-distribution | build | sim | `human-only` | não | `tauri signer generate` + cadastro de secrets — nenhum agente tem a credencial |
| **T6, T9, T10, T11, T12, T19** (release) | release-distribution | pipeline/build | sim | `human-only` | não | cadeia depende de T5 (chave) e/ou de push publicado |
| **T15–T18** | release-distribution | quick | sim | `code` (quando chegar a vez) | não | dependem de T14 (ainda não executada nesta run) |
| T1–T4 (4) | agent-selection | rust + vitest | sim | `code` | **sim** (T1 sem dependência pendente; T2→T4 seguem em cadeia) | liberada — decisão 2 |
| T0–T8 (9) | mcp-task-server | rust full | sim | `code` | **sim** (T0 sem dependência; T1–T8 em cadeia atrás de T0) | liberada — decisão 2. T0 é gate de bloqueio do M2 inteiro |
| T1–T4 (4) | projects | rust + vitest | sim | `code`/`uat-agent`* | não | liberada — decisão 2, mas depende de `mcp-task-server/T1` (que por sua vez depende de T0, ainda não executado). *T3 tem `Verify` "chamar `project_list` pelo devtools" — leve, via devtools, auditor não classificou como UAT visual pleno; reavaliar quando a cadeia chegar lá |
| T1–T4 (4) | terminal-statuses | rust + vitest | sim | `code` | não | `tasks.md` segue em `Draft` — decisão 2 não a incluiu |
| T1–T6 (6) | task-kanban | rust + vitest | sim | `code`/`uat-agent`* | não | `tasks.md` segue em `Draft` — decisão 2 não a incluiu. *T1 e T6 têm `Verify` visual explícito (abrir board 2x → 1 janela; enviar tarefa → aparece no terminal certo) — candidatas a `uat-agent` quando liberada |
| 6 features (`mcp-management`, `skills-manager`, `worktrees`, `conversation-cleanup`, `notifications`, `onboarding-agent`) | — | — | — | fora do inventário | — | só têm `spec.md`, sem `tasks.md`; nenhuma seção de decisão pendente encontrada |

**Por rótulo (depois das decisões 1 e 2):** `code` pronto para começar imediatamente: **5 itens** (fmt, marcador SPEC, `release-distribution/T14`, `mcp-task-server/T0`, `agent-selection/T1`) · `uat-agent` pronto: **5** (`multi-terminal/T6,T7,T9,T10,T11`) · **total pronto para a `spec-loop` iniciar agora: 10 itens** · `code` liberado mas atrás de dependência em cadeia (torna-se pronto conforme a fila anda): **19** (`agent-selection/T2–T4`, `mcp-task-server/T1–T8`, `projects/T1–T4`) · `human-only`: **9** (`T2,T5,T6,T9,T10,T11,T12,T19,T21` de release-distribution) · `code` retido por `Draft`: **10** (`terminal-statuses` 4, `task-kanban` 6) · `code` bloqueado por dependência não satisfeita: **4** (`release-distribution/T15–T18`, aguardam T14) · `needs-decision`: **0** · `blocked`: 0 · `moot`: 0.

**Ordem sugerida para a `spec-loop`:**

| Onda | Itens | Observação |
|---|---|---|
| 1 | fmt (4 arquivos) + marcador `SPEC:` (3 arquivos) | `code`, sem app, arquivos não coincidem — podem ir juntos ou em série |
| 2 | `release-distribution/T14` · `mcp-task-server/T0` · `agent-selection/T1` | as 3 são `code`, sem dependência pendente entre si e sem colisão de arquivo — paralelizáveis nesta onda |
| 3 | `mcp-task-server/T1` (migração `002` — território compartilhado com `release-distribution/T14`; quem chegar primeiro pega o número, ver `EXECUTION.md`) · `agent-selection/T2` | sequencial dentro de cada feature |
| 4 | `multi-terminal/T6` → depois **uma de** `T7`/`T9` → depois **a outra** → `T10` → `T11` | `uat-agent`, nunca duas juntas. Pode intercalar com as ondas 2–3, que não tocam o app |
| 5 | `mcp-task-server/T2` → `T3` → (`T4`→`T5`→`T6`→`T7` e `T3`→`T8`) · `agent-selection/T3`, `T4` [P] · `projects/T1` assim que `mcp-task-server/T1` fechar | segue `EXECUTION.md` onda a onda |
| — | `release-distribution/T2`, `T21` (fechar) | **fora de alcance nesta run** — decisão 1 manteve `human-only` |

---

## Decisões do usuário (Fase 3)

*Escrito ANTES da primeira pergunta.*

| # | Pergunta | Por que só o usuário responde | Resposta | Data | Onde ficou gravada |
|---|---|---|---|---|---|
| 1 | `release-distribution/T2` e `T21` estão implementadas e passam localmente (CI + Clippy), mas só fecham com um run real no GitHub Actions, que exige `git push` ao `origin/master`. A triagem 002/run "003" registrou "nenhum push nesta run" como decisão explícita. Isso continua valendo, ou você autoriza o push agora? | `git push` é uma ação visível a terceiros e difícil de reverter sem força bruta — está fora do que qualquer agente decide sozinho, e o `STATE.md` já tem uma AD anterior dizendo "nenhum push" que precisa ser reconfirmada ou substituída, não presumida | **Ainda não — mantém `human-only`.** Nenhum push nesta run. `T2` e `T21` seguem com a única caixa aberta sendo "Gate passa: run verde na Actions" | 01/08/2026 | `project/STATE.md` — AD nova reconfirmando a decisão; `release-distribution/tasks.md` (T2 e T21) já refletia "implementado, prova pendente" desde a correção da Fase 1 desta mesma triagem, então nenhuma edição adicional foi necessária nelas |
| 2 | Além de `multi-terminal` (100% implementada) e `release-distribution` (já liberada), você quer destravar (`Draft` → `In Progress`) alguma das 5 features restantes — `agent-selection`, `mcp-task-server`, `projects`, `terminal-statuses`, `task-kanban` — para esta rodada de execução? `mcp-task-server/T0` é o gate de bloqueio de todo o M2 (Kanban, status de terminal, servidor MCP) — liberar essa é o que abre a maior fila nova | Escopo de execução é decisão de produto do mantenedor, não algo que o repositório responde sozinho — a AD de 28/07/2026 existe exatamente para isso | **Liberar `agent-selection`, `mcp-task-server` e `projects`.** `terminal-statuses` e `task-kanban` continuam `Draft`. (Resposta inicial marcou "Nenhuma" simultaneamente com as três — clarificado numa segunda pergunta antes de gravar, para não presumir a intenção de uma resposta contraditória.) | 01/08/2026 | `project/STATE.md` — AD nova com o trade-off; `**Status**` trocado para `In Progress` em `agent-selection/tasks.md:5`, `mcp-task-server/tasks.md:5`, `projects/tasks.md:5`; `project/ROADMAP.md` — as três entradas de feature reescritas de "PLANNED" para "IN PROGRESS (liberada na triagem 004)" |

**Teste do contrato aplicado às duas respostas** — *um agente que leia só a spec da feature, sem esta conversa, consegue executar sem perguntar?*
**Sim.** `release-distribution/tasks.md` já classificava `T2`/`T21` como bloqueadas por push antes mesmo da pergunta — a resposta só confirma que o estado permanece. Para a decisão 2, o campo `**Status**` de cada `tasks.md` é exatamente o que a `spec-loop` lê para decidir se uma feature é executável (mesmo mecanismo usado desde a triagem 001) — um agente frio vê `In Progress` em `mcp-task-server/tasks.md` e sabe que pode começar por `T0`, sem precisar desta conversa.

---

## Fora da execução

| Item | Rótulo | Por quê |
|---|---|---|
| `release-distribution/T5` — chave de assinatura e secrets | `human-only` | `tauri signer generate` + cadastro de secrets no GitHub |
| `release-distribution/T2, T21` (fechar) | `human-only` | decisão 1: nenhum push nesta run |
| `release-distribution/T6, T9, T10, T11, T12, T19` | `human-only` | dependem de T5 e/ou push publicado |
| `release-distribution/T15–T18` | retido | dependem de T14, ainda não executada nesta run |
| 10 tarefas em 2 features (`terminal-statuses` 4, `task-kanban` 6) | retido | decisão 2 não incluiu essas duas — seguem `Draft` |
| `agent-selection/T2–T4`, `mcp-task-server/T1–T8`, `projects/T1–T4` (19 tarefas) | liberadas, não prontas ainda | dependem de tasks anteriores na própria cadeia (`T0`/`T1` de cada feature) que ainda não rodaram nesta run — ficam prontas conforme a `spec-loop` avança |

---

## Não verificado

- **Não abri as 27 tasks retidas por `Draft` uma a uma no nível de `Verify`.** O auditor confirmou que todas declaram `Onde` e classificou preliminarmente `projects/T3` e `task-kanban/T1,T6` como candidatas a `uat-agent` pelo texto do `Verify`, mas essa reclassificação formal (como foi feita para `multi-terminal` na triagem 002) só deveria acontecer quando a feature for de fato liberada — fazer agora seria trabalho descartável se a resposta da decisão 2 for negativa.
- **Não tentei rodar `Verify` visual de `multi-terminal/T6,T7,T9,T10,T11`.** O ambiente desta sessão de triagem não abre a janela do app nem tira screenshot — isso é trabalho da `spec-loop`, não desta skill. Fica registrado aqui só para não ser confundido com "verificado".
- **Não recriei a `runs/003`.** Documentado na divergência #7 como um buraco permanente, não preenchido.
- **Não corrigi os `TRIAGE.md` das runs 001/002.** São registro histórico; os erros que sobreviveram estão remediados nos documentos vivos, que é onde um leitor poderia ser enganado.
- **Não medi novamente `git-cliff`** (`release-distribution/T3`) — não está instalado neste ambiente, mesma limitação já registrada no próprio `tasks.md` da feature; nenhum item pronto depende disso.
- **Nenhum commit foi feito por esta triagem.** Todas as edições em `.specs/` (TESTING.md, README.md, ROADMAP.md, STATE.md, e os `tasks.md` de release-distribution, agent-selection, mcp-task-server e projects) estão na árvore de trabalho, não commitadas — por regra desta skill (nunca commita sozinha). Sugestão de mensagem, para o mantenedor decidir:
  `docs(specs): reconcile documentation and record triagem 004 decisions`
  `— corrige 8 divergências (script test:scripts, status de multi-terminal e release-distribution no roadmap, contagem de fmt, checkboxes de T2/T21), libera agent-selection/mcp-task-server/projects para execução, e reconfirma "nenhum push" para release-distribution/T2,T21.`
