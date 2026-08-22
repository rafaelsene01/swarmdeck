# minimized-tray

Minimizar um terminal passa a tirá-lo da tela por inteiro, em vez de encolhê-lo
a uma barra de 34px dentro do grid. Os minimizados de **todas as abas** viram
uma bandeja no header: um ícone com a contagem e um popover que lista cada um
com a aba de origem, de onde dá para restaurar ou encerrar.

No mesmo passo o header perde os dois últimos botões inertes (`run` e `copy`) e
o "new terminal" troca o `+` por um botão de ícone de terminal.

Referências visuais: `print/min.png` (o ícone), `print/min_poput.png` (o
popover), `print/run.png` (o formato do botão de "new terminal").

## Requisitos

### Minimizar tira o terminal da tela

- **MIN-01** — WHEN o usuário minimiza um terminal THEN o sistema SHALL removê-lo
  da área de terminais (a célula sai do plano do grid e recebe `display: none`)
  e redistribuir colunas e linhas entre os visíveis, **sem desmontar** o painel
  — o PTY e o scrollback continuam vivos (TERM-08).

### Bandeja no header

- **MIN-02** — WHILE houver pelo menos um terminal minimizado em qualquer aba,
  o sistema SHALL exibir no header um botão com ícone e a contagem de
  minimizados; sem nenhum minimizado o botão não é renderizado.
- **MIN-03** — WHEN o usuário aciona o botão da bandeja THEN o sistema SHALL
  abrir um popover; um segundo acionamento, `Escape` ou um clique fora fecham-no
  sem alterar nada.
- **MIN-04** — WHILE o popover estiver aberto, o sistema SHALL listar cada
  terminal minimizado com o **nome da aba** de origem e o **nome do terminal**.
- **MIN-05** — WHEN o usuário aciona um item da lista THEN o sistema SHALL
  restaurar aquele terminal ao grid, ativar a aba dona dele e fechar o popover.
- **MIN-06** — WHEN o usuário aciona o "X" de um item THEN o sistema SHALL pedir
  confirmação e, confirmada, encerrar aquele terminal — mesmo que ele esteja em
  outra aba.
- **MIN-07** — WHEN o usuário aciona "Close all" THEN o sistema SHALL pedir
  confirmação e, confirmada, encerrar todos os terminais minimizados.
- **MIN-08** — WHILE o popover estiver aberto, o sistema SHALL exibir no topo
  dele a contagem de minimizados.

### Header

- **MIN-09** — O sistema SHALL não renderizar mais os botões inertes `run` e
  `copy` do header. **Revoga HDR-09 e HDR-10** (`shell-chrome`).
- **MIN-10** — O sistema SHALL renderizar o botão "new terminal" como um botão
  de ícone de terminal, sem rótulo textual, no formato de `print/run.png`
  (retângulo arredondado com borda e glifo em acento). **Revisa HDR-05**, que
  descrevia o mesmo botão com o ícone `+`; o comportamento (abrir o diálogo de
  novo terminal, desabilitado no teto de 4) não muda.
- **MIN-11** — O sistema SHALL posicionar a bandeja no **grupo direito** do
  header, imediatamente antes do menu de layout, e ancorar o popover pela borda
  direita. **Revisa MIN-02**, que a punha no grupo esquerdo, ao lado do botão de
  novo terminal; comportamento inalterado.
- **MIN-12** — O sistema SHALL usar uma **lua** (`MoonStar`) como ícone da
  bandeja — minimizado = dormindo —, no lugar do `Minimize2` anterior.
- **MIN-13** — O sistema SHALL usar uma **lua** (`Moon`) no botão que minimiza
  um terminal para a bandeja, no lugar do traço (`Minus`) anterior, casando com
  o ícone da bandeja (MIN-12).

## Edge Cases

- IF todos os terminais da aba ativa estiverem minimizados THEN a área de
  terminais fica vazia (sem `EmptyState`, que é reservado à aba sem nenhum
  terminal); a bandeja do header é o caminho de volta.
- IF o último minimizado sair da lista com o popover aberto THEN o sistema SHALL
  fechar o popover — o botão que o ancorava deixou de existir.
- IF um terminal minimizado for restaurado a partir de uma aba diferente THEN a
  aba dona é ativada junto (MIN-05); restaurar sem trocar de aba não mostraria
  nada.

## Fora de escopo

- **Nome renomeado à mão na bandeja.** O rename manual de TERM-06 vive no estado
  local de `TerminalHeader` e não sobe até o `App`, então a bandeja mostra o
  rótulo padrão `Terminal <n>` (n = posição na aba), o mesmo que o header mostra
  enquanto ninguém renomeou. Levantar esse estado é mudança em TERM-06, não
  nesta feature.
- Reordenar a lista de minimizados, ou minimizar/restaurar por atalho de
  teclado.
- Persistir a bandeja: `minimized` já é persistido por `LayoutEntry`, então um
  terminal minimizado volta minimizado no boot seguinte — sem trabalho novo.

## Requirement Traceability

| Requisito | Implementação | Teste |
| --- | --- | --- |
| MIN-01 | `src/components/grid/GridLayout.tsx` (`visiblePanes`, `display: none`), `src/App.tsx` (`.app-pane`), `src/state/terminals.ts` (doc de `PaneMode`) | `src/components/grid/GridLayout.test.tsx`, `src/App.test.tsx` |
| MIN-02 | `src/components/shell/MinimizedTray.tsx`, `src/components/shell/Header.tsx` | `src/components/shell/MinimizedTray.test.tsx`, `src/components/shell/Header.test.tsx` |
| MIN-03 | `src/components/shell/MinimizedTray.tsx` | `src/components/shell/MinimizedTray.test.tsx` |
| MIN-04 | `src/components/shell/MinimizedTray.tsx`, `src/App.tsx` (`minimizedTerminals`) | `src/components/shell/MinimizedTray.test.tsx`, `src/App.test.tsx` |
| MIN-05 | `src/App.tsx` (`handleRestoreMinimized`) | `src/components/shell/MinimizedTray.test.tsx`, `src/App.test.tsx` |
| MIN-06 | `src/components/shell/MinimizedTray.tsx`, `src/App.tsx` (`handleCloseTerminal`, agora cross-tab) | `src/components/shell/MinimizedTray.test.tsx`, `src/App.test.tsx` |
| MIN-07 | `src/components/shell/MinimizedTray.tsx` | `src/components/shell/MinimizedTray.test.tsx` |
| MIN-08 | `src/components/shell/MinimizedTray.tsx` | `src/components/shell/MinimizedTray.test.tsx` |
| MIN-09 | `src/components/shell/Header.tsx` | `src/components/shell/Header.test.tsx` |
| MIN-10 | `src/components/shell/Header.tsx` (`.shell-header__new-terminal`) | `src/components/shell/Header.test.tsx` |
| MIN-11 | `src/components/shell/Header.tsx` (grupo direito), `src/components/shell/MinimizedTray.tsx` (`right: 0`) | `src/components/shell/Header.test.tsx` |
| MIN-12 | `src/components/shell/MinimizedTray.tsx` (`MoonStar`) | `src/components/shell/MinimizedTray.test.tsx` |
| MIN-13 | `src/components/terminal/TerminalHeader.tsx` (`Moon`) | `src/components/terminal/TerminalHeader.test.tsx` |

## Requisitos revogados por esta feature

- **HDR-09, HDR-10** (`shell-chrome`) — os ícones inertes `run` e `copy`.
  Revogados por MIN-09. A pasta `.specs/features/shell-chrome/` não existe no
  disco (`.specs` está no `.gitignore`, ver "Perda de dados registrada" em
  `STATE.md`), então o registro da revogação é este.
- **Altura recolhida de 34px de TERM-08** — revogada por MIN-01. TERM-08 segue
  válido no que importa: o PTY e o scrollback sobrevivem ao minimizar. O que
  mudou é a apresentação. O edge case correspondente em
  `.specs/features/terminal-layout-options/spec.md` foi atualizado.
