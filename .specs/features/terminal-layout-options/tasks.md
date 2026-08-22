# terminal-layout-options Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/terminal-layout-options/design.md`
**Status**: Approved

> **Commits (AD-013)**: nesta base nenhum agente commita. Cada task termina em
> gate verde + `tasks.md` marcado; o campo `Commit` de cada task é a mensagem
> **sugerida** para o usuário, não uma instrução de executar `git commit`.

---

## Test Coverage Matrix

> Gerada do código, das diretrizes do projeto e do spec — confirmar antes do Execute. Diretrizes encontradas: nenhuma (`AGENTS.md` é referenciado por `CLAUDE.md` mas não existe no disco; não há `CONTRIBUTING.md`, `docs/` nem limiar de cobertura em `vite.config.ts`). Defaults fortes aplicados, com o piso dado pelos testes existentes (`src/state/terminals.test.ts`, `src/components/**/*.test.tsx`, `src-tauri/src/db/quota_prefs.rs`, `src-tauri/src/commands/quota.rs`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Estado puro TS (`src/state/*.ts`) | unit | Todos os ramos; 1:1 com os ACs do spec; todo edge case listado tem teste | `src/state/*.test.ts` | `npm test` |
| Componentes React (`src/components/**/*.tsx`) | unit | Todo comportamento observável do componente: caminho feliz + estados vazios/desabilitados + interação de teclado | `src/components/**/*.test.tsx` | `npm test` |
| Shell da aplicação (`src/App.tsx`) | unit (integração via RTL) | Fluxos que atravessam componentes: restaurar, gravar, reordenar, trocar layout | `src/App.test.tsx` | `npm test` |
| Persistência Rust (`src-tauri/src/terminal/layout.rs`) | unit | Caminhos de query + erro + normalização + transação; todo edge case listado | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Comandos Tauri (`src-tauri/src/commands/terminal.rs`) | unit | Ida e volta `set`→`get` e mapeamento de erro | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Migração SQL (`src-tauri/src/db/migrations/*.sql`) | none | — (coberta pelos testes de `layout.rs`, que só passam com o schema aplicado) | — | build gate |

## Gate Check Commands

> Gerada do código — confirmar antes do Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Depois de tasks só com testes de unidade em TS | `npm test` |
| Full | Depois de tasks que tocam Rust | `npm test && cargo test --manifest-path src-tauri/Cargo.toml` |
| Build | Fim de fase, ou tasks de schema/wiring | `npm run build && cargo test --manifest-path src-tauri/Cargo.toml` |

---

## Execution Plan

Fases ordenadas, executadas em sequência; dentro de cada fase as tasks rodam em ordem.

### Phase 1: Núcleo puro

```
T1
T2
```

### Phase 2: Grid

```
T1 → T3
```

### Phase 3: Popover de layout

```
T4 → T5
```

### Phase 4: Arrastar e soltar

```
T6 → T7
T2 → T7
T3 → T7
T5 → T7
```

### Phase 5: Persistência (backend)

```
T8 → T9 → T10
```

### Phase 6: Integração do boot e da gravação

```
T10 → T11 → T12
```

---

## Task Breakdown

### T1: Criar o modelo de layout puro ✅

**What**: Criar `layoutPlan(count, layout)` com os tipos `LayoutMode`, `LayoutSpan`, `TabLayout`, `LayoutPlan` e a constante `DEFAULT_LAYOUT`, cobrindo a tabela de verdade do design.
**Where**: `src/state/layout.ts`
**Depends on**: None
**Reuses**: `gridTemplate` de `src/components/grid/GridLayout.tsx` para o ramo horizontal; formato de módulo puro de `src/state/terminals.ts`
**Requirement**: LAYOUT-07, LAYOUT-08, LAYOUT-09, LAYOUT-10, LAYOUT-11, LAYOUT-12, LAYOUT-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `layoutPlan` devolve exatamente as 7 linhas da tabela de verdade do design
- [x] `span` é campo de `TabLayout`, preservado quando a contagem não é 3 (LAYOUT-15)
- [x] Marcador `// SPEC: terminal-layout-options (LAYOUT-07, LAYOUT-08, LAYOUT-09, LAYOUT-10, LAYOUT-11, LAYOUT-12, LAYOUT-15)` no topo do arquivo
- [x] Gate check passa: `npm test` (176 passed)
- [x] Test count: 9 testes novos em `src/state/layout.test.ts` (7 linhas da tabela + preservação do span + `DEFAULT_LAYOUT`, nomeado no "What" da task)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): modelo puro de disposição por aba`

---

### T2: Adicionar `moveTerminal` ao estado de terminais ✅

**What**: Função pura que move um terminal para a posição de outro dentro da mesma aba, preservando a ordem relativa dos demais.
**Where**: `src/state/terminals.ts`
**Depends on**: None
**Reuses**: assinatura e estilo de `maximize`/`minimize`/`close` no mesmo arquivo
**Requirement**: LAYOUT-16, LAYOUT-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mover para frente e para trás produz a ordem esperada, com os demais na ordem relativa original
- [x] `fromId === toId`, id inexistente e lista de 1 devolvem a lista original
- [x] `fracW` de cada terminal acompanha o terminal, sem redistribuição
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-layout-options (LAYOUT-16, LAYOUT-19)`
- [x] Gate check passa: `npm test` (181 passed)
- [x] Test count: 5 testes novos passam em `src/state/terminals.test.ts`

> SPEC_DEVIATION: o índice de reinserção é o que `toId` ocupa na lista
> **original**, não na lista já sem o arrastado como diz o design §2. A regra
> do design torna o arrasto sobre o vizinho imediato da direita um no-op, o
> que contradiz LAYOUT-16. Marcador no corpo de `moveTerminal`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): reordenação pura de terminais na aba`

---

### T3: Aplicar o plano de layout no grid ✅

**What**: `GridLayout` passa a receber `layout`, aplicar `gridColumn: span N` por célula, sincronizar `localPanes` pela sequência de ids e renderizar divisória só entre vizinhos da mesma linha sem span.
**Where**: `src/components/grid/GridLayout.tsx`
**Depends on**: T1
**Reuses**: `layoutPlan` (T1); `applyDrag` e `gridTemplate` já existentes no arquivo
**Requirement**: LAYOUT-07, LAYOUT-08, LAYOUT-09, LAYOUT-10, LAYOUT-11, LAYOUT-12, LAYOUT-18, LAYOUT-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `gridTemplateColumns`/`gridTemplateRows` e o `gridColumn` de cada célula seguem `layoutPlan`
- [x] Reordenar `panes` mantendo a contagem re-renderiza na nova ordem (a comparação por contagem foi trocada por comparação de ids)
- [x] Nenhuma divisória é renderizada quando `columns === 1`, nem entre painéis de linhas diferentes, nem ao lado de um painel com span 2
- [x] Os testes existentes de `GridLayout.test.tsx` continuam passando sem edição (eram **6**, não 4 como esta task previa)
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-layout-options (LAYOUT-07, LAYOUT-08, LAYOUT-09, LAYOUT-10, LAYOUT-11, LAYOUT-12, LAYOUT-18, LAYOUT-20)`
- [x] Gate check passa: `npm test` (187 passed)
- [x] Test count: 6 existentes + 6 novos = 12 testes passam em `src/components/grid/GridLayout.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): grid aplica modo, span e ordem`

---

### T4: Criar o popover de opções de layout ✅

**What**: Componente `LayoutMenu` — botão com `aria-label="layout options"` e popover com cabeçalho "N TERMINAIS", itens Horizontal/Vertical e as duas variantes de largura quando a aba tem 3 terminais.
**Where**: `src/components/shell/LayoutMenu.tsx`
**Depends on**: None
**Reuses**: linguagem visual do popover de `src/components/shell/QuotaIndicator.tsx`; tipos de `src/state/layout.ts`
**Requirement**: LAYOUT-01, LAYOUT-03, LAYOUT-04, LAYOUT-05, LAYOUT-06, LAYOUT-13, LAYOUT-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cabeçalho mostra "1 TERMINAL" com um e "N TERMINAIS" com mais de um
- [x] Só a entrada do modo ativo recebe a cor de acento
- [x] Escolher um modo chama `onChange` com `mode` novo e `span` preservado, e fecha o popover
- [x] Escape e clique fora fecham sem chamar `onChange`
- [x] Botão desabilitado com `count === 0`
- [x] Variantes de largura aparecem só com `count === 3` e `mode === 'horizontal'`
- [x] Marcador `// SPEC: terminal-layout-options (LAYOUT-01, LAYOUT-03, LAYOUT-04, LAYOUT-05, LAYOUT-06, LAYOUT-13, LAYOUT-14)` no topo
- [x] Gate check passa: `npm test` (197 passed)
- [x] Test count: 10 testes novos em `src/components/shell/LayoutMenu.test.tsx` (9 previstos + escolher uma variante, LAYOUT-13)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): popover de opções de layout`

---

### T5: Colocar o menu de layout no header ✅

**What**: Substituir o botão inerte `Columns2` (`aria-label="split"`) pelo `LayoutMenu`, mantendo a posição imediatamente à esquerda do indicador de cota, e passar `count`/`layout`/`onLayoutChange` pelas props do `Header`.
**Where**: `src/components/shell/Header.tsx`
**Depends on**: T4
**Reuses**: `LayoutMenu` (T4); estrutura de `shell-header__group` já existente
**Requirement**: LAYOUT-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Não existe mais botão com `aria-label="split"` no header
- [x] O botão `layout options` é o irmão imediatamente anterior ao indicador de cota no DOM
- [x] O botão `LayoutGrid` do grupo da esquerda continua inerte, sem alteração
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-layout-options (LAYOUT-02)`
- [x] Gate check passa: `npm test` (199 passed)
- [x] Test count: 12 existentes + 2 novos = 14 em `Header.test.tsx`

> DESVIO do "Done when": 3 testes existentes **precisaram** ser retargetados,
> não passaram intactos — eles afirmavam o botão `split`, que LAYOUT-02 revoga.
> Nenhum foi apagado, pulado ou enfraquecido: `INERT_LABELS` perdeu `split`, o
> teste dos 7 elementos passou a exigir `layout options`, e a ordem do grupo
> direito virou `['run','copy','layout options','quota','settings']`. Não há
> spec `shell-chrome` em `.specs/` para marcar a revogação — os HDR-xx só
> vivem nos marcadores e nos testes.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): menu de layout substitui o botão inerte do header`

---

### T6: Tornar a alça do cabeçalho arrastável ✅

**What**: A `GripVertical` de `TerminalHeader` passa a ser `draggable` e a publicar o id do terminal em `dataTransfer` quando a prop `onDragStartReorder` é fornecida; sem a prop segue decorativa.
**Where**: `src/components/terminal/TerminalHeader.tsx`
**Depends on**: None
**Reuses**: a alça já existente (`TerminalHeader.tsx:137`)
**Requirement**: LAYOUT-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sem `onDragStartReorder`, a alça continua `aria-hidden` e não arrastável — os 11 testes atuais do arquivo passam sem edição
- [x] Com a prop, `dragstart` na alça dispara o callback
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-layout-options (LAYOUT-17)`
- [x] Gate check passa: `npm test` (201 passed)
- [x] Test count: 11 existentes + 2 novos = 13 em `src/components/terminal/TerminalHeader.test.tsx`

> Nota: quem publica o id em `dataTransfer` é `App.tsx` (T7), não o
> `TerminalHeader` como o design §5 sugeria — o `id` do header é o da sessão
> do backend, não o do painel no grid, que é a chave de `moveTerminal`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): alça do terminal vira origem de arrasto`

---

### T7: Ligar layout por aba e soltar-para-reordenar no App ✅

**What**: `TerminalTab` ganha o campo `layout`; o `Header` recebe o layout da aba ativa; o `div.app-pane` vira alvo de drop com destaque e chama `moveTerminal` no `onDrop`.
**Where**: `src/App.tsx`
**Depends on**: T2, T3, T5, T6
**Reuses**: `moveTerminal` (T2), `layoutPlan` (T1) via `GridLayout` (T3), `LayoutMenu` via `Header` (T5), `setActiveTerminals` já existente
**Requirement**: LAYOUT-15, LAYOUT-16, LAYOUT-17, LAYOUT-19, LAYOUT-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Trocar o modo pelo popover altera só a aba ativa; a outra aba mantém o dela
- [x] Soltar um terminal sobre outro reordena os painéis e o grid reflete a nova ordem
- [x] Soltar sobre o próprio painel não muda nada
- [x] Nenhum `TerminalPane` remonta na reordenação (mesmos nós de DOM antes e depois)
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-layout-options (LAYOUT-15, LAYOUT-16, LAYOUT-17, LAYOUT-19, LAYOUT-20)`
- [x] Gate check passa: `npm test` (206 passed) + `npx tsc --noEmit` limpo
- [x] Test count: 25 existentes + 5 novos = 30 em `src/App.test.tsx`

> O stub de `TerminalPane` em `App.test.tsx` passou a expor `data-cwd` — é o
> que identifica cada painel depois da reordenação (o número do cabeçalho é a
> posição, justamente o que muda). Acréscimo puro: nenhum teste existente foi
> editado.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): layout por aba e reordenação por arrastar e soltar`

---

### T8: Criar a migração do workspace de terminais ✅

**What**: Migração `008` com a tabela `terminal_tabs` e a coluna `tab_id` em `terminal_layout`, registrada na lista de migrações embutidas.
**Where**: `src-tauri/src/db/migrations/008_terminal_workspace.sql`
**Depends on**: None
**Reuses**: padrão das migrações `001` e `007`; lista `include_str!` de `src-tauri/src/db/mod.rs`
**Requirement**: LAYOUT-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tabela `terminal_tabs` criada com `id`, `slot`, `name`, `layout_mode`, `layout_span`, `updated_at`, sem `CHECK` nos dois campos de layout
- [x] `terminal_layout` ganha `tab_id` anulável e índice `(tab_id, slot)`
- [x] Entrada `(8, include_str!("migrations/008_terminal_workspace.sql"))` acrescentada em `db/mod.rs`
- [x] Banco existente migra sem erro (o teste de migração de `db/mod.rs` continua passando)
- [x] Gate check passa: `npm run build && cargo test --manifest-path src-tauri/Cargo.toml` (231 passed, 0 failed)

**Tests**: none (camada de schema — matriz diz `none`; coberta pelos testes de `layout.rs` em T9)
**Gate**: build

**Commit**: `feat(layout): migração do workspace de terminais`

---

### T9: Persistir abas e terminais em `layout.rs` ✅

**What**: Introduzir `TabEntry`, reescrever `save`/`restore` para a forma com abas (transação, normalização de modo desconhecido, descarte de órfãos, vetor vazio quando não há nada salvo) e derivar `Serialize`/`Deserialize` em `LayoutEntry`.
**Where**: `src-tauri/src/terminal/layout.rs`
**Depends on**: T8
**Reuses**: `save`/`restore` atuais (código morto, sem chamador nem teste); fallback de `cwd` já implementado; padrão de testes de `src-tauri/src/db/quota_prefs.rs`
**Requirement**: LAYOUT-22, LAYOUT-23, LAYOUT-24, LAYOUT-25, LAYOUT-27, LAYOUT-28, LAYOUT-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `save` roda numa transação e substitui abas e terminais por completo
- [x] `restore` devolve vetor vazio quando não há aba salva (`default_entry` removido)
- [x] `layout_mode`/`layout_span` desconhecidos voltam como `horizontal`/`first`
- [x] Terminal com `tab_id` nulo ou apontando para aba inexistente é descartado
- [x] `cwd` inexistente cai em `home` com `cwd_fallback_from` preenchido
- [x] Marcador `SPEC:` do arquivo atualizado com `terminal-layout-options (LAYOUT-22, LAYOUT-23, LAYOUT-24, LAYOUT-25, LAYOUT-27, LAYOUT-28, LAYOUT-29)`
- [x] Gate check passa: `npm test` (206 passed) + `cargo test --manifest-path src-tauri/Cargo.toml` (240 passed)
- [x] Test count: 9 testes novos passam em `layout.rs` (os 8 previstos + "aba salva sem nenhum terminal", edge case do spec)

> DESVIO: a task previa `layout.rs` sem testes ("código morto, sem chamador
> nem teste"), mas `src-tauri/tests/layout.rs` já tinha **4 testes de
> integração** contra a API sem abas. A mudança de forma (AD-012) os torna
> incompiláveis, então os 4 foram **retargetados** para `TabEntry` — nenhum
> apagado, pulado ou enfraquecido, contagem preservada.
>
> Um deles, `banco_vazio_restaura_um_unico_terminal_em_home`, afirmava
> exatamente o que **LAYOUT-24 revoga** ("sem layout salvo, o app deve abrir
> com exatamente 1 terminal"). Foi invertido para
> `banco_vazio_restaura_workspace_vazio`, com o motivo da revogação no
> docstring do teste. O requisito antigo só existia no comentário de
> `default_entry`; não há requisito TERM-xx escrito em `.specs/` para marcar
> como revogado (o `multi-terminal/spec.md` é um delta de TERM-12/13/06).
>
> `unchecked_transaction()` em vez de `conn_mut()`: mantém a assinatura
> `save(db: &Db, ...)` do design §6.2 sem propagar `&mut Db` até o comando.
>
> Campos que o frontend não envia (`title`, `titleSource`, `updatedAt`,
> `cwdFallbackFrom`, `agentId`) receberam `#[serde(default)]` — o payload do
> front grava o que ele conhece, não o esquema inteiro da tabela.

**Tests**: unit
**Gate**: full

**Commit**: `feat(layout): persistência de abas e terminais`

---

### T10: Expor os comandos de workspace ao frontend ✅

**What**: `terminal_workspace_get` e `terminal_workspace_set` em `commands/terminal.rs`, registrados em `lib.rs::invoke_handler`.
**Where**: `src-tauri/src/commands/terminal.rs`
**Depends on**: T9
**Reuses**: padrão de `quota_prefs_get`/`quota_prefs_set` em `src-tauri/src/commands/quota.rs`; `paths.rs` para o `home`
**Requirement**: LAYOUT-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `terminal_workspace_set` seguido de `terminal_workspace_get` devolve as mesmas abas e terminais
- [x] Erro de banco vira `Err(String)` sem panicar (leitura e gravação)
- [x] Os dois comandos aparecem em `lib.rs::invoke_handler` com o comentário `// SPEC: terminal-layout-options (LAYOUT-26)` acima
- [x] Marcador `SPEC:` de `commands/terminal.rs` atualizado com `terminal-layout-options (LAYOUT-26)`
- [x] Gate check passa: `npm run build && cargo test --manifest-path src-tauri/Cargo.toml` (243 passed)
- [x] Test count: 3 testes novos passam em `commands/terminal.rs`

> DESVIO: o design §6.3 diz que o `home` do fallback de `cwd` vem de
> `paths.rs`, mas `paths.rs` não expõe nenhum `home` — ele resolve o
> diretório de *dados* do app, não o do usuário. A fonte usada é
> `dirs::home_dir()`, a mesma de `quota.rs:199`.

**Tests**: unit
**Gate**: build

**Commit**: `feat(layout): comandos Tauri do workspace de terminais`

---

### T11: Restaurar o workspace no boot ✅

**What**: `App.tsx` lê `terminal_workspace_get` na montagem, reconstrói abas, terminais, agentes e layouts, e só marca `hydrated` depois disso; vetor vazio ou erro mantém a aba vazia inicial.
**Where**: `src/App.tsx`
**Depends on**: T10
**Reuses**: `fromLayoutEntries` de `src/state/terminals.ts`; padrão de `useEffect` de boot já usado para `quota_prefs_get`
**Requirement**: LAYOUT-23, LAYOUT-24, LAYOUT-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Workspace salvo com 2 abas restaura as 2, com terminais, ordem, `cwd`, agente e layout
- [x] Vetor vazio mantém uma aba vazia com o `EmptyState` (EMPTY-03 preservado)
- [x] Comando rejeitado registra o erro e mantém a aba vazia, sem quebrar o render
- [x] Marcador `SPEC:` de `App.tsx` atualizado com os IDs desta task
- [x] Gate check passa: `npm test` (210 passed) + `npx tsc --noEmit` limpo
- [x] Test count: 30 existentes + 4 novos = 34 em `src/App.test.tsx`

> O tipo do payload (`WorkspaceTab`/`WorkspaceTerminal`) mora em `App.tsx`,
> como `QuotaPrefsPayload` já mora: `agentId` é estado à parte no front
> (`agentByTerminalId`), então não cabe no `LayoutEntry` de
> `state/terminals.ts` — que, além disso, está fora do `Where` desta task.
>
> O stub de `TerminalPane` em `App.test.tsx` passou a expor `data-agent` — é
> o que prova que o agente salvo voltou. Acréscimo puro, nenhum teste
> existente editado.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): restaurar abas e terminais no boot`

---

### T12: Gravar o workspace com debounce ✅

**What**: `useEffect` que serializa abas + terminais + agentes e chama `terminal_workspace_set` 500 ms depois da última mudança, inerte enquanto `hydrated` for falso.
**Where**: `src/App.tsx`
**Depends on**: T11
**Reuses**: `toLayoutEntries` de `src/state/terminals.ts`; o `hydrated` de T11
**Requirement**: LAYOUT-21, LAYOUT-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mudança em abas, ordem, layout ou agentes dispara uma única chamada 500 ms depois (nada em 499 ms)
- [x] Mudanças em rajada resultam em uma chamada, e é o último estado que vai no payload
- [x] Nada é gravado antes de `hydrated` virar verdadeiro (leitura que nunca resolve → nenhuma gravação)
- [x] O payload carrega `agentId` por terminal e `layoutMode`/`layoutSpan` por aba
- [x] Marcador `SPEC:` de `App.tsx` atualizado com `LAYOUT-21, LAYOUT-22`
- [x] Gate check passa: `npm test` (214 passed) + `npx tsc --noEmit` limpo
- [x] Test count: 34 existentes + 4 novos = 38 em `src/App.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(layout): gravar o workspace com debounce`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1        T2
Phase 2:  T1 ------→ T3
Phase 3:  T4 ------→ T5
Phase 4:  T2 ------→ T7
Phase 4:  T3 ------→ T7
Phase 4:  T5 ------→ T7
Phase 4:  T6 ------→ T7
Phase 5:  T8 ------→ T9 ------→ T10
Phase 6:  T10 -----→ T11 -----→ T12
```

Execução estritamente sequencial: uma task por vez, na ordem.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: modelo de layout | 1 arquivo, 1 função + tipos | ✅ Granular |
| T2: `moveTerminal` | 1 função | ✅ Granular |
| T3: grid aplica o plano | 1 componente | ✅ Granular |
| T4: `LayoutMenu` | 1 componente | ✅ Granular |
| T5: header usa o menu | 1 arquivo, troca de 1 botão | ✅ Granular |
| T6: alça arrastável | 1 arquivo, 1 elemento | ✅ Granular |
| T7: layout por aba + drop | 1 arquivo, 1 fluxo coeso | ✅ Granular |
| T8: migração | 1 arquivo SQL + 1 linha de registro | ✅ Granular |
| T9: persistência | 1 arquivo | ✅ Granular |
| T10: comandos | 1 arquivo + registro | ✅ Granular |
| T11: boot | 1 arquivo, 1 efeito | ✅ Granular |
| T12: gravação | 1 arquivo, 1 efeito | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ Match |
| T2 | None | — | ✅ Match |
| T3 | T1 | T1 → T3 | ✅ Match |
| T4 | None | — | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | — | ✅ Match |
| T7 | T2, T3, T5, T6 | T2 → T7, T3 → T7, T5 → T7, T6 → T7 | ✅ Match |
| T8 | None | — | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |

Dependências entre fases apontam sempre para trás; nenhuma task depende de fase posterior.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| --- | --- | --- | --- | --- |
| T1 | Estado puro TS | unit | unit | ✅ OK |
| T2 | Estado puro TS | unit | unit | ✅ OK |
| T3 | Componente React | unit | unit | ✅ OK |
| T4 | Componente React | unit | unit | ✅ OK |
| T5 | Componente React | unit | unit | ✅ OK |
| T6 | Componente React | unit | unit | ✅ OK |
| T7 | Shell da aplicação | unit | unit | ✅ OK |
| T8 | Migração SQL | none | none | ✅ OK |
| T9 | Persistência Rust | unit | unit | ✅ OK |
| T10 | Comandos Tauri | unit | unit | ✅ OK |
| T11 | Shell da aplicação | unit | unit | ✅ OK |
| T12 | Shell da aplicação | unit | unit | ✅ OK |

---

## Fix pass (pós-Verifier)

Correções apontadas por `validation.md` (16/08/2026). Nenhuma task existente foi
reescrita; este bloco só registra o que mudou depois da validação.

| Fix | Severidade | O quê | Por quê |
| --- | --- | --- | --- |
| 1 | Major | `fromLayoutEntries` passa a carregar `cwdFallbackFrom` (`src/state/terminals.ts`) e `App.tsx` mostra um aviso dispensável, uma linha por terminal, nomeando o diretório que sumiu. Testes novos em `src/state/terminals.test.ts` (3) e `src/App.test.tsx` (3). | LAYOUT-25 manda "informar qual diretório sumiu". O backend preenchia o campo e o front o descartava: o usuário caía em home em silêncio. |
| 2 | Minor | Teste novo em `src/App.test.tsx`: restaurar 5 terminais dispara 5 `pty_spawn`, cada um só com `cwd` e agente. O dublê de `TerminalPane` passou a espelhar o `pty_spawn` de mount do componente real. | LAYOUT-29 não tinha assertiva nenhuma. O observável é o spawn por painel: sessão nova, sem id antigo nem saída anterior. |
| 3 | Minor | Dois testes novos em `src/components/grid/GridLayout.test.tsx`: maximizado sob `vertical` (mantém TERM-04, ninguém desmonta) e minimizado sob a variante `last` (mantém posição e os 34 px de TERM-08). | A Test Coverage Matrix exige teste para todo edge case listado; layout e modo de painel eram testados separados, nunca juntos. |
| 4 | Nit | Comentários de `src-tauri/src/terminal/layout.rs` (testes de descarte de órfão) deixaram de citar `LAYOUT-25`. Só o texto do comentário; a lógica não mudou. | LAYOUT-25 é o AC do fallback de `cwd`. Descarte de órfão é edge case listado, não aquele AC — o marcador mentia. |

Gates depois do passe: `npm test` 223 passed / 0 failed (era 214);
`cargo test --manifest-path src-tauri/Cargo.toml` 243 passed / 0 failed
(inalterado, o Fix 4 é comentário). `npx tsc --noEmit` limpo.
