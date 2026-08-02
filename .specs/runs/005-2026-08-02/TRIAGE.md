# Triagem 005 — 02/08/2026

**Status:** pronta
**Revisão ao fechar:** `39d3b00` (git) — a sessão concorrente descrita abaixo estabilizou e commitou; a árvore ficou limpa antes do fechamento desta triagem.
**Perguntas em aberto:** 0

> **Esta triagem rodou com outra sessão ativa no mesmo repositório, ao mesmo tempo — em duas rodadas.** Rodada 1: entre o fechamento da 004 (revisão `b8dc34c`) e o início desta, alguém publicou a árvore inteira em `origin/master` (`cf21c82`) fora desta skill; **durante** esta própria triagem, o HEAD avançou de novo para `5ac0ecd` (fix real do bug de CI que este documento também investigou) e depois para `39d3b00` (a sessão concorrente terminou de implementar `release-distribution/T6–T11` — `release.yml`, `make-portable.mjs`, `patch-latest-json.mjs` — e commitou tudo junto com as próprias correções desta triagem, num único commit). Rodada 2, a pedido explícito do usuário: com a árvore já estável em `39d3b00`, esta triagem auditou `release-distribution/T6–T11` que tinha ficado de fora da varredura inicial — ver Divergências #14–#15 abaixo, os dois bugs reais mais graves encontrados nesta run inteira.

---

## Perfil do projeto (Fase 0)

- **Conjunto de specs:** `.specs/` — estado: `project/STATE.md` | roadmap: `project/ROADMAP.md` | ordem/dependências: `project/EXECUTION.md` | codebase: `codebase/TESTING.md` | índice: `README.md`
- **Tasks moram em:** markdown no repositório, `features/<f>/tasks.md` (7 arquivos)
  - decisão do usuário é gravada em: o próprio `tasks.md`/`spec.md` da feature + `project/STATE.md`
  - espelhada em: — (sem rastreador externo)
  - tasks declaram os arquivos que tocam: **sim**
- **Controle de versão:** git — `git rev-parse --short HEAD` | `git status --short`
  - branch `master`, remote `git@github.com:rafaelsene01/swarmdeck.git`
  - **HEAD avançou 4 vezes durante esta única sessão de triagem**: `cf21c82` (início) → `5ac0ecd` (fix concorrente do bug de CI) → `39d3b00` (sessão concorrente termina `release-distribution/T6–T11` e commita junto com as correções desta triagem) — ver nota de concorrência acima
  - `origin/master` em `cf21c82` (confirmado por `git fetch` no início da sessão); `5ac0ecd` e `39d3b00` **não foram publicados** até o fechamento desta triagem
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
| 14 | `release-distribution/T6` "Done when" — commit inclui `Cargo.toml`, `Cargo.lock` (implícito: os da raiz) | `tasks.md:195` (antigo), `release.yml:135` | O `git add` real lista `src-tauri/Cargo.toml src-tauri/Cargo.lock` — **nenhum dos dois existe**. A versão mora no `Cargo.toml` da raiz (`version.workspace = true`); `T1` já escreve lá certo, só o `git add` de `T6` ficou com o caminho do `local-mind` (referência), nunca adaptado. Sob `set -euo pipefail`, derruba `prepare` antes de qualquer commit — e `T9/T10/T11` dependem de `prepare` | 2ª auditoria (a pedido do usuário): `ls src-tauri/Cargo.lock` → não existe; `ls Cargo.lock` (raiz) → existe; leitura de `release.yml:135` | **ALTA — bloqueia toda a Fase C, não só T5/T12** | ✅ — callout de T6/T9 reescrito, REL-06 rebaixado no `spec.md`, vira item `code` prioritário no inventário |
| 15 | `release-distribution/T7` "Done when" — bundle portátil pronto, gate `npm run test:scripts` 6/6 | `tasks.md:216-221` (antigo), `make-portable.mjs:118-119` | Os 6 testes passam `binary` explícito; o caminho **default** (o que `release.yml:225` de fato usa, sem `--binary`) resolve para `src-tauri/target/release/...`, mas o workspace Cargo builda em `<raiz>/target/release/` — nunca exercitado por nenhum teste | 2ª auditoria: `cargo build --workspace` → binário em `./target/`; `ls src-tauri/target` → não existe | **ALTA — mesma classe do #13, gate isolado verde, integração real nunca provada** | ✅ — callout de T7 reescrito, REL-14/18 rebaixados no `spec.md` |
| 16 | ~6 citações de linha erradas em `Done when` de T6, T7, T8, T9, T10, T20 (deslocadas ou apontando para trecho errado) | vários `tasks.md`/`spec.md` | Números reais conferidos linha a linha (ex.: REL-13 citava `release.yml:148`, que é um comentário — a entrada real está em `:155`; T10 dizia "job separado" quando é o mesmo job `finalize` com 2 steps) | 2ª auditoria, leitura direta de cada citação | MÉDIA/BAIXA | ✅ — todas corrigidas |

**Confirmado sem divergência (2 auditores + eu):** README "112 requisitos", "16 ferramentas MCP" batendo com `TOOL-CONTRACT.md` e `tools.rs`; `App.tsx` de fato ainda placeholder; todos os gates locais idênticos ao que `STATE.md`/`JOURNAL.md` já registravam; `.github/workflows/ci.yml` estruturalmente conforme `T2`/`T21`; `commands/*.rs` de fato invólucros finos; migrações 001-004 no disco batendo com `db/mod.rs`; `npm run test:scripts` → 25/25 real (11 `bump-version` + 6 `make-portable` + 8 `patch-latest-json`); marcador `// SPEC:` presente nos 4 arquivos novos de `release-distribution` T7/T8; `T7`/`T8` de fato `[P]`-seguras (não compartilham arquivo); nenhum `protoc` nem `push --force` em `release.yml`; condição e ordem de exclusão do job `cleanup` batem exatamente com o `Done when` de T11; secrets citados em T5/T9 batem 1:1.

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
| **Corrigir `release.yml:135`** — `git add` referencia `src-tauri/Cargo.toml`/`Cargo.lock` inexistentes | release-distribution (T6) | pipeline (mas o fix em si é 1 linha, verificável por leitura) | `code` | **sim** | achado #14 — prioridade alta, desbloqueia toda a Fase C (T9, T10, T11) |
| **Corrigir o caminho default em `make-portable.mjs:118-119`** | release-distribution (T7) | scripts | `code` | **sim** | achado #15 — trocar para `<raiz>/target/release/` ou exigir `--binary` explicitamente em `release.yml:225` |
| `release-distribution/T5` | release-distribution | build | `human-only` | não | credencial |
| `release-distribution/T2, T21` (fechar) | release-distribution | pipeline | `human-only` | não | run real existe e é vermelho; decisão do usuário nesta triagem foi não mexer |
| `release-distribution/T6, T9–T12, T19` (fechar) | release-distribution | pipeline/build | `human-only` | não | além de T5/push, agora também esperam os 2 bugs `code` acima corrigidos |

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
| `release-distribution/T2, T21, T6, T9–T12, T19` (fechar) | `human-only` | push/CI verde/credencial — e agora também os 2 bugs `code` do inventário |

---

## Não verificado

- **Causa raiz do bug de CI (`agent_prefs.rs`) foi corrigida, mas não provada em CI real** (`5ac0ecd` não publicado).
- **Os 2 bugs de `release-distribution` (achados #14, #15) não foram corrigidos** — esta skill não edita código; viram itens `code` no inventário.
- **Nenhuma validação de sintaxe de YAML** foi possível no ambiente desta triagem (sem `actionlint`, sem intérprete Python real) — os achados vêm de leitura estrutural, não de parse automatizado.
- **`agent-selection` catálogo**: nomes `antigravity`/`kimi` seguem inferência de convenção, nunca confirmados contra instalação real.
- **Aproximação T6/T7 de `mcp-task-server`** (~11/~5 de 16 testes): dividida por módulo de código, não por autoria real — documentado como aproximado no próprio `tasks.md`.
- **`multi-terminal/T12` e `mcp-task-server/T9`**: escritas por leitura de código, nunca implementadas nem testadas por esta skill (não implementa).
- **Medição de tamanho de binário** (`STATE.md`, T20) não foi refeita nesta triagem — exigiria dois builds de release completos.

---

## Recomendação

**Itens prontos para a `spec-loop` agora, em ordem de prioridade:**
1. **Corrigir `release.yml:135`** (achado #14) — desbloqueia toda a Fase C de `release-distribution` (T6, T9, T10, T11 passam a fechar assim que `T5`/`T12` também estiverem prontos).
2. **Corrigir o caminho default de `make-portable.mjs`** (achado #15).
3. `multi-terminal/T12`, `mcp-task-server/T9` — as duas lacunas de integração real.
4. Marcador `SPEC:` em 4 `mod.rs`.
5. `terminal-statuses` (4 tarefas) e `task-kanban` (trava em `mcp-task-server/T9` para sincronizar de verdade).

**`release-distribution/T2, T21` seguem fora de alcance** — mesmo corrigindo os 2 bugs de código, ainda faltam `T5` (chave de assinatura, credencial humana) e um push/disparo real, e a decisão desta triagem foi não mexer nisso agora.
