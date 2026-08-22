# terminal-screenshot

## Problem Statement

Quem usa o SwarmDeck para acompanhar vários agentes de IA em paralelo não tem
como tirar um print de um terminal específico para colar num chat, num issue ou
num relatório — sobra recortar a tela inteira à mão e apagar o resto. Esta
feature põe um botão de câmera na barra de título de cada terminal: um clique
gera o PNG daquele painel, pronto para salvar em disco ou colar com Ctrl+V.

**Revisado em 18/08/2026 (AD-018).** A primeira versão morava no header do app
e exigia dois passos — armar a câmera e depois escolher o painel. O botão
passou para dentro do painel, onde já sabe a quem pertence, e o modo armado
inteiro (destaque, dica, Esc, alvo) foi revogado.

## Goals

- [ ] Cada painel tem, na própria barra de título, um botão de câmera que
      captura aquele terminal — sem seleção, sem modo armado.
- [ ] Um clique nesse botão produz um PNG do viewport daquele terminal em menos
      de um segundo, sem dependência nova de npm nem de crate.
- [ ] O PNG pode ser salvo numa pasta escolhida pelo usuário ou copiado para a
      área de transferência; o modal só fecha quando a ação conclui com sucesso.

## Out of Scope

Excluído de propósito. Documentado para conter escopo.

| Feature | Reason |
| --- | --- |
| Capturar o scrollback inteiro | "Print do terminal" é o que está na tela; scrollback longo é outro produto (exportar log). |
| Capturar painel `minimized` | A 34px com `overflow: hidden` o conteúdo não existe na tela; a imagem seria uma tira de barra de título. |
| Capturar terminal de aba inativa | Aba inativa é `display: none`; o usuário não está vendo aquilo e não pode apontar para ele. |
| Capturar a janela inteira do app | Não foi pedido; e o SO já tem ferramenta para isso. |
| Anotar, desfocar ou aplicar fundo/gradiente no print | Editor de imagem é outra feature; o pedido tem dois botões, salvar e copiar. |
| Upload do print para serviço externo | Não pedido; publicaria conteúdo de terminal fora da máquina. |
| `tauri-plugin-clipboard-manager` | `navigator.clipboard.write` já resolve no WebView2; o plugin entra só se o build Linux falhar de fato. |
| Tema claro no modal | `styles.css` declara `color-scheme: dark`; o app é dark-only. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Como capturar a imagem | Repintar o buffer do xterm num `<canvas>` (`terminal.buffer.active`), sem fotografar o DOM nem a janela do SO | Conselho 3-0. xterm 5.5 usa o DOM renderer, então o conteúdo já está disponível como dado por célula. `html2canvas` não rasteriza `<canvas>` e diverge entre WebView2 e WebKitGTK; `html-to-image` depende de `foreignObject`, com histórico ruim no WebKitGTK; captura nativa de janela devolve frame preto no WebView2 (composto por DirectComposition) e exige portal no Wayland. Zero dependência nova e testável em jsdom. Registrado como AD-015. | y |
| Como salvar em disco | `save()` do `@tauri-apps/plugin-dialog` (já instalado) mais o comando Rust `screenshot_save(path, bytes)` com `std::fs` | Conselho 3-0. `tauri-plugin-fs` custaria npm mais crate mais configuração de escopo de capability para fazer o que ~15 linhas de comando já fazem. | y |
| Como copiar para a área de transferência | `navigator.clipboard.write` com `ClipboardItem` `image/png` | Conselho 2-1. Recurso nativo da plataforma; WebView2 é Chromium e `tauri.localhost` é secure context. A objeção da voz dissidente (perda de transient user activation pelo `await` do encode) não se aplica: o PNG é gerado no clique do painel, então o botão "Copiar" já tem o blob em mãos e não há `await` antes do `write`. | y |
| Formato dos bytes na fronteira IPC | `Uint8Array`, nunca array de números JSON | Tauri v2 trata `ArrayBuffer`/`Uint8Array` como bytes crus; serializar como array JSON custa 3-4x em memória e trava visível num PNG de alguns MB. | y |
| O que a imagem contém além do texto | Faixa de título de 28px com `#N · <cwd>` e 12px de respiro | Como a imagem é repintada do zero, a moldura não vem de graça; a faixa custa ~20 linhas e faz o print se identificar sozinho. Não reproduz os botões do `TerminalHeader` — meio-header seria pior que nenhum. | y |
| Onde mora o botão de câmera | Na barra de título de cada painel (`TerminalHeader`), não no header do app | AD-018. Dentro do painel o botão já sabe qual terminal capturar: somem o modo armado, o destaque, a dica e o Esc — quatro estados e um caminho de clique a menos. | y |
| Câmera com zero terminais | Não existe botão | Sem painel não há barra de título; o caso deixou de precisar de tratamento. | y |
| Nome do arquivo sugerido | `swarmdeck-terminal-<N>-<YYYYMMDD-HHMMSS>.png` | Ordenável por nome e identifica o painel de origem. | y |

**Open questions:** none - todas resolvidas ou registradas acima.

---

## User Stories

### P1: Capturar o terminal pelo botão do próprio painel ⭐ MVP

**User Story**: Como quem acompanha vários agentes, quero um botão de câmera na
barra de título de cada terminal, para capturar aquele painel num clique.

**Why P1**: É a porta de entrada da feature inteira.

**Acceptance Criteria**:

1. WHEN the user activates the camera button in a pane's title bar THEN the system SHALL capture that pane and open the preview modal, with no prior selection step
2. ~~REVOGADO por AD-018~~ — contorno tracejado e `cursor: crosshair` nos painéis elegíveis
3. ~~REVOGADO por AD-018~~ — painéis de aba inativa e minimizados fora do alvo (o botão vive dentro do painel: painel fora da tela não tem botão alcançável)
4. ~~REVOGADO por AD-018~~ — dica "Selecione um terminal para capturar · Esc cancela"
5. ~~REVOGADO por AD-018~~ — Escape sai do modo de captura
6. ~~REVOGADO por AD-018~~ — segundo clique na câmera desarma
7. ~~REVOGADO por AD-018~~ — câmera desabilitada com zero terminais
8. ~~REVOGADO por AD-018~~ — o modo armado não bloqueia digitação nem os controles do painel

**Independent Test**: abrir 2 terminais, clicar na câmera do segundo, e ver o
modal com o print daquele painel.

---

### P1: Imagem fiel do que o terminal mostra ⭐ MVP

**User Story**: Como usuário, quero que o print pareça o terminal que estou
vendo, com as mesmas cores e o mesmo texto.

**Why P1**: Um print infiel não serve para colar em lugar nenhum.

**Acceptance Criteria**:

1. WHEN a pane is captured THEN the system SHALL render only the visible rows of that terminal, from buffer row `baseY` to `baseY + rows - 1`
2. The system SHALL render the PNG at `window.devicePixelRatio` scale over background `#0a0a0c`, with 12px of padding around the text area
3. The system SHALL reproduce, per cell, the foreground colour, the background colour and the bold, italic, underline, dim and inverse attributes read from the xterm buffer
4. WHERE a cell carries the `inverse` attribute the system SHALL swap its foreground and background colours
5. IF the captured pane has no live xterm instance THEN the system SHALL open no modal

**Independent Test**: rodar um comando colorido, capturar, e comparar as cores do PNG com a tela.

---

### P1: Salvar ou copiar o print ⭐ MVP

**User Story**: Como usuário, quero salvar o print numa pasta ou colá-lo direto
com Ctrl+V, e fechar sem fazer nada se eu mudar de ideia.

**Why P1**: É o que torna o print útil; sem isso a imagem morre no modal.

**Acceptance Criteria**:

1. WHEN the capture completes THEN the system SHALL open a modal showing the PNG over the same overlay treatment used by the Settings overlay (`rgba(0, 0, 0, 0.62)` background plus `backdrop-filter: blur(4px)`)
2. ~~REVOGADO por AD-018~~ — abrir o modal saía do modo de captura
3. WHEN the user activates "Salvar" THEN the system SHALL open the native save dialog with default file name `swarmdeck-terminal-<N>-<YYYYMMDD-HHMMSS>.png`, write the PNG bytes to the chosen path and close the modal
4. WHEN the user activates "Copiar" THEN the system SHALL write the PNG to the system clipboard as `image/png` and close the modal
5. WHEN the user activates the modal close button or presses Escape THEN the system SHALL close the modal without saving and without copying
6. IF the save dialog is cancelled THEN the system SHALL keep the modal open and perform no write
7. IF writing the file fails THEN the system SHALL keep the modal open and display the failure message inline
8. IF the clipboard write fails THEN the system SHALL keep the modal open and display the failure message inline

**Independent Test**: capturar, clicar em Copiar, colar num editor de imagem; capturar de novo, clicar em Salvar, escolher uma pasta e abrir o arquivo.

---

### P2: Acabamento da imagem e do foco

**User Story**: Como usuário, quero saber de qual terminal veio cada print e não
perder o foco do teclado depois de fechar o modal.

**Why P2**: A feature funciona sem isso, mas o print fica anônimo e o teclado
pode acabar digitando no painel errado.

**Acceptance Criteria**:

1. The system SHALL draw a 28px title strip with background `#131318` at the top of the PNG, showing the pane index and its working directory
2. WHEN the modal closes by any path THEN the system SHALL return keyboard focus to the camera button of the pane that produced the image

**Independent Test**: capturar pelo segundo painel, fechar no botão de fechar, e confirmar que o foco voltou para a câmera daquele painel.

---

## Edge Cases

- IF the terminal reports zero rows or zero columns THEN the system SHALL open no modal
- WHEN a captured terminal keeps producing output THEN the system SHALL show the buffer state read at click time, never a later state
- IF `navigator.clipboard` is unavailable THEN the system SHALL keep the modal open and display the failure message inline

---

## Requirement Traceability

| Requirement ID | Story | Implementation | Test | Status |
| --- | --- | --- | --- | --- |
| SHOT-01 | P1: Capturar pelo painel | `src/components/terminal/TerminalHeader.tsx` (botão `capturar terminal`), `src/App.tsx` (`onScreenshot` → `handleCapturePane`) | `TerminalHeader.test.tsx` — dispara `onScreenshot`; `App.test.tsx` — captura o painel do próprio botão | Verified |
| SHOT-02 | — | Revogado por AD-018 | — | Revoked |
| SHOT-03 | — | Revogado por AD-018 | — | Revoked |
| SHOT-04 | — | Revogado por AD-018 | — | Revoked |
| SHOT-05 | — | Revogado por AD-018 | — | Revoked |
| SHOT-06 | — | Revogado por AD-018 | — | Revoked |
| SHOT-07 | — | Revogado por AD-018 | — | Revoked |
| SHOT-08 | — | Revogado por AD-018 | — | Revoked |
| SHOT-09 | P1: Imagem fiel | `src/lib/terminalSnapshot.ts` (`paintSnapshot`, laço de `baseY`) | `terminalSnapshot.test.ts` — só as linhas visíveis | Verified |
| SHOT-10 | P1: Imagem fiel | `src/lib/terminalSnapshot.ts` (`ctx.scale(dpr)`, `snapshotBlob`) | `terminalSnapshot.test.ts` — fundo, dpr e dimensões | Verified |
| SHOT-11 | P1: Imagem fiel | `src/lib/terminalSnapshot.ts` (`fgOf`/`bgOf`, `ANSI_PALETTE`) | `terminalSnapshot.test.ts` — default/RGB/paleta e atributos | Verified |
| SHOT-12 | P1: Imagem fiel | `src/lib/terminalSnapshot.ts` (`isInverse`) | `terminalSnapshot.test.ts` — troca frente e fundo | Verified |
| SHOT-13 | P1: Imagem fiel | `src/lib/terminalSnapshot.ts` (`snapshotBlob`), `TerminalPane.tsx` (`onTerminal`), `App.tsx` (`handleCapturePane`) | `terminalSnapshot.test.ts` — medida zero; `App.test.tsx` — desarma sem modal | Verified |
| SHOT-14 | P1: Salvar ou copiar | `src/components/terminal/ScreenshotModal.tsx` | `ScreenshotModal.test.tsx` — imagem no modal | Verified |
| SHOT-15 | — | Revogado por AD-018 | — | Revoked |
| SHOT-16 | P1: Salvar ou copiar | `ScreenshotModal.tsx` (`save` + `invoke`), `src-tauri/src/commands/screenshot.rs` | `ScreenshotModal.test.tsx` — salva pelo seletor; `screenshot.rs` — grava os bytes | Verified |
| SHOT-17 | P1: Salvar ou copiar | `ScreenshotModal.tsx` (`navigator.clipboard.write`) | `ScreenshotModal.test.tsx` — copia como image/png | Verified |
| SHOT-18 | P1: Salvar ou copiar | `ScreenshotModal.tsx` (botão fechar e Escape) | `ScreenshotModal.test.tsx` — fecha sem salvar nem copiar | Verified |
| SHOT-19 | P1: Salvar ou copiar | `ScreenshotModal.tsx` (`if (!path) return`) | `ScreenshotModal.test.tsx` — seletor cancelado | Verified |
| SHOT-20 | P1: Salvar ou copiar | `ScreenshotModal.tsx` (catch do save), `screenshot.rs` (`map_err`) | `ScreenshotModal.test.tsx` — falha de gravação; `screenshot.rs` — diretório inexistente | Verified |
| SHOT-21 | P1: Salvar ou copiar | `ScreenshotModal.tsx` (catch do copy) | `ScreenshotModal.test.tsx` — falha de cópia | Verified |
| SHOT-22 | P2: Acabamento | `src/lib/terminalSnapshot.ts` (`TITLE_STRIP_HEIGHT`) | `terminalSnapshot.test.ts` — faixa e deslocamento | Verified |
| SHOT-23 | P2: Acabamento | `src/App.tsx` (`cameraRef.current?.focus()`), `TerminalHeader.tsx` (repassa o próprio botão em `onScreenshot`) | `App.test.tsx` — foco devolvido à câmera do painel capturado | Verified |

**Mapa ID para critério:** SHOT-01 a SHOT-08 são os critérios 1 a 8 de P1
"Capturar pelo painel", na ordem — 02 a 08 revogados por AD-018. SHOT-09 a SHOT-13 são os critérios 1 a 5 de P1
"Imagem fiel". SHOT-14 a SHOT-21 são os critérios 1 a 8 de P1 "Salvar ou
copiar". SHOT-22 e SHOT-23 são os critérios 1 e 2 de P2 "Acabamento".

**Coverage:** 23 total, 8 revogados por AD-018 (SHOT-02..SHOT-08, SHOT-15), 15
implementados e cobertos por teste, 0 sem mapeamento.

---

## Success Criteria

- [ ] Do terminal ao modal em 1 clique, sem atalho decorado.
- [ ] O PNG de um terminal 80x24 sai em menos de 500ms, sem congelar a UI.
- [ ] Colar com Ctrl+V num editor de imagem produz exatamente o que o modal mostrou.
- [ ] Nenhuma dependência nova de npm nem de crate entra no projeto.
- [ ] `npm test`, `npm run build` e `cargo test -p swarmdeck` passam.
