# Validação — terminal-screenshot

**Veredito: PASS** — 23/23 critérios confirmados com evidência em `file:line`,
3 gates verdes. Nenhum critério de aceite falha. Foram encontrados **8 defeitos
ou limites de precisão**, todos menores ou latentes, listados na última seção.

Verificador independente (não escreveu a implementação). Regra de evidência:
sem `file:line` lido de verdade, o critério vale ZERO. Nenhum arquivo de código,
teste ou spec foi modificado nesta validação.

---

## Mapa dos 23 critérios

| ID | Veredito | Evidência (file:line) | Nota |
| --- | --- | --- | --- |
| SHOT-01 | PASS | `src/components/shell/Header.tsx:122-134` (`onClick`, `aria-pressed`, `data-armed`); `src/components/shell/Header.tsx:90-95` (`.shell-header__camera[data-armed='true'] { border: 1px solid var(--accent) }`); teste `src/components/shell/Header.test.tsx:191-217` | Botão deixa de ser inerte; `INERT_LABELS` perdeu `camera` em `Header.test.tsx:20`. A borda `var(--accent)` é verificada pelo atributo `data-armed`, não por estilo computado — jsdom não resolve o `<style>` inline. |
| SHOT-02 | PASS | `src/App.tsx:695-697` (`data-capture-target`); `src/App.tsx:875-885` (outline tracejado + `cursor: crosshair`); teste `src/App.test.tsx:1399-1418` | Desvio literal: a spec pede outline `var(--accent)`; o CSS usa `rgba(245, 183, 0, 0.5)` no repouso (valor de `--accent` em `src/styles.css:4`, com alfa) e só usa `var(--accent)` no `:hover` (`App.tsx:882`). Ver defeito D5. Ver também D1 (painel escondido por maximize). |
| SHOT-03 | PASS | `src/App.tsx:696` (`tab.id === activeTab.id && !isMinimized`); testes `src/App.test.tsx:1421-1432` (minimizado) e `src/App.test.tsx:1435-1455` (aba inativa + remarcação ao trocar de aba) | Não-clicável decorre do mesmo predicado em `App.tsx:704-705`: fora dele o `onClickCapture` é `undefined`. |
| SHOT-04 | PASS | `src/App.tsx:1128-1135` (`<div className="app-capture-hint" role="status">Selecione um terminal para capturar · Esc cancela</div>`), renderizado imediatamente antes de `.app-grid-area` em `src/App.tsx:1137`; teste `src/App.test.tsx:1413-1417` | Texto conferido caractere a caractere, inclusive o `·`. |
| SHOT-05 | PASS | `src/App.tsx:495-508` (efeito de `keydown`; `dialogOpen`/`settingsOpen` têm precedência); teste `src/App.test.tsx:1458-1476` | Sem conflito com o Esc do `ScreenshotModal`: quando o modal existe, `captureArmed` já é `false` (`App.tsx:522`), então o efeito nem se registra. |
| SHOT-06 | PASS | `src/App.tsx:1048` (`onToggleCapture={() => setCaptureArmed((armed) => !armed)}`); teste `src/App.test.tsx:1471-1475` | Nenhuma imagem é produzida no desarme. |
| SHOT-07 | PASS | `src/components/shell/Header.tsx:127` (`disabled={terminalCount === 0}`); `src/App.tsx:1044` passa `terminals.length`, que é `activeTab.terminals` (`src/App.tsx:233`); teste `src/components/shell/Header.test.tsx:220-224` | Contagem é a da aba ativa, como o critério exige. |
| SHOT-08 | PASS (com lacuna de teste) | `src/App.tsx:703-712` (`onClickCapture` com guarda `closest('.terminal-header')`); `src/components/terminal/TerminalHeader.tsx:147` confirma a classe; teste `src/App.test.tsx:1479-1492` (maximizar e trocar de aba com o modo armado) | **Digitação não é testada**: `App.test.tsx:69-96` substitui `TerminalPane` por um dublê `<div>`. Evidência de mecanismo levantada por mim: `node_modules/@xterm/xterm/lib/xterm.js` registra **0** listeners de `"click"` e 5 de `mousedown` — interceptar `click` não pode quebrar foco, seleção nem digitação do xterm. Ver defeito D3. |
| SHOT-09 | PASS | `src/lib/terminalSnapshot.ts:96-98` (`buffer.getLine(buffer.baseY + row)` para `row` em `0..rows-1`); testes `src/lib/terminalSnapshot.test.ts:183-196` (scrollback fica de fora) e `:213-220` (linha ausente não derruba o resto) | |
| SHOT-10 | PASS | `src/lib/terminalSnapshot.ts:79` (`ctx.scale(dpr, dpr)`), `:81-82` (fundo `#0a0a0c`), `:133` (`PADDING = 12`), `:151-153` (`canvas.width = Math.round(width * dpr)`); testes `src/lib/terminalSnapshot.test.ts:110-118` e `:255-265` | Contas conferidas à mão: 2 col × 10px + 24 = 44 lógicos × dpr 2 = 88; 1 lin × 20 + 28 + 24 = 72 × 2 = 144. Bate com o teste. |
| SHOT-11 | PASS | `src/lib/terminalSnapshot.ts:50-62` (`fgOf`/`bgOf`), `:31-41` (`ANSI_PALETTE`), `:117-127` (bold/italic/dim/underline); testes `src/lib/terminalSnapshot.test.ts:96-106`, `:121-152`, `:155-165` | **Aritmética da paleta reconferida célula a célula**: cubo 16-231 usa `r=⌊n/36⌋, g=⌊n/6⌋%6, b=n%6` com `step(v)= v===0 ? 0 : 55+40v` (fórmula canônica do xterm); cinzas 232-255 usam `8+10(i-232)`. Índices 16→`#000000`, 21→`#0000ff`, 231→`#ffffff`, 232→`#080808`, 255→`#eeeeee` — todos corretos. |
| SHOT-12 | PASS | `src/lib/terminalSnapshot.ts:107-109` (`const inverse = ...; const fg = inverse ? bgOf(current) : fgOf(current); const bg = inverse ? fgOf(current) : bgOf(current)`); teste `src/lib/terminalSnapshot.test.ts:143-152` | **Ordem confirmada**: `fgOf`/`bgOf` resolvem RGB, paleta e default por completo *antes* da troca — o inverse é aplicado sobre cores já resolvidas, não sobre índices. Célula default invertida vira fg `#0a0a0c` sobre bg `#e8e8ea`, que é o comportamento certo. |
| SHOT-13 | PASS (com lacuna de teste) | `src/App.tsx:519-529` (`if (!term) return` após `setCaptureArmed(false)`); `src/lib/terminalSnapshot.ts:143-148` (rejeita sem elemento / sem dimensão); ponte em `src/components/terminal/TerminalPane.tsx:87` e `:183`, consumida em `src/App.tsx:764-768`; testes `src/lib/terminalSnapshot.test.ts:268-289`, `src/components/terminal/TerminalPane.test.tsx:79-92`, `src/App.test.tsx:1533-1546` | O teste de App exercita o caminho de **rejeição** de `snapshotBlob`, não o ramo `!term`. Ver defeito D4. |
| SHOT-14 | PASS | `src/components/terminal/ScreenshotModal.tsx:83-87` (`rgba(0, 0, 0, 0.62)` + `backdrop-filter: blur(4px)`), idêntico a `.app-settings-backdrop` em `src/App.tsx:1007-1008`; `ScreenshotModal.tsx:165` (`<img>`); testes `ScreenshotModal.test.tsx:48-53` e `App.test.tsx:1503-1508` | Tratamento de overlay comparado linha a linha com o do Settings: mesmo `rgba`, mesmo blur, mesmo `z-index: 1200`, mesmo `padding: clamp(...)`. |
| SHOT-15 | PASS | `src/App.tsx:521` (`setCaptureArmed(false)` antes de qualquer `await`); teste `src/App.test.tsx:1509-1510` (`aria-pressed` volta a `false` e não sobra `[data-capture-target]`) | Desarma no clique, ou seja, antes mesmo do modal montar — mais forte que o critério. |
| SHOT-16 | PASS | `src/components/terminal/ScreenshotModal.tsx:47-52` (`save({ defaultPath })`, `new Uint8Array(await blob.arrayBuffer())`, `invoke('screenshot_save')`, `onClose()`); nome em `src/App.tsx:13-22`; Rust em `src-tauri/src/commands/screenshot.rs:11-13`; registro em `src-tauri/src/lib.rs:161-162` e `src-tauri/src/commands/mod.rs:10-11`; testes `ScreenshotModal.test.tsx:56-70`, `App.test.tsx:1521-1530`, `screenshot.rs:20-30` | Bytes atravessam o IPC como `Uint8Array` (AD do spec), não como array JSON — asserção explícita em `ScreenshotModal.test.tsx:69`. Formato do nome bate com `swarmdeck-terminal-<N>-<YYYYMMDD-HHMMSS>.png`. |
| SHOT-17 | PASS | `src/components/terminal/ScreenshotModal.tsx:59-66` (`navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`); teste `ScreenshotModal.test.tsx:96-105` | Sem `await` entre o clique e o `write` — o blob já está em mãos, como o spec exigiu para preservar a *transient user activation*. |
| SHOT-18 | PASS | `src/components/terminal/ScreenshotModal.tsx:159-161` (botão fechar) e `:36-43` (Escape em `window`); testes `ScreenshotModal.test.tsx:118-126` e `:129-135` | O teste do botão confirma explicitamente que nem `save` nem `clipboard.write` foram chamados. |
| SHOT-19 | PASS | `src/components/terminal/ScreenshotModal.tsx:49` (`if (!path) return`); teste `ScreenshotModal.test.tsx:73-83` | Teste confirma `invoke` não chamado e `onClose` não chamado. |
| SHOT-20 | PASS | `src/components/terminal/ScreenshotModal.tsx:54-56` (catch → `setError`), `:167-171` (`role="alert"`); Rust `src-tauri/src/commands/screenshot.rs:12` (`map_err(|e| e.to_string())`); testes `ScreenshotModal.test.tsx:86-93` e `screenshot.rs:33-41` | O teste Rust confirma também que nada foi escrito (`!path.exists()`). |
| SHOT-21 | PASS | `src/components/terminal/ScreenshotModal.tsx:64-66`; teste `ScreenshotModal.test.tsx:108-115` | |
| SHOT-22 | PASS | `src/lib/terminalSnapshot.ts:43-46` (`TITLE_STRIP_HEIGHT = 28`, `TITLE_BACKGROUND = '#131318'`), `:84-90` (faixa + texto), `:94` (`top = TITLE_STRIP_HEIGHT + padding`); título montado em `src/lib/terminalSnapshot.ts:169` (`#${index} · ${cwd}`); testes `terminalSnapshot.test.ts:190-199` e `:202-210` | O teste confirma a faixa **e** o deslocamento da primeira linha para baixo dela. |
| SHOT-23 | PASS | `src/App.tsx:1161-1172` (`onClose` → `setCapture(null)` + `cameraRef.current?.focus()`); `src/App.tsx:181` (`cameraRef`); `src/components/shell/Header.tsx:125` (`ref={cameraRef}`); teste `src/App.test.tsx:1549-1564` | "Por qualquer caminho" vale: salvar, copiar, botão fechar, Escape e clique no backdrop convergem todos para o mesmo `onClose`. |

---

## Edge Cases da spec

| Edge case | Situação | Evidência |
| --- | --- | --- |
| Aba ativa com zero terminais → câmera desabilitada e nunca arma | **OK** | `src/components/shell/Header.tsx:127`; teste `Header.test.tsx:220-224`. Mas ver defeito D2: *fechar* o último terminal com o modo já armado não desarma. |
| Trocar de aba com o modo armado remarca os painéis da nova aba | **OK, testado** | `src/App.tsx:696` (predicado reavaliado a cada render); teste `src/App.test.tsx:1435-1455` confirma a troca `['/b','/c'] → ['/a']`. |
| Terminal com zero linhas ou zero colunas → sai do modo sem abrir modal | **Comportamento correto, mas por caminho lateral e sem teste** | A guarda `if (!cellWidth \|\| !cellHeight)` em `src/lib/terminalSnapshot.ts:147` **não pega este caso**: com `cols === 0` e `clientWidth > 0`, `cellWidth = Infinity`, que é *truthy*. O fluxo segue, `width` vira `NaN` (`0 * Infinity`), `canvas.width` é coagido a `0` (`terminalSnapshot.ts:151`), e o `toBlob` de um canvas sem pixels devolve `null` → rejeita em `:181` → `App.tsx:527` engole e o modo já foi desarmado em `:521`. Resultado final bate com o spec, mas por acidente. Ver defeito D6. |
| Terminal continua produzindo saída → mostra o buffer lido no clique | **OK** | `snapshotBlob` (`src/lib/terminalSnapshot.ts:138`) é `async`, mas **não há nenhum `await` antes de `paintSnapshot`** (`:161`): toda a leitura do buffer roda síncrona dentro do handler de clique. Só o `toBlob` é assíncrono, e ele já opera sobre pixels desenhados. Sem teste dedicado, mas garantido pela estrutura do código. |
| `navigator.clipboard` indisponível → modal fica aberto com a falha inline | **OK** | O `try/catch` de `src/components/terminal/ScreenshotModal.tsx:60-67` captura tanto a rejeição da promise quanto o `TypeError` de ler `.write` de `undefined`. O teste (`ScreenshotModal.test.tsx:108-115`) simula uma *rejeição*, não a *ausência* do objeto. Lacuna de precisão pequena. |

---

## Marcadores `SPEC:`

`grep -rn "SPEC: terminal-screenshot" src/ src-tauri/src/` → 24 ocorrências.
Todos os 12 arquivos criados ou editados nesta feature carregam marcador:

| Arquivo | Marcador | Regra |
| --- | --- | --- |
| `src/lib/terminalSnapshot.ts:1` | SHOT-09, 10, 11, 12, 13, 22 | topo ✓ |
| `src/lib/terminalSnapshot.test.ts:1` | SHOT-09, 10, 11, 12, 22 | topo ✓, mas **incompleto** — ver D8 |
| `src/components/terminal/ScreenshotModal.tsx:1` | SHOT-14, 16..21 | topo ✓ |
| `src/components/terminal/ScreenshotModal.test.tsx:1` | SHOT-14, 16..21 | topo ✓ |
| `src/App.tsx:1` | SHOT-02, 03, 04, 05, 08, 13, 14, 15, 23 | topo ✓, anexado à lista existente |
| `src/App.test.tsx:1` | mesmos IDs | topo ✓ |
| `src/components/shell/Header.tsx:1` | SHOT-01, 06, 07, 23 | topo ✓ |
| `src/components/shell/Header.test.tsx:1` | SHOT-01, 06, 07 | topo ✓ |
| `src/components/terminal/TerminalPane.tsx:1` | SHOT-13 | topo ✓ |
| `src/components/terminal/TerminalPane.test.tsx:1` | SHOT-13 | topo ✓ |
| `src-tauri/src/commands/screenshot.rs:1` | SHOT-16, SHOT-20 | topo ✓ (arquivo existe só por esta feature) |
| `src-tauri/src/commands/mod.rs:10` | SHOT-16 | **localizado** acima de `pub mod screenshot;` — exceção do item 3 da regra, aplicada corretamente |
| `src-tauri/src/lib.rs:161` | SHOT-16 | **localizado** acima de `commands::screenshot::screenshot_save` no `invoke_handler` — exceção aplicada corretamente |

Há ainda 10 marcadores localizados dentro de `App.tsx`, `Header.tsx`,
`TerminalPane.tsx` e `terminalSnapshot.ts` apontando blocos específicos. O
`grep` continua achando todos os arquivos, como a regra exige.

Nenhum ID inventado: os 23 IDs usados existem no spec. Nenhum arquivo sem
sintaxe de comentário foi tocado. Nenhuma spec antiga foi revogada — a feature
só liga o botão que `shell-chrome (HDR-10)` já reservava, e o marcador de
`Header.tsx` mantém HDR-10 na lista.

---

## Gates — números reais executados nesta validação

| Gate | Comando | Resultado |
| --- | --- | --- |
| Build | `npm run build` (`tsc --noEmit && vite build`) | **exit 0** — 1855 módulos, `dist/assets/index-Bdwv10KU.js` 631.21 kB (gzip 172.97 kB), 3.41s. Único aviso é o de tamanho de chunk, pré-existente. |
| Testes front | `npm test -- --run` | **exit 0** — **29 arquivos, 297 testes, 297 passed, 0 failed**, 12.59s |
| Testes Rust | `cargo test -p swarmdeck --manifest-path src-tauri/Cargo.toml` | **exit 0** — **269 testes ao todo (16 binários), 269 passed, 0 failed**. Binário principal: 200 passed. Inclui `commands::screenshot::tests::grava_os_bytes_no_caminho_recebido ... ok` e `commands::screenshot::tests::caminho_em_diretorio_inexistente_devolve_erro ... ok`. |

Recorte da feature: 45 testes nos 4 arquivos de componente/lib
(`terminalSnapshot.test.ts` 16 · `ScreenshotModal.test.tsx` 9 · `Header.test.tsx` ·
`TerminalPane.test.tsx`) + 9 testes de `App.test.tsx` filtrados por
`-t "terminal-screenshot"` + 2 testes Rust.

**Zero dependência nova**: `git diff --stat package.json src-tauri/Cargo.toml`
volta vazio. O `tempfile` usado nos testes Rust já existia
(`src-tauri/Cargo.toml:98`).

---

## Defeitos e limites de precisão

### D1 — Painel escondido por `maximized` de um irmão continua marcado como alvo (latente)

`src/App.tsx:682` calcula `hiddenByMaximize` e o usa para `display: none` em
`src/App.tsx:734`. Mas `data-capture-target` (`:695-697`) e `onClickCapture`
(`:704-705`) **não consultam essa variável**. Com um painel maximizado, os
irmãos em modo `normal` continuam com `data-capture-target="true"` no DOM e com
handler de captura instalado.

Impacto real hoje: **nulo para o usuário** — `display: none` não pinta outline
nem recebe clique, e se um clique sintético chegasse, `snapshotBlob` rejeitaria
por dimensão zero (SHOT-13). Mas é um marcador que mente: qualquer teste ou
consulta que use `[data-capture-target]` como fonte de verdade conta painéis
invisíveis. `design.md` não menciona o caso de maximize em lugar nenhum, então
não é decisão registrada — é omissão. Correção seria uma palavra:
`&& !hiddenByMaximize`.

### D2 — Fechar o último terminal com o modo armado deixa o estado preso

Nada em `src/App.tsx` reseta `captureArmed` quando `terminals.length` cai a
zero. O resultado é: a dica `.app-capture-hint` (`:1128`) continua na tela
dizendo "Selecione um terminal para capturar", não há painel nenhum para
selecionar, e o botão de câmera fica `disabled` (`Header.tsx:127`) — ou seja, o
próprio SHOT-06 (desarmar clicando na câmera) deixa de estar disponível. Só o
Esc resolve. Nenhum critério cobre a transição, então não reprova nenhum ID,
mas é um estado inconsistente alcançável em dois cliques.

### D3 — SHOT-08 "digitação do terminal" não é verificada por teste (asserção em dublê)

`src/App.test.tsx:69-96` troca `TerminalPane` por um `<div>` estático. O teste
de SHOT-08 (`src/App.test.tsx:1479-1492`) exercita só os botões do
`TerminalHeader` e a troca de aba — a metade "digitação continua operando" do
critério **não é testada em lugar nenhum**, nem aqui nem em
`TerminalPane.test.tsx`.

Levantei evidência de mecanismo por fora para não deixar o critério no escuro:
`node_modules/@xterm/xterm/lib/xterm.js` tem **0 ocorrências de `"click"`** e 5
de `mousedown`. O `stopPropagation` de `src/App.tsx:709` roda sobre um evento
`click`; foco, seleção e digitação do xterm nascem de `mousedown`/`focus`, que
não são interceptados. Por isso classifiquei SHOT-08 como PASS. Mas isso é
raciocínio meu sobre a biblioteca, **não uma asserção do repositório** — se o
xterm passar a escutar `click` numa atualização, nada aqui quebra em vermelho.

### D4 — SHOT-13: o ramo `!term` e o caminho ponta-a-ponta não são testados

Dois pontos:
1. `src/App.tsx:522` (`if (!term) return`) — o caso literal do critério, "painel
   clicado sem instância viva de xterm" — não tem teste. O teste que carrega o
   ID (`src/App.test.tsx:1533-1546`) faz `snapshotBlobMock.mockRejectedValue(...)`,
   que exercita o `.catch` de `:526`, um ramo diferente.
2. `src/App.test.tsx:18` faz `vi.mock('./lib/terminalSnapshot')`. Somado ao dublê
   de `TerminalPane`, isso significa que **nenhum teste da suíte vai do clique
   no painel até um PNG real**: `terminalSnapshot.test.ts` testa a pintura com
   um contexto 2D falso, e `App.test.tsx` testa o fio com a pintura mockada. A
   junção das duas metades é assumida, não provada. O comentário em
   `App.test.tsx:16-17` declara isso honestamente, o que é correto — registro
   aqui como limite de cobertura, não como desonestidade.

### D5 — SHOT-02: o outline não usa `var(--accent)` como o critério pede

`src/App.tsx:878` escreve `outline: 2px dashed rgba(245, 183, 0, 0.5)`. É
literalmente o valor de `--accent` (`src/styles.css:4` = `#f5b700`) com alfa,
mas hardcoded — o token só aparece no estado `:hover` (`src/App.tsx:883`).
Visualmente indistinguível hoje; quebra silenciosamente se o tema mudar o
token. O comentário de `:875-876` justifica `outline` em vez de `border` (não
mexer no box model), o que é uma boa decisão — mas não justifica o literal.

### D6 — A guarda de dimensão zero não pega zero linhas/colunas

`src/lib/terminalSnapshot.ts:145-147` divide antes de validar:
`cellWidth = screen.clientWidth / term.cols`. Com `cols === 0` e
`clientWidth > 0` o resultado é `Infinity`, e `!Infinity` é `false` — a guarda
passa. O caso ainda termina certo (via `NaN` → `canvas.width = 0` → `toBlob`
devolve `null` → rejeita), mas por três camadas de coerção, nenhuma delas
intencional nem testada. O teste que existe (`terminalSnapshot.test.ts:268-278`)
usa `clientWidth = 0` com 1 coluna, que é o caso *diferente* de painel sem
dimensão. Validar `term.cols`/`term.rows` antes da divisão custaria uma linha.

### D7 — O modal não prende o foco

`ScreenshotModal` tem `role="dialog" aria-modal="true"` (`:157`) e `autoFocus`
no botão Copiar (`:175`), mas nenhum *focus trap*. Com Tab dá para alcançar o
botão de câmera atrás do backdrop e rearmar o modo de captura com o modal
aberto — daí o Esc seguinte dispara os dois handlers (`ScreenshotModal.tsx:38`
e `App.tsx:498`). Nenhum critério cobre isso; registro por ser um estado
alcançável e não previsto.

### D8 — Marcador `SPEC:` incompleto em `terminalSnapshot.test.ts`

`src/lib/terminalSnapshot.test.ts:1` lista `SHOT-09, 10, 11, 12, 22`, mas o
arquivo contém testes explicitamente anotados para **SHOT-13**
(`:268`, `:279`) e **SHOT-14** (`:258`). O item 3 de
`.claude/rules/spec-driven-changes.md` manda atualizar o marcador quando o
escopo do arquivo muda. Desvio pequeno, correção de uma linha.

---

### Resumo do risco

Nenhum dos 8 achados invalida um critério de aceite, e nenhum é caminho de
perda de dado — o modal nunca fecha em falso sucesso (SHOT-19/20/21 cobrem os
três caminhos de falha, com teste). Os dois que eu corrigiria antes de fechar
são **D1** (uma palavra, elimina um marcador que mente) e **D2** (um estado
preso alcançável em dois cliques). **D3** e **D4** são dívida de teste
consciente e declarada no próprio código, não defeito de implementação.

---

## Fix pass — 18/08/2026, após o Verifier

Os defeitos abaixo foram corrigidos depois do veredito, no mesmo ciclo de
desenvolvimento. Gate após as correções: `npm run build` verde,
**301 testes front**, **269 testes Rust**.

| # | Situação | O que mudou |
| --- | --- | --- |
| D1 | Corrigido | `isCaptureTarget` em `src/App.tsx:691` passa a incluir `!hiddenByMaximize`; painel escondido por outro maximizado deixa de ser marcado. Teste: `App.test.tsx` — "não marca o painel escondido por outro maximizado". |
| D2 | Corrigido | Efeito em `src/App.tsx:497-499` desarma a captura quando a aba fica sem terminais, já que a câmera fica `disabled` e não poderia desarmar. Teste: "desarma sozinho quando o último terminal da aba é fechado". |
| D4 | Corrigido | O dublê de `TerminalPane` deixa de entregar instância para o `cwd` reservado `/sem-xterm`, o que exercita o ramo `if (!term) return`. Teste: "desarma sem pintar quando o painel não tem instância de xterm". |
| D6 | Corrigido | `snapshotBlob` valida `term.cols`/`term.rows` **antes** de dividir (`src/lib/terminalSnapshot.ts`), então zero colunas rejeita direto em vez de virar `Infinity`. Teste: "rejeita quando o terminal reporta zero colunas". |
| D8 | Corrigido | Marcador de `src/lib/terminalSnapshot.test.ts` passa a listar SHOT-13 e SHOT-14. |
| D5 | Mantido, com razão | O outline em repouso usa `rgba(245, 183, 0, 0.5)` porque é exatamente o que a Visual Specification do `design.md` especifica, e um token CSS não carrega alfa. O valor é `--accent` a 50%; o estado de hover usa o token direto. |
| D3 | Não corrigido — limite do ambiente | Provar que a digitação no terminal continua funcionando com o modo armado exige xterm montado de verdade; jsdom não monta. Fica para o teste manual registrado no handoff. |
| D7 | Fora de escopo | Focus trap no modal não é requisito de nenhum dos 23 critérios. Registrado como melhoria futura de acessibilidade. |
