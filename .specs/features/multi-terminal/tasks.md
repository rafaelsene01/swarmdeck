# Multi-terminal em grid — Tasks

**Design**: `.specs/features/multi-terminal/design.md`
**Testing**: `.specs/codebase/TESTING.md`
**Status**: In Progress
**Milestone**: M1

| Tarefa | Status | Testes entregues |
|---|---|---|
| T1 Scaffolding | ✅ Done | — (gate build) |
| T2 Camada de banco | ✅ Done | 5 integration (plano: 4) |
| T3 Throttle | ✅ Done | 5 unit (plano: 5) |
| T4 PtySession | ✅ Done | 5 integration (plano: 5) |
| T5 TerminalManager | ✅ Done | 6 integration (plano: 6) |
| T6 Comandos Tauri | ✅ Done — **Verify visual CONFIRMADO na run 004 (01/08/2026)** | — (none, invólucro fino) |
| T7 TerminalPane | ✅ Done (gate build) — ⛔ **Verify visual NEEDS-DECISION (run 004)** | — (none) |
| T8 GridLayout | ✅ Done | 5 unit (plano: 5) |
| T9 TerminalHeader | ✅ Done (gate build) — ⛔ **Verify visual NEEDS-DECISION (run 004)** | — (none, apresentacional) |
| T10 Max/min/fechar | ✅ Done (gate quick) — ⛔ **Verify visual NEEDS-DECISION (run 004)** | 4 unit (plano: 4) |
| T11 Persistência | ✅ Done (gate full) — ⛔ **Verify visual NEEDS-DECISION (run 004)** | 4 integration (plano: 4) |

**Total atual: 40 testes passando** — `cargo test` = 31 (11 lib + 5 db + 4 layout + 6 manager + 5 session); `npm run test` = 9 (5 GridLayout + 4 terminals). Ver relatório de execução para a saída bruta de cada gate.

**Verify visual — atualização da run 004 (01/08/2026, spec-loop, modo direto, item `uat-agent`):** desta vez o ambiente TINHA display gráfico e o agente conseguiu subir o app, conectar por CDP (Chrome DevTools Protocol, via `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`) e dirigir a janela real — a limitação registrada em 31/07/2026 (sem display) NÃO se repetiu. **T6 foi CONFIRMADO**: `pty_spawn` invocado pelo console do DevTools (a UI não tem botão de "novo terminal" ainda), bytes reais de `cmd.exe` chegaram pelo `Channel` (incluindo o handshake DSR `[6n` documentado no design.md).

**T7, T9, T10 e T11 NÃO puderam ser confirmados — mas por um motivo diferente do registrado em 31/07/2026, e mais grave.** O agente de UAT encontrou que `src/App.tsx` é ainda o placeholder do scaffolding (`<h1>SwarmDeck</h1><p>Scaffolding pronto...</p>`) — ele **não importa nem renderiza** `GridLayout`, `TerminalPane`, `TerminalHeader` nem `state/terminals.ts`. Confirmado por leitura de `App.tsx`/`main.tsx` e grep: nenhum arquivo em `src/` fora dos próprios `.test.tsx` importa esses componentes. Ou seja: T7, T9, T10, T11 passam nos gates automatizados **isolados** (build/test do componente em si), mas nenhum deles é alcançável por um usuário real abrindo o app — não existe grid, não existe pane, não existe header na tela. Nenhuma task deste arquivo lista `App.tsx` como "Onde", então a integração nunca foi um item planejado — é uma lacuna de escopo, não um bug de uma task específica.

⛔ **Isto é NEEDS-DECISION, devolvido à `spec-triage` (run 004, 01/08/2026) — ver `.specs/runs/004-2026-08-01/JOURNAL.md`, seção "Devolvido para triagem".** `spec-loop` não pode inventar a task de integração que faltaria (T12? "Montar App.tsx"?) porque criar requisito/task novo é trabalho da triagem, não da execução.

**Desvios registrados:**
- **T1**: `crates/*` saiu do workspace Cargo — Cargo falha ao carregar glob que não casa com nenhum diretório. Entra em `mcp-task-server/T6`, com o sidecar.
- **T1**: `tsconfig.node.json` removido — projeto *composite* não aceita `noEmit` (TS6310). O Vite compila o próprio config por esbuild.
- **T2**: 5 testes em vez de 4. O extra cobre o `CHECK` de `title_source`, que é o que sustenta a regra "rename manual vence o agente".
- **Infra**: `npm run test` ganhou `--passWithNoTests`. Sem isso o vitest sai com código 1 enquanto não houver teste de React, quebrando o gate `quick` de T3 até T8.

> T1–T2 são o scaffolding do repositório inteiro. Todas as demais features do projeto dependem delas.

---

## ✅ DECISÃO DO USUÁRIO — triagem 002, 28/07/2026

**Pergunta:** as tarefas cujo `Verify` exige o app rodando são verificadas por um agente, ou pelo mantenedor?
**Resposta: o agente dirige o app.** `T6`, `T7`, `T9`, `T10` e `T11` são **`uat-agent`** — quem as executa roda o app, executa o `Verify` descrito na própria task e só então a considera pronta. Não precisa perguntar nada ao usuário.

Três regras que vêm junto, e que **não são negociáveis**:

1. **Nenhuma tarefa `uat-agent` roda em paralelo com outra `uat-agent`.** Isto **sobrepõe o marcador `[P]`** de `T7` e `T9`: as duas dirigem a mesma janela do app, e o `[P]` delas vale apenas contra tarefas que **não** tocam o app. Na prática, na Fase 3 só `T8` (`code`, sem app) pode rodar ao lado de uma delas. Duas instâncias do app disputando o mesmo banco e o mesmo PTY produzem falha que não se reproduz.

2. **Clique nesta janela é instável — reler antes de afirmar.** `STATE.md` § Lições registra a medição: alguns cliques registram só como *hover* e a seção não troca. Portanto, todo `Verify` visual **relê o screenshot para confirmar que a ação aconteceu**, em vez de assumir que o clique pegou. Retry com espera maior resolve. Um `Verify` que não pôde ser confirmado por leitura é **falha**, não sucesso.

3. **Verificação não confirmada não fecha a task.** Se o app não subir, ou se o passo visual não puder ser lido com confiança depois de retry, a task fica aberta com a evidência do que se viu — nunca marcada como verificada. Registrar "não consegui confirmar" é um resultado válido; inventar um ✅ não é.

*Trade-off aceito pelo usuário:* a fila executável sobe de 4 para 9 itens, contra o risco de a instabilidade de clique produzir um "verificado" que ninguém viu. A regra 2 é o que contém esse risco; a regra 3 é o que impede que ele vire silêncio.

---

## Plano de execução

### Fase 1 — Fundação (sequencial)
```
T1 → T2 → T3
```

### Fase 2 — Núcleo do PTY (sequencial: testes de integração não são paralelizáveis)
```
T3 → T4 → T5 → T6
```

### Fase 3 — Frontend (paralelo **parcial** — ver a decisão da triagem 002)
```
          ┌→ T7  [P] 🖥️ uat-agent ─┐
T6 ───────┼→ T8  [P] ✅ code       │ T7 e T9 NÃO rodam juntas
          └→ T9  [P] 🖥️ uat-agent ─┘
```
⚠️ O `[P]` das três é real **apenas quanto a arquivos** — elas não colidem em disco. Mas `T7` e `T9`
dirigem a **mesma janela do app**, e pela decisão da triagem 002 nenhuma dupla `uat-agent` roda em
paralelo. Combinação válida: `T8` ao lado de `T7` **ou** de `T9`, nunca `T7` + `T9`.

### Fase 4 — Integração (sequencial)
```
T7, T8, T9 → T10 → T11
```

---

## Tarefas

### T1: Scaffolding do projeto Tauri 2

**O quê**: Criar o esqueleto do workspace — app Tauri 2 com React + TypeScript + Vite, e um workspace Cargo preparado para o crate sidecar.
**Onde**: raiz do repositório, `src-tauri/`, `src/`, `Cargo.toml` (workspace)
**Depende de**: nenhuma
**Reusa**: `create-tauri-app` como ponto de partida
**Requisito**: — (habilitador)

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `npm run tauri dev` abre uma janela em branco funcional
- [ ] `Cargo.toml` raiz declara workspace com `src-tauri` e `crates/*`
- [ ] TypeScript em modo `strict`
- [ ] Gate passa: `cargo build && npm run build`

**Tests**: none · **Gate**: build

**Verify**: `npm run tauri dev` → janela abre. `cargo build` → sem erro.

**Commit**: `chore: scaffold tauri 2 + react + vite workspace`

---

### T2: Camada de banco e runner de migração

**O quê**: Módulo de acesso ao SQLite com runner de migração versionado e a migração `001` criando `terminal_layout`.
**Onde**: `src-tauri/src/db/mod.rs`, `src-tauri/src/db/migrations/`
**Depende de**: T1
**Reusa**: `rusqlite` com feature `bundled`
**Requisito**: TERM-07

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `Db::open(path)` cria o arquivo e aplica migrações pendentes
- [ ] Migração roda uma vez só — segunda chamada é no-op
- [ ] Tabela `terminal_layout` criada conforme o design
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 4 testes passam (aplica, idempotente, cria schema, versão registrada)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test db::` → 4 passam. Abrir o `.db` gerado e conferir o schema.

**Commit**: `feat(db): sqlite layer with versioned migrations`

---

### T3: `OutputThrottle`

**O quê**: Buffer agregador que acumula bytes do PTY e despeja em janelas de 16ms, com teto e descarte do início.
**Onde**: `src-tauri/src/terminal/throttle.rs`
**Depende de**: T1
**Reusa**: nenhum
**Requisito**: TERM-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `push()` acumula sem alocar por chamada
- [ ] `flush_tick()` devolve o acumulado e esvazia
- [ ] Ao estourar o teto, descarta o **início** e sinaliza truncamento
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 5 testes passam (acumula, flush esvazia, flush vazio é no-op, teto descarta início, flag de truncamento)

**Tests**: unit · **Gate**: quick

**Verify**: `cargo test throttle::` → 5 passam.

**Commit**: `feat(terminal): output throttle with 16ms aggregation`

---

### T4: `PtySession`

**O quê**: Encapsular um par PTY: spawn do comando, reader clonado, writer, resize e estado do processo filho.
**Onde**: `src-tauri/src/terminal/session.rs`
**Depende de**: T3
**Reusa**: `portable_pty::native_pty_system()`, `PtySize`, `CommandBuilder`
**Requisito**: TERM-01, TERM-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `PtySession::new()` spawna e devolve sessão em estado `Running`
- [ ] `resize()` propaga ao kernel
- [ ] Saída do processo é lida pela thread dedicada
- [ ] Processo que termina vira `Exited(code)`; spawn que falha vira `Failed(msg)`
- [x] ~~Flags do ConPTY aplicadas com detecção de versão~~ — **removido do escopo em 28/07/2026.** `portable-pty` 0.9.0 já aplica `RESIZE_QUIRK` e `WIN32_INPUT_MODE` hardcoded, e `PASSTHROUGH_MODE` não é configurável de fora. Nada a implementar. Ver `design.md` → "Nota sobre os flags do ConPTY".
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 5 testes passam (spawn ok, echo round-trip, resize, exit code, comando inexistente falha)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test session::` → 5 passam, incluindo spawn real de `cmd.exe`/`sh`.

**Commit**: `feat(terminal): pty session wrapper over portable-pty`

---

### T5: `TerminalManager`

**O quê**: Registro das sessões vivas, com criação, escrita, resize, kill e listagem; injeta `SWARMDECK_TERMINAL_ID` no ambiente.
**Onde**: `src-tauri/src/terminal/manager.rs`
**Depende de**: T4
**Reusa**: `PtySession` (T4), `AppState` do Tauri
**Requisito**: TERM-01, TERM-03

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `spawn()` retorna `TerminalId` (uuid v7) e registra a sessão
- [ ] `SWARMDECK_TERMINAL_ID` presente no ambiente do processo filho
- [ ] `write`/`resize`/`kill` em id inexistente retornam erro descritivo
- [ ] `kill` remove do registro e encerra o processo
- [ ] Shutdown encerra todas as sessões sem deixar órfão
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 6 testes passam (spawn/list, env var injetada, write, id inválido, kill remove, shutdown limpa)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test manager::` → 6 passam. Em um teste, o filho imprime `$SWARMDECK_TERMINAL_ID` e o valor bate.

**Commit**: `feat(terminal): terminal manager with session registry`

---

### T6: Comandos Tauri e `Channel` de saída

**O quê**: Expor `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill` como comandos, e ligar a saída da sessão a um `tauri::ipc::Channel`.
**Onde**: `src-tauri/src/commands/terminal.rs`
**Depende de**: T5
**Reusa**: `TerminalManager` (T5), `OutputThrottle` (T3)
**Requisito**: TERM-01, TERM-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Os 4 comandos registrados no `invoke_handler`
- [ ] `pty_spawn` aceita um `Channel<Vec<u8>>` e o liga ao throttle da sessão
- [ ] Comandos são invólucros finos — nenhuma lógica além de delegar
- [ ] Gate passa: `cargo build && npm run build`

**Tests**: none *(invólucro fino — a matriz exige `none`; a lógica está coberta em T3/T4/T5)* · **Gate**: build

**Verify**: `npm run tauri dev`, chamar `pty_spawn` pelo console do devtools e ver bytes chegando no `Channel`.

**✅ CONFIRMADO — run 004 (01/08/2026), `uat-agent`.** App subido com `npm run tauri dev`, CDP conectado via `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`. `pty_spawn` invocado pelo console do DevTools (a UI ainda não tem botão de "novo terminal" — ver NEEDS-DECISION em T7 abaixo, mesma causa). Primeiro chunk recebido no `Channel`: `"[6n"` (handshake DSR do ConPTY, confirma a nota do design.md). Depois de responder com `pty_write` (`\x1b[24;80R`), chegou o output real de `cmd.exe` (banner do Windows + prompt). Terminal encerrado com `pty_kill` ao final. Evidência completa no journal desta run.

**Commit**: `feat(terminal): tauri commands with ipc channel output`

---

### T7: `TerminalPane` (React) [P]  ⛔ NEEDS-DECISION (Verify)

**O quê**: Componente que casa uma instância de xterm.js com uma sessão do backend, com fit e debounce de resize.
**Onde**: `src/components/terminal/TerminalPane.tsx`
**Depende de**: T6
**Reusa**: `xterm.js`, `@xterm/addon-fit`
**Requisito**: TERM-01, TERM-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] No mount abre o `Channel` e escreve tudo que chega em `Terminal.write()`
- [ ] Teclado encaminhado via `pty_write`
- [ ] ⚠️ **Saída e teclado ligados antes do primeiro byte do processo.** O ConPTY bloqueia o filho até o terminal responder ao DSR (`ESC[6n`). Se o retorno não estiver ligado a tempo, o terminal nasce mudo e a falha é silenciosa. Ver `design.md` → "Handshake de DSR no Windows"
- [ ] `ResizeObserver` → `fit()` → `pty_resize` com debounce de 100ms
- [ ] No unmount descarta listeners e o addon
- [ ] Gate passa: `cargo build && npm run build`

**Tests**: none *(ponte com biblioteca externa e DOM real — a matriz exige `none`)* · **Gate**: build

**Verify**: rodar o app, digitar no terminal, ver eco. Redimensionar a janela e confirmar o reflow.

> ⛔ **NEEDS-DECISION — estacionada na run 004 (01/08/2026).** Não executar o `Verify` até haver decisão do usuário.

**Pergunta:** `src/App.tsx` continua sendo o placeholder do scaffolding (`<h1>SwarmDeck</h1><p>Scaffolding pronto...</p>`) — não importa `GridLayout`, `TerminalPane`, `TerminalHeader` nem `state/terminals.ts`. Nenhuma task deste arquivo lista `App.tsx` como "Onde". Duas leituras possíveis: (a) falta uma task nova, explícita, de "integrar os componentes de terminal em `App.tsx`" — e aí é a `spec-triage` que a cria e a insere na cadeia; ou (b) a integração deveria ter sido parte implícita de uma das tasks já `✅ Done` (T7? T8? T10?) e ficou pra trás por lacuna de escopo, e a correção é reabrir essa task específica. Qual das duas, e se (a), qual o número/posição da task nova?
**Por que só o usuário responde:** criar requisito/task novo é decisão de escopo do mantenedor — a `spec-loop` explicitamente não inventa ID de requisito nem task nova.
**Medições que sustentam a escolha:** leitura de `src/App.tsx` e `src/main.tsx` (run 004) — nenhum import de `TerminalPane`/`GridLayout`/`TerminalHeader`; `grep` confirmou que só os próprios arquivos `.test.tsx` importam esses componentes fora de si mesmos.
**Estado do código:** nada alterado — T7 (`TerminalPane.tsx`) continua existindo e passando no gate `build` isolado, só não é alcançável pela UI real.

**Commit**: `feat(ui): terminal pane bridging xterm.js to pty channel`

---

### T8: `GridLayout` (React) [P]

**O quê**: Disposição em grid com divisórias arrastáveis, layout por fração.
**Onde**: `src/components/grid/GridLayout.tsx`
**Depende de**: T6
**Reusa**: `ResizeObserver`
**Requisito**: TERM-03, TERM-04

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] 2 painéis → 2 colunas; 3 ou 4 → grid 2×2
- [ ] Arrastar divisória atualiza as frações dos vizinhos
- [ ] Piso de largura mínima respeitado
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 5 testes passam (layout 2, layout 3, layout 4, arrasto redistribui, piso mínimo)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test GridLayout` → 5 passam.

**Commit**: `feat(ui): resizable grid layout with fractional sizing`

---

### T9: `TerminalHeader` (React) [P]  ⛔ NEEDS-DECISION (Verify)

**O quê**: Header do terminal com número, título, ícone do agente, badge de status e ações.
**Onde**: `src/components/terminal/TerminalHeader.tsx`
**Depende de**: T6
**Reusa**: tokens de estilo do projeto
**Requisito**: TERM-05

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Exibe número, título, ícone do agente e badge quando houver
- [ ] Ações de maximizar, minimizar e fechar disparam callbacks
- [ ] Fechar com processo ativo pede confirmação
- [ ] Gate passa: `cargo build && npm run build`

**Tests**: none *(apresentacional — a matriz exige `none`)* · **Gate**: build

**Verify**: inspeção visual no app com um terminal ativo.

> ⛔ **NEEDS-DECISION — estacionada na run 004 (01/08/2026), mesma causa de T7:** `src/App.tsx` não renderiza `TerminalHeader`, então não há "terminal ativo" na UI real para inspecionar. Ver o header de T7 acima para a pergunta completa e as opções — é a mesma decisão, não repetida aqui para não divergir.

**Commit**: `feat(ui): terminal header with status badge and actions`

---

### T10: Maximizar, minimizar e fechar  ⛔ NEEDS-DECISION (Verify)

**O quê**: Ligar as ações do header ao estado do grid, mantendo o PTY vivo quando minimizado.
**Onde**: `src/components/grid/GridLayout.tsx` (modifica), `src/state/terminals.ts`
**Depende de**: T7, T8, T9
**Reusa**: `GridLayout` (T8), `TerminalHeader` (T9)
**Requisito**: TERM-04, TERM-08

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Maximizar ocupa a área toda e mantém os demais vivos
- [ ] Minimizar recolhe a uma barra compacta; o PTY continua rodando
- [ ] Restaurar reexibe o scrollback acumulado no período
- [ ] Fechar encerra o PTY e reorganiza o grid
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 4 testes passam (maximizar isola, minimizar preserva sessão, restaurar reexibe, fechar reorganiza)

**Tests**: unit · **Gate**: quick

**Verify**: minimizar um terminal com `ping -t` rodando, restaurar, e confirmar que a saída do período não sumiu.

> ⛔ **NEEDS-DECISION — estacionada na run 004 (01/08/2026), mesma causa de T7:** sem `TerminalHeader`/`TerminalPane` montados em `App.tsx`, não há UI real para minimizar/restaurar. Ver o header de T7 acima para a pergunta completa.

**Commit**: `feat(ui): maximize, minimize and close terminals`

---

### T11: Persistência de layout  ⛔ NEEDS-DECISION (Verify)

**O quê**: Salvar e restaurar número de terminais, frações, `cwd` e agente entre reinícios.
**Onde**: `src-tauri/src/terminal/layout.rs`, `src/state/terminals.ts` (modifica)
**Depende de**: T10, T2
**Reusa**: camada de banco (T2), tabela `terminal_layout`
**Requisito**: TERM-07

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Estado persistido no shutdown e ao mudar o layout
- [ ] Restaura terminais com mesmos `cwd` e frações
- [ ] `cwd` inexistente cai para home e avisa
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 4 testes passam (salva, restaura, cwd sumido cai para home, banco vazio abre 1 terminal)

**Tests**: integration · **Gate**: full

**Verify**: montar layout 2×2, fechar, reabrir, conferir restauração.

> ⛔ **NEEDS-DECISION — estacionada na run 004 (01/08/2026), mesma causa de T7:** sem UI real de grid montada, não há como montar um layout 2×2 pela interface. Ver o header de T7 acima para a pergunta completa.

**Commit**: `feat(terminal): persist and restore grid layout`

---

## Check 1 — Granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T1 Scaffolding | 1 setup de projeto | ✅ |
| T2 Camada de banco | 1 módulo + 1 migração | ✅ |
| T3 Throttle | 1 struct | ✅ |
| T4 PtySession | 1 struct | ✅ |
| T5 TerminalManager | 1 struct | ✅ |
| T6 Comandos Tauri | 4 invólucros finos, 1 arquivo | ✅ coeso |
| T7 TerminalPane | 1 componente | ✅ |
| T8 GridLayout | 1 componente | ✅ |
| T9 TerminalHeader | 1 componente | ✅ |
| T10 Max/min/fechar | 1 comportamento, 2 arquivos | ✅ coeso |
| T11 Persistência | 1 comportamento | ✅ |

Nenhuma tarefa precisa ser dividida.

## Check 2 — Diagrama × definição

| Tarefa | `Depende de` | Diagrama | Status |
|---|---|---|---|
| T1 | — | raiz | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T1 | T2→T3 ⚠️ | ⚠️ ver nota |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T4 | T4→T5 | ✅ |
| T6 | T5 | T5→T6 | ✅ |
| T7 | T6 | T6→T7 [P] | ✅ |
| T8 | T6 | T6→T8 [P] | ✅ |
| T9 | T6 | T6→T9 [P] | ✅ |
| T10 | T7,T8,T9 | T7,T8,T9→T10 | ✅ |
| T11 | T10, T2 | T10→T11 | ✅ (T2 é dep transitiva, já satisfeita) |

> ⚠️ **Nota**: T3 depende só de T1, não de T2. O diagrama da Fase 1 mostra `T1→T2→T3` por ser uma cadeia de execução sequencial, não de dependência real. T3 poderia rodar em paralelo com T2 — mas como T2 tem `Tests: integration` (não paralelizável) e T3 é curta, a sequência é mantida de propósito. Dependência real registrada corretamente no corpo da tarefa.

## Check 3 — Co-locação de testes

| Tarefa | Camada criada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T1 | scaffolding | none | none | ✅ |
| T2 | banco/migrações | integration | integration | ✅ |
| T3 | throttle | unit | unit | ✅ |
| T4 | sessão PTY | integration | integration | ✅ |
| T5 | gerência PTY | integration | integration | ✅ |
| T6 | comandos Tauri (finos) | none | none | ✅ |
| T7 | ponte xterm↔Channel | none | none | ✅ |
| T8 | componente React com lógica | unit | unit | ✅ |
| T9 | componente apresentacional | none | none | ✅ |
| T10 | componente React com lógica | unit | unit | ✅ |
| T11 | banco + estado | integration | integration | ✅ |

Nenhuma violação. Nenhum `Tests: none` justificado por "testado em outra tarefa".

## Paralelismo

Só T7, T8 e T9 são `[P]` — todas com `Tests` em `none` ou `unit`, ambos parallel-safe pela avaliação em TESTING.md. Toda tarefa com `Tests: integration` (T2, T4, T5, T11) roda sequencial por disputar arquivo SQLite, socket ou processos reais.
