# editor-launch

Cada terminal já sabe em que pasta está (`TerminalState.cwd`). Abrir essa
pasta no editor de código do usuário exigia sair do app, achar a janela do
editor e navegar até o diretório à mão. Esta feature põe a ação na própria
barra de título do terminal: um botão abre um popover com os editores que
**estão instalados na máquina**, e a escolha abre o `cwd` daquele terminal.

A detecção reaproveita a resolução de PATH que `agents::catalog` já faz para
os CLIs de agente (`command_exists_in_path`), promovida a
`resolve_command_in_path`, que agora devolve o caminho resolvido em vez de só
um booleano — o lançamento precisa do caminho real para funcionar com
`code.cmd`/`cursor.cmd` no Windows.

## Requisitos

- **EDITOR-01** — Enquanto um terminal estiver visível, o sistema deve exibir
  na barra de título dele um botão de abrir a pasta do terminal num editor de
  código.
- **EDITOR-02** — Quando o usuário aciona esse botão, o sistema deve exibir um
  popover listando apenas os editores de código detectados no PATH da máquina,
  cada um com nome e ícone da marca.
- **EDITOR-03** — Quando nenhum editor do catálogo é detectado, o popover deve
  dizer isso explicitamente, em vez de abrir vazio.
- **EDITOR-04** — Quando o usuário escolhe um editor, o sistema deve lançá-lo
  com o `cwd` daquele terminal como argumento e fechar o popover.
- **EDITOR-05** — O sistema deve lançar apenas comandos do catálogo estático de
  editores; um id fora do catálogo deve ser recusado sem executar nada.

## Fora de escopo

- Detectar editores instalados que **não** exponham CLI no PATH (ex.: VS Code
  no macOS sem "Shell Command: Install 'code' command in PATH"). Ceilings
  marcados com `ponytail:` em `src-tauri/src/editors.rs`.
- Lembrar o último editor escolhido / editor padrão.
- Abrir arquivo específico ou linha específica — só a pasta.

## Rastreabilidade

| Requisito | Implementação | Teste |
| --- | --- | --- |
| EDITOR-01 | `src/components/terminal/TerminalHeader.tsx`, `src/App.tsx` (`cwd`) | `src/components/terminal/TerminalHeader.test.tsx` |
| EDITOR-02 | `src/components/terminal/EditorMenu.tsx`, `src/components/terminal/EditorGlyph.tsx`, `src/App.tsx` (CSS do cabeçalho), `src-tauri/src/editors.rs` (`detect_installed`), `src-tauri/src/commands/editors.rs` (`editor_catalog`) | `src/components/terminal/EditorMenu.test.tsx`, `src/components/terminal/EditorGlyph.test.tsx`, `src-tauri/src/editors.rs` (testes) |
| EDITOR-03 | `src/components/terminal/EditorMenu.tsx` | `src/components/terminal/EditorMenu.test.tsx` |
| EDITOR-04 | `src/components/terminal/EditorMenu.tsx`, `src-tauri/src/editors.rs` (`build_open_command`), `src-tauri/src/commands/editors.rs` (`editor_open`) | `src/components/terminal/EditorMenu.test.tsx`, `src-tauri/src/editors.rs` (testes) |
| EDITOR-05 | `src-tauri/src/editors.rs` (`descriptor`) | `src-tauri/src/editors.rs` (testes) |
