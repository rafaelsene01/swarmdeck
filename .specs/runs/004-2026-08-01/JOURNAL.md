# Run 004 — 01/08/2026

**Status:** concluída
**Modo:** direto — escolhido pelo usuário às 12:40 (aprox.)
**Triagem que autorizou:** TRIAGE.md desta pasta, revisão `b8dc34c`
**Orquestrador:** sessão iniciada em 01/08/2026

## Fila de execução (da triagem)

| Item | Feature | Escopo/gate | Classificação | Onda | (se sozinha) por quê |
|---|---|---|---|---|---|
| fmt (4 arquivos) | — (auditoria) | rust fmt | code | 1 | — |
| marcador SPEC (3 arquivos: db/mod.rs, throttle.rs, session.rs) | multi-terminal | rust build | code | 1 | — |
| T14 Persistência das preferências de update | release-distribution | rust full | code | 2 | — |
| T0 Contrato de ferramentas MCP | mcp-task-server | doc/none | code | 2 | — |
| T1 Catálogo de agentes e detecção no PATH | agent-selection | quick | code | 2 | — |
| T1 Migração 002 (mcp-task-server) | mcp-task-server | rust full | code | 3 | território compartilhado db/mod.rs, sequencial após onda 2 (T14 já fechou a 002) |
| T2 Lançamento do agente na sessão (agent-selection) | agent-selection | quick/build | code | 3 | cadeia após T1 |
| T6 Comandos Tauri (multi-terminal) | multi-terminal | build | uat-agent | 4 | UAT nunca em paralelo |
| T7 TerminalPane (multi-terminal) | multi-terminal | build | uat-agent | 4 | UAT nunca em paralelo |
| T9 TerminalHeader (multi-terminal) | multi-terminal | build | uat-agent | 4 | UAT nunca em paralelo |
| T10 Maximizar/minimizar/fechar (multi-terminal) | multi-terminal | quick | uat-agent | 4 | UAT nunca em paralelo |
| T11 Persistência de layout (multi-terminal) | multi-terminal | full | uat-agent | 4 | UAT nunca em paralelo |
| (restante da cadeia mcp-task-server T2-T8, agent-selection T3-T4, projects T1-T4) | — | — | code | 5+ | liberam conforme a fila anda |

## Execução

| Task | Onda | Implementador | Gates | Validação | Ciclos | Status |
|---|---|---|---|---|---|---|
| marcador SPEC (3 arquivos) | 1 | general-purpose | `cargo build` limpo (1 warning pré-existente, não relacionado) | — (modo direto) | 0 | Completo |
| fmt (4 arquivos) | 1 | general-purpose | `cargo fmt --all -- --check` exit 0 após fix; `cargo test --lib` 11 passed/0 failed | — (modo direto) | 0 | Completo |
| mcp-task-server/T0 (TOOL-CONTRACT.md) | 2 | general-purpose | gate: none (documento) | — (modo direto) | 0 | Completo |
| release-distribution/T14 (persistência update) | 2 | general-purpose | `cargo test` 35 passed/0 failed (31 baseline + 4 novos); `npm run test` 9 passed | — (modo direto) | 0 | Completo — DESVIO: também editou `tests/db.rs` (fora da lista autorizada) para corrigir 2 asserções hardcoded `schema_version()==1`→`2`, consequência mecânica de nova migração, não mudança de design |
| agent-selection/T1 (catálogo + detecção PATH) | 2 | general-purpose | `cargo test --lib` 16 passed/0 failed (11 baseline + 5 novos); `cargo test agents::catalog` 5/5; `npm run test` 9 passed | — (modo direto) | 0 | Completo — DESVIO: nomes de comando `antigravity`/`kimi` inferidos por convenção, sem confirmação de instalação real (não bloqueante, catálogo fácil de corrigir depois) |
| mcp-task-server/T1 (schema tasks/projects/status, migração 003) | 3 | general-purpose | `cargo test` 45 passed/0 failed (40 baseline + 5 novos) | — (modo direto) | 0 | Completo — DESVIO: migração usou número `003` (não `002`, que `tasks.md` ainda cita — `002` já estava reservado por T14 desta mesma run); `tasks.md` do mcp-task-server NÃO foi atualizado para refletir `003` — pendente de consolidação; também editou `tests/db.rs` e `tests/settings.rs` (fora da lista autorizada) para atualizar `schema_version` esperado de 2→3, consequência mecânica |
| agent-selection/T2 (lançamento do agente na sessão) | 3 | general-purpose | `cargo test` 51 passed/0 failed (45 baseline + 6 novos, 1 a mais que o pedido por robustez) | — (modo direto) | 0 | Completo — DESVIO: warning exposto via `TerminalSnapshot.launch_warning` (não `take_launch_warning`); teste extra de integração ponta-a-ponta; observou flakiness pontual e não reproduzida em `tests/db.rs` num baseline intermediário — não investigada (fora do território da task) |
| multi-terminal/T6 (Verify UAT) | 4 | general-purpose (uat-agent) | — (UAT, não gate automatizado) | — (modo direto) | 0 | **CONFIRMADO** — app subido via CDP, `pty_spawn` chamado pelo console, bytes reais de `cmd.exe` recebidos no `Channel` |
| multi-terminal/T7 (Verify UAT) | 4 | general-purpose (uat-agent) | — | — (modo direto) | 0 | **Estacionada — NEEDS-DECISION.** `App.tsx` não integra `TerminalPane` — não há UI real para digitar/redimensionar. Ver STATE.md e `multi-terminal/tasks.md` |
| multi-terminal/T9 (Verify UAT) | 4 | general-purpose (uat-agent) | — | — (modo direto) | 0 | **Estacionada — NEEDS-DECISION.** Mesma causa de T7 |
| multi-terminal/T10 (Verify UAT) | 4 | general-purpose (uat-agent) | — | — (modo direto) | 0 | **Estacionada — NEEDS-DECISION.** Mesma causa de T7 |
| multi-terminal/T11 (Verify UAT) | 4 | general-purpose (uat-agent) | — | — (modo direto) | 0 | **Estacionada — NEEDS-DECISION.** Mesma causa de T7 |
| mcp-task-server/T2 (máquina de estados) | 5 | general-purpose | `cargo test --lib` 28 passed/0 failed (8 novos); `npm run test` 9 passed | — (modo direto) | 0 | Completo — DESVIO: `start` a partir de `in_progress` é idempotente (spec não define; decisão documentada no código) |
| projects/T1 (ProjectService CRUD) | 5 | general-purpose | `cargo test --test projects` 7/7; suíte completa 74 testes, **4 falhas fora do território** (`tests/db.rs`, `settings.rs`, `tasks_schema.rs` — `schema_version` hardcoded em `3`, mas `agent-selection/T3` concorrente adicionou migração `004`) | — (modo direto) | 0 | Completo — paleta de 8 cores hex documentada; falhas de versão de schema **corrigidas pela própria T3** (ver abaixo) |
| agent-selection/T3 (preferência de agente padrão, migração 004) | 5 | general-purpose | `cargo test` 74 passed/0 failed (59 baseline + 4 novos + 7 de `projects/T1` chegando em paralelo) | — (modo direto) | 0 | Completo — DESVIO: também corrigiu `tests/db.rs`, `settings.rs`, `tasks_schema.rs` (schema_version 3→4), resolvendo as 4 falhas que `projects/T1` reportou como fora do seu território |
| projects/T2 (resolução de projeto por diretório) | 6 | general-purpose | `cargo test --lib` 38 passed/0 failed (32 baseline + 6 novos); `npm run test` 12 passed | — (modo direto) | 0 | Completo |
| agent-selection/T4 (UI seleção de agente) | 6 | general-purpose | `npm run test` 13 passed/0 failed | — (modo direto) | 0 | Completo — **defeito descoberto depois por `projects/T3`: `npm run build` (tsc) falha em `AgentPanel.test.tsx:53` (TS2345), gate que `npm run test` (vitest) não pega. Pendente de correção mecânica** |
| projects/T3 (comandos Tauri de projeto) | 7 | general-purpose | `cargo build` limpo; `npm run build` **FALHOU** — erro pré-existente em `AgentPanel.test.tsx` (task `agent-selection/T4`, onda 6), não desta task | — (modo direto) | 0 | Parcial — bloco Rust completo e correto; gate `npm run build` bloqueado por defeito de outra task |
| projects/T4 (UI de gerenciamento de projetos) | 7 | general-purpose | `npm run test` 18 passed/0 failed (13 baseline + 5 novos, 1 a mais que o pedido — cobertura extra do estado vazio) | — (modo direto) | 0 | Completo |
| correção: TS2345 em `AgentPanel.test.tsx` (bloqueava `npm run build`) | 7 (fix) | general-purpose | `npm run build` exit 0; `npm run test` 18 passed/0 failed | — (modo direto) | 0 | Completo — causa: `noUncheckedIndexedAccess` tipava `badges[0]` como `HTMLElement \| undefined`; corrigido com `?? null`, sem mudar comportamento em runtime |
| mcp-task-server/T3 (TaskService) | 7 | general-purpose | `cargo test` 89 passed/0 failed (80 baseline + 9 novos) | — (modo direto) | 0 | Completo — DESVIO: teto de truncamento 8000 chars; **descobriu bug real**: `ProjectService` grava path canonicalizado com prefixo verbatim `\\?\` do Windows, quebrando `projects::resolve` para qualquer `cwd` não-canonicalizado (produção real). Contornado localmente; correção na causa raiz despachada em seguida |
| correção: bug de path verbatim `\\?\` do Windows em `ProjectService`/`resolve` | 7 (fix) | general-purpose | `cargo test` 90 passed/0 failed (89 baseline + 1 novo); `cargo build` limpo | — (modo direto) | 0 | Completo — corrigido na origem (`require_existing_dir`), workaround local em `tasks/service.rs` removido (código morto depois do fix); `projects/T3` (comandos Tauri) se beneficia automaticamente |
| mcp-task-server/T4 (TerminalMetaService) | 8 | general-purpose | 8/8 testes próprios passando (7 inline + 1 integration); 3 falhas observadas eram de `tasks/similarity.rs` (T8, ainda em progresso na mesma wave, fora do território) | — (modo direto) | 0 | Completo |
| mcp-task-server/T8 (similaridade de tarefas) | 8 | general-purpose (1ª tentativa cortada por limite de sessão; retomada por um 2º agente verificador) | `cargo test --lib` 51 passed/0 failed (6 de similarity); `npm run test` 18 passed | — (modo direto) | 0 | Completo — **bug real de algoritmo encontrado na verificação**: coeficiente de Dice não batia o critério da spec (par "Add pagination"/"Implement pagination in the list" pontuava 0.43, exigido >0.70); trocado para coeficiente de overlap (Szymkiewicz-Simpson), agora 0.75. Mostra o valor de uma segunda passada mesmo em modo direto |
| mcp-task-server/T5 (IpcServer) | 9 (sozinha) | general-purpose | `cargo test` 111 passed/0 failed (104 baseline + 7 novos, 1 a mais que o pedido); `cargo build` limpo | — (modo direto) | 0 | Completo — dependência `interprocess = "2.4.3"` adicionada (autorizada pela task); transporte via `local_socket` (fachada oficial da crate); Unix socket com modo 0600, Windows fica no ACL padrão do named pipe (documentado como limitação conhecida, não como omissão) |
| mcp-task-server/T6 (sidecar `swarmdeck-mcp`, esqueleto + `check_active`) | 10 (sozinha) | general-purpose | `cargo test -p swarmdeck-mcp` 6/6 (4 pedidos + 2 extras); `cargo test` workspace 117 passed/0 failed (111 + 6); `cargo clippy -p swarmdeck-mcp` 0 warnings | — (modo direto) | 0 | Completo — `Cargo.toml` raiz ativou `crates/*`; novo crate `crates/swarmdeck-mcp` com `rmcp 3.1.0` + `tokio` (só neste crate, `src-tauri` continua síncrono); handshake testado ponta-a-ponta via `tokio::io::duplex`, mesmo padrão dos testes upstream do `rmcp` |
| mcp-task-server/T7 (catálogo completo de 16 ferramentas MCP, app + sidecar) | 11 (sozinha) | general-purpose | `cargo test --workspace` 138 passed/0 failed (117 baseline + 21 novos); `cargo build --workspace` limpo | — (modo direto) | 0 | Completo — **feature mcp-task-server 100% concluída (T0–T8)**. Corrigido gap de escopo: roteamento server-side das 15 ferramentas nunca tinha sido atribuído a nenhuma task, autorizado nesta dispatch. DESVIO: `find_related_active_tasks` só devolve o melhor match (limite de `similarity.rs`, fora do território); `long_title` de `set_terminal_title` aceito mas descartado (falta campo em `TerminalMeta`) |
| correção: clippy `double_ended_iterator_last`/`cloned_ref_to_slice_refs` em `projects/resolve.rs` | 12 (fix) | general-purpose | `cargo clippy --workspace --all-targets -- -D warnings` exit 0 (era exit 1, 5 erros); `cargo test --workspace` 138 passed/0 failed, sem alteração de comportamento | — (modo direto) | 0 | Completo — **workspace inteiro limpo em clippy e testes** |
| release-distribution/T15 (verificação de atualização) | 13 (sozinha) | general-purpose | `cargo test --lib` 61 passed/0 failed (54 baseline + 7 novos); `npm run test` 18 passed; `cargo build` limpo | — (modo direto) | 0 | Completo — `tauri-plugin-updater 2.10.1` + `semver 1.0.28` reconfirmados antes de fixar; rede abstraída via injeção de closure (`fetch_remote`/`is_skipped`), sem mock de framework; seleção de entrada do manifesto por `flavor` é código próprio (plugin não expõe o mapa completo) |
| release-distribution/T16 (atualização do modo portátil) | 14 (sozinha) | general-purpose | `cargo test --lib` 70 passed/0 failed (61 baseline + 9 novos, 1 a mais que o pedido); `npm run test` 18 passed; `cargo build` limpo | — (modo direto) | 0 | Completo — `minisign-verify 0.2.5` reconfirmado; zip tratado como bytes diretos do executável (simplificação documentada, sem dep de unzip); erro próprio `PortableUpdateError` (não podia editar `check.rs`, fora do território); **`cargo fmt --check` acusou diff em `crates/swarmdeck-mcp/src/client.rs` — pré-existente de T7, não desta task, pendente de correção** |
| correção: `cargo fmt` — 14 arquivos com diff (T6/T7/mcp-task-server acumulados) | 15 (fix) | general-purpose | `cargo fmt --all -- --check` exit 0 (era exit 1, 14 arquivos); `cargo test --workspace` 154 passed/0 failed, idêntico antes/depois | — (modo direto) | 0 | Completo — **workspace inteiro limpo em fmt, clippy e testes** |
| release-distribution/T17 (aviso de nova versão) | 16 (sozinha) | general-purpose | `cargo build` limpo, `cargo test --lib` 70 passed; `npm run test` 23 passed/0 failed (18 baseline + 5 novos) | — (modo direto) | 0 | Completo |
| release-distribution/T18 (seção "Atualizações") | 17 (sozinha) | general-purpose | `npm run test` 27 passed/0 failed (23 baseline + 4 novos) | — (modo direto) | 0 | Completo — **fila de execução esgotada: todos os itens `code`/`uat-agent` prontos ou liberados pela cadeia foram executados** |
| verificação final: medição limpa de todos os gates do workspace | 18 (fix/verificação) | general-purpose | ver tabela "Gates medidos nesta run" abaixo | — (modo direto) | 0 | Completo — achou 1 erro de clippy novo (`io_other_error` em `update/portable.rs`) |
| correção: clippy `io_other_error` em `update/portable.rs` | 18 (fix) | general-purpose | `cargo clippy --workspace --all-targets -- -D warnings` exit 0 (era exit 101); `cargo test --workspace` 154 passed/0 failed | — (modo direto) | 0 | Completo — **workspace inteiro limpo: fmt + clippy + testes (Rust e frontend) + build, todos verdes** |

## Devolvido para triagem

| Task | Pergunta | Onde ficou gravada | Estado do código |
|---|---|---|---|
| `multi-terminal/T7, T9, T10, T11` (Verify) | `src/App.tsx` continua sendo o placeholder do scaffolding — não integra `GridLayout`/`TerminalPane`/`TerminalHeader`/`state/terminals.ts`. Falta task nova de integração, ou é reabertura de uma task `Done` existente? Qual e onde entra na cadeia? | `multi-terminal/tasks.md` (marcador `⛔ NEEDS-DECISION` em cada uma das 4 tasks, com a pergunta completa escrita em T7 e referenciada nas outras 3); `project/STATE.md` (AD de 01/08/2026) | Nada alterado pelo UAT — os 4 componentes React continuam existindo e passando no gate isolado. `T6` (mesma família, mas alcançável só pelo console do DevTools) foi **confirmado**. |

## Gates medidos nesta run

Medição final limpa, depois da correção do último clippy (todos rodados de `D:\ide`, workspace inteiro):

| escopo | comando | resultado medido |
|---|---|---|
| rust — formato | `cargo fmt --all -- --check` | **exit 0** |
| rust — lint | `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0** |
| rust — testes | `cargo test --workspace` | **154 passed / 0 failed** — 70 lib (`swarmdeck_lib`) + 68 integration (`agent_launch` 2, `agent_prefs` 4, `db` 5, `ipc_server` 15, `layout` 4, `manager` 6, `projects` 8, `session` 5, `settings` 4, `task_service` 9, `tasks_schema` 5, `terminal_meta` 1) + 16 (`swarmdeck-mcp`) |
| rust — build | `cargo build --workspace` | **exit 0**, limpo (só warning de linker pré-existente, não relacionado) |
| front — testes | `npm run test` | **27 passed / 0 failed**, 7 arquivos |
| front — build | `npm run build` | **exit 0** (`tsc --noEmit && vite build`) |
| scripts | `npm run test:scripts` | **11 passed / 0 failed** |
| pipeline | run real no GitHub Actions | **não medido nesta run** — segue `human-only` (nenhum push autorizado) |

Baseline no início desta run (triagem 004): rust-unit 11, rust-completo 31, front-testes 9, scripts 11 — todos os números acima já incluem o que esta run acrescentou.

## Estado da árvore no último checkpoint

`git rev-parse --short HEAD` → `b8dc34c` (idêntico ao HEAD registrado no início da conversa — **nenhum commit foi feito durante toda a run**, conforme a regra desta skill).

`git status --short` (resumo — árvore de trabalho tem edições extensas e não commitadas):
- Arquivos já rastreados modificados (`M`): `.specs/*` (README, TESTING, STATE, ROADMAP, tasks.md de 5 features), `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/commands/{mod.rs,terminal.rs}`, `src-tauri/src/db/mod.rs`, `src-tauri/src/terminal/{manager.rs,session.rs,throttle.rs}`, `src-tauri/tauri.conf.json`, `src-tauri/tests/{layout.rs,manager.rs}`, `Cargo.toml` (raiz), `Cargo.lock`.
- Diretórios/arquivos novos não rastreados (`??`): `crates/` (sidecar inteiro), `src-tauri/src/{agents,ipc,projects,tasks,update}/`, `src-tauri/src/db/settings.rs`, `src-tauri/src/db/migrations/{002,003,004}_*.sql`, `src-tauri/src/terminal/meta.rs`, `src-tauri/capabilities/`, `src-tauri/tests/{agent_launch,agent_prefs,ipc_server,projects,settings,task_service,tasks_schema,terminal_meta}.rs`, `src/components/{UpdateBanner.tsx,terminal/NewTerminalDialog.tsx,settings/UpdateSettings.tsx}` (+ testes), `src/routes/settings/{AgentPanel,ProjectsPanel}.tsx` (+ testes), `.specs/features/mcp-task-server/TOOL-CONTRACT.md`, `.specs/runs/004-2026-08-01/`.

Nada disso foi commitado — fica para o mantenedor decidir a granularidade dos commits (a run não commita sozinha, e a árvore ficaria melhor dividida por task/feature do que num commit único, mas essa é uma decisão editorial, não desta skill).

## Não verificado

- **Nenhuma task desta run passou por validação adversarial independente** (modo `direto`, escolhido pelo usuário) — o que está registrado sobre cada task é o autorrelato de quem a implementou, mais duas camadas de rede de segurança que a run adicionou por conta própria: (a) uma segunda passada de verificação quando uma task foi cortada por limite de sessão (`mcp-task-server/T8`, achou e corrigiu um bug real de algoritmo) e (b) uma medição final limpa de todos os gates do workspace inteiro (achou e corrigiu 1 clippy residual). Isso cobre bugs que gate automatizado pega — não cobre o que só validação adversarial pega (requisito cumprido só na aparência, teste que passa pelo motivo errado, etc. — ver o checklist do validador que este modo não rodou).
- **`multi-terminal/T7, T9, T10, T11`**: `Verify` não confirmável e devolvido à triagem — `App.tsx` não integra nenhum componente de terminal. Ver seção "Devolvido para triagem".
- **`release-distribution/T2, T21`** (fechar CI): implementadas e passam localmente; fecham só com run real no GitHub Actions, que exige push — `human-only`, decisão reconfirmada na triagem 004.
- **`release-distribution/T19`** (atualização ponta a ponta, 🧑 verificação): marcada como verificação humana desde a spec original — não entrou na fila desta run.
- **Sidecar `swarmdeck-mcp` real contra o app real**: testado ponta a ponta via `tokio::io::duplex`/sockets de teste, mas nunca rodado como dois processos de verdade (binário sidecar + app Tauri) trocando mensagens.
- **`interprocess`/named pipe em ambiente Unix real**: só o ramo `#[cfg(windows)]` foi exercitado nesta sessão (ambiente é Windows); o ramo Unix compila mas não rodou.
- **Update flow real** (T15-T18): nenhuma chamada de rede real, nenhum download real, nenhuma troca de executável real — tudo testado com dados/closures fake, por desenho (a task explicitamente reserva a troca real e o relançamento para `T19`, humano).
- **`agent-selection` catálogo**: nomes de comando `antigravity`/`kimi` são inferência de convenção, sem confirmar contra instalação real desses CLIs.
- **`mcp-task-server` — nomes de ferramenta**: o `TOOL-CONTRACT.md` (T0) é explicitamente inferido do `CLAUDE.md` global do usuário, sem validação contra uma implementação de referência real — risco aceito e registrado desde a triagem 001.
- **Specs de nível-feature não foram todas atualizadas para refletir o trabalho desta run** — ver seção "Specs atualizadas" no relatório final que acompanha esta run.
