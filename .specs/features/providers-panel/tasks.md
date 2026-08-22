# Providers Panel Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/providers-panel/design.md`
**Status**: In Progress

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec. Guidelines found: `.claude/rules/spec-driven-changes.md` (marcador `SPEC:` obrigatório, spec é a autorização), `.claude/rules/tauri-build-cleanup.md`; `package.json` (`vitest run`); nenhum limiar de cobertura configurado, então valem os defaults fortes.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Migration SQL | none | build gate only | `src-tauri/src/db/migrations/*.sql` | build gate only |
| Persistência Rust (`db/*.rs`) | unit | caminhos de query + round-trip get/set, no padrão de `db::quota_prefs` tests | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test` |
| Regra Rust pura (`merge_scan`) | unit | 1:1 com PROV-12, PROV-13 e o caso "nada achado" | `#[cfg(test)] mod tests` no próprio arquivo | `cargo test` |
| Cache Rust (`clear_wsl_probe_cache`) | unit | prova que a sonda roda de novo depois do clear | `#[cfg(test)] mod tests` em `agents/catalog.rs` | `cargo test` |
| Componente React apresentacional | unit | todo AC de renderização/interação da spec + casos de borda listados | `src/**/*.test.tsx` (co-locado) | `npx vitest run <arquivo>` |
| Wiring React (`SettingsShell`, `App`) | unit | os `invoke` que a spec exige, com `invoke` mockado | `src/**/*.test.tsx` (co-locado) | `npx vitest run <arquivo>` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tarefa Rust | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Quick | Tarefa React | `npx vitest run <arquivo de teste da tarefa>` |
| Full | Fim de fase React | `npm test` |
| Build | Tarefa só de schema/config, e fim de cada fase | `npm run build` + `cargo test --manifest-path src-tauri/Cargo.toml` |

---

## Execution Plan

### Phase 1: Backend

```
T1 → T2
T2 → T4
T3 → T4
T4 → T5
```

### Phase 2: Painel de Configurações

```
T6 → T7
```

### Phase 3: Wizard e boot

```
T8 → T9
```

---

## Task Breakdown

### T1: Migração da tabela `provider_prefs` ✅

**What**: Cria a tabela `provider_prefs(provider_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, found_in TEXT NOT NULL DEFAULT '[]')`, sem seed.
**Where**: `src-tauri/src/db/migrations/014_provider_prefs.sql`
**Depends on**: None
**Reuses**: padrão de `004_agent_prefs.sql` (tabela sem seed)
**Requirement**: PROV-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Arquivo criado com o marcador `-- SPEC: providers-panel (PROV-10)`
- [ ] Registrado como `(14, include_str!(...))` em `src-tauri/src/db/mod.rs`
- [ ] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: none
**Gate**: build

---

### T2: Módulo de persistência `db::provider_prefs` ✅

**What**: `ProviderPref { id, enabled, found_in }` (serde camelCase) com `get_all`, `replace_all` e `set_enabled`, mais testes de round-trip.
**Where**: `src-tauri/src/db/provider_prefs.rs`
**Depends on**: T1
**Reuses**: `src-tauri/src/db/quota_prefs.rs` (par get/set, JSON num campo só)
**Requirement**: PROV-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `pub mod provider_prefs;` em `src-tauri/src/db/mod.rs`
- [ ] Teste: `replace_all` seguido de `get_all` devolve o mesmo conjunto, com `found_in` preservado
- [ ] Teste: `set_enabled` altera só a linha pedida e `get_all` reflete (PROV-05)
- [ ] Teste: `get_all` num banco recém-migrado devolve vetor vazio
- [ ] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: unit
**Gate**: quick

---

### T3: Invalidação do cache de sondagem WSL ✅

**What**: `pub fn clear_wsl_probe_cache()` que esvazia `wsl_probe_cache`, mais teste provando que a sonda roda de novo depois dela.
**Where**: `src-tauri/src/agents/catalog.rs`
**Depends on**: None
**Reuses**: `wsl_probe_cache()` / `wsl_found_with` já existentes no arquivo
**Requirement**: PROV-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Marcador `SPEC:` do arquivo atualizado com `providers-panel (PROV-07)`
- [ ] Teste: com cache injetado, duas chamadas contam 1 sonda; após limpar o mapa, a terceira conta 2
- [ ] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: unit
**Gate**: quick

---

### T4: `merge_scan` e os comandos de provedor ✅

**What**: `merge_scan` (puro) mais `provider_prefs_get`, `provider_scan` e `provider_enabled_set`, com testes 1:1 de PROV-12/PROV-13.
**Where**: `src-tauri/src/commands/providers.rs`
**Depends on**: T2, T3
**Reuses**: `shells::list::list_profiles`, `agents::catalog::detect_installed_in`, `commands::agents::entries_for` como referência de forma
**Requirement**: PROV-06, PROV-09, PROV-10, PROV-12, PROV-13

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `pub mod providers;` em `src-tauri/src/commands/mod.rs`
- [ ] `provider_scan` limpa o cache antes de sondar (PROV-07) e grava via `replace_all`
- [ ] `provider_prefs_get` varre e persiste quando `get_all` volta vazio (PROV-10)
- [ ] Teste: achado sem registro anterior → `enabled: true` (PROV-12)
- [ ] Teste: achado com registro anterior desabilitado → segue desabilitado
- [ ] Teste: registrado habilitado e não achado → `enabled: false`, `found_in: []` (PROV-13)
- [ ] Teste: saída sempre na ordem do catálogo, uma entrada por provedor
- [ ] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: unit
**Gate**: quick

---

### T5: Registrar os comandos no `invoke_handler` ✅

**What**: Acrescenta `provider_prefs_get`, `provider_scan` e `provider_enabled_set` ao `invoke_handler!`.
**Where**: `src-tauri/src/lib.rs`
**Depends on**: T4
**Reuses**: bloco de registro existente (`commands::agents::*`, `commands::quota::*`)
**Requirement**: PROV-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Os três comandos aparecem no `invoke_handler!`
- [ ] Marcador `SPEC:` localizado acima do bloco, conforme a exceção da regra do repo para arquivos compartilhados
- [ ] Gate check passes: `cargo test --manifest-path src-tauri/Cargo.toml`

**Tests**: none
**Gate**: build

---

### T6: Painel de Provedores em lista ✅

**What**: Reescreve o componente como lista (ícone · rótulos de detecção · switch) com botão "Atualizar", na identidade visual de `ProjectsPanel`.
**Where**: `src/routes/settings/AgentPanel.tsx`
**Depends on**: None
**Reuses**: `ProjectsPanel.tsx` (estilos e estrutura de cabeçalho/linha), `ProviderIcon` + `providerMeta` (`components/shell/ProviderIcon.tsx`)
**Requirement**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Uma linha por provedor recebido, na ordem recebida, com `ProviderIcon` e switch (PROV-01)
- [ ] Centro mostra os rótulos quando `foundIn.length > 1` e fica vazio quando `=== 1` (PROV-02, PROV-03)
- [ ] `foundIn` vazio → switch desligado e `disabled`, linha marcada como não encontrada (PROV-04)
- [ ] Botão "Atualizar" desabilitado enquanto `refreshing` (PROV-08)
- [ ] Testes cobrindo os quatro itens acima e a lista vazia
- [ ] `AgentPanel.test.tsx` atualizado (a grade de cards e o `onSelectDefault` saíram)
- [ ] Gate check passes: `npx vitest run src/routes/settings/AgentPanel.test.tsx`

**Tests**: unit
**Gate**: quick

---

### T7: Wiring da seção Provedores ✅

**What**: Carrega `provider_prefs_get` ao abrir a seção, chama `provider_scan` no botão e `provider_enabled_set` no switch.
**Where**: `src/routes/settings/SettingsShell.tsx`
**Depends on**: T6
**Reuses**: o próprio padrão de `quota_prefs_get`/`quota_prefs_set` deste arquivo (efeito por seção + persistência imediata)
**Requirement**: PROV-05, PROV-06, PROV-08, PROV-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Abrir a seção chama `provider_prefs_get` e não `provider_scan` (PROV-09)
- [ ] "Atualizar" chama `provider_scan` e repõe a lista (PROV-06)
- [ ] Alternar o switch chama `provider_enabled_set` e mantém o valor em tela (PROV-05)
- [ ] Falha de leitura registra no console e deixa a lista vazia, sem derrubar o painel (edge case da spec)
- [ ] `agents`/`installedIds`/`defaultAgentId` órfãos deste arquivo removidos
- [ ] `SettingsShell.test.tsx` atualizado
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: full

---

### T8: Wizard oferece só o habilitado ✅

**What**: Remove o `SELECTABLE` hardcoded e passa a habilitar o ladrilho por `enabledIds` ∩ `installedIds`; `PaneWizard` repassa a prop.
**Where**: `src/components/terminal/AgentStep.tsx`
**Depends on**: None
**Reuses**: `installedIds` já existente na assinatura do componente
**Requirement**: PROV-14, PROV-15, PROV-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `SELECTABLE` e a legenda "em breve" saem; o ladrilho habilita por `enabledIds.has(id) && installedIds.has(id)` (PROV-14)
- [ ] Provedor instalado mas desabilitado renderiza `disabled` (PROV-15)
- [ ] Ladrilho "Terminal" segue habilitado com `enabledIds` vazio (PROV-16)
- [ ] `PaneWizard.tsx` repassa `enabledIds` sem decidir nada
- [ ] `AgentStep.test.tsx` e `PaneWizard.test.tsx` atualizados
- [ ] Gate check passes: `npx vitest run src/components/terminal/AgentStep.test.tsx src/components/terminal/PaneWizard.test.tsx`

**Tests**: unit
**Gate**: quick

---

### T9: Varredura no boot e `enabledIds` no wizard ✅

**What**: `provider_scan` no boot, antes de `agent_catalog_all`, e o conjunto de ids habilitados descendo até o wizard.
**Where**: `src/App.tsx`
**Depends on**: T8
**Reuses**: o efeito de boot que já chama `agent_catalog_all`
**Requirement**: PROV-11, PROV-14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Boot chama `provider_scan` e só depois `agent_catalog_all` (PROV-11, ordem exigida pelo cache)
- [ ] `enabledIds` chega a `PaneWizard`
- [ ] Falha de `provider_scan` não prende o overlay de boot nem impede `agent_catalog_all`
- [ ] `App.test.tsx` atualizado com o novo `invoke`
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: full

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 → T2 ↘
                   T4 → T5
          T3 ─────↗
Phase 2:  T6 → T7
Phase 3:  T8 → T9
```

As fases 2 e 3 dependem da fase 1 inteira (os comandos registrados em T5); a ordem das fases já
carrega isso, então nenhum `Depends on` cruza fase.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 arquivo SQL | ✅ Granular |
| T2 | 1 módulo (3 funções coesas, mesmo arquivo) | ✅ Granular |
| T3 | 1 função | ✅ Granular |
| T4 | 1 módulo de comandos (merge + 3 wrappers finos) | ⚠️ OK - coeso, mesmo arquivo |
| T5 | 1 bloco de registro | ✅ Granular |
| T6 | 1 componente | ✅ Granular |
| T7 | 1 wiring de seção | ✅ Granular |
| T8 | 1 componente (+ repasse de prop) | ✅ Granular |
| T9 | 1 efeito de boot | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | (início da fase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | (sem seta de entrada) | ✅ Match |
| T4 | T2, T3 | T2 → T4, T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | (início da fase 2) | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | None | (início da fase 3) | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |

## Test Co-location Validation

| Task | Layer | Matrix Requires | Task Declares | Status |
| ---- | ----- | --------------- | ------------- | ------ |
| T1 | Migration SQL | none | none | ✅ |
| T2 | Persistência Rust | unit | unit | ✅ |
| T3 | Cache Rust | unit | unit | ✅ |
| T4 | Regra Rust pura | unit | unit | ✅ |
| T5 | Config/registro | none | none | ✅ |
| T6 | Componente React | unit | unit | ✅ |
| T7 | Wiring React | unit | unit | ✅ |
| T8 | Componente React | unit | unit | ✅ |
| T9 | Wiring React | unit | unit | ✅ |
