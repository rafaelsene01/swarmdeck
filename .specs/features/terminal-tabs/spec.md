# terminal-tabs

Grupos de terminais em abas. Uma aba é um conjunto de até 4 terminais; só um
conjunto fica visível de cada vez, e trocar de aba não interrompe nada do que
está rodando nas outras.

Antes desta feature o app tinha um único grid global e o teto de 4 terminais
era o teto do app inteiro (`multi-terminal`, "Fora de escopo: mais de 4
terminais"). Esse teto continua valendo — mas agora **por aba**, não pelo app.
Nenhum requisito de `multi-terminal` foi revogado: o grid 2×2, o arrasto de
divisória, maximizar/minimizar e a sobrevivência do PTY continuam iguais
dentro de cada aba.

## Requisitos

- **TAB-01** — Quando o usuário troca de aba, o sistema deve manter montados
  os terminais da aba que saiu de vista, preservando o PTY e o scrollback
  acumulado (mesma garantia de TERM-08 para `minimized`).
- **TAB-02** — Quando a aba ativa deixa de existir, o sistema deve ativar a
  aba vizinha, nunca renderizar sem aba.
- **TAB-03** — Enquanto o usuário aciona "nova aba", o sistema deve criar uma
  aba vazia e torná-la a ativa.
- **TAB-04** — Quando o usuário fecha uma aba, o sistema deve encerrar os PTYs
  dos terminais dela. A última aba não pode ser fechada.
- **TAB-05** — Enquanto a aba ativa tiver 4 terminais, o sistema deve impedir
  a criação de mais um terminal nela.
- **TAB-06** — Quando o usuário clica na aba **já ativa**, o sistema deve
  trocar o rótulo dela por um campo de texto com confirmar e cancelar
  explícitos; confirmar (Enter ou ✓) aplica o nome aparado, cancelar (Escape
  ou ✗) mantém o antigo, e nome vazio ou só com espaços é tratado como
  cancelamento. Clicar numa aba **inativa** continua só trocando de aba.
  *(Aberto em 16/08/2026: "Renomear aba" era fora de escopo desta feature e
  passou a ser requisito a pedido do usuário.)*

## Fora de escopo

- Persistir abas entre execuções. `layout.rs` só grava uma lista plana de
  terminais e nenhum comando Tauri expõe `layout::restore` ao frontend hoje —
  as abas vivem em memória, como os terminais já viviam. O nome renomeado em
  TAB-06 segue essa regra: vive em memória, some ao fechar o app.
- Reordenar aba.
- Mover terminal de uma aba para outra.

## Rastreabilidade

| Requisito | Implementação | Teste |
| --- | --- | --- |
| TAB-01 | `src/App.tsx` (`renderTab`, `display: none` na aba inativa) | `src/App.test.tsx` |
| TAB-02 | `src/App.tsx` (`activeTab`, `handleCloseTab`) | `src/App.test.tsx` |
| TAB-03 | `src/App.tsx` (`createTab`, `handleCreateTab`) | `src/App.test.tsx` |
| TAB-04 | `src/App.tsx` (`handleCloseTab`) + limpeza de `TerminalPane` | `src/App.test.tsx` |
| TAB-05 | `src/App.tsx` (`atMaxTerminals` da aba ativa) | `src/App.test.tsx` |
| TAB-06 | `src/App.tsx` (`renamingTabId`) + `src/components/shell/InlineRename.tsx` | `src/App.test.tsx` |
