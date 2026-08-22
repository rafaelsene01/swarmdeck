# Providers Panel — Validation

**Verdict:** PASS
**Escopo verificado:** T1–T9 (`.specs/features/providers-panel/tasks.md`), 16 requisitos PROV-01…PROV-16.
**Diff range:** working tree contra `fc460d7` (nenhum commit criado — ver "Pendências").
**Gates:** `cargo test --manifest-path src-tauri/Cargo.toml` → 315 passed, 0 failed. `npm run build` (tsc --noEmit + vite build) → exit 0. `npx vitest run` por arquivo tocado → AgentPanel 9/9, SettingsShell 28/28, AgentStep 19/19, App 88/88.

## Evidência por requisito

| Req | Evidência (`file:line` + asserção) | Resultado esperado pela spec | Coberto |
| --- | --- | --- | --- |
| PROV-01 | `src/routes/settings/AgentPanel.test.tsx:30` — `expect(rendered).toEqual(PROVIDERS.map((provider) => provider.id))`; ordem do catálogo garantida no Rust em `src-tauri/src/commands/providers.rs:198` (`merge_devolve_o_catalogo_inteiro_na_ordem`) e `:257` (`in_catalog_order_completa_provedor_sem_linha_gravada`) | uma linha por provedor, na ordem do catálogo, com ícone e switch | ✅ |
| PROV-02 | `src/routes/settings/AgentPanel.test.tsx:45` — `expect(places).toEqual(['Windows', 'Ubuntu-24.04'])` | os rótulos de todos os perfis onde foi achado | ✅ |
| PROV-03 | `src/routes/settings/AgentPanel.test.tsx:52,54` — `expect(row('codex-cli').querySelectorAll('.providers-panel__place')).toHaveLength(0)` | centro vazio com um perfil só | ✅ |
| PROV-04 | `src/routes/settings/AgentPanel.test.tsx:63` — `expect(missing.disabled).toBe(true)` + `:65` `toHaveTextContent('Não encontrado em nenhum terminal')`; e `:79-80` para `enabled: true` gravado sem locais | switch desligado e desabilitado; linha marcada | ✅ |
| PROV-05 | `src/routes/settings/AgentPanel.test.tsx:89` — `expect(onToggle).toHaveBeenCalledWith('claude-code', false)`; persistência em `src/routes/settings/SettingsShell.test.tsx:107` — `expect(invokeMock).toHaveBeenCalledWith('provider_enabled_set', { id: 'claude-code', enabled: false })`; round-trip no banco em `src-tauri/src/db/provider_prefs.rs:137` (`set_enabled_altera_so_a_linha_pedida`) | novo valor persiste e volta na leitura seguinte | ✅ |
| PROV-06 | `src/routes/settings/SettingsShell.test.tsx:87` — `expect(invokeMock).toHaveBeenCalledWith('provider_scan')`; a varredura em si é `probe_all_profiles` sobre `list_profiles` × `detect_installed_in` (`src-tauri/src/commands/providers.rs:33-51`) | sonda cada perfil por cada provedor e grava | ✅ |
| PROV-07 | `src-tauri/src/agents/catalog.rs:588` — `assert_eq!(calls.load(Ordering::SeqCst), 2, "depois do clear a sonda roda de novo")` | cache descartado antes de sondar | ✅ |
| PROV-08 | `src/routes/settings/AgentPanel.test.tsx:110` — `expect(button).toBeDisabled()` com `refreshing` | botão travado durante a varredura | ✅ |
| PROV-09 | `src/routes/settings/SettingsShell.test.tsx:71` — `expect(invokeMock).not.toHaveBeenCalledWith('provider_scan')` ao abrir a seção com dados | abre com o salvo, sem sondar | ✅ |
| PROV-10 | `src-tauri/src/db/provider_prefs.rs:105` — `assert_eq!(get_all(db.conn()).unwrap(), Vec::new())` num banco recém-migrado, que é a condição que `provider_prefs_get` (`src-tauri/src/commands/providers.rs:137-145`) usa para varrer | tabela vazia dispara varredura antes de responder | ⚠️ Spec-precision gap: o *ramo* `stored.is_empty() → provider_scan` não tem teste próprio — `provider_scan` exige `State<Mutex<Db>>` do Tauri, que este crate não instancia em teste (nenhum `#[tauri::command]` do repo é testado por dentro). A pré-condição está provada; a ramificação é uma linha lida por inspeção. |
| PROV-11 | `src/App.test.tsx:242-243` — `expect(commands.indexOf('provider_scan')).toBeLessThan(commands.indexOf('agent_catalog_all'))` | varredura completa a cada abertura, antes do catálogo | ✅ |
| PROV-12 | `src-tauri/src/commands/providers.rs:215` — `assert!(claude.enabled)` sem registro anterior | achado sem registro nasce habilitado | ✅ |
| PROV-13 | `src-tauri/src/commands/providers.rs:239-240` — `assert!(!claude.enabled)` + `assert_eq!(claude.found_in, Vec::<String>::new())` | habilitado que sumiu é desligado e perde os locais | ✅ |
| PROV-14 | `src/components/terminal/AgentStep.test.tsx:56` — todo provedor habilitado+instalado `toBeEnabled()` | ladrilho clicável só com habilitado ∩ instalado | ✅ |
| PROV-15 | `src/components/terminal/AgentStep.test.tsx:66` — `expect(screen.getByRole('button', { name: 'Codex CLI' })).toBeDisabled()` com `enabledIds` sem ele; motivo em `:69` (`title` = "Codex CLI · desabilitado em Configurações › Provedores") | instalado mas desligado renderiza desabilitado | ✅ |
| PROV-16 | `src/components/terminal/AgentStep.test.tsx:78` — `expect(plainButton()).toBeEnabled()` com `enabledIds` vazio | "Terminal" sempre habilitado | ✅ |

## Casos de borda da spec

| Caso | Evidência | Coberto |
| ---- | --------- | ------- |
| `wsl.exe` ausente/falha → só o host | `src-tauri/src/shells/list.rs:106-110` (`list_profiles` devolve só `Host` sem erro), coberto pelos testes existentes de `shells::list` | ✅ (herdado) |
| Nenhum provedor em nenhum perfil | `src-tauri/src/commands/providers.rs:245` — `nada_achado_deixa_tudo_desligado_sem_locais`; lado UI em `AgentStep.test.tsx:78` | ✅ |
| Leitura que falha no frontend | `src/routes/settings/SettingsShell.test.tsx:130` — lista vazia + `expect(consoleError).toHaveBeenCalled()`; boot em `src/App.test.tsx:257` | ✅ |
| Gravação que falha | erro sobe como `Err(String)` de `provider_scan`/`provider_enabled_set` e o painel mantém a lista em tela | ⚠️ Verificado por inspeção (`src-tauri/src/commands/providers.rs:128,152`); sem teste, mesma limitação de `State<Mutex<Db>>` do PROV-10 |

## Sensor de discriminação

Mutações aplicadas na árvore com backup fora dela e restauradas em seguida (`diff -q` confirmou byte-a-byte após cada uma):

| # | Mutação | Resultado |
| - | ------- | --------- |
| M1 | `AgentPanel.tsx`: `foundIn.length > 1` → `> 0` | morto — 1 falha (PROV-03) |
| M2 | `AgentPanel.tsx`: `checked={found && provider.enabled}` → `checked={provider.enabled}` | morto — 1 falha (PROV-04) |
| M3 | `AgentStep.tsx`: `enabledIds.has(id) && installedIds.has(id)` → `installedIds.has(id)` | morto — 3 falhas (PROV-14/15) |
| M4 | `providers.rs`: `merge_scan` `.map_or(true, …)` → `.map_or(false, …)` | morto — `achado_sem_registro_anterior_nasce_habilitado` FAILED |

4 mutantes, 4 mortos. Nenhum sobreviveu.

## Pendências

- **Commits atômicos não criados.** O ambiente negou a permissão de `git commit`; todo o trabalho está na árvore, não versionado. As nove tasks estão marcadas em `tasks.md`, mas os commits por task previstos pelo protocolo ficaram para uma autorização explícita.
- **`agent_default` / `agents::prefs` / tabela `agent_prefs`** seguem no Rust sem chamador de frontend (AD-036). Nada quebra; é código morto conhecido.
