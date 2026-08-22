# terminal-screenshot Tasks

> **Revisão de 18/08/2026 (AD-018).** Este arquivo é o registro do que foi
> executado na run original e fica como está. As tasks T9 e T10 (modo armado no
> header e no App) foram depois revogadas: o botão de câmera passou para o
> `TerminalHeader`. Ver `spec.md` e AD-018 em `.specs/STATE.md`.

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

Regra do repositório, aplicável a toda task: `.claude/rules/spec-driven-changes.md` — todo arquivo criado ou editado leva o marcador `// SPEC: terminal-screenshot (SHOT-xx, ...)` no topo, em inglês, com os IDs reais. Arquivo compartilhado que não é, no todo, implementação de requisito (`src-tauri/src/lib.rs`) leva o marcador imediatamente acima do bloco.

---

**Design**: `.specs/features/terminal-screenshot/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerada do codebase e das guidelines do projeto. Guidelines encontradas: `CLAUDE.md`, `.claude/rules/spec-driven-changes.md`, `vite.config.ts` (bloco `test`), `package.json` (scripts). `AGENTS.md` é referenciado por `CLAUDE.md` mas não existe na árvore — nada dele foi aplicado.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Lógica pura de front (`src/lib/`) | unit | Todos os ramos; 1:1 com os ACs da spec; toda edge case listada tem teste | `src/lib/*.test.ts` | `npm test` |
| Componente React (`src/components/`) | unit | Todo AC que descreve comportamento do componente, mais os caminhos de erro | `src/components/**/*.test.tsx` | `npm test` |
| Shell da aplicação (`src/App.tsx`) | unit | Fluxo feliz ponta a ponta mais as edge cases de estado (aba inativa, painel minimizado, Esc) | `src/App.test.tsx` | `npm test` |
| Comando Tauri (`src-tauri/src/commands/`) | unit | Caminho de sucesso mais o caminho de erro de escrita | `#[cfg(test)]` no próprio arquivo | `cargo test -p swarmdeck` |
| Registro no `invoke_handler` / documentação `.specs` | none | - (build gate apenas) | - | build gate apenas |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Depois de tasks só com teste de unidade de front | `npm test` |
| Full | Depois de tasks que tocam front e Rust | `npm test && cargo test -p swarmdeck --manifest-path src-tauri/Cargo.toml` |
| Build | Fim de fase, ou task de wiring/documentação | `npm run build && npm test && cargo test -p swarmdeck --manifest-path src-tauri/Cargo.toml` |

Não há script de lint no `package.json`; `npm run build` roda `tsc --noEmit` antes do `vite build` e é o gate de tipos.

---

## Execution Plan

### Phase 1: Pintura do snapshot

```
T1 → T2 → T3
```

### Phase 2: Gravação em disco

```
T4 → T5
```

### Phase 3: Interface

```
T6 → T7 → T8 → T9 → T10
```

### Phase 4: Registro da decisão

```
T11
```

---

## Task Breakdown

### T1: Pintar o viewport do xterm num contexto 2D

**What**: criar `paintSnapshot(term, opts, ctx)` — resolve cor por célula (default, RGB, paleta ANSI 256), aplica bold/italic/dim/underline/inverse e desenha as linhas visíveis de `baseY` a `baseY + rows - 1`.
**Where**: `src/lib/terminalSnapshot.ts`
**Depends on**: None
**Reuses**: tipos de `@xterm/xterm`; tokens de cor de `src/styles.css` (`#0a0a0c`, `#e8e8ea`).
**Requirement**: SHOT-09, SHOT-10, SHOT-11, SHOT-12

**Tools**:

- MCP: `code-review-graph` para localizar o uso atual do `Terminal`
- Skill: NONE

**Done when**:

- [x] A tabela ANSI cobre 0-15 literais (paleta Tango do xterm) e 16-255 calculados (cubo 6x6x6 e escala de cinza)
- [x] Célula com `getWidth() === 0` é pulada (continuação de caractere de largura dupla)
- [x] `isInverse()` troca frente e fundo depois da resolução das duas cores
- [x] Só as linhas de `baseY` a `baseY + rows - 1` são desenhadas
- [x] Marcador `// SPEC: terminal-screenshot (SHOT-09, SHOT-10, SHOT-11, SHOT-12)` no topo do arquivo
- [x] Gate check passa: `npm test`
- [x] Test count: 8 testes passam (no silent deletions)

**Tests**: unit — contexto 2D falso; asserta cor resolvida para célula default/RGB/paleta, inversão, célula de largura 0 pulada, primeira e última linha desenhadas, escala por `dpr`.
**Gate**: quick

**Commit**: `feat(screenshot): paint xterm viewport onto a 2D context`

---

### T2: Desenhar a faixa de título do print

**What**: acrescentar ao `paintSnapshot` a faixa de 28px com fundo `#131318` mostrando o índice do painel e o diretório de trabalho, deslocando a área de texto para baixo dela.
**Where**: `src/lib/terminalSnapshot.ts` (modificar)
**Depends on**: T1
**Reuses**: `paintSnapshot` de T1; token `--surface` (`#131318`).
**Requirement**: SHOT-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A faixa ocupa 28px lógicos no topo e a primeira linha de texto começa abaixo dela mais o padding de 12px
- [x] O texto da faixa é o índice do painel seguido do `cwd`
- [x] Marcador `SPEC:` atualizado com SHOT-22
- [x] Gate check passa: `npm test`
- [x] Test count: 10 testes passam (no silent deletions)

**Tests**: unit — asserta o `fillRect` da faixa com a cor certa, o `fillText` do título, e o deslocamento vertical da primeira linha.
**Gate**: quick

**Commit**: `feat(screenshot): draw the title strip on the snapshot`

---

### T3: Empacotar o snapshot num Blob PNG

**What**: criar `snapshotBlob(term, meta)` — mede a célula em `.xterm-screen`, cria o canvas na escala do `devicePixelRatio`, chama `paintSnapshot` e devolve `toBlob('image/png')`; rejeita quando linhas ou colunas medem zero.
**Where**: `src/lib/terminalSnapshot.ts` (modificar)
**Depends on**: T2
**Reuses**: `paintSnapshot`; `term.options.fontFamily` e `term.options.fontSize`.
**Requirement**: SHOT-10, SHOT-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Largura do canvas é `cols * cellWidth * dpr` mais o padding, altura inclui a faixa de título
- [x] Medida de célula zero (ou `term.element` ausente) rejeita a promise sem criar canvas
- [x] Marcador `SPEC:` atualizado com SHOT-13
- [x] Gate check passa: `npm test`
- [x] Test count: 13 testes passam (no silent deletions)

**Tests**: unit — `HTMLCanvasElement.prototype.getContext` e `toBlob` stubbados; asserta dimensões calculadas, rejeição em medida zero, e `image/png` no `toBlob`.
**Gate**: quick

**Commit**: `feat(screenshot): wrap the snapshot into a PNG blob`

---

### T4: Comando Rust que grava os bytes do print

**What**: criar `screenshot_save(path: String, bytes: Vec<u8>) -> Result<(), String>` com `std::fs::write`, devolvendo a mensagem do erro de IO como `Err`.
**Where**: `src-tauri/src/commands/screenshot.rs`
**Depends on**: None
**Reuses**: forma dos comandos existentes em `src-tauri/src/commands/`; `tempfile` já em `[dev-dependencies]`.
**Requirement**: SHOT-16, SHOT-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Grava os bytes exatos no caminho recebido
- [x] Erro de IO vira `Err(String)` com a mensagem do sistema, sem panic
- [x] Marcador `// SPEC: terminal-screenshot (SHOT-16, SHOT-20)` no topo do arquivo
- [x] Gate check passa: `cargo test -p swarmdeck --manifest-path src-tauri/Cargo.toml`
- [x] Test count: 2 testes passam (no silent deletions)

**Tests**: unit — `#[cfg(test)]` com `tempfile`: grava e relê os bytes; caminho em diretório inexistente devolve `Err`.
**Gate**: full

**Commit**: `feat(screenshot): add the screenshot_save Tauri command`

---

### T5: Registrar o comando no invoke_handler

**What**: declarar `pub mod screenshot;` em `commands/mod.rs` e acrescentar `commands::screenshot::screenshot_save` ao `generate_handler!` de `lib.rs`, com o marcador `SPEC:` imediatamente acima da linha.
**Where**: `src-tauri/src/lib.rs`
**Depends on**: T4
**Reuses**: bloco `invoke_handler` existente em `src-tauri/src/lib.rs:113`.
**Requirement**: SHOT-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pub mod screenshot;` presente em `src-tauri/src/commands/mod.rs`
- [x] `commands::screenshot::screenshot_save` listado no `generate_handler!`
- [x] Marcador `// SPEC: terminal-screenshot (SHOT-16)` imediatamente acima da linha registrada, conforme a exceção do item 3 da regra do repositório
- [x] Gate check passa: `npm run build && npm test && cargo test -p swarmdeck --manifest-path src-tauri/Cargo.toml`

**Tests**: none — camada de registro, coberta pelo build gate conforme a matriz.
**Gate**: build

**Commit**: `chore(screenshot): register screenshot_save in the invoke handler`

---

### T6: Expor a instância do xterm ao componente que monta o painel

**What**: acrescentar a prop `onTerminal?: (term: Terminal | null) => void` ao `TerminalPane`, chamada com a instância depois de `terminal.open()` e com `null` no cleanup do efeito.
**Where**: `src/components/terminal/TerminalPane.tsx`
**Depends on**: None
**Reuses**: o padrão da prop `onSessionId` no mesmo arquivo.
**Requirement**: SHOT-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A prop é opcional e a ausência dela não muda o comportamento atual
- [x] `null` é entregue no cleanup, antes do `terminal.dispose()`
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-screenshot (SHOT-13)`
- [x] Gate check passa: `npm test`
- [x] Test count: os testes existentes de `TerminalPane.test.tsx` mais 2 novos passam (no silent deletions)

**Tests**: unit — asserta que o callback recebe uma instância no mount e `null` no unmount.
**Gate**: quick

**Commit**: `feat(screenshot): expose the xterm instance from TerminalPane`

---

### T7: Ligar o botão de câmera do header

**What**: trocar o botão inerte por um botão real com `onToggleCapture`, `aria-pressed={captureArmed}`, `data-armed` e `disabled` quando `terminalCount === 0`; adicionar o estilo do estado armado no bloco `<style>` do header.
**Where**: `src/components/shell/Header.tsx`
**Depends on**: T6
**Reuses**: padrão de `atMaxTerminals` e o bloco `<style>` do próprio header; tokens `--accent`.
**Requirement**: SHOT-01, SHOT-06, SHOT-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `aria-pressed` reflete `captureArmed`
- [x] `disabled` quando `terminalCount === 0`
- [x] Borda `var(--accent)` e fundo `rgba(245, 183, 0, 0.14)` quando armado
- [x] `camera` removido de `INERT_LABELS` em `Header.test.tsx` no mesmo commit
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-screenshot (SHOT-01, SHOT-06, SHOT-07)`
- [x] Gate check passa: `npm test`
- [x] Test count: os testes existentes de `Header.test.tsx` mais 3 novos passam (no silent deletions)

**Tests**: unit — clique chama `onToggleCapture`; `aria-pressed` alterna; `terminalCount={0}` desabilita.
**Gate**: quick

**Commit**: `feat(screenshot): arm capture mode from the header camera button`

---

### T8: Modal de pré-visualização do print

**What**: criar `ScreenshotModal` com a imagem, os botões Salvar e Copiar, o botão de fechar, o erro inline e o Esc; fecha só em sucesso.
**Where**: `src/components/terminal/ScreenshotModal.tsx`
**Depends on**: T7
**Reuses**: classes `.app-settings-backdrop`/`.app-settings-modal` de `src/App.tsx`; `NewTerminalDialog` como referência de diálogo apresentacional; ícones `X`, `Download`, `Copy` de `lucide-react`.
**Requirement**: SHOT-14, SHOT-16, SHOT-17, SHOT-18, SHOT-19, SHOT-20, SHOT-21

**Tools**:

- MCP: NONE
- Skill: `ui-ux-pro-max:ui-ux-pro-max` para o acabamento visual do card
- Skill: NONE além dessa

**Done when**:

- [x] Salvar chama `save()` do plugin-dialog com o nome sugerido e depois `invoke('screenshot_save', { path, bytes })` com `Uint8Array`
- [x] Cancelar o diálogo de salvar mantém o modal aberto e não chama `invoke`
- [x] Copiar chama `navigator.clipboard.write` com `ClipboardItem` `image/png`
- [x] Rejeição de salvar ou de copiar mantém o modal aberto e mostra a mensagem
- [x] Esc e o botão de fechar fecham sem salvar nem copiar
- [x] `URL.createObjectURL` revogado no unmount
- [x] Marcador `// SPEC: terminal-screenshot (SHOT-14, SHOT-16, SHOT-17, SHOT-18, SHOT-19, SHOT-20, SHOT-21)` no topo
- [x] Gate check passa: `npm test`
- [x] Test count: 8 testes passam (no silent deletions)

**Tests**: unit — `save`, `invoke` e `navigator.clipboard.write` mockados; cobre sucesso e rejeição dos dois botões, cancelamento do diálogo, fechar pelo botão e por Esc.
**Gate**: quick

**Commit**: `feat(screenshot): add the screenshot preview modal`

---

### T9: Modo de captura no shell

**What**: em `App.tsx`, adicionar o estado `captureArmed`, o ref de instâncias do xterm, a marcação `data-capture-target` nos painéis elegíveis da aba ativa, a faixa de dica, o Esc no listener existente e o CSS do alvo.
**Where**: `src/App.tsx`
**Depends on**: T8
**Reuses**: `renderTab` e o `.app-pane` existentes; o efeito de teclado que já trata `dialogOpen`/`settingsOpen`; o bloco `<style>` do próprio `App.tsx`.
**Requirement**: SHOT-02, SHOT-03, SHOT-04, SHOT-05, SHOT-08

**Tools**:

- MCP: `code-review-graph` (`get_impact_radius_tool`) antes de editar `App.tsx`
- Skill: NONE

**Done when**:

- [x] Só painéis da aba ativa em modo `normal` ou `maximized` recebem `data-capture-target`
- [x] A faixa de dica aparece só com o modo armado
- [x] Esc desarma sem abrir modal e não interfere quando um diálogo está aberto
- [x] Digitação, botões do `TerminalHeader` e troca de aba seguem funcionando com o modo armado
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-screenshot (SHOT-02, SHOT-03, SHOT-04, SHOT-05, SHOT-08)`
- [x] Gate check passa: `npm test`
- [x] Test count: os testes existentes de `App.test.tsx` mais 4 novos passam (no silent deletions)

**Tests**: unit — armar marca os dois painéis da aba ativa; painel minimizado e painel de aba inativa não recebem a marca; Esc desarma; troca de aba com o modo armado remarca corretamente.
**Gate**: quick

**Commit**: `feat(screenshot): add capture mode to the app shell`

---

### T10: Capturar no clique e abrir o modal

**What**: em `App.tsx`, ligar o `onClickCapture` do painel marcado a `snapshotBlob`, montar o `ScreenshotModal` com o resultado, desarmar ao abrir e devolver o foco ao botão de câmera ao fechar.
**Where**: `src/App.tsx` (modificar)
**Depends on**: T9
**Reuses**: `snapshotBlob` de T3; `ScreenshotModal` de T8; o ref de instâncias criado em T9.
**Requirement**: SHOT-13, SHOT-14, SHOT-15, SHOT-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Clique num painel marcado abre o modal com o blob daquele painel
- [x] Abrir o modal desarma o modo de captura
- [x] Painel sem instância viva de xterm desarma sem abrir modal
- [x] Fechar o modal por qualquer caminho devolve o foco ao botão de câmera
- [x] Marcador `SPEC:` do arquivo atualizado com SHOT-13, SHOT-14, SHOT-15 e SHOT-23
- [x] Gate check passa: `npm run build && npm test && cargo test -p swarmdeck --manifest-path src-tauri/Cargo.toml`
- [x] Test count: os testes de T9 mais 4 novos passam (no silent deletions)

**Tests**: unit — `snapshotBlob` mockado; asserta abertura do modal, desarme, caminho sem instância, e foco devolvido após fechar.
**Gate**: build

**Commit**: `feat(screenshot): capture the clicked pane and open the preview`

---

### T11: Registrar AD-015 e fechar a rastreabilidade

**What**: acrescentar a AD-015 (captura por repintura do buffer) em `.specs/STATE.md` e mover os 23 IDs de `spec.md` para `Status: Verified` com a implementação e o teste de cada um.
**Where**: `.specs/STATE.md`
**Depends on**: None
**Reuses**: formato das ADs existentes (`Decision`/`Reason`/`Trade-off`/`Scope`/`Date`/`Status`).
**Requirement**: SHOT-09, SHOT-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] AD-015 registrada com decisão, razão, trade-off, escopo, data e status `active`
- [x] Tabela de rastreabilidade de `spec.md` com implementação e teste por ID
- [x] `grep -rn "SPEC: terminal-screenshot" src/ src-tauri/src/` acha todos os arquivos tocados
- [x] Gate check passa: `npm run build && npm test && cargo test -p swarmdeck --manifest-path src-tauri/Cargo.toml`

**Tests**: none — documentação, coberta pelo build gate conforme a matriz.
**Gate**: build

**Commit**: `docs(screenshot): record AD-015 and close the traceability table`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5
Phase 3:  T6 ------→ T7 ------→ T8 ------→ T9 ------→ T10
Phase 4:  T11
```

Dentro de uma fase a execução é estritamente sequencial, e cada fase só começa
depois que a anterior fecha. Por isso o campo `Depends on` de cada task registra
apenas o elo imediato dentro da própria fase — as dependências entre fases (T8
precisa do comando registrado em T5; T10 precisa de `snapshotBlob` de T3) já são
garantidas pela ordem das fases e não se repetem no campo.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: pintar viewport | 1 função em 1 arquivo novo | ✅ Granular |
| T2: faixa de título | 1 bloco na mesma função | ✅ Granular |
| T3: blob PNG | 1 função no mesmo arquivo | ✅ Granular |
| T4: comando Rust | 1 função em 1 arquivo novo | ✅ Granular |
| T5: registro | 2 linhas em 2 arquivos de wiring | ✅ Granular (wiring coeso) |
| T6: prop `onTerminal` | 1 prop em 1 componente | ✅ Granular |
| T7: botão de câmera | 1 botão em 1 componente | ✅ Granular |
| T8: modal | 1 componente novo | ✅ Granular |
| T9: modo armado | 1 estado e 1 marcação em 1 arquivo | ✅ Granular |
| T10: captura no clique | 1 handler no mesmo arquivo | ✅ Granular |
| T11: AD e rastreabilidade | 2 arquivos de documentação | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | None (início da fase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | None (início da fase 2) | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | None (início da fase 3) | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | None | None (única task da fase 4) | ✅ Match |

Nenhuma dependência aponta para uma fase posterior.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | `src/lib/` | unit | unit | ✅ OK |
| T2 | `src/lib/` | unit | unit | ✅ OK |
| T3 | `src/lib/` | unit | unit | ✅ OK |
| T4 | `src-tauri/src/commands/` | unit | unit | ✅ OK |
| T5 | registro no `invoke_handler` | none | none | ✅ OK |
| T6 | `src/components/` | unit | unit | ✅ OK |
| T7 | `src/components/` | unit | unit | ✅ OK |
| T8 | `src/components/` | unit | unit | ✅ OK |
| T9 | `src/App.tsx` | unit | unit | ✅ OK |
| T10 | `src/App.tsx` | unit | unit | ✅ OK |
| T11 | documentação `.specs` | none | none | ✅ OK |
