# Triagem 001 — 28/07/2026

**Status:** pronta
**Revisão ao fechar:** `d8a6ebe` (git) — medições feitas em `dffd9f0`; ver o aviso abaixo
**Perguntas em aberto:** 0

> ⚠️ **Este repositório commita sozinho.** Durante esta triagem o HEAD andou duas vezes sem que ninguém pedisse: `dffd9f0` → `d8a6ebe`, e o commit `d8a6ebe` contém exatamente as correções da Fase 1 que eu tinha acabado de escrever. Consequência para a `spec-loop`: **o teste de frescor por HEAD dá falso positivo de "triagem velha" neste repositório.** A regra aqui é mais fina — a triagem só envelhece se `src/` ou `src-tauri/src/` mudarem. Confira com `git diff --stat d8a6ebe -- src src-tauri/src`; se vier vazio, a classificação abaixo continua válida por mais que o HEAD tenha andado.

---

## Perfil do projeto (Fase 0)

- **Conjunto de specs:** `.specs/` — estado: `project/STATE.md` | roadmap: `project/ROADMAP.md` | ordem: `project/EXECUTION.md` | codebase: `codebase/TESTING.md` (**é o único arquivo de `codebase/`** — não há `ARCHITECTURE.md` nem `CONVENTIONS.md`)
- **Tasks moram em:** markdown no repositório, `features/<f>/tasks.md` (7 arquivos, 59 headers `### T`)
  - decisão do usuário é gravada em: o próprio `tasks.md`/`spec.md` da feature + `project/STATE.md` (não existe `context.md` em nenhuma feature)
  - espelhada em: — (sem rastreador externo)
  - tasks declaram os arquivos que tocam: **sim** — campo `**Onde**` em cada task
- **Controle de versão:** git — revisão: `git rev-parse --short HEAD` | estado: `git status --short`
  - branch `master`, remote `git@github.com:rafaelsene01/swarmdeck.git`, 3 commits, 0 tags, árvore limpa
  - ⚠️ o histórico foi **reescrito durante esta sessão** (o HEAD anterior era `c221489`, com outras três mensagens). A triagem seguinte deve conferir isto antes de confiar na revisão registrada aqui.
- **Regras do repositório:** `.claude/rules/spec-driven-changes.md` (**não existe `AGENTS.md` nem `CLAUDE.md` na raiz** — o `agent-briefs.md` da `spec-loop` manda lê-los; nesta base o equivalente é a regra em `.claude/rules/`)
  - marcador de rastreabilidade: **exigido** — `// SPEC: <pasta-da-feature> (ID-01, ID-02)` no topo do arquivo, em inglês
  - ⚠️ **medido: zero arquivos do código têm o marcador hoje** (`grep -rn "SPEC:" src/ src-tauri/src/` não retorna nada), embora `src-tauri/src/{db,terminal}/` implementem `multi-terminal/T1–T4`
- **Idioma:** código e comentários em **inglês**; documentação e specs em **português** (`STATE.md` § Preferências). Identificadores de requisito e nomes de arquivo em inglês.
- **Gates por escopo** (medidos nesta triagem, 28/07/2026, HEAD `dffd9f0`):

  | escopo | comando | resultado medido |
  |---|---|---|
  | rust — unit | `cargo test --lib` | **5 passando / 0 falhas / 0 ignorados** |
  | rust — completo | `cargo test` | **15 passando / 0 falhas** (5 unit + 10 integration, em 5 binários) |
  | rust — formato | `cargo fmt --check` | **exit 1 — 7 arquivos com diff** ⚠️ |
  | front — testes | `npm test` | **0 arquivos de teste** (passa por `--passWithNoTests`) |
  | front — build | `npm run build` | ok — 29 módulos, `index.js` 194.89 kB (gzip 61.04 kB) |
  | scripts | `npm run test:scripts` | **script inexistente** ⚠️ — `package.json` tem só `dev, build, preview, test, test:watch, tauri` |
  | pipeline | run real no GitHub Actions | **não existe `.github/`** |

- **Território compartilhado:**

  | Território | Por que colide |
  |---|---|
  | `src-tauri/src/db/mod.rs` — const `MIGRATIONS` | hoje só a `001`. `mcp-task-server/T1` e `release-distribution/T14` **ambas reivindicam a `002`** (Todo aberto no `STATE.md`: quem executar primeiro fica com ela) |
  | `Cargo.toml` da raiz (workspace) | `version.workspace = true`; o escritor de versão de `rd/T1` edita este arquivo |
  | `package.json` | `rd/T1` adiciona `test:scripts`; qualquer task de front mexe em deps |
  | `src-tauri/src/lib.rs` | registro central dos comandos Tauri — toda feature nova escreve na mesma lista |
  | `Cargo.lock` / `package-lock.json` | conflito garantido em edição simultânea |
  | testes `integration` de Rust (banco, IPC, PTY) | `codebase/TESTING.md` é explícito: **nunca `[P]`** — disputam arquivo SQLite, socket e processos reais |
  | gate `pipeline` | disputa a mesma branch e o mesmo histórico de runs |

- **`human-only` neste projeto:** gerar a chave de assinatura e cadastrar secrets (`rd/T5`); disparar `workflow_dispatch` de release (AD 28/07: só o mantenedor); qualquer prova que dependa de um run real do GitHub Actions (exige push na branch); publicar release; instalar sem direitos de administrador.

---

## Divergências encontradas (Fase 1)

| # | Afirmação | Onde | O que o código diz | Evidência | Grav. | Corrigido? |
|---|---|---|---|---|---|---|
| 1 | gate `scripts` = `npm run test:scripts` | `codebase/TESTING.md:15` | o script não existe; `scripts/` não existe | `Object.keys(package.json.scripts)` → `[dev, build, preview, test, test:watch, tauri]` | **ALTA** | ✅ marcado como inexistente, com quem o cria (`rd/T1`) |
| 2 | "`fmt` foi **medido** nesta sessão e passa (exit 0)" | `project/STATE.md`, AD de 28/07 | falha | `cargo fmt --check` → exit 1, `grep -c "^Diff in"` → 7 | **ALTA** | ✅ remedido na AD, sem apagar a original |
| 3 | "Milestone atual: M1 / **Status: Planning**" e "Multi-terminal — **PLANNED**" | `project/ROADMAP.md:3-4,36` | T1–T4 entregues, 15 testes, código em `src-tauri/src/{db,terminal}/` | `multi-terminal/tasks.md` + `cargo test` = 15 | MÉDIA | ✅ → "In Progress" / "IN PROGRESS (T1–T4 de 11)" |
| 4 | "**37 tarefas.** 12 podem rodar em paralelo" | `project/EXECUTION.md:5` e §Regras | 38 tarefas em M1/M2; **13** marcadas `[P]` — e a própria lista enumerada tem 13 itens | `grep -cE '^### T[0-9]+'` = 38; `grep '\[P\]'` = 13 | MÉDIA | ✅ → 38 / 13, nos dois lugares |
| 5 | "58 tarefas atômicas" | `.specs/README.md:38` | 59 — a tabela do próprio README soma 59 | `grep -hcE '^### T'` nos 7 arquivos = 59 | BAIXA | ✅ → 59 |
| 6 | git init "feito: … **1 commit**, zero tags" | `project/STATE.md`, Todos | 3 commits (branch e remote conferem; 0 tags confere) | `git log --oneline` | BAIXA | ✅ → 3 commits |
| 7 | Todo aberto: "Decidir formato de persistência do layout do grid (JSON vs SQLite)" | `project/STATE.md`, Todos | **já decidido em código**: `001_terminal_layout.sql` cria a tabela `terminal_layout` e `db/mod.rs` a consome | `cat` da migração + `MIGRATIONS` em `db/mod.rs` | MÉDIA | ✅ riscado com o motivo, nomeando `multi-terminal/T2` |

**Não corrigido, e por quê:** o marcador `SPEC:` está ausente em **todo** o código já escrito (`src-tauri/src/db/*`, `terminal/*`), embora a regra do repositório o exija. Não corrigi porque adicionar marcador é **edição de código**, e esta skill não implementa. Entrou no inventário como item `code`.

---

## Inventário (Fase 2)

**59 tarefas, 4 concluídas (`mt/T1–T4`), 55 abertas** + 1 item achado na auditoria.

| Item | Feature | Escopo/gate | Declara arquivos | Classificação | Pronto | Por quê (se não) |
|---|---|---|---|---|---|---|
| T5–T11 (7) | multi-terminal | rust quick/full | sim | `code` | **sim** | T7–T9 são `[P]` entre si. Única feature `In Progress` |
| formatar os 7 arquivos que o `cargo fmt --check` acusa | — (achado da auditoria) | rust fmt | não | `code` | **sim** | os arquivos são do território de `multi-terminal`; pré-requisito de `rd/T2`, senão o primeiro CI nasce vermelho |
| marcador `SPEC:` ausente no código de `mt/T1–T4` | — (achado da auditoria) | rust build | não | `code` | **sim** | mesma feature; a regra do repositório exige e nenhum arquivo tem |
| T1–T4 (4) | agent-selection | rust + vitest | sim | `code` | **não** | `tasks.md` em `Draft` — decisão 2 |
| T1, T3, T4, T7, T8, T13–T18, T20 (12) | release-distribution | scripts/build/quick/full | sim | `code` | **não** | `tasks.md` em `Draft` — decisão 2 |
| **T0** | mcp-task-server | — | n/a | `code` *(era `needs-decision`)* | **não** | decisão 1 respondida: o contrato está congelado e T0 é redigível sem perguntar. Mas o `tasks.md` está em `Draft` — decisão 2 |
| T1–T8 (8) | mcp-task-server | rust full | sim | `code` | **não** | `Draft` + dependem de `T0` |
| T1–T4 (4) | projects | rust + vitest | sim | `code` | **não** | `Draft` + dependem de `mcp/T1` |
| T1–T4 (4) | terminal-statuses | rust + vitest | sim | `code` | **não** | `Draft` + dependem de `mcp/T4` |
| T1–T6 (6) | task-kanban | rust + vitest | sim | `code` | **não** | `Draft` + dependem de `mcp/T5` |
| T5 | release-distribution | — | sim | `human-only` | não | chave de assinatura + secrets do repositório |
| T2, T6, T9, T10, T11, T12, T19, T21 (8) | release-distribution | **pipeline** | sim | `human-only` | não | a prova é um run real do GitHub Actions — exige push e conta. O YAML é redigível por agente; **a task não fecha sem o run** |

**Por rótulo, depois das duas decisões:** `code` **pronto para a `spec-loop`: 7 tarefas + 2 itens de auditoria** · `code` retido por `Draft`: **39** · `needs-decision`: **0** · `human-only`: **9** · `blocked`: 0 · `moot`: 0 (o único, o Todo do layout, foi riscado na Fase 1).

> A decisão 2 é o que separa 7 de 24. Sem ela, `agent-selection` e `release-distribution` entrariam na fila. Para liberá-las, o mantenedor troca `**Status**: Draft` → `In Progress` no `tasks.md` da feature e roda uma triagem nova.

---

## Decisões do usuário (Fase 3)

*Escrito antes da primeira pergunta.*

| # | Pergunta | Por que só o usuário responde | Resposta | Data | Onde ficou gravada |
|---|---|---|---|---|---|
| 1 | O contrato de ferramentas MCP (`mcp-task-server/T0`) pode ser congelado com os nomes inferidos do `CLAUDE.md` global, ou precisa ser validado contra a implementação real antes? | Os nomes são um contrato com agentes externos que já rodam com prompts existentes. Errar quebra os prompts do usuário, e nenhum arquivo deste repositório contém a lista oficial — a fonte é a instalação do usuário. `STATE.md` registrava como bloqueio **Aberto**. | **Congelar os nomes inferidos**, sem validação prévia | 28/07/2026 | `features/mcp-task-server/tasks.md` § T0 (bloco "✅ DECISÃO DO USUÁRIO" + `Done when` reescrito) · `project/STATE.md` (bloqueio → Resolvido, Todo riscado, **AD nova** com o trade-off) |
| 2 | Os `tasks.md` estão com `**Status**: Draft` (6 de 7). Isso autoriza execução, ou Draft significa "ainda não revisado por mim"? | É o significado que o usuário dá ao próprio marcador de ciclo de vida. Executar 24 tarefas a partir de um plano que ele considera rascunho é retrabalho caro; não executar nada por excesso de zelo trava a run. Nada no repositório define o termo. | **Só `multi-terminal`** (o único `In Progress`); Draft bloqueia execução automatizada | 28/07/2026 | `project/STATE.md` — **AD nova** definindo que `Draft` bloqueia a `spec-loop` e como o mantenedor libera uma feature |

**Teste do contrato aplicado a cada resposta** — *um agente que leia só a spec, sem esta conversa, consegue implementar sem perguntar?*
- **Resposta 1: sim.** O bloco em `T0` diz o que congelar, de qual fonte, e que não há validação. Um implementador frio escreve o `TOOL-CONTRACT.md` sem voltar ao usuário.
- **Resposta 2: sim, e é executável por máquina.** A regra virou um critério objetivo — `**Status**: In Progress` no `tasks.md` — que a `spec-loop` confere sozinha.

---

## Fora da execução

| Item | Rótulo | Por quê |
|---|---|---|
| `rd/T5` — chave de assinatura e secrets | `human-only` | `tauri signer generate` + cadastro de secrets no GitHub. Nenhuma tarefa automatizada substitui |
| `rd/T2, T6, T9–T12, T19, T21` | `human-only` | gate `pipeline`: a prova é o run no GitHub Actions, que exige push autorizado. `T12` e `T19` já vêm marcadas 🧑 na própria spec |
| `mcp/T0` e as 22 tarefas atrás dele | `needs-decision` | ver pergunta 1 |

---

## Não verificado

- **Não rodei `cargo clippy`.** O `STATE.md` tem um Todo pedindo a medição; ela não entrou nesta triagem porque nenhum item pronto depende dela.
- **Não abri as 59 tasks uma a uma.** Classifiquei por feature, a partir do header, do campo `Gate`/`Tests` e do grafo de dependências do `EXECUTION.md`. Uma task individual pode ter uma dependência que o grafo não mostra.
- **Não conferi as 21 tarefas de `release-distribution` contra o `design.md` delas** — a classificação saiu do gate declarado, não do conteúdo.
- **Não validei o conteúdo dos `spec.md` das 6 features sem `tasks.md`** (`mcp-management`, `skills-manager`, `worktrees`, `conversation-cleanup`, `notifications`, `onboarding-agent`): são de M3–M5, sem tarefas escritas, e por isso fora do inventário — não porque foram verificadas.
- **A auditoria da Fase 1 foi feita pelo orquestrador, não por subagent**, ao contrário do que a skill recomenda. O repositório é pequeno e coube; num repositório maior isso teria consumido o contexto que a Fase 3 precisa.
