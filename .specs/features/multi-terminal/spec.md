# multi-terminal — delta de requisitos (TERM-12, TERM-13, TERM-14) e revisão de TERM-06

Os requisitos TERM-01..TERM-11 foram escritos na run original da feature; o
diretório `.specs/` é gitignored e foi apagado no commit `e6ff82b`, então só
os marcadores `SPEC:` no código sobreviveram. Este arquivo registra os
requisitos criados em 16/08/2026 e a mudança de gesto em TERM-06.

## Requisitos

- **TERM-12 (clonar)** — Quando o usuário aciona "clonar terminal" no
  cabeçalho de um painel, o sistema deve abrir outro terminal **na mesma
  aba**, com o mesmo diretório de projeto (`cwd`) e o mesmo provedor de
  agente do painel de origem. Enquanto a aba já tiver 4 terminais (TAB-05), o
  controle fica desabilitado e nenhum terminal é criado.
- **TERM-13 (reiniciar)** — Quando o usuário aciona "reiniciar terminal", o
  sistema deve encerrar a sessão atual e abrir uma **sessão nova** no mesmo
  painel, com o mesmo `cwd` e o mesmo provedor: PTY novo, processo do agente
  novo e scrollback zerado — o objetivo é começar com contexto limpo. Havendo
  processo ativo, a ação exige confirmação, como fechar (TERM-05).
- **TERM-14 (colar)** — Quando o usuário pressiona `Ctrl+V` (ou
  `Ctrl+Shift+V`) com o foco num painel de terminal, o sistema deve colar o
  texto da área de transferência na sessão, aplicando a transformação de texto
  colado do xterm — quebras de linha normalizadas e marcadores de *bracketed
  paste* quando o programa em primeiro plano tiver ligado esse modo. O byte de
  controle literal `^V` não deve chegar ao shell. Área de transferência vazia
  não escreve nada; leitura negada pelo webview não derruba o painel e não
  escreve nada. As demais teclas seguem para o xterm inalteradas.

## Revisão de TERM-06 (renomear terminal)

O gesto passou de **duplo-clique** para **clique simples**, e a confirmação
passou de "commit no `blur`" para confirmar/cancelar explícitos (Enter/✓ e
Escape/✗), compartilhando o componente `InlineRename` com TAB-06. Nome vazio
ou só com espaços é cancelamento. Nada mais de TERM-06 mudou: `TitleSource::
User` continua vencendo sobre a escrita do agente via `terminal_set_title`.

**Parcialmente revogada por AD-029 (20/08/2026).** O gesto de rename saiu do
cabeçalho: o título do terminal agora é o **nome do projeto** (PROJ-11), só
leitura. Continua valendo a parte de backend — `terminal_set_title`,
`TitleSource::User` e a precedência sobre a escrita do agente seguem no lugar,
sem chamador na UI. Rename de **aba** (TAB-06) não foi tocado.

## Decisões técnicas

- **Reiniciar remonta o `TerminalPane`, não troca o id do terminal.** A `key`
  do painel carrega um contador de reinícios (`resetNonceByTerminalId`); o
  unmount chama `pty_kill` e o mount seguinte chama `pty_spawn`. Trocar o id
  do terminal seria mais direto, mas `GridLayout` só relê a prop `panes`
  quando a **contagem** muda (`effectivePanes`), então o painel sumiria. Não
  existe — nem precisa existir — um comando de "reiniciar sessão" no backend.
- **Clonar reusa o caminho de `handleCreate`**: `defaultTerminal()` + `cwd` da
  origem + a entrada correspondente em `agentByTerminalId`. Nenhum estado novo.
- **Colar usa `navigator.clipboard.readText()` e `terminal.paste()`**, não um
  plugin de área de transferência do Tauri. O webview já é usado para escrever
  na área de transferência (`ScreenshotModal.tsx:61`), e `terminal.paste()` é
  quem sabe aplicar bracketed paste. O `preventDefault()` no keydown é o que
  impede o evento `paste` nativo do webview de duplicar o conteúdo. Se o
  WebView2 negar a permissão de **leitura** da área de transferência, a troca é
  de uma linha: `tauri-plugin-clipboard-manager` no lugar de
  `navigator.clipboard` (ver AD-027).

## Fora de escopo

- Clonar para **outra** aba.
- Preservar o scrollback através do reinício — o objetivo declarado é o
  oposto: contexto limpo.

## Rastreabilidade

| Requisito | Implementação | Teste |
| --- | --- | --- |
| TERM-12 | `src/App.tsx` (`handleCloneTerminal`), `src/components/terminal/TerminalHeader.tsx` | `src/App.test.tsx`, `src/components/terminal/TerminalHeader.test.tsx` |
| TERM-13 | `src/App.tsx` (`handleResetTerminal`, `key` do `TerminalPane`), `src/components/terminal/TerminalHeader.tsx` | `src/App.test.tsx`, `src/components/terminal/TerminalHeader.test.tsx` |
| TERM-06 (parcial, AD-029) | backend: `src-tauri/src/commands/terminal.rs` (`terminal_set_title`) — sem gesto na UI; o cabeçalho mostra o nome do projeto (`src/App.tsx`, `src/components/terminal/TerminalHeader.tsx`) | `src/components/terminal/TerminalHeader.test.tsx` (título só leitura) |
| TERM-14 | `src/components/terminal/TerminalPane.tsx` (`attachCustomKeyEventHandler`) | `src/components/terminal/TerminalPane.test.tsx` |


## Requisitos revogados

- **TERM-10** — revogado por **AD-019** (19/08/2026). O seletor nativo de
  pastas deixou de ser a única forma de definir o `cwd` de um terminal novo:
  o `cwd` passa a vir da escolha de projeto no wizard do painel (PROJ-10 /
  PROJ-13). O seletor sobrevive dentro de "Import Project" e "New Project".
- **TERM-11** — revogado por **AD-019** (19/08/2026). A memória do "último
  diretório usado" (`terminal_picker_prefs`) deixou de ser o ponto de partida
  do terminal novo; a lista de projetos ordenada por `last_used` ocupa esse
  lugar (PROJ-10). A tabela (migração 005), o módulo `picker_prefs` e os
  comandos `terminal_picker_last_dir` / `terminal_picker_set_last_dir`
  continuam **no código, sem nenhum chamador**: os seletores de PROJ-17 e
  PROJ-18 chamam `open({ directory: true })` sem `defaultPath`. É código
  morto conhecido, não uma sobrevida funcional — remover é uma task própria,
  porque envolve migração de banco.

O texto original de TERM-01..TERM-11 não está neste arquivo — foi perdido com
o `.specs/` apagado no commit `e6ff82b`, como registra o topo. A revogação
fica registrada aqui para que ninguém leia os marcadores `SPEC:` remanescentes
e conclua que o comportamento continua valendo.
