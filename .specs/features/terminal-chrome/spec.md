# terminal-chrome

Cada terminal é apresentado como uma "janela": um cartão com barra de título
própria, separado dos vizinhos e da borda da área por uma calha constante.

Antes desta feature as classes `.terminal-header`, `.app-pane` e
`.terminal-pane` existiam mas não tinham estilo nenhum — nem em `styles.css`,
nem no bloco `<style>` de `App.tsx`. O cabeçalho renderizava como texto solto
sobre o fundo do app, e os terminais encostavam uns nos outros. Nenhum
requisito de `multi-terminal` muda: grid 2×2, arrasto de divisória e os três
modos (`normal`/`maximized`/`minimized`) continuam iguais.

## Requisitos

- **CHROME-01** — Enquanto houver terminais na aba, o sistema deve renderizar
  cada um dentro de um cartão com borda, cantos arredondados e fundo próprio,
  afastado dos vizinhos e da borda da área por 8px.
- **CHROME-02** — Enquanto um terminal estiver visível, o sistema deve exibir
  no topo dele uma barra de título com o nome do terminal e os controles de
  maximizar, minimizar e fechar.
- **CHROME-03** — Quando o usuário maximiza um terminal, o sistema deve fazê-lo
  cobrir a janela inteira, incluindo o cabeçalho do app e a barra de abas.
- **CHROME-04** — Enquanto um terminal estiver maximizado, o sistema deve trocar
  o controle de maximizar pelo de **restaurar** (ícone de setas para dentro e
  rótulo "restaurar terminal"); fora do modo maximizado ele volta a "maximizar
  terminal". A ação por trás do botão é a mesma nos dois estados.

## Fora de escopo

- Arrastar o terminal pela barra de título (a alça é decorativa; o
  redimensionamento continua na divisória do grid).
- Tema claro. `styles.css` declara `color-scheme: dark` e o app é dark-only.
- Reordenar terminais dentro da aba.

## Rastreabilidade

| Requisito | Implementação | Teste |
| --- | --- | --- |
| CHROME-01 | `src/styles.css` (tokens), `src/App.tsx` (`.app-pane`, `.app-tab-panel`), `src/components/grid/GridLayout.tsx` (`gap`) | `src/components/grid/GridLayout.test.tsx` |
| CHROME-02 | `src/components/terminal/TerminalHeader.tsx`, `src/App.tsx` (`.terminal-header`) | `src/components/terminal/TerminalHeader.test.tsx` |
| CHROME-03 | `src/App.tsx` (`isMaximized` → `fixed`/`z-index: 100`), `src/components/grid/GridLayout.tsx` | `src/App.test.tsx` |
| CHROME-04 | `src/components/terminal/TerminalHeader.tsx` (`isMaximized`), `src/App.tsx` (repasse) | `src/components/terminal/TerminalHeader.test.tsx` |
