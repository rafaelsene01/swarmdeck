# Providers Panel Design

## Decisão central

A varredura já existe. `commands::agents::agent_catalog_all` (BOOT-10) percorre `shells::list::list_profiles()` e roda `agents::catalog::detect_installed_in` em cada perfil — exatamente o dado "onde este provedor foi encontrado". O que falta é **persistir** aquilo e pendurar um `enabled` em cada provedor. Esta feature não escreve detecção nova: acrescenta uma tabela, um merge puro e três comandos, e troca a UI.

## Componentes

| Camada | Arquivo | Papel |
| ------ | ------- | ----- |
| Schema | `src-tauri/src/db/migrations/014_provider_prefs.sql` | Uma linha por provedor: `provider_id` (PK), `enabled`, `found_in` (JSON de rótulos). Sem seed — tabela vazia significa "nunca varreu" (PROV-10). |
| Persistência | `src-tauri/src/db/provider_prefs.rs` | `ProviderPref` (serde camelCase, é o payload de IPC), `get_all`, `replace_all`, `set_enabled`. Mesmo par `get`/`set` de `db::quota_prefs`. |
| Invalidação | `src-tauri/src/agents/catalog.rs` | `clear_wsl_probe_cache()` — o cache por distro vive o processo inteiro (PROV-07); sem isso "Atualizar" devolveria a resposta antiga. |
| Regra | `src-tauri/src/commands/providers.rs` | `merge_scan` (núcleo puro: catálogo × registro anterior × achados → novo estado) e os comandos `provider_prefs_get`, `provider_scan`, `provider_enabled_set`. |
| UI | `src/routes/settings/AgentPanel.tsx` | Lista no lugar da grade de cards: ícone, rótulos de detecção, switch, botão "Atualizar". Apresentacional, como `ProjectsPanel`. |
| Wiring | `src/routes/settings/SettingsShell.tsx` | Carrega e persiste as prefs da seção Provedores. |
| Boot | `src/App.tsx` | `provider_scan` antes de `agent_catalog_all` (PROV-11) e `enabledIds` para o wizard. |
| Wizard | `src/components/terminal/AgentStep.tsx` | `SELECTABLE` hardcoded sai; habilitado = `enabledIds` ∩ `installedIds` (PROV-14, PROV-15). |

## Fluxo

```
boot (App.tsx)
  └─ provider_scan            → limpa cache, sonda cada perfil, merge, grava   → ProviderPref[]
  └─ agent_catalog_all        → lê do cache quente (custo ~0)                  → ProfileCatalog

Configurações › Provedores
  └─ provider_prefs_get       → lê o salvo; varre só se a tabela estiver vazia → ProviderPref[]
  └─ [Atualizar]  provider_scan
  └─ [switch]     provider_enabled_set(id, enabled)
```

`provider_scan` roda **antes** de `agent_catalog_all` de propósito: ele invalida o cache de sondagem, então a ordem inversa faria o boot sondar cada distro duas vezes.

## `merge_scan` — as regras, num lugar só

Entrada: catálogo (ordem de exibição), registro anterior, e os rótulos de perfil onde cada id foi achado.

| Situação | Resultado |
| -------- | --------- |
| Achado, sem registro anterior | `enabled: true` (PROV-12) |
| Achado, com registro anterior | preserva o `enabled` gravado |
| Não achado em nenhum perfil | `enabled: false`, `found_in: []` (PROV-13) — a UI trava o switch por `found_in` vazio (PROV-04) |

Saída sempre na ordem do catálogo, uma entrada por provedor — a UI nunca precisa completar buracos.

## O que sai

O clique-para-definir-padrão do painel (AGT-01/AGT-03/AGT-04) sai junto com a grade de cards: AD-035 já revogou a decisão que ele tomava. `agent_default` e `agents::prefs` continuam no Rust, sem chamador no frontend — remover a tabela e o comando é um diff que esta feature não precisa pagar, e está registrado como pendência em `STATE.md` (AD-036).

## Alternativas rejeitadas

- **Guardar o `ProfileCatalog` inteiro no banco.** Duplicaria `label`/`wsl1` de cada perfil numa segunda fonte que envelhece sozinha. Só os rótulos onde o provedor foi achado são guardados; o resto continua vindo de `list_profiles`.
- **Um switch por provedor por perfil.** Não foi pedido, e multiplica a tabela por distro.
- **Detectar por diretório de config (`~/.claude/*`).** Ver Out of Scope da spec: detectaria menos que a sonda atual.
