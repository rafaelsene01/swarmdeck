# Run 008 — 11/08/2026 (spec-loop)

**Status:** pausada (usuário liberou só a resolução das 2 validações pendentes — "execute a próxima tarefa" — não a run inteira; onda 2+ segue sem despacho até pedido explícito)
**Triagem que autorizou:** TRIAGE.md desta pasta, revisão `6f93e6b`
**Orquestrador:** sessão iniciada às ~19:40; retomada em sessão nova no mesmo dia

**Ponto de pausa anterior (resolvido nesta sessão):** as 2 alegações pendentes de validação foram revalidadas por agentes novos, em paralelo. `multi-terminal/T16` → **APROVADO** (ver Execução). `projects/T5` → **NEEDS-DECISION** (ver Execução e Devolvido para triagem) — o código funciona e está testado, mas diverge do `Done when` literal (`create_with_options` nova em vez de `create` migrada); estacionada, não marcada como Done. Onda 2+ continua sem despacho: o pedido desta sessão foi resolver o ponto de pausa, não continuar a fila inteira.

## Fila de execução (da triagem)

| Item | Feature | Escopo/gate | Classificação | Onda | Nota |
|---|---|---|---|---|---|
| `cargo fmt --all` | (transversal) | rust build | `code` | 1 | formata `commands/terminal.rs`, `terminal/picker_prefs.rs` |
| `T16` — `id` real em `App.tsx`→`TerminalHeader` | multi-terminal | front build | `code` | 1 | confirmado por leitura direta: backend (`terminal_set_title`) e UI de duplo-clique JÁ EXISTEM; único gap real é `App.tsx` não passar `id={terminal.id}` |
| `T5` PROJ-01/02/09 (base-dir, cor, git init) | projects | rust full | `code` | 1 | `service.rs` |
| `T5` evento push de status/atividade | terminal-statuses | rust+front full | `code` | 2 | `ipc/server.rs` + `App.tsx` (depende de T16 ter liberado `App.tsx`) |
| `T6` last-opened + `project_list_recent` | projects | rust full | `code` | 2 | `service.rs` (depende de T5 projects ter liberado `service.rs`) + migração **006** |
| `T9` pseudo-projeto Sandbox | projects | rust full | `code` | 2 | `sandbox.rs`, novo, independente |
| `T6` Resume/New Session | agent-selection | rust+front full | `code` | 3 | `session.rs`, migração **007**, `launch.rs`, possivelmente `commands/terminal.rs`+`lib.rs`, `NewTerminalDialog.tsx`, `App.tsx` (depende de terminal-statuses/T5 ter liberado `App.tsx`) |
| `T7` `CreateProjectModal` | projects | front quick | `code` | 3 | novo arquivo, depende de projects/T5 (onda 1) |
| `T3` git-cliff local | release-distribution | build | `code` | 3 | `cliff.toml` + instalação local |
| `T8` `ProjectPicker` | projects | front quick | `code` | 4 | novo arquivo, depende de projects/T6 (onda 2) |
| Reconciliar 3 contagens de `test:scripts` | release-distribution | doc | `code`/bookkeeping | 4 | só texto em `tasks.md` |

**Excluídos da fila apesar de "sim" no `TRIAGE.md` — achado desta run, não da triagem:**

| Item | Por quê excluído |
|---|---|
| `task-kanban/T8` (formulário manual) | O próprio `tasks.md` ainda tem o bloco `⛔ NEEDS-DECISION` da run 007, sem resposta registrada (pergunta de arquitetura: `task_create` novo vs. dividir em 2 tasks vs. reduzir critério). O `TRIAGE.md` 008 classificou como `code`/"sim" sem perceber a contradição — devolvido à triagem. |
| `mcp-task-server/T9` (iniciar `IpcServer` real) | Mesma situação: `tasks.md` linha 21 e o corpo da task (305-343) mantêm `⛔ NEEDS-DECISION — estacionada na run 005`, pergunta de arquitetura sobre `Arc`-wrapping de `TerminalManager`/`Db` nunca respondida. `TRIAGE.md` 008 classificou como "sim" sem notar. Devolvido à triagem. |

Ambos ficam marcados no `tasks.md` de origem (já estavam) — nenhuma edição nova feita agora, só o registro aqui e no relatório final de que a run 008 do `TRIAGE.md` errou a classificação desses dois itens.

## Execução

| Task | Onda | Implementador | Gates | Validação | Ciclos | Status |
|---|---|---|---|---|---|---|
| `projects/T5` (base-dir, cor, git init) | 1 | (sessão anterior, pós-pausa) | `cargo test --workspace` 189/189, `cargo test --lib projects::service::` 5/5, `cargo test --test projects` 8/8 intocado, clippy/fmt limpos | Validador novo (sessão de retomada): código correto e testado, mas achou desvio real — `Done when` fala em `create`, código entrega `create_with_options` nova, `create` original intocada | 1 | ⛔ **NEEDS-DECISION** — estacionada em `projects/tasks.md::T5`, `Done when` não marcado |
| `multi-terminal/T16` (`id` real de `App.tsx`→`TerminalHeader`) | 1 | (corretor, pós-pausa) | `cargo build` verde (1 warning de linker inofensivo), `npm run build` verde, `npm run test -- --run` 72/72 (15 arquivos), `cargo fmt --all -- --check` limpo | Validador novo (sessão de retomada): **APROVADO** — leu o código linha a linha (`TerminalHeader.tsx:103-109`, `TerminalPane.tsx:80`, `App.tsx:129-257`, `terminal.rs:52/113-119`), confirmou que a chave bate nos três pontos (front↔backend↔MCP) e rodou os gates ele mesmo, não confiou no relatório do corretor | 1 | ✅ **Aprovado** — checkboxes `[x]` do `Done when` (linha 570 de `tasks.md`) confirmados válidos |

## Devolvido para triagem

| Task | Pergunta | Onde ficou gravada | Estado do código |
|---|---|---|---|
| `task-kanban/T8` | (já registrada na run 007, ver `tasks.md`) | `task-kanban/tasks.md::T8` | nada alterado nesta run |
| `mcp-task-server/T9` | (já registrada na run 005, ver `tasks.md`) | `mcp-task-server/tasks.md::T9` | nada alterado nesta run |
| `projects/T5` | `create_with_options` (função nova) cumpre o `Done when` que fala em `create` (função existente), ou a task exige migrar `create` de verdade? | `projects/tasks.md::T5` | `create_with_options` no disco, testada (5/5), `create` original intocada (8/8) — nada revertido, ambas as leituras aproveitam o código atual |

## Gates medidos nesta run

| escopo | comando | resultado medido | quando |
|---|---|---|---|
| rust — testes (workspace) | `cargo test --workspace` | **189 passando, 0 falhas** (baseline 184 + 5 novos de `projects::service`) | validação de `projects/T5`, sessão de retomada |
| rust — `projects::service` | `cargo test --lib projects::service::` | **5 passando** | validação de `projects/T5`, sessão de retomada |
| rust — `tests/projects.rs` (T1, fora do escopo) | `cargo test --test projects` | **8 passando, intocado** | validação de `projects/T5`, sessão de retomada |
| rust — lint | `cargo clippy --all-targets -- -D warnings` | exit 0 — 0 warnings | validação de `projects/T5`, sessão de retomada |
| rust — formato | `cargo fmt --all -- --check` | exit 0 | validação de `projects/T5`, sessão de retomada |

## Estado da árvore no último checkpoint

(preenchido a cada checkpoint)

## Não verificado

- **`multi-terminal/T16`, achado do validador (não bloqueia, não coberto pelo `Done when`)**: entre o mount do painel e `pty_spawn` resolver, `id` fica `undefined`. Se o usuário renomear nessa janela estreita, `TerminalHeader.tsx:102` atualiza o texto exibido mesmo assim, mas o `invoke('terminal_set_title', ...)` é pulado silenciosamente (sem erro, sem retry) — o rename nunca persiste. Antes desta correção 100% dos renames se perdiam (chave errada); agora só essa janela de corrida falha. Fica como follow-up para uma task futura, não para esta.
- **Anomalia investigada e descartada**: o validador de T16 rodou `cargo test` (bônus, fora do gate desta task) e viu 1 falha em `projects::service::tests::cor_explicita_ja_usada_recusa` — mas isso coincidiu com a janela em que o validador de T5, em paralelo, tinha mutado temporariamente `service.rs` para um teste de mutação (revertido logo depois). Confirmado após os dois validadores terminarem: `git diff --stat -- src-tauri/src/projects/service.rs` → 242 inserções/1 deleção, batendo exatamente com o que o validador de T5 relatou como estado final restaurado. Falso alarme por concorrência entre validações, não defeito real.
- Itens já listados no `TRIAGE.md` (ACL das janelas secundárias, `REL-08`/`REL-22`, `git-cliff` local, bytes do binário, threshold de cor) seguem não verificados — nada nesta sessão de retomada tocou essas frentes.
