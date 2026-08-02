# Triagem 005 — 02/08/2026

**Status:** pronta
**Revisão ao fechar:** `5ac0ecd` (git) — ⚠️ **ver nota de concorrência abaixo: uma sessão fora desta skill continuou commitando durante esta triagem**, então esta revisão é um instantâneo, não um ponto de repouso garantido.
**Perguntas em aberto:** 0

> **Esta triagem rodou com outra sessão ativa no mesmo repositório, ao mesmo tempo.** Entre o fechamento da 004 (revisão `b8dc34c`) e o início desta, alguém publicou a árvore inteira em `origin/master` (`cf21c82`) fora desta skill. E **durante** esta própria triagem, o HEAD local avançou mais uma vez, para `5ac0ecd` — um fix real do bug de CI que este documento também investigou, e (ainda não commitado ao fechar) uma implementação em andamento de `release-distribution/T6–T11` (arquivos novos: `.github/workflows/release.yml`, `scripts/make-portable.mjs`, `scripts/patch-latest-json.mjs`, e o próprio `release-distribution/spec.md` já reescrito com uma tabela de rastreabilidade corrigida — trabalho de qualidade equivalente ao desta triagem, feito por outra via). Por isso esta triagem **não audita `release-distribution` T6–T11**: seria auditar um alvo em movimento, e o autor concorrente já está aplicando o mesmo rigor. Recomendação no fim deste documento.

---

## Perfil do projeto (Fase 0)

- **Conjunto de specs:** `.specs/` — estado: `project/STATE.md` | roadmap: `project/ROADMAP.md` | ordem/dependências: `project/EXECUTION.md` | codebase: `codebase/TESTING.md` | índice: `README.md`
- **Tasks moram em:** markdown no repositório, `features/<f>/tasks.md` (7 arquivos)
  - decisão do usuário é gravada em: o próprio `tasks.md`/`spec.md` da feature + `project/STATE.md`
  - espelhada em: — (sem rastreador externo)
  - tasks declaram os arquivos que tocam: **sim**
- **Controle de versão:** git — `git rev-parse --short HEAD` | `git status --short`
  - branch `master`, remote `git@github.com:rafaelsene01/swarmdeck.git`
  - **HEAD avançou 3 vezes durante esta única sessão de triagem**: `cf21c82` (início) → `5ac0ecd` (fix concorrente do bug de CI) — ver nota de concorrência acima
  - `origin/master` em `cf21c82` (confirmado por `git fetch`); `5ac0ecd` e o trabalho em andamento de `release-distribution` **não foram publicados** até o fechamento desta triagem
- **Regras do repositório:** `.claude/rules/spec-driven-changes.md` (marcador `// SPEC:` obrigatório)
- **Idioma:** código/comentários em inglês; specs em português
- **Gates por escopo** (medidos nesta triagem, HEAD `cf21c82`, antes do fix concorrente):

  | escopo | comando | resultado local (Windows) | resultado real no CI (Linux) |
  |---|---|---|---|
  | rust — completo | `cargo test --workspace` | **154 passando / 0 falhas** | **FALHA** em `cf21c82` — `agent_prefs.rs`, 2 testes. Causa raiz achada e corrigida em `5ac0ecd` (fora desta skill); não publicada, não reprovada em CI real |
  | rust — formato | `cargo fmt --all -- --check` | exit 0 | passa |
  | rust — lint | `cargo clippy --workspace --all-targets -- -D warnings` | exit 0 | passa |
  | front — testes | `npm run test -- --run` | **27 passando / 0 falhas** | passa |
  | front — build | `npm run build` | ok | passa |
  | scripts | `npm run test:scripts` | **11 passando / 0 falhas** | (dentro do job `frontend`) |
  | pipeline | run real no GitHub Actions | — | 2 runs no histórico (`gh run list`), **os 2 falharam** — ver Divergências |
- **Território compartilhado:** `src-tauri/src/db/mod.rs`, `Cargo.toml`/`Cargo.lock` raiz, `package.json`/`package-lock.json`, `src-tauri/src/lib.rs`, testes de integração Rust (nunca `[P]`), gate `pipeline` (nunca duas tarefas do mesmo gate em paralelo — **e, com histórico real de CI agora existindo, evitar acumular pushes vermelhos**).
- **`human-only` neste projeto:** chave de assinatura e secrets (`release-distribution/T5`); `workflow_dispatch` de release; publicar release; instalar sem admin. `git push` não é mais automaticamente `human-only` por ausência de autorização — já aconteceu fora desta skill duas vezes nesta mesma janela de tempo.

---

## Divergências encontradas (Fase 1)

Duas fontes: leitura direta (minha) e um subagent de auditoria somente-leitura despachado sobre o código pós-run-004 (nunca auditado antes, ~10.500 linhas novas).

| # | Afirmação | Onde | O que o código diz | Evidência | Grav. | Corrigido? |
|---|---|---|---|---|---|---|
| 1 | `mcp-task-server/T1` **Onde**/**Verify** citam `002_tasks.sql` / `migrations::002` | `mcp-task-server/tasks.md:91,108` | Arquivo real `003_tasks.sql`; testes reais em `tests/tasks_schema.rs` sem esse prefixo | `ls migrations/`; `grep fn migracao tests/tasks_schema.rs` | ALTA | ✅ |
| 2 | Diagrama cita "migração 002" para `mcp/T1` | `EXECUTION.md:28` | Mesma raiz do #1 | idem | MÉDIA | ✅ |
| 3 | "Nenhum push nesta run" ainda apresentado como bloqueio de T2/T21 | `STATE.md`, `release-distribution/tasks.md` | Push já aconteceu fora desta skill; CI rodou 2x, 2 falhas | `git fetch`, `gh run list` | ALTA | ✅ |
| 4 | `agent-selection/T3` **Onde** cita migração `003_agent_prefs.sql` | `agent-selection/tasks.md:85` | Arquivo real `004_agent_prefs.sql` (`003` já ocupado por `mcp/T1`) | `ls migrations/`; `db/mod.rs:29` | ALTA | ✅ |
| 5 | `mcp-task-server/T3` **Verify**: `cargo test tasks::service` → 9 | `tasks.md:162` | Filtro real casa 0; testes reais são funções soltas em `tests/task_service.rs` (9 lá) | `cargo test tasks::service` → 0; `cargo test --test task_service` → 9 | ALTA | ✅ |
| 6 | `projects/T1` **Verify**: `cargo test projects::service` → 7 | `tasks.md:49` + Done-when | Filtro real casa 0; `tests/projects.rs` tem **8**, não 7 (teste de regressão do bug `\\?\` não contado) | `cargo test projects::service` → 0; `cargo test --test projects` → 8 | ALTA | ✅ |
| 7 | `agent-selection/T2`: corpo diz "5 testes"/`cargo test agents::launch` → 5; tabela diz 6 | `tasks.md:20,72,76` | Filtro real = 4 (unit); +2 integration em `tests/agent_launch.rs` = 6 total | `cargo test agents::launch` → 4; `cargo test --test agent_launch` → 2 | ALTA | ✅ |
| 8 | `mcp-task-server/T4` **Verify**: `cargo test terminal::meta` → 8 | `tasks.md:189` + tabela | Filtro real = 9 (unit) + 1 integration não capturada = 10 total | `cargo test --lib terminal::meta` → 9; `cargo test --test terminal_meta` → 1 | MÉDIA | ✅ |
| 9 | `mcp-task-server/T5` **Verify**: `cargo test ipc::` → 6; tabela diz 7 | `tasks.md:215` + tabela | Filtro real = 1 (unit); `tests/ipc_server.rs` sozinho tem 15 = 16 total | `cargo test --lib ipc::` → 1; `cargo test --test ipc_server` → 15 | ALTA | ✅ |
| 10 | `mcp-task-server/T6, T7`: tabela soma 6+21=27 | `tasks.md:18-19` | Crate `swarmdeck-mcp` inteiro tem **16** testes, não 27 | `cargo test -p swarmdeck-mcp` → 16 | ALTA | ✅ (aproximado por módulo, ver nota no arquivo) |
| 11 | `mod.rs` sem marcador `// SPEC:` em `projects/`, `tasks/`, `commands/`, `ipc/` | 4 arquivos | Regra do repositório exige; `agents/mod.rs` (mesma onda) tem o marcador, os outros 4 não | `grep -n "SPEC:" src-tauri/src/{projects,tasks,commands,ipc}/mod.rs` → vazio | MÉDIA | ❌ — edição de código, fora do escopo desta skill. Vira item `code` no inventário |
| 12 | 4 `spec.md` (`multi-terminal`, `agent-selection`, `projects`, `mcp-task-server`) diziam "0 requisitos mapeados para tarefas" | tabelas de Rastreabilidade | As 4 features estão com gate 100% `✅ Done`; requisitos claramente cobertos, campo `Requisito` de cada task confirma | leitura cruzada `tasks.md` × `spec.md` das 4 features | ALTA — achado meu, não do auditor; tão grave quanto os acima | ✅ |
| 13 | `mcp-task-server` "Done" (T0–T8) sem ressalva | `tasks.md:5`, `ROADMAP.md` | `IpcServer::for_app(...).serve()` nunca é chamado em `src-tauri/src/lib.rs` — sidecar não conecta em uso real; todo o round-trip provado só contra `IpcServer` de teste | `grep -rn "IpcServer" src-tauri/src/lib.rs` → vazio; doc-comment de `for_app` já antecipava o gap | ALTA — achado do auditor | ✅ — virou `⛔ NEEDS-DECISION`, resolvida (ver Decisões) |

**Confirmado sem divergência (auditor + eu):** README "112 requisitos", "16 ferramentas MCP" batendo com `TOOL-CONTRACT.md` e `tools.rs`; `App.tsx` de fato ainda placeholder; todos os 6 gates locais idênticos ao que `STATE.md`/`JOURNAL.md` já registravam; `.github/workflows/ci.yml` estruturalmente conforme `T2`/`T21`; `commands/*.rs` de fato invólucros finos; migrações 001-004 no disco batendo com `db/mod.rs`.

---

## Inventário (Fase 2)

| Item | Feature | Escopo/gate | Classificação | Pronto | Nota |
|---|---|---|---|---|---|
| `multi-terminal/T12` — montar `App.tsx` | multi-terminal | build → depois `uat-agent` | `code`/`uat-agent` | **sim** | task nova, criada nesta triagem — decisão do usuário |
| `mcp-task-server/T9` — iniciar `IpcServer` no app real | mcp-task-server | build → depois `uat-agent` | `code`/`uat-agent` | **sim** | task nova, criada nesta triagem — decisão do usuário |
| Marcador `// SPEC:` ausente em 4 `mod.rs` | vários | rust build | `code` | **sim** | achado #11, edição trivial de 1 linha por arquivo |
| `terminal-statuses` (4 tarefas) | terminal-statuses | rust/vitest | `code` | **sim** | liberada nesta triagem (`Draft`→`In Progress`) |
| `task-kanban` (6 tarefas) | task-kanban | rust/vitest | `code`/`uat-agent`* | parcial | liberada, mas depende de `mcp-task-server/T5` **e**, para sincronizar de verdade, de `T9` (nova) — ver `EXECUTION.md` |
| Bug de CI em `agent_prefs.rs` (Linux) | release-distribution | pipeline | — | — | causa raiz achada e corrigida **fora desta skill** durante a sessão (`5ac0ecd`); decisão do usuário: não investigar/publicar nesta rodada |
| `release-distribution` T6–T11 | release-distribution | vários | — | — | **fora do escopo desta triagem** — execução concorrente em andamento fora desta skill; reavaliar numa triagem futura depois que estabilizar |
| `release-distribution/T5` | release-distribution | build | `human-only` | não | credencial |
| `release-distribution/T2, T21` (fechar) | release-distribution | pipeline | `human-only` | não | run real existe e é vermelho; decisão do usuário nesta triagem foi não mexer |
| `release-distribution/T6, T9–T12, T19` | release-distribution | pipeline/build | `human-only` | não | dependem de T5 e/ou push publicado e verde |

---

## Decisões do usuário (Fase 3)

| # | Pergunta | Resposta | Onde ficou gravada |
|---|---|---|---|
| 1 | Autorizar push(es) da `spec-loop` para iterar até o CI Linux ficar verde? | **Não mexer nisso agora.** (Nota: o mantenedor corrigiu a causa raiz por conta própria, em paralelo, na mesma sessão — commit `5ac0ecd`, não publicado.) | `STATE.md` (AD 02/08, duas entradas); `release-distribution/tasks.md` (T2, T21) |
| 2 | Gap de `App.tsx` não integrado (`multi-terminal/T7,T9,T10,T11`) — task nova ou reabrir existente? | **Criar task nova.** | `multi-terminal/tasks.md` (T12 criada; T7,T9,T10,T11 apontam para ela); `STATE.md` (AD resolvida) |
| 3 | Liberar `terminal-statuses`/`task-kanban` (`Draft`→`In Progress`)? | **Liberar as duas.** | `terminal-statuses/tasks.md`, `task-kanban/tasks.md` (`**Status**`); `ROADMAP.md`; `STATE.md` (AD nova) |
| 4 | `IpcServer` nunca iniciado no app real (`mcp-task-server/T5`) — task nova ou reabrir T5? | **Criar task nova.** | `mcp-task-server/tasks.md` (T9 criada; T5 aponta para ela); `STATE.md` (AD resolvida) |

**Teste do contrato** (agente frio, só a spec, sem esta conversa, consegue executar sem perguntar?): **Sim** para as 4. T12 e T9 têm `O quê`/`Onde`/`Depende de`/`Done when`/`Verify` completos, escritos a partir de leitura direta do código (inclusive um doc-comment em `ipc/server.rs` que já antecipava T9). Os `**Status**` de `terminal-statuses`/`task-kanban` são o campo que a `spec-loop` lê para saber se pode começar — já atualizados.

---

## Fora da execução

| Item | Rótulo | Por quê |
|---|---|---|
| `release-distribution/T5` | `human-only` | credencial que nenhum agente tem |
| `release-distribution/T2, T21, T6, T9–T12, T19` | `human-only` | push/CI verde/credencial |
| `release-distribution/T6–T11` | fora de escopo | execução concorrente ativa fora desta skill — não auditado |

---

## Não verificado

- **Causa raiz do bug de CI foi corrigida, mas não provada em CI real** (`5ac0ecd` não publicado).
- **`release-distribution/T6–T11`**: código apareceu/mudou várias vezes durante esta triagem (outra sessão ativa); não auditado por esta skill — o autor concorrente já aplicou correção de rastreabilidade equivalente em `release-distribution/spec.md`.
- **`agent-selection` catálogo**: nomes `antigravity`/`kimi` seguem inferência de convenção, nunca confirmados contra instalação real.
- **Aproximação T6/T7 de `mcp-task-server`** (~11/~5 de 16 testes): dividida por módulo de código, não por autoria real — documentado como aproximado no próprio `tasks.md`.
- **`multi-terminal/T12` e `mcp-task-server/T9`**: escritas por leitura de código, nunca implementadas nem testadas por esta skill (não implementa).

---

## Recomendação

**Itens prontos para a `spec-loop` agora:** `multi-terminal/T12`, `mcp-task-server/T9`, marcador `SPEC:` em 4 `mod.rs`, `terminal-statuses` (4 tarefas), `task-kanban` (parcial — trava em T9 para sincronizar de verdade).

**Antes de rodar a `spec-loop`:** verificar se a sessão concorrente que estava implementando `release-distribution/T6–T11` já terminou (`git log`, `git status`) — se ainda estiver ativa, uma nova run corre o risco de colidir em `Cargo.toml`/`package.json`/território compartilhado. Se terminou e commitou, uma triagem rápida focada só em `release-distribution` (reconciliar `tasks.md` com o que `spec.md` já corrigiu sozinho) fecha o quadro antes da próxima execução.
