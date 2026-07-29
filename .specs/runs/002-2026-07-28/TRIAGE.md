# Triagem 002 — 28/07/2026

**Status:** pronta
**Revisão ao fechar:** `45c8430` (git) — todas as medições desta triagem feitas neste HEAD
**Perguntas em aberto:** 0

> **Frescor herdado da 001.** A triagem 001 fechou em `d8a6ebe`; o HEAD andou para `45c8430`, mas
> `git diff --stat d8a6ebe HEAD -- src src-tauri/src` **veio vazio** — o código está intacto e só
> documentação mudou. Por isso a classificação da 001 não envelheceu por deriva de código; o que
> esta triagem encontrou foram erros que já estavam lá.

---

## Perfil do projeto (Fase 0)

Reconferido nesta run; o perfil da 001 continua correto, com as ressalvas anotadas.

- **Conjunto de specs:** `.specs/` — estado: `project/STATE.md` | roadmap: `project/ROADMAP.md` | ordem: `project/EXECUTION.md` | codebase: `codebase/TESTING.md` (único arquivo de `codebase/`)
- **Tasks moram em:** markdown no repositório, `features/<f>/tasks.md` (7 arquivos, 59 headers `### T`)
  - decisão do usuário é gravada em: o próprio `tasks.md`/`spec.md` da feature + `project/STATE.md` (não existe `context.md`)
  - espelhada em: — (sem rastreador externo)
  - tasks declaram os arquivos que tocam: **sim** — campo `**Onde**`
- **Controle de versão:** git — `git rev-parse --short HEAD` | `git status --short`
  - branch `master`, remote `git@github.com:rafaelsene01/swarmdeck.git`, **5 commits**, 0 tags, árvore limpa
  - ⚠️ **o aviso da 001 se confirmou**: o HEAD andou de novo entre as duas triagens sem pedido explícito. O teste de frescor por HEAD dá falso positivo aqui. A regra correta continua sendo: **a triagem só envelhece se `src/` ou `src-tauri/src/` mudarem** (`git diff --stat <rev> HEAD -- src src-tauri/src`).
- **Regras do repositório:** `.claude/rules/spec-driven-changes.md` (não existe `AGENTS.md` nem `CLAUDE.md` na raiz)
  - marcador de rastreabilidade: **exigido** — `// SPEC: <pasta-da-feature> (ID-01, ID-02)` no topo, em inglês
  - ⚠️ **remedido nesta run: continua zero** — `grep -rn "SPEC:" src/ src-tauri/src/` não retorna nada
- **Idioma:** código e comentários em **inglês**; documentação e specs em **português**
- **Gates por escopo** (medidos nesta triagem, HEAD `45c8430`):

  | escopo | comando | resultado medido |
  |---|---|---|
  | rust — unit | `cargo test --lib` | **5 passando / 0 falhas / 0 ignorados** |
  | rust — completo | `cargo test` | **15 passando / 0 falhas** (5 binários: 5+0+5+5+0) |
  | rust — formato | `cargo fmt --check` | **exit 1 — 7 hunks em 3 arquivos** ⚠️ (ver divergência 4) |
  | front — testes | `npm test` | **0 arquivos de teste** (`--passWithNoTests`, vitest 2.1.9) |
  | front — build | `npm run build` | não remedido nesta run (a 001 mediu ok; nenhum item pronto depende) |
  | scripts | `npm run test:scripts` | **script inexistente** ⚠️ — `package.json`: `dev, build, preview, test, test:watch, tauri` |
  | pipeline | run real no GitHub Actions | **não existe `.github/`** |

- **Território compartilhado:** inalterado em relação à 001 — `src-tauri/src/db/mod.rs` (const `MIGRATIONS`, disputa da migração `002` entre `mcp/T1` e `rd/T14`), `Cargo.toml` da raiz, `package.json`, `src-tauri/src/lib.rs` (registro de comandos), `Cargo.lock`/`package-lock.json`, testes de integração Rust (**nunca `[P]`**), gate `pipeline`.
- **`human-only` neste projeto:** chave de assinatura e secrets (`rd/T5`); `workflow_dispatch` de release; qualquer prova que dependa de run real do GitHub Actions; publicar release; instalar sem direitos de administrador.

---

## Divergências encontradas (Fase 1)

Quatro divergências novas — **todas sobreviveram à triagem 001**, e duas foram *criadas* por ela.

| # | Afirmação | Onde | O que a medição diz | Evidência | Grav. | Corrigido? |
|---|---|---|---|---|---|---|
| 1 | "Todas as **37 tarefas** do M1/M2 declaram MCP: NENHUM" | `project/EXECUTION.md:123` | 38 | a 001 corrigiu o topo (`:5`) e a lista (`:97`) e registrou "corrigido **nos dois lugares**" — eram **três**. `grep -cE '^### T'` nos seis `tasks.md` de M1/M2 = 38 | MÉDIA | ✅ → 38, nomeando o que a 001 deixou passar |
| 2 | `EXECUTE ⬜` no diagrama de pipeline | `.specs/README.md:34` | `mt/T1–T4` entregues, 15 testes passando | `multi-terminal/tasks.md` (4 × ✅ Done) + `cargo test` = 15 | MÉDIA | ✅ → 🟡. **É a mesma divergência que a 001 corrigiu no `ROADMAP.md`**; este segundo lugar passou |
| 3 | "`T0` é gate de bloqueio — **confirmar** o contrato de ferramentas MCP" | `.specs/README.md:53` | a confirmação foi **revogada** pela decisão do usuário na triagem 001 | `STATE.md:26` (AD), `STATE.md:53` (Todo riscado), `mcp-task-server/tasks.md:47` | MÉDIA | ✅ → "**escrever** o `TOOL-CONTRACT.md`". Também corrigi o **título da própria T0**, que ainda dizia "Confirmar" enquanto o corpo dela dizia "Escrever" |
| 4 | "`cargo fmt --check` … **7 arquivos** com diff" | `project/STATE.md:28` (escrito pela 001) | **7 _hunks_ em 3 arquivos** | `cargo fmt --check \| grep -c '^Diff in'` = 7, mas `... \| sed 's/:[0-9]*:$//' \| sort -u \| wc -l` = **3** — `db/mod.rs`, `terminal/throttle.rs`, `tests/session.rs`. O `rustfmt` emite uma linha `Diff in` por trecho, não por arquivo | MÉDIA | ✅ remedido em `STATE.md`, sem apagar o registro original |

**Padrão que vale registrar:** as quatro divergências são do mesmo tipo — *correção aplicada em alguns lugares, não em todos*, ou *número derivado de um `grep` cuja unidade foi lida errado*. A lição para a próxima triagem: depois de corrigir um número, `grep` pelo valor **antigo** no conjunto inteiro antes de declarar a correção feita.

**Não corrigido, e por quê:** o marcador `SPEC:` continua ausente em todo o código (`src-tauri/src/db/*`, `terminal/*`), embora a regra do repositório o exija. Adicionar marcador é **edição de código**, e esta skill não implementa. Continua no inventário como item `code`.

---

## Inventário (Fase 2)

**59 tarefas, 4 concluídas (`mt/T1–T4`), 55 abertas** + 2 itens achados em auditoria.

Só `multi-terminal` está `In Progress`; as outras 6 features estão `Draft` e, pela AD de 28/07/2026, `Draft` bloqueia execução automatizada.

> ⚠️ **Correção de classificação em relação à 001.** A triagem 001 classificou `mt/T5–T11` inteiro como `code`. Lendo o campo **`Verify`** de cada task, **cinco das sete exigem o app rodando** — são `uat-agent`, não `code`. A diferença é operacional: `uat-agent` **nunca roda em paralelo**, e `mt/T7` e `mt/T9` estão marcadas `[P]` na spec. Seguir o `[P]` da spec colocaria duas tarefas dirigindo a mesma janela do app ao mesmo tempo.

| Item | Feature | Escopo/gate | Declara arquivos | Classificação | Pronto | Por quê (se não) |
|---|---|---|---|---|---|---|
| **T5** `TerminalManager` | multi-terminal | rust full | sim | `code` | **sim** | `Verify` é `cargo test manager::` → 6 passam. Sem app |
| **T8** `GridLayout` | multi-terminal | front quick | sim | `code` | **sim** | `Verify` é `npm run test GridLayout` → 5 passam. Sem app |
| formatar os 3 arquivos que o `cargo fmt --check` acusa | — (auditoria) | rust fmt | não | `code` | **sim** | pré-requisito de `rd/T1`, senão o primeiro CI nasce vermelho |
| marcador `SPEC:` ausente no código de `mt/T1–T4` | — (auditoria) | rust build | não | `code` | **sim** | a regra do repositório exige e nenhum arquivo tem |
| **T6** comandos Tauri + `Channel` | multi-terminal | build | sim | `uat-agent` | **sim** | decisão 1 respondida. `Verify`: `npm run tauri dev` + chamar `pty_spawn` pelo console do devtools. **Nunca em paralelo com outra `uat-agent`** |
| **T7** `TerminalPane` ~~`[P]`~~ | multi-terminal | build | sim | `uat-agent` | **sim** | `Verify`: rodar o app, digitar, ver eco, redimensionar. **O `[P]` não vale contra `T9`** |
| **T9** `TerminalHeader` ~~`[P]`~~ | multi-terminal | build | sim | `uat-agent` | **sim** | `Verify`: inspeção **visual** no app. **O `[P]` não vale contra `T7`** |
| **T10** maximizar/minimizar/fechar | multi-terminal | front quick | sim | `uat-agent` | **sim** | `Verify`: minimizar terminal com `ping -t` rodando e conferir que a saída não sumiu |
| **T11** persistência de layout | multi-terminal | rust full | sim | `uat-agent` | **sim** | `Verify`: montar layout 2×2, fechar o app, reabrir, conferir restauração |
| T1–T4 (4) | agent-selection | rust + vitest | sim | `code` | não | `tasks.md` em `Draft` |
| T0–T8 (9) | mcp-task-server | rust full | sim | `code` | não | `Draft` (T0 já está redigível: decisão 1 da triagem 001) |
| T1–T4 (4) | projects | rust + vitest | sim | `code` | não | `Draft` + dependem de `mcp/T1` |
| T1–T4 (4) | terminal-statuses | rust + vitest | sim | `code` | não | `Draft` + dependem de `mcp/T4` |
| T1–T6 (6) | task-kanban | rust + vitest | sim | `code` | não | `Draft` + dependem de `mcp/T5` |
| T1, T3, T4, T7, T8, T13–T18, T20 (12) | release-distribution | scripts/build/quick/full | sim | `code` | não | `Draft` |
| T5 | release-distribution | — | sim | `human-only` | não | chave de assinatura + secrets |
| T2, T6, T9–T12, T19, T21 (8) | release-distribution | **pipeline** | sim | `human-only` | não | a prova é um run real do GitHub Actions |

**Por rótulo, depois da decisão 1:** `code` pronto: **2 tarefas + 2 itens de auditoria** · `uat-agent` pronto: **5** · **total pronto para a `spec-loop`: 9 itens** · `code` retido por `Draft`: **39** · `needs-decision`: **0** · `human-only`: **9** · `blocked`: 0 · `moot`: 0.

**Ordem que a `spec-loop` deve respeitar** — `T6` é dependência de `T7`, `T9`, `T10` e `T11`, então a fila não é plana:

| Onda | Itens | Observação |
|---|---|---|
| 1 | `fmt` (3 arquivos) · marcadores `SPEC:` · **T5** | os dois de auditoria são `code` e tocam arquivos já existentes; `T5` depende de `T4` (feito) |
| 2 | **T6** | `uat-agent` sozinha — é gate de tudo que vem depois |
| 3 | **T8** (`code`) **+ uma** de `T7`/`T9` | `T8` não toca o app; `T7` e `T9` **não podem ir juntas** |
| 4 | a outra de `T7`/`T9` | — |
| 5 | **T10** → **T11** | ambas `uat-agent`, ambas em série |

---

## Decisões do usuário (Fase 3)

*Escrito ANTES da primeira pergunta.*

| # | Pergunta | Por que só o usuário responde | Resposta | Data | Onde ficou gravada |
|---|---|---|---|---|---|
| 1 | As cinco tarefas cujo `Verify` exige o app rodando (`mt/T6, T7, T9, T10, T11`) podem ser verificadas por um agente dirigindo o app, ou o `Verify` delas é do mantenedor — tornando-as `human-only`? | Depende da máquina e da disposição do usuário, não do repositório. `npm run tauri dev` abre uma janela GUI no Windows; nada nas specs diz se um agente pode dirigi-la, e `mt/T9` pede explicitamente "inspeção **visual**". A `STATE.md` § Lições já registra que **a automação de clique nesta janela é instável**. Errar para o lado otimista produz um "verificado" que ninguém viu. | **O agente dirige o app.** As 5 são `uat-agent` e entram na fila — com três regras de contenção: nunca duas `uat-agent` em paralelo (sobrepõe o `[P]` de T7/T9), reler o screenshot antes de afirmar, e verificação não confirmada **não** fecha a task | 28/07/2026 | `features/multi-terminal/tasks.md` — bloco **"✅ DECISÃO DO USUÁRIO — triagem 002"** + diagrama da Fase 3 reescrito com o aviso `T7`+`T9` · `project/STATE.md` — **AD nova** com o trade-off · `codebase/TESTING.md` — seção nova **"Sobre o `Verify` que exige o app rodando (`uat-agent`)"**, que é onde um implementador frio procura como provar |

**Teste do contrato aplicado à resposta** — *um agente que leia só a spec da feature, sem esta conversa, consegue executar sem perguntar?*
**Sim.** O bloco em `multi-terminal/tasks.md` diz quem dirige o app, o que fazer quando o clique não pega, e o que fazer quando a verificação não confirma. Cada task já trazia o seu `Verify` concreto. A regra de paralelismo virou critério objetivo e legível por máquina — *nenhuma dupla `uat-agent` junta* — em vez de depender de o executor inferir que `[P]` não cobre disputa por janela. `TESTING.md` repete a regra no documento que descreve como se prova qualquer coisa neste projeto, então o implementador acha por dois caminhos.

---

## Fora da execução

| Item | Rótulo | Por quê |
|---|---|---|
| `rd/T5` — chave de assinatura e secrets | `human-only` | `tauri signer generate` + cadastro de secrets no GitHub |
| `rd/T2, T6, T9–T12, T19, T21` | `human-only` | gate `pipeline`: a prova é o run no GitHub Actions, que exige push autorizado |
| 39 tarefas em 6 features | retido | `tasks.md` em `Draft` — a AD de 28/07/2026 bloqueia execução automatizada. Para liberar, o mantenedor troca `**Status**` e roda triagem nova |

---

## Não verificado

- **Não rodei `cargo clippy`.** O Todo do `STATE.md` continua aberto; nenhum item pronto depende dele.
- **Não remedi `npm run build`.** A 001 mediu ok e o front não mudou; a linha do gate diz isso explicitamente em vez de repetir o número dela como se fosse desta run.
- **Não abri as 55 tasks abertas uma a uma.** Abri em detalhe as 7 de `multi-terminal` (a única feature `In Progress`) — e foi exatamente aí que a reclassificação `code`→`uat-agent` apareceu. As 39 retidas por `Draft` foram classificadas por feature, a partir do header e do grafo do `EXECUTION.md`. **É plausível que a mesma reclassificação apareça nelas quando forem liberadas.**
- **Não validei os `spec.md` das 6 features sem `tasks.md`** (`mcp-management`, `skills-manager`, `worktrees`, `conversation-cleanup`, `notifications`, `onboarding-agent`) — M3–M5, fora do inventário por não terem tarefas escritas, não por terem sido verificadas.
- **Não corrigi o `TRIAGE.md` da 001.** Ele é registro histórico de uma run; os erros dele estão remediados nos documentos vivos (`STATE.md`, `EXECUTION.md`, `README.md`), que é onde um leitor pode ser enganado.
- **A auditoria foi feita pelo orquestrador, não por subagent** — o repositório é pequeno e coube no contexto.
