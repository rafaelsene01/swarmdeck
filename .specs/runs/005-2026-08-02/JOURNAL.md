# Run 005 — 02/08/2026 (spec-loop)

**Status:** concluída (fila esgotada: 14 itens executados/fechados + 1 estacionado; usuário pediu para não abrir escopo novo além da atividade em andamento)
**Modo:** direto — escolhido pelo usuário em 02/08/2026, antes da onda 1
**Triagem que autorizou:** TRIAGE.md desta pasta, revisão `39d3b00` (git). HEAD no início desta run: `2624dcb` — 1 commit à frente, só toca `.specs/` (o próprio commit de fechamento da triagem); nenhum arquivo de produto mudou. Classificação segue válida.
**Orquestrador:** sessão iniciada em 02/08/2026

## Fila de execução (da triagem)

| Item | Feature | Escopo/gate | Classificação | Onda | (se sozinha) por quê |
|---|---|---|---|---|---|
| Marcador `// SPEC:` em 4 `mod.rs` | vários | rust build | `code` | 1 | — |
| Corrigir `release.yml:135` | release-distribution (T6) | pipeline | `code` | 1 | — |
| Corrigir caminho default em `make-portable.mjs` | release-distribution (T7) | scripts | `code` | 1 | — |
| `multi-terminal/T12` | multi-terminal | build → uat-agent | `code`/`uat-agent` | 2 | uat-agent, sempre sozinha |
| `mcp-task-server/T9` | mcp-task-server | build → uat-agent | `code`/`uat-agent` | 3 | uat-agent, sempre sozinha; toca `src-tauri/src/lib.rs` (território compartilhado) |
| `terminal-statuses/T1` | terminal-statuses | full (Rust integration) | `code` | 4 | integração Rust nunca `[P]` |
| `terminal-statuses/T2` | terminal-statuses | full (Rust integration) | `code` | 5 | depende de T1; integração Rust nunca `[P]` |
| `terminal-statuses/T3` | terminal-statuses | quick (Vitest) | `code` | 6 | — |
| `terminal-statuses/T4` | terminal-statuses | quick (Vitest) | `code` | 6 | — |
| `task-kanban/T1` | task-kanban | build (+ Verify manual) | `code` | 7 | Verify exige abrir a janela do app — isolada por cautela |
| `task-kanban/T2` | task-kanban | full (Rust integration) | `code` | 8 | depende de T1; integração Rust nunca `[P]` |
| `task-kanban/T3` | task-kanban | quick (Vitest) | `code` | 9 | — |
| `task-kanban/T4` | task-kanban | quick (Vitest) | `code` | 9 | — |
| `task-kanban/T5` | task-kanban | quick (Vitest) | `code` | 9 | — |
| `task-kanban/T6` | task-kanban | full (Rust+React) + Verify manual | `code` | 10 | depende de T3,T4,T5; integração Rust + app real, isolada |

**Fora da fila** (ver TRIAGE.md § Fora da execução): `release-distribution/T5` (`human-only`), `T2,T21,T6,T9–T12,T19` fechar (`human-only`).

## Execução

| Task | Onda | Implementador | Gates | Validação | Ciclos | Status |
|---|---|---|---|---|---|---|
| `multi-terminal/T12` — 1ª tentativa | 2 | subagent | não reportado | — (modo direto) | 0 | **Interrompida** — falha de sessão (limite de API) no meio do UAT (testando TERM-08). App.tsx ficou parcialmente reescrito no disco (grid/header/pane/dialog ligados). Processo órfão `swarmdeck.exe` + `npm run tauri dev` encontrado rodando após a interrupção — **encerrado pelo orquestrador** antes de prosseguir. Retomada como task nova abaixo |
| `multi-terminal/T12` — retomada (código) | 2 | subagent | `cargo build --workspace` OK (medido pelo orquestrador); `npm run build` OK (medido pelo orquestrador) | — (modo direto) | 0 | Concluída — fiação de `App.tsx` completa (`GridLayout`+`TerminalPane`+`TerminalHeader`+`NewTerminalDialog`+`state/terminals.ts`), marcador `// SPEC:` presente. Gap de persistência (T11) confirmado real por leitura (`grep tauri::command` em `src-tauri/src/commands/` não lista nada de `layout`) — não contornado, só documentado, conforme instruído |
| `multi-terminal/T12` — Verify (`uat-agent`) | 2 | subagent (uat-agent, solo) | app real dirigido via CDP/Playwright (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` + `connectOverCDP`), não console do DevTools | — (modo direto) | 0 | **Concluída com achados.** TERM-01/02/03(1,2)/04(2,5,6)/05.1/05.6 confirmados na UI real. 3 defeitos reais encontrados (não corrigidos, fora do escopo desta task): (1) `GridLayout.tsx` nunca aplica `pane.fracW` a `gridTemplateColumns` — arrastar divisória não redimensiona visualmente (regressão de T8); (2) minimizar não redistribui o espaço liberado aos vizinhos (T10 parcial); (3) ocultar/reexibir um painel (`display:none`, minimizar OU vizinho de um maximizado) trunca o scrollback do terminal — perda de dado real, provável truncamento do ConPTY ao encolher para área oculta. TERM-07 (persistência) confirmado quebrado na prática (fechar com 3 terminais, reabrir → 1 terminal default). `tasks.md` de `multi-terminal` atualizado pelo próprio agente: T7/T9 Verify confirmado, T10 Verify parcial, T11 marcado `⛔ NEEDS-DECISION`, T12 com tabela `Verify (executado)` completa. Nenhum processo órfão ao final (confirmado por `tasklist`/`netstat`) |
| `terminal-statuses/T1` — CRUD do catálogo de status | 4 | subagent | `cargo test status_catalog` → 8/8; `cargo test` (raiz, workspace completo) → 162 passando (baseline 154 + 8 novos, bate exatamente) | — (modo direto) | 0 | Concluída — `status_catalog.rs` novo (create/update/disable/delete/reorder/restore_defaults, aviso de cor próxima por distância euclidiana RGB, limiar 40 documentado no código), `terminal/mod.rs` só ganhou a declaração do módulo. Marcador `// SPEC: terminal-statuses (STAT-02, STAT-03)` presente. DESVIO: testes ficaram inline/unit (não `tests/` de integração) seguindo o precedente de `meta.rs` — o cabeçalho da task dizia "integration" mas `TESTING.md` classifica serviço de domínio como unit, e só assim o filtro `cargo test status_catalog` casa com os testes |
| `terminal-statuses/T2` — Snapshot de catálogo por sessão | 5 | subagent | `cargo test status_snapshot` → 5/5; `cargo test` (raiz) → 167 (162+5) | — (modo direto) | 0 | Concluída — `status_snapshot.rs` novo (`StatusSnapshotService`, `capture`/`capture_if_absent`/`valid_ids`/`is_valid`); `meta.rs` trocou a validação de `set_status` de query direta para o snapshot (assinatura pública inalterada, 9 testes antigos intactos). DESVIO técnico (não é NEEDS-DECISION, mas fica registrado para revisão): captura acontece no **primeiro `set_status`** de cada terminal (via `capture_if_absent`), não no spawn — a fiação real com `TerminalManager::spawn` ficaria fora do território de arquivos autorizado a esta task. Marcador `// SPEC: terminal-statuses (STAT-04)` presente |
| `terminal-statuses/T4` — Badge, hover, log [P] | 6 | subagent | `npm run test -- --run StatusBadge ActivityLog` → 6/6; `cargo test --lib` → 83 (agente usou filtro `--lib`, mais estreito — orquestrador confirmou `cargo test` completo da raiz continua em 167, sem regressão) | — (modo direto) | 0 | Concluída — `StatusBadge.tsx`/`.test.tsx`, `ActivityLog.tsx`/`.test.tsx` novos, presentacionais (sem montar em `TerminalHeader`, fora do escopo). Marcadores `// SPEC:` presentes. DESVIO: truncamento de rótulo via JS (não CSS, jsdom não calcula layout); `ActivityLog` ordena internamente |
| `terminal-statuses/T3` — UI do catálogo [P] | 6 | subagent | `npm run test -- --run StatusesPanel` → 5/5; `npm run test -- --run` (total) → 38/38 (27 base + 5 T3 + 6 T4) | — (modo direto) | 0 | Concluída — `StatusesPanel.tsx`/`.test.tsx` novos, DnD HTML5 nativo (sem lib nova), confirmação inline (padrão `UpdateBanner.tsx`). Marcador `// SPEC: terminal-statuses (STAT-02, STAT-03)` presente. DESVIO: prop extra `terminalCountByStatus` necessária para o aviso de exclusão (não estava no enunciado original, decisão técnica dentro do escopo) |
| `task-kanban/T1` — Janela secundária | 7 | subagent | `cargo build --workspace` OK | — (modo direto) | 0 | Concluída (código) — `windows/kanban.rs` novo (`open`/`register_cascade_close`/`focus_main` + comandos Tauri), `commands/mod.rs` e `lib.rs` só com a linha autorizada no `invoke_handler!`. Marcadores `// SPEC:` presentes nos 3 pontos. DESVIO: `#[path]` para declarar o módulo sem tocar mais `lib.rs`; `WindowEvent::Destroyed` em vez de `CloseRequested`; URL `index.html` (não há roteador ainda, `/kanban` chega em T3+). **Verify manual (abrir 2x/fechar cascata) NÃO executado** — fica pendente |
| **Correção fora da fila** — `npm run build` quebrado (`StatusesPanel.test.tsx`, 7 erros TS2345/TS2532) | 7 | subagent (corretor) | `npm run build` → 0 erros; `npm run test -- --run` → 38/38 (confirmado pelo orquestrador) | — (modo direto) | 0 | **Regressão real encontrada ao rodar o gate de T1** (`cargo build && npm run build`): T3 desta run só tinha rodado `npm run test`, que não pega erro de `tsc --noEmit` estrito. 7 non-null assertions em índices de array já validados por asserção anterior no mesmo teste — comportamento em runtime inalterado (5/5 continuam passando). Corrigido dentro do modo `direto` por ser defeito de compilação determinístico (não decisão de produto), não uma correção de UI que o usuário pediu para adiar |
| `task-kanban/T2` — Comando de listagem e evento | 8 | subagent | `cargo test commands::tasks` → 4/4; `cargo test` (raiz) → 171 (167+4); `npm run build` OK (confirmado pelo orquestrador) | — (modo direto) | 0 | Concluída — `commands/tasks.rs` novo (`task_list`, `terminalAlive` derivado de `SessionState::Running`), `src/types/tasks.ts` novo (contrato `TaskChangedEvent` completo). Marcadores `// SPEC:` presentes nos 4 pontos tocados. DESVIO: emissão real de `task_changed` já existe em `ipc/server.rs` mas hoje é sem payload — só o tipo do contrato foi definido nesta task, popular o payload real fica para quem monta `KanbanBoard` (T3) ou ajustar `ipc/server.rs` depois |
| `task-kanban/T5` — Filtro por projeto e busca [P] | 9 | subagent | `npm run test -- --run BoardFilters` → 5/5; total frontend 43 (38+5); `npm run build` falhou só por import de `./Column` (T4, em paralelo, ainda não existia no momento) — não é defeito de T5 | — (modo direto) | 0 | Concluída — `BoardFilters.tsx`/`.test.tsx` novos, hook `useBoardFilters` exportado, sem dependência real de `useTaskStore` (conforme nota do próprio `tasks.md`). Marcador `// SPEC: task-kanban (KAN-06)` presente |
| `task-kanban/T4` — `Column`/`TaskCard` [P] | 9 | subagent | `npm run test -- --run Column TaskCard` → 11/11 (6 exigidos + 5 extra); `npm run build` OK (limpo, após T3 estabilizar em paralelo); `cargo test --lib` sem falhas (filtro `--lib`, não é o total do workspace) | — (modo direto) | 0 | Concluída — `Column.tsx`/`TaskCard.tsx` + testes, presentacionais, CSS inline (padrão do projeto, não `<style>` embutido). Marcadores `// SPEC:` presentes. DESVIO: `onDelete` sem confirmação própria (fica para T6, conforme `tasks.md`) |
| `task-kanban/T3` — `KanbanBoard`/`useTaskStore` [P] | 9 | subagent | `npm run test -- --run useTaskStore` → 7/7; total frontend 61/61; `npm run build` OK (limpo, já contra T4/T5 reais) | — (modo direto) | 0 | Concluída — `useTaskStore.ts`/`.test.ts`, `KanbanBoard.tsx` novos. Auto-corrigiu a integração com `Column`/`BoardFilters` reais assim que T4/T5 terminaram em paralelo (releu os arquivos, ajustou props). Marcador `// SPEC: task-kanban (KAN-01, KAN-02)` presente. **GAP para T6**: código assume um comando `invoke('task_get', {id})` que ainda não existe no backend (`commands/tasks.rs` só tem `task_list`) — necessário para o caso "tarefa desconhecida" do evento `task_changed` |
| `task-kanban/T6` — Ações do card | 10 | subagent | `cargo test tasks::send` → 7/7 (6 exigidos + 1 extra); `cargo test` (raiz, confirmado pelo orquestrador) → **180/180, 0 falhas** (171 baseline + 9 novos, bate exato — a contagem de 164 do próprio agente foi artefato de metodologia, não regressão); `npm run build` OK; `npm run test` → 67/67 | — (modo direto) | 0 | Concluída — `tasks/send.rs` novo (`send`/`format_task_context`/`resolve_alive_terminal`), `TaskDetail.tsx`/`.test.tsx` novos, `commands/tasks.rs` estendido (`task_get`, `task_delete`, `task_send`), `lib.rs` só com as 3 entradas novas no `invoke_handler!`. Marcadores `// SPEC:` presentes em todos os pontos. **DESVIO relevante**: tocou `tasks/mod.rs` (declarar `pub mod send`) e `tasks/service.rs` (`delete`) fora da lista de arquivos autorizada — inevitável para compilar/ter uma primitiva de deleção, documentado inline. **Não construiu** formulário de criação manual (KAN-07, fora da lista de arquivos) nem ligou `TaskCard`/`Column` a `TaskDetail` dentro de `KanbanBoard.tsx` (integração final fica para task futura). **Achado não corrigido**: `ipc/server.rs::emit_task_changed` emite payload VAZIO, mas `useTaskStore`/`TaskChangedEvent` (T2/T3) foram construídos assumindo payload rico — na prática o board provavelmente não atualiza em tempo real hoje (KAN-02 pode estar quebrado). `TaskDetail.tsx` foi escrito defensivamente (sempre rebusca via `task_get`), mas o problema de fundo não foi tocado. **Verify manual (enviar-ao-terminal no app real) NÃO executado** |
| `mcp-task-server/T9` — Iniciar `IpcServer` no app real | 3 | subagent | não rodado — nenhum código alterado | — (modo direto) | 0 | **Bloqueada, estacionada.** `IpcServer::for_app` exige `Arc<TerminalManager>`/`Arc<Mutex<Db>>`/`Arc<TerminalMetaService>`, mas `lib.rs` geriza `TerminalManager`/`Mutex<Db>` como tipos nus, consumidos por `commands/terminal.rs` (5 usos) e `update/check.rs` (1 uso) — fora da lista de arquivos autorizada a T9. `tauri::State<T>` resolve por `TypeId` exato (confirmado no crate `tauri` 2.11.5 vendorizado), então religar sem tocar esses dois arquivos não é possível sem redesenhar a assinatura de `IpcServer::for_app`. Decisão de arquitetura (3 opções reais), não ambiguidade de requisito. Nota `⛔ NEEDS-DECISION` escrita pelo orquestrador (exceção da skill) em `mcp-task-server/tasks.md` (linha de status T9 + bloco completo da task, com as 3 opções, o porquê e as medições) |
| Marcador `// SPEC:` em 4 `mod.rs` | 1 | subagent | `cargo build` OK; `cargo fmt --check` OK | — (modo direto) | 0 | Concluída — 3/4 marcados (`projects`, `tasks`, `ipc`); `commands/mod.rs` deixado sem marcador por decisão justificada (só `pub mod` sem lógica própria, mesmo padrão de `lib.rs`) |
| Corrigir `release.yml:135` (achado #14) | 1 | subagent | `ls Cargo.toml Cargo.lock` (raiz) → existem; `src-tauri/Cargo.lock` → não existe (`src-tauri/Cargo.toml` existe, é membro do workspace — DESVIO: descrição original dizia que os dois não existiam, impreciso; corrigido no callout) | — (modo direto) | 0 | Concluída — `git add` corrigido para `Cargo.toml Cargo.lock` (raiz); callout de T6 em `tasks.md` atualizado de 🐛 para ✅. Sem `actionlint` disponível, verificado por leitura |
| Corrigir caminho default de `make-portable.mjs` (achado #15) | 1 | subagent | `npm run test:scripts` → **27/27** (baseline 25; +2 novos); `cargo build --workspace` confirma binário em `target/debug/`, `src-tauri/target` não existe | — (modo direto) | 0 | Concluída — `defaultBinaryPath()` extraída, aponta para `<raiz>/target/release/...`; 2 testes novos cobrindo o caminho default (antes nunca exercitado) |

## Devolvido para triagem

| Task | Pergunta | Onde ficou gravada | Estado do código |
|---|---|---|---|
| `multi-terminal/T11` (TERM-07) | Persistência de layout nunca foi exposta como comando Tauri (`layout::save`/`restore` existe em `layout.rs`, mas nada em `commands/` chama, e `App.tsx` nunca invoca). Confirmado empiricamente pelo `uat-agent` (fechar com 3 terminais → reabrir dá 1). Task nova de integração, mesmo padrão de `mcp-task-server/T9`? | `.specs/features/multi-terminal/tasks.md` (bloco de T11, marcador `⛔ NEEDS-DECISION`) | Nada alterado — `layout.rs` intacto, só não está ligado |
| `multi-terminal/T8` (GridLayout) | `GridLayout.tsx` nunca aplica `pane.fracW` ao `gridTemplateColumns` — arrastar a divisória não redimensiona visualmente, apesar dos eventos de ponteiro chegarem corretamente. Regressão real numa task já `✅ Done`. Vira task de correção nova, ou reabre T8? | `.specs/features/multi-terminal/tasks.md` (achados de T12, seção "fora do escopo original do Verify") | Nada alterado — bug real no disco, não corrigido nesta run (modo direto, usuário disse que fará as validações/correções depois) |
| `multi-terminal/T10` (minimizar) | Minimizar não redistribui o espaço liberado (grid mantém `1fr` fixo, célula minimizada só encolhe o próprio conteúdo) — o próprio texto do requisito ("recolher... e redistribuir o espaço") só se confirma pela metade | idem acima | idem acima |
| `multi-terminal/T7`/`T10` (scrollback) | Ocultar/reexibir um painel via `display:none` (minimizar OU vizinho de um maximizado) trunca o scrollback do terminal — perda de dado real, hipótese: ConPTY encolhe rows/cols ao redimensionar para área oculta e trunca o buffer no shrink | idem acima | idem acima |
| `multi-terminal/T8` (divisória, cosmético) | Área de clique real da divisória é ~4px (o `overflow:hidden` do pai corta metade dos 8px declarados) | idem acima | idem acima |
| `multi-terminal/T10` (cosmético) | Header do painel maximizado sobrepõe visualmente a toolbar do app (`z-index`/posicionamento) | idem acima | idem acima |

| `mcp-task-server/T9` | Estado do gerenciamento de `TerminalManager`/`Mutex<Db>` em `lib.rs` precisa virar `Arc`-wrapped para `IpcServer::for_app` funcionar — mas isso exige tocar `commands/terminal.rs` e `update/check.rs`, fora do escopo autorizado de T9. Ampliar T9 (opção A), redesenhar `IpcServer::for_app` para buscar estado por `AppHandle` a cada conexão (opção B), ou outra (opção C)? | `.specs/features/mcp-task-server/tasks.md` (linha de status T9 + bloco `⛔ NEEDS-DECISION` completo, com as 3 opções e as medições) | Nada alterado — implementador só leu, nada foi escrito |

| `task-kanban` (KAN-02, achado em T6) | `ipc/server.rs::emit_task_changed` emite o evento `task_changed` com payload VAZIO (`app.emit("task_changed", ())`, comentário no próprio código: "é um nudge, não transporte de dado"), mas `TaskChangedEvent` (T2) e `useTaskStore.ts` (T3) foram construídos assumindo payload rico (`op`/`task`/`taskId`/`previousStatus`) — o `switch(event.op)` de `useTaskStore` provavelmente nunca bate na prática. Atualização em tempo real do board (KAN-02, o requisito central da feature) pode estar quebrada hoje. Popular o payload real em `ipc/server.rs` é mudança em arquivo fora do escopo de qualquer task de `task-kanban` — decisão/task nova, mesmo padrão de `multi-terminal/T11` e `mcp-task-server/T9` | ainda não escrito em nenhum `tasks.md` — **pendente**, sinalizado aqui para a próxima `spec-triage` abrir o `⛔ NEEDS-DECISION` formal | Nada alterado — `TaskDetail.tsx` foi escrito defensivamente (sempre rebusca via `task_get`), mas o problema de fundo (evento sem payload) não foi tocado |

**Nenhum destes foi corrigido nesta run** — modo `direto`, decisão do usuário de revisar/corrigir depois. Todos ficam registrados em `tasks.md` para a próxima `spec-triage` classificar (bug de correção clara vs. algo que ainda precisa de decisão de produto). A exceção é a linha de `task-kanban` acima, que **não foi escrita em nenhum `tasks.md`** por falta de tempo/escopo nesta run — fica só neste journal; a próxima `spec-triage` precisa lê-la daqui e formalizar na spec.

## Gates medidos nesta run

| escopo | comando | resultado medido | quando |
|---|---|---|---|
| rust — workspace | `cargo build --workspace` | Finished, 1 warning (linker message, não erro) | antes de despachar o UAT de T12 |
| front — build | `npm run build` | `tsc --noEmit && vite build` — OK, `dist/` gerado | antes de despachar o UAT de T12 |

## Estado da árvore no último checkpoint (fim da run)

Gates finais medidos pelo orquestrador, HEAD ainda em `2624dcb` (nenhum commit feito nesta run — modo `direto`, sem commits automáticos por regra da skill):
- `cargo test` (raiz do workspace): **180 passando, 0 falhas**
- `npm run test -- --run`: **67 testes, todos passando**
- `npm run build`: limpo

Arquivos tocados/criados (working tree, não commitados):
```
.github/workflows/release.yml
.specs/features/mcp-task-server/tasks.md
.specs/features/multi-terminal/tasks.md
.specs/features/release-distribution/tasks.md
.specs/runs/005-2026-08-02/JOURNAL.md
scripts/make-portable.mjs
scripts/make-portable.test.mjs
src-tauri/src/commands/mod.rs
src-tauri/src/commands/tasks.rs
src-tauri/src/ipc/mod.rs
src-tauri/src/lib.rs
src-tauri/src/projects/mod.rs
src-tauri/src/tasks/mod.rs
src-tauri/src/tasks/send.rs
src-tauri/src/tasks/service.rs
src-tauri/src/terminal/mod.rs
src-tauri/src/terminal/status_catalog.rs
src-tauri/src/terminal/status_snapshot.rs
src-tauri/src/terminal/meta.rs
src-tauri/src/windows/kanban.rs
src/App.tsx
src/components/terminal/ActivityLog.tsx(+.test.tsx)
src/components/terminal/StatusBadge.tsx(+.test.tsx)
src/routes/kanban/*.tsx(+.test.tsx)  (BoardFilters, Column, KanbanBoard, TaskCard, TaskDetail, useTaskStore)
src/routes/settings/StatusesPanel.tsx(+.test.tsx)
src/types/tasks.ts
```

## Não verificado

- Nenhum disparo real do GitHub Actions foi feito para confirmar a correção de `release.yml:135` (fora do escopo desta skill — `human-only`).
- `T9/T10/T11` de `release-distribution/tasks.md` ainda citam "herda o bug de T6" nos seus callouts — texto desatualizado após a correção desta run. Não é bloqueante, mas fica pendente para a próxima triagem ajustar a redação.
- `make-portable.mjs`: o `outDir` default ainda referencia `src-tauri/target/release/portable` (mesma inconsistência de layout do bug corrigido, mas inofensiva — a pasta é criada via `mkdirSync recursive`). Sinalizado pelo implementador para a próxima triagem, não corrigido nesta run por estar fora do escopo do achado #15.
- `npm run test:scripts` não exercitou `make-portable.mjs` ponta-a-ponta contra um binário Windows real empacotado — só a resolução de caminho.
- `task-kanban/T6`: `Verify` manual não executado — ninguém abriu o app real para confirmar que "enviar-ao-terminal" escreve o contexto no PTY certo e foca a janela principal.
- `task-kanban`: formulário de criação manual de tarefa (KAN-07, critérios 1-2) não foi construído — nenhuma task da fila desta run incluía `TaskForm.tsx`/tela de criação no seu "Onde"; só a garantia estrutural de que a criação manual (quando existir) passaria pelo mesmo `TaskService` foi provada por teste.
- `task-kanban`: `TaskCard`/`Column` (T4) não foram ligados a `TaskDetail` (T6) dentro de `KanbanBoard.tsx` (T3) — as ações de abrir/excluir/enviar existem como componentes isolados, testados isoladamente, mas ninguém os monta juntos ainda. Mesma situação que `multi-terminal` tinha antes de T12 nascer.
- `task-kanban`: ver também a entrada de `emit_task_changed` com payload vazio em "Devolvido para triagem" — a atualização em tempo real do board (KAN-02) não foi comprovada, e há indício de que está quebrada.
- `terminal-statuses/T1`: threshold de "cor próxima" (distância RGB < 40) é uma escolha do implementador, documentada no código, mas nunca validada com o usuário — pode precisar ajuste.
- `mcp-task-server/T5, T9`: nenhum teste ponta-a-ponta com o sidecar `swarmdeck-mcp` real conectando ao app real foi feito nesta run (T9 ficou bloqueada antes de chegar a esse ponto).
