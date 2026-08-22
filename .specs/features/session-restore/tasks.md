# session-restore Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/session-restore/design.md`
**Status**: Approved

> **Commits (AD-013)**: nesta base nenhum agente commita. Cada task termina em
> gate verde + `tasks.md` marcado; o campo `Commit` de cada task é a mensagem
> **sugerida** para o usuário, não uma instrução de executar `git commit`.

---

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Catálogo/lançamento Rust (`src-tauri/src/agents/*.rs`) | unit | Toda combinação (agente declara flag ou não) × (resume ou não) | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Persistência Rust (`src-tauri/src/terminal/layout.rs`) | unit | Round-trip da coluna nova + linha antiga sem coluna | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Estado puro TS (`src/state/*.ts`) | unit | Ida e volta dos campos novos; ausência do campo | `src/state/*.test.ts` | `npm test` |
| Componentes React (`src/components/**/*.tsx`) | unit | Caminho feliz + estados desabilitados + teclado | `src/components/**/*.test.tsx` | `npm test` |
| Shell da aplicação (`src/App.tsx`) | unit (integração via RTL) | Boot com e sem modal, nenhum spawn antes da escolha, argumentos do spawn | `src/App.test.tsx` | `npm test` |
| Migração SQL (`src-tauri/src/db/migrations/*.sql`) | none | — (coberta pelos testes de `layout.rs`, que só passam com o schema aplicado) | — | build gate |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks só com testes de unidade em TS | `npm test` |
| Full | Tasks que tocam Rust | `npm test && cargo test --manifest-path src-tauri/Cargo.toml` |
| Build | Fim de fase, ou tasks de schema/wiring | `npm run build && cargo test --manifest-path src-tauri/Cargo.toml` |

---

## Execution Plan

### Phase 1: Sessão no backend

```
T1 → T2
T3
```

### Phase 2: Estado do front

```
T3 → T4
T2 → T5
T4 → T5
```

### Phase 3: Modal

```
T4 → T6
```

### Phase 4: Integração do boot

```
T1 → T7
T5 → T7
T6 → T7
T7 → T8
```

---

## Task Breakdown

### T1: Flags de sessão no catálogo e na resolução do comando

**What**: Adicionar `session_new_flag` e `session_resume_flag` a `AgentDescriptor` (só `claude-code` preenchidos, com `--session-id` e `--resume`); `LaunchResolution` ganha `args: Vec<String>` e `resolve_launch_command` ganha o parâmetro `session: Option<SessionLaunch>`. Expor `supportsSessionResume` em `agent_catalog`.
**Where**: `src-tauri/src/agents/catalog.rs`, `src-tauri/src/agents/launch.rs`, `src-tauri/src/agents/mod.rs`, `src-tauri/src/commands/agents.rs`
**Depends on**: None
**Reuses**: `resolve_with` (núcleo testável já existente em `launch.rs`); o catálogo estático de `catalog.rs`
**Requirement**: SESS-11, SESS-12, SESS-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Agente com flag + `resume: false` produz `args == ["--session-id", "<id>"]`
- [x] Agente com flag + `resume: true` produz `args == ["--resume", "<id>"]`
- [x] Agente sem flag produz `args == []` nos dois casos, sem warning novo
- [x] `session: None` produz `args == []` (terminal sem id de sessão)
- [x] Marcador `SPEC:` dos arquivos atualizado com `session-restore (SESS-11, SESS-12, SESS-13)`
- [x] Gate check passa: `npm test && cargo test --manifest-path src-tauri/Cargo.toml`
- [x] Test count: 5 testes novos em `launch.rs` + 1 em `catalog.rs`

**Tests**: unit
**Gate**: full

**Commit**: `feat(agents): flags de sessão por agente na resolução do comando`

---

### T2: `SessionConfig` e `pty_spawn` carregam o id de sessão

**What**: `SessionConfig` ganha `session_id: Option<String>` e `resume: bool`; `TerminalManager::spawn` repassa para `resolve_launch_command` e aplica `resolution.args` no `CommandBuilder`. O comando `pty_spawn` aceita `sessionId` e `resume`.
**Where**: `src-tauri/src/terminal/manager.rs`, `src-tauri/src/commands/terminal.rs`
**Depends on**: T1
**Reuses**: o `CommandBuilder` já montado em `spawn`; a conversão camelCase→snake_case dos argumentos do Tauri
**Requirement**: SESS-12, SESS-13, SESS-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `spawn` aplica cada item de `resolution.args` como argumento, na ordem
- [x] Sessão sem `session_id` continua lançando exatamente o comando de hoje
- [x] Marcador `SPEC:` dos arquivos atualizado
- [x] Gate check passa: `npm test && cargo test --manifest-path src-tauri/Cargo.toml`
- [x] Test count: 1 teste novo em `manager.rs` (args aplicados) — o resto é coberto por T1

**Tests**: unit
**Gate**: full

**Commit**: `feat(terminal): pty_spawn aceita id de sessão e modo de retomada`

---

### T3: Persistir `agent_session_id`

**What**: Migração `009_terminal_session.sql` (`ALTER TABLE terminal_layout ADD COLUMN agent_session_id TEXT`) e o campo correspondente em `layout::LayoutEntry`, gravado por `save` e lido por `restore`.
**Where**: `src-tauri/src/db/migrations/009_terminal_session.sql`, `src-tauri/src/db/mod.rs`, `src-tauri/src/terminal/layout.rs`
**Depends on**: None
**Reuses**: o runner de migração versionado de `db/mod.rs`; o padrão `#[serde(default)]` dos campos opcionais de `LayoutEntry`
**Requirement**: SESS-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `save` seguido de `restore` devolve o mesmo `agent_session_id`
- [x] Linha gravada sem a coluna (banco antigo) volta com `agent_session_id: None`
- [x] Marcador `SPEC:` dos arquivos atualizado
- [x] Gate check passa: `npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
- [x] Test count: 2 testes novos em `layout.rs`

**Tests**: unit
**Gate**: build

**Commit**: `feat(db): coluna agent_session_id no layout de terminais`

---

### T4: Id de sessão no estado do front

**What**: `TerminalState` ganha `agentSessionId` e `resumeSession`; `LayoutEntry` ganha `agentSessionId`; `toLayoutEntries`/`fromLayoutEntries` carregam o campo.
**Where**: `src/state/terminals.ts`
**Depends on**: T3
**Reuses**: o par `toLayoutEntries`/`fromLayoutEntries` já existente; o tratamento de `cwdFallbackFrom` como modelo de campo opcional
**Requirement**: SESS-10, SESS-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `agentSessionId` sobrevive à ida e volta pelas duas funções
- [x] Entrada sem `agentSessionId` volta com `null`, nunca `undefined` implícito
- [x] `resumeSession` **não** aparece em `toLayoutEntries` (não é persistido)
- [x] Marcador `SPEC:` do arquivo atualizado
- [x] Gate check passa: `npm test`
- [x] Test count: 3 testes novos em `src/state/terminals.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(state): id de sessão do agente no estado de terminais`

---

### T5: `TerminalPane` repassa sessão ao spawn

**What**: `TerminalPane` ganha as props `sessionId` e `resume` e as envia em `pty_spawn`, lidas no mount (fora das dependências do efeito).
**Where**: `src/components/terminal/TerminalPane.tsx`
**Depends on**: T2, T4
**Reuses**: a chamada `invoke('pty_spawn', ...)` existente
**Requirement**: SESS-12, SESS-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pty_spawn` recebe `sessionId` e `resume` junto de `cwd`/`agent`
- [x] As dependências do efeito continuam `[cwd, shell, agent]` — remonte segue sendo só o da `key`
- [x] Marcador `SPEC:` do arquivo atualizado
- [x] Gate check passa: `npm test`
- [x] Test count: coberto pelas asserções de `App.test.tsx` em T7 (o dublê do painel é quem observa os argumentos)

**Tests**: none
**Gate**: quick

**Commit**: `feat(terminal): painel repassa id de sessão ao spawn`

---

### T6: Componente `RestoreSessionDialog`

**What**: Modal apresentacional fiel a `print/restore.png`: abas e terminais com checkbox, switch restaurar/nova sessão por terminal, contador "N/M selecionados", "Start Fresh" e "Restore Selected".
**Where**: `src/components/shell/RestoreSessionDialog.tsx`, `src/components/shell/RestoreSessionDialog.test.tsx`
**Depends on**: T4
**Reuses**: `ProviderIcon` para a marca do agente; o backdrop `.app-dialog-backdrop` já definido em `App.tsx`; o padrão apresentacional de `NewTerminalDialog`
**Requirement**: SESS-03, SESS-04, SESS-05, SESS-09, SESS-14, SESS-15

**Tools**:

- MCP: NONE
- Skill: ui-ux-pro-max

**Done when**:

- [x] Tudo nasce marcado e em "restaurar sessão"
- [x] Desmarcar/remarcar uma aba propaga para os terminais dela
- [x] Contador mostra "N/M selecionados" com N = terminais marcados
- [x] Switch travado em "nova sessão", com a dica, quando o terminal não tem id salvo ou o agente não retoma
- [x] "Restore Selected" desabilitado com zero terminais marcados
- [x] `role="dialog"`, `aria-modal`, foco inicial no botão primário e `outline` visível em todo controle
- [x] Marcador `SPEC:` no topo do arquivo
- [x] Gate check passa: `npm test`
- [x] Test count: 8 testes novos em `RestoreSessionDialog.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shell): modal de restauração de abas e sessões`

---

### T7: Integrar o modal ao boot

**What**: `App.tsx` segura o workspace lido em `pendingRestore` em vez de aplicá-lo; monta o modal quando há terminal salvo; aplica a escolha (restaurar/fresh/Escape); gera id de sessão em criar, clonar e reiniciar.
**Where**: `src/App.tsx`, `src/App.test.tsx`
**Depends on**: T1, T5, T6
**Reuses**: `hydrated` (a guarda que já impede gravação antes da leitura); `handleCreate`/`handleCloneTerminal`/`handleResetTerminal`; `agent_catalog` para `resumableAgentIds`
**Requirement**: SESS-01, SESS-02, SESS-06, SESS-07, SESS-08, SESS-10, SESS-16, SESS-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Workspace com terminal salvo abre o modal e **nenhum** `pty_spawn` acontece antes da escolha
- [x] Workspace sem terminal nenhum restaura direto, sem modal
- [x] "Restore Selected" monta só o marcado e grava o workspace resultante
- [x] "Start Fresh", × e Escape abrem uma aba vazia e gravam esse estado
- [x] Criar, clonar e reiniciar geram id de sessão novo com `resume: false`
- [x] Falha de leitura abre aba vazia sem modal (LAYOUT-26 preservado)
- [x] Marcador `SPEC:` de `App.tsx` atualizado com `session-restore (...)`
- [x] Gate check passa: `npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
- [x] Test count: 8 testes novos em `src/App.test.tsx`

**Tests**: unit
**Gate**: build

**Commit**: `feat(app): confirmar abas e sessões a restaurar no boot`

---

### T8: Atualizar a spec antiga e registrar a decisão

**What**: Marcar em `terminal-layout-options/spec.md` a revisão de LAYOUT-23 e a revogação parcial de LAYOUT-29, remover a linha "Modal escolhendo o que restaurar no boot" de Fora de Escopo, e registrar AD-014 em `.specs/STATE.md`.
**Where**: `.specs/features/terminal-layout-options/spec.md`, `.specs/STATE.md`, `.specs/features/session-restore/spec.md`
**Depends on**: T7
**Reuses**: o formato de AD já usado em `STATE.md` (Decision/Reason/Trade-off/Scope/Date/Status)
**Requirement**: SESS-01, SESS-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] LAYOUT-23 e LAYOUT-29 marcados na spec antiga, nomeando SESS-01/SESS-12 e AD-014
- [x] Linha de Fora de Escopo removida, com nota de por quê
- [x] AD-014 registrada em `STATE.md`
- [x] Rastreabilidade de `session-restore/spec.md` com todos os 17 IDs em `Verified`
- [x] Gate check passa: `npm test`

**Tests**: none
**Gate**: quick

**Commit**: `docs(specs): revisar terminal-layout-options e registrar AD-014`
