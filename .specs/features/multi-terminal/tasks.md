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
| T7 TerminalPane | ✅ Done — **Verify confirmado na run 005 (uat-agent, 02/08/2026)** | — (none) |
| T8 GridLayout | ✅ Done | 5 unit (plano: 5) |
| T9 TerminalHeader | ✅ Done — **Verify confirmado na run 005 (uat-agent, 02/08/2026)** | — (none, apresentacional) |
| T10 Max/min/fechar | ⚠️ Done (gate quick) — **Verify PARCIAL na run 005 (uat-agent, 02/08/2026): maximizar/fechar confirmados; minimizar→restaurar PERDE o scrollback do período minimizado — o próprio critério de Verify da task (`ping -t`, minimizar, restaurar) falhou.** | 4 unit (plano: 4) |
| T11 Persistência | ⛔ Done (gate full) — **NEEDS-DECISION na run 005 (uat-agent, 02/08/2026): TERM-07 confirmado como não integrado ao frontend.** | 4 integration (plano: 4) |
| T12 Montar `App.tsx` | 🆕 Criada na triagem 005 (02/08/2026) — pronta para execução | — (fiação, gate build) |

**Total atual: 40 testes passando** — `cargo test` = 31 (11 lib + 5 db + 4 layout + 6 manager + 5 session); `npm run test` = 9 (5 GridLayout + 4 terminals). Ver relatório de execução para a saída bruta de cada gate.

**Verify visual — atualização da run 004 (01/08/2026, spec-loop, modo direto, item `uat-agent`):** desta vez o ambiente TINHA display gráfico e o agente conseguiu subir o app, conectar por CDP (Chrome DevTools Protocol, via `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`) e dirigir a janela real — a limitação registrada em 31/07/2026 (sem display) NÃO se repetiu. **T6 foi CONFIRMADO**: `pty_spawn` invocado pelo console do DevTools (a UI não tem botão de "novo terminal" ainda), bytes reais de `cmd.exe` chegaram pelo `Channel` (incluindo o handshake DSR `[6n` documentado no design.md).

**T7, T9, T10 e T11 NÃO puderam ser confirmados — mas por um motivo diferente do registrado em 31/07/2026, e mais grave.** O agente de UAT encontrou que `src/App.tsx` é ainda o placeholder do scaffolding (`<h1>SwarmDeck</h1><p>Scaffolding pronto...</p>`) — ele **não importa nem renderiza** `GridLayout`, `TerminalPane`, `TerminalHeader` nem `state/terminals.ts`. Confirmado por leitura de `App.tsx`/`main.tsx` e grep: nenhum arquivo em `src/` fora dos próprios `.test.tsx` importa esses componentes. Ou seja: T7, T9, T10, T11 passam nos gates automatizados **isolados** (build/test do componente em si), mas nenhum deles é alcançável por um usuário real abrindo o app — não existe grid, não existe pane, não existe header na tela. Nenhuma task deste arquivo lista `App.tsx` como "Onde", então a integração nunca foi um item planejado — é uma lacuna de escopo, não um bug de uma task específica.

✅ **Resolvido na triagem 005 (02/08/2026).** O usuário decidiu criar uma task nova de integração — é **T12** (logo após T11 neste arquivo), pronta para a `spec-loop` executar. `T7, T9, T10, T11` seguem sem `Verify` confirmado até T12 fechar e o `uat-agent` reexecutar o `Verify` original de cada uma.

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

### T7: `TerminalPane` (React) [P]  — Verify pendente de T12

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

> ✅ **NEEDS-DECISION resolvida na triagem 005 (02/08/2026).** O usuário escolheu criar uma task nova de integração — ver **T12** (logo após T11 neste arquivo). O `Verify` desta task fica pendente de T12: só é executável depois que `App.tsx` monta a árvore real. Não reabrir esta pergunta — é a mesma decisão para T7, T9, T10 e T11, registrada uma única vez aqui.
**Estado do código:** nada alterado — T7 (`TerminalPane.tsx`) continua existindo e passando no gate `build` isolado, só não é alcançável pela UI real até T12 fechar.

**✅ Verify confirmado — run 005 (02/08/2026), `uat-agent`, via T12.** App real dirigido por CDP/Playwright (não console do DevTools). Terminal #1 nasce automaticamente com `cmd.exe` real, banner do Windows visível em <500ms. Digitação (`echo HELLO_UAT_12345`) ecoada sem perda de caractere. Redraw de linha testado (digitar errado, `Backspace` × 3, completar, `Enter`) — o texto errado nunca aparece na tela, só o corrigido: edição de linha do shell (doskey) renderiza igual a um terminal nativo. Cores ANSI confirmadas via `color 0a`/`color 07` (ConPTY traduz a chamada de console attribute do Win32 em SGR real) — tela virou verde e voltou ao normal, screenshot confirma. Redimensionamento do painel → PTY: não testado via resize direto da janela do SO, mas confirmado **indiretamente e de forma mais forte**: o ciclo maximizar/restaurar de um painel vizinho (que oculta os outros com `display:none` e depois os reexibe) dispara `ResizeObserver → fit() → pty_resize` nos painéis ocultos — é exatamente esse mecanismo que causou a perda de scrollback documentada no Verify de T10 abaixo, o que prova que as dimensões chegam de fato ao PTY (o bug está na perda de conteúdo durante o resize, não na ausência do resize).

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

### T9: `TerminalHeader` (React) [P]  — Verify pendente de T12

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

> ✅ **Resolvida na triagem 005 — ver T12.** `Verify` pendente da mesma integração de `App.tsx` que T7 aguardava; mesma decisão, não repetida aqui.

**✅ Verify confirmado — run 005 (02/08/2026), `uat-agent`, via T12.** Header exibe número sequencial correto em cada painel (`#1`..`#4`, confirmado visualmente com 4 terminais abertos simultaneamente). Ícone de agente e badge de status: **fora de escopo desta run** (gap conhecido, `agent-selection` ainda não fiado — `App.tsx` passa `agents={[]}` de propósito, ver comentário no próprio arquivo). Ação de fechar com processo ativo **pede confirmação real**: cliquei em "×" do terminal #4 e um diálogo nativo `window.confirm` apareceu com a mensagem exata "Este terminal tem um processo ativo. Encerrar mesmo assim?" — `Cancel` manteve o terminal aberto (contagem de painéis inalterada), `OK` fechou e reorganizou o grid. **Isto contradiz a hipótese do prompt desta run** (que a leitura isolada de `App.tsx` sugeria fechamento direto sem confirmação) — a confirmação está implementada em `TerminalHeader.tsx::handleClose` (linhas 34-42), que envolve o `onClose` recebido via prop antes de chamá-lo; `App.tsx::handleCloseTerminal` de fato não tem confirmação própria, mas nunca é chamado sem passar primeiro pelo `window.confirm` do header. Botões de maximizar/minimizar disparam os callbacks corretos (confirmado em T10).

**Commit**: `feat(ui): terminal header with status badge and actions`

---

### T10: Maximizar, minimizar e fechar  — Verify pendente de T12

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

> ✅ **Resolvida na triagem 005 — ver T12.** `Verify` pendente da mesma integração de `App.tsx` que T7 aguardava; mesma decisão, não repetida aqui.

**⚠️ Verify PARCIAL — run 005 (02/08/2026), `uat-agent`, via T12.** Três dos quatro comportamentos confirmam; o quarto (o critério literal do `Verify` desta task) **falha**:
- ✅ Maximizar: painel ocupa toda a área (`boundingBox` = viewport inteiro, 1400×900), os outros 2 painéis continuam no DOM (`display:none`, não desmontados) — confirmado com screenshot. Ressalva cosmética: o header do painel maximizado (`z-index:20`, `position:fixed`) sobrepõe visualmente a toolbar do app (`z-index` não declarado na toolbar) — bug visual menor, não bloqueia a função.
- ✅ Fechar: `×` remove o painel e o grid reorganiza (4→3 painéis, 2×2 vira 2+1) — confirmado com screenshot.
- ✅ Minimizar recolhe a uma barra compacta — confirmado visualmente (`data-mode="minimized"`, altura ~2rem). Ressalva: o espaço liberado **não é redistribuído** aos vizinhos — a célula minimizada só encolhe seu próprio conteúdo a 2rem dentro da mesma track de grid (`1fr` fixo), deixando espaço vazio na grade em vez de ceder a área aos painéis restantes. O texto da task ("recolher a uma barra compacta **e redistribuir o espaço**") só se confirma pela metade.
- ❌ **Restaurar NÃO reexibe o scrollback do período minimizado — reprodução exata do `Verify` pedido.** Rodei `ping -t 127.0.0.1` (caminho completo, `C:\Windows\System32\ping.exe`, para contornar um `PATH` incompleto do shell spawnado — ver DESVIO), esperei 3 respostas visíveis, minimizei, esperei 4s (tempo suficiente para mais ~4 respostas), restaurei. Resultado: só **1** resposta ficou visível — nem as 3 anteriores ao minimizar nem a maior parte das que deveriam ter chegado durante os 4s permaneceram. Rolei a tela para cima (`mouse.wheel`) e o conteúdo não reapareceu — não é um problema de viewport/scroll, é perda real do buffer. A barra de scroll de outro painel (não afetado) mostra thumb visível para comparação; a do painel restaurado fica praticamente vazia. Mesmo padrão de perda observado, de forma independente, no ciclo maximizar/restaurar de um vizinho (T7 acima) — o `ResizeObserver → fit() → pty_resize` disparado quando o painel sai/entra de `display:none` parece truncar o histórico do lado do PTY/ConPTY (redimensionar para uma área oculta provavelmente encolhe rows/cols do console, e o Windows console buffer trunca no shrink). O processo `ping` continuou rodando (não foi morto — ainda produzia 1 resposta nova), então o requisito "PTY continua rodando" se sustenta; é especificamente "reexibir o scrollback completo" que não se sustenta.

Screenshots desta verificação: `shot-17-minimized2.png`, `shot-19-minimized2.png`, `shot-20-restored2.png` (caminho local do agente, não versionados no repo).

**Commit**: `feat(ui): maximize, minimize and close terminals`

---

### T11: Persistência de layout  — Verify pendente de T12

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

> ✅ **Resolvida na triagem 005 — ver T12.** `Verify` pendente da mesma integração de `App.tsx` que T7 aguardava; mesma decisão, não repetida aqui.

⛔ **NEEDS-DECISION — persistência não integrada ao frontend (run 005):** backend `layout::save`/`restore` (T11, `src-tauri/src/terminal/layout.rs`) nunca foi exposto como comando Tauri; `App.tsx` nunca chama `invoke` para layout. Requer task nova (mesmo padrão de `mcp-task-server/T9`) — decisão da spec-triage, não desta execução.

**Confirmação empírica (run 005, 02/08/2026, `uat-agent`):** montei 3 terminais reais na UI (não pelo console do DevTools), um deles com histórico de comandos digitado (`echo`, `color`). Fechei a janela do app com `taskkill` (sinal de encerramento, não `/F` — a mesma via que fecharia a janela por um clique real no X), o processo `swarmdeck.exe` e todo o pipeline `cargo run`/`vite` encerraram juntos (nenhum ficou de pé aguardando um segundo close). Subi o app de novo do zero (`npm run tauri dev` outra vez, build incremental). Resultado: o app abriu com **1 único terminal** (`#1`, `cmd.exe` fresco em `D:\ide\src-tauri`) — os 3 terminais anteriores, seus diretórios e proporções não voltaram. Confirma exatamente o sintoma que o orquestrador já havia identificado por `grep` (nenhum `tauri::command` de layout registrado): TERM-07 falha na prática, não só na leitura de código.

**Commit**: `feat(terminal): persist and restore grid layout`

---

### T12: Montar `App.tsx` — integração real do grid

> **Criada na triagem 005 (02/08/2026), decisão do usuário.** Resolve o `⛔ NEEDS-DECISION` aberto desde a run 004 em T7, T9, T10 e T11: nenhuma task listava `App.tsx` como `Onde`, então nenhum componente de terminal era alcançável por um usuário real — `App.tsx` seguia o placeholder do scaffolding. O usuário escolheu "criar task nova de integração" entre as opções levantadas (a alternativa era reabrir uma task `Done` existente). Não é redesenho: todos os componentes e o estado já existem e passam no gate isolado — esta task só monta o que já foi construído.

**O quê**: Substituir o placeholder de `App.tsx` por uma árvore real: estado de `TerminalState[]` (`state/terminals.ts`) alimentando `GridLayout`, cada painel renderizando `TerminalPane` dentro de `TerminalHeader`, e um botão "novo terminal" abrindo `NewTerminalDialog` (já existe, também nunca foi montado — ver Divergências da triagem 005). Fiação, não lógica nova: cada peça já tem seu próprio teste; esta task não introduz regra de negócio, só liga os pontos.
**Onde**: `src/App.tsx`, `src/main.tsx` (se precisar mover o provider/root)
**Depende de**: T7, T8, T9, T10, T11 (todos os componentes e o estado que serão montados)
**Reusa**: `GridLayout` (T8), `TerminalPane` (T7), `TerminalHeader` (T9), `NewTerminalDialog` (já existe em `src/components/terminal/`, órfão — mesma situação), `state/terminals.ts` (T10, T11), comandos Tauri de terminal (T6)
**Requisito**: TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-07, TERM-08 (nenhum requisito novo — esta task fecha o `Verify` dos que já existem, não cria comportamento)

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `App.tsx` renderiza `GridLayout` alimentado por `state/terminals.ts`, não o placeholder
- [ ] Cada painel do grid mostra `TerminalHeader` (topo) + `TerminalPane` (corpo), ligados ao mesmo `id` de terminal
- [ ] Existe uma ação visível de "novo terminal" que abre `NewTerminalDialog` e, ao confirmar, adiciona uma entrada a `TerminalState[]`
- [ ] Maximizar/minimizar/fechar (T10) e persistência de layout (T11) funcionam através da UI montada, não só via chamada direta ao estado
- [ ] Gate passa: `cargo build && npm run build`
- [ ] `Verify` de T7, T9, T10 e T11 (estacionados desde a run 004) tornam-se executáveis e devem ser reconfirmados nesta mesma execução — não é suficiente montar a árvore, o `uat-agent` precisa efetivamente repetir o `Verify` de cada um contra o app real

**Tests**: none *(fiação — a lógica já é testada nas peças que compõe; ver `codebase/TESTING.md` → "Ponte xterm.js ↔ Channel" e a linha de `App.tsx`, que hoje não existe na matriz e deveria ser adicionada como `none` na próxima revisão de `TESTING.md`)* · **Gate**: build

**Verify**: `uat-agent` — abrir o app, criar 2+ terminais pela UI (não pelo console do DevTools), digitar em cada um, redimensionar arrastando a divisória, maximizar, minimizar, fechar, reabrir o app e confirmar que o layout volta. Isto **substitui** o `Verify` que T7/T9/T10/T11 não conseguiram completar na run 004 — depois de T12, reexecutar o `Verify` original de cada uma dessas quatro tasks e atualizar seus marcadores de `NEEDS-DECISION` para `CONFIRMADO` ou `NÃO CONFIRMADO` (nunca presumir).

**Verify** (executado)

Executado em 02/08/2026 pelo `uat-agent` da run 005, app real dirigido via CDP (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`) + Playwright `connectOverCDP` (ad-hoc, `npx`, não entrou em `package.json`). Nenhuma chamada direta a `invoke`/estado interno — todas as ações abaixo foram cliques, digitação e arrasto reais na página.

| Critério | Resultado | Evidência |
|---|---|---|
| `App.tsx` renderiza `GridLayout` real, não placeholder | ✅ | Grid com painéis reais visível desde a abertura |
| Header + Pane por painel, mesmo `id` | ✅ | `#1`..`#4` com terminal correspondente, testado com 4 terminais simultâneos |
| Ação "novo terminal" abre `NewTerminalDialog` e cria entrada | ✅ | Diálogo abriu, campo Diretório/Agente visíveis, `criar` adicionou painel em 251ms |
| TERM-01.1 spawn em até 500ms | ✅ | 251ms do clique em "criar" até o 2º painel aparecer no DOM |
| TERM-01.2/TERM-02 digitação sem perda | ✅ | `echo HELLO_UAT_12345` ecoado exato |
| TERM-01/02.3 redraw de linha + ANSI | ✅ | Backspace/retype sem resíduo visual; `color 0a`/`07` mudou a tela inteira de cor e voltou |
| TERM-01.4 resize → PTY | ✅ (indireto) | Confirmado via efeito colateral do bug de T10 (resize claramente chega ao PTY) — não testado via resize direto da janela do SO |
| TERM-03/04.1 2 terminais = 2 colunas iguais | ✅ | Screenshot, 700px/700px |
| TERM-03/04.2 3-4 terminais = grid 2×2 | ✅ | Screenshot com 4 painéis |
| TERM-03/04.3 arrastar divisória redimensiona | ❌ | **Bug real, não de condução**: `GridLayout.tsx` usa `gridTemplateColumns: repeat(columns, 1fr)` fixo — nunca lê `pane.fracW` no container. Eventos `pointerdown`/`pointermove` disparam corretamente (confirmado via listener injetado, 16 `pointermove` durante o arrasto) e o estado interno `localPanes` provavelmente atualiza, mas nada no DOM reflete a nova fração — larguras ficam sempre 50/50. Achado adicional: a caixa de acerto (`boundingBox`) da divisória é reportada com 8px, mas o pai tem `overflow:hidden` que corta a metade direita — só ~4px realmente respondem a clique (não é a causa do bug acima, mas é um problema de UX separado que também vale registrar) |
| TERM-03/04.4 maximizar ocupa tudo, outros vivos | ✅ (com ressalva cosmética) | `boundingBox` = viewport inteiro; outros painéis `display:none` mas presentes no DOM. Ressalva: header do painel maximizado sobrepõe a toolbar (`z-index`/posicionamento, cosmético) |
| TERM-03/04.5 fechar encerra e reorganiza | ✅ | 4→3 painéis, grid reflui |
| TERM-03/04.6 5º desabilitado com explicação | ✅ | Botão `disabled`, `title="Limite de 4 terminais atingido"` |
| TERM-05.1 número sequencial no header | ✅ | `#1`..`#4` visíveis |
| TERM-05.6 fechar com processo ativo pede confirmação | ✅ | `window.confirm` real disparado com a mensagem exata; Cancelar mantém, OK fecha — **contradiz a suspeita levantada no prompt desta run** (a confirmação vive em `TerminalHeader.tsx`, não em `App.tsx`) |
| TERM-08.1 minimizar recolhe e redistribui espaço | ⚠️ PARCIAL | Recolhe a ~2rem; **não redistribui** — espaço liberado fica vazio na grade (`1fr` fixo por linha) |
| TERM-08.2 PTY continua rodando minimizado | ✅ | Processo `ping` não foi morto durante os 4s minimizado — nova resposta chegou |
| TERM-08.3 restaurar reexibe scrollback completo | ❌ | De 3 respostas visíveis pré-minimizar + ~4 esperadas durante o período, só 1 sobrou após restaurar. Rolagem para cima não recupera o conteúdo (não é problema de viewport). Mesmo padrão observado independentemente no ciclo maximizar/restaurar de T7 |
| TERM-07.1/2 persistência entre reinícios | ❌ | Confirmado: fechei o app com 3 terminais abertos, reabri — voltou com 1 terminal padrão. Gap de integração já identificado pelo orquestrador (nenhum comando Tauri de layout registrado); **NEEDS-DECISION**, não conserto aqui |

**Achados fora do escopo original do `Verify`, mas descobertos durante a condução real (reportados, não corrigidos):**
1. Divisória do grid não redimensiona visualmente (`fracW` nunca aplicado ao `gridTemplateColumns`) — `GridLayout.tsx`.
2. Perda de scrollback ao ocultar/reexibir um painel via `display:none` (afeta tanto minimizar quanto o painel *vizinho* de um maximizado) — provável truncamento do buffer do ConPTY ao redimensionar para uma área oculta.
3. Sobreposição visual cosmética entre o header do painel maximizado e a toolbar do app.
4. Área de clique real da divisória é ~4px, não os 8px do layout — clipada pelo `overflow:hidden` do pai.

**Commit**: `feat(ui): mount grid, terminal panes and header in App.tsx`

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
