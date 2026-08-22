# quota-provider-source

**Prefix**: `QSRC` · **Status**: implemented · **Opened**: 2026-08-21

## Problem

Configurações › Geral, bloco "Popover do hover", lists the whole Rust catalog:
`GeneralPanel` renders one row per persisted pref plus one per `agentIds`
entry, locking whoever has no consumption endpoint (AD-033). So a machine
where only `claude` is installed still shows five rows, four of them useless.

The scan that already knows better is next door: `provider_prefs.found_in`
(PROV-02) holds the label of every terminal profile where each CLI was found.
Geral ignores it.

Second gap: the quota fetch does not let the user say *which* terminal it
should read the credential from. `quota::credential_candidates` tries the
default profile and then every other profile in turn (QUOTA-15) — which is
right when nothing was chosen and wrong once the user has an opinion, because
host and distro can hold different accounts.

## Requirements

| ID | Requirement |
| --- | --- |
| QSRC-01 | Configurações › Geral SHALL list only providers the scan found — `found_in` non-empty — in catalog order. A provider found nowhere SHALL NOT render a row. |
| QSRC-02 | A listed provider without a real consumption endpoint (`providerMeta().hasQuota === false`) SHALL keep the locked rendering it has today: switch off and disabled, "sem cota" hint. AD-033 stands. |
| QSRC-03 | WHERE a provider was found in more than one terminal profile, the row SHALL render, in its center, one selectable option per profile, exactly one of them marked. WHERE it was found in a single profile, the row SHALL render no selector. |
| QSRC-04 | The marked profile SHALL persist per provider, inside the existing `quota_prefs.providers` JSON (`profileId`), and SHALL survive a reopen of the window. |
| QSRC-05 | WHERE a provider has a persisted `profileId`, the quota fetch SHALL read the credential only from that profile. IF no credential exists there, THEN the indicator SHALL report the credential-missing state instead of reading another profile's. |
| QSRC-06 | WHERE a provider has no persisted `profileId`, the fetch SHALL keep today's candidate chain — default profile first, then the remaining available profiles (QUOTA-15). Not choosing must not regress the Windows-host / WSL-credential case. |
| QSRC-07 | The selector SHALL pair each `found_in` label with the terminal profile of the same label from the catalog the app already loaded (`agent_catalog_all`: `profileId` + `label`), and use its `profileId` as the persisted value. A label with no match SHALL NOT become an option. |
| QSRC-08 | An enabled provider is what the ring's popover lists, what the 5-minute poll refreshes, and what the boot fetch asks for. Disabling one SHALL remove it from all three. |
| QSRC-09 | Toggling the switch of a provider SHALL NOT change its persisted `profileId`. |

## Non-goals

- Giving `codex-cli`/`opencode` a quota endpoint. They stay locked (QSRC-02) until one exists.
- A per-profile switch. The switch is per provider, as in Configurações › Provedores.
- Changing `provider_prefs.found_in` to carry profile ids. QSRC-07 pairs by label instead, so no data migration and no change to the Provedores panel.
- Reordering rows. The order is the catalog's, as today.

## Revokes

| Requirement | Feature | Why |
| --- | --- | --- |
| QUOTA-31 | quota-indicator | Mandated listing the whole catalog with the missing providers locked. QSRC-01 replaces it: a provider that exists in no terminal has no quota to show. Revoked by AD-044. |
| QUOTA-15 (partial) | quota-indicator | The candidate chain stays as written **only while nothing is chosen** (QSRC-06). With a chosen profile, QSRC-05 makes it a single candidate. Revoked in part by AD-044. |

## Traceability

| Requirement | Implementation | Check |
| --- | --- | --- |
| QSRC-01 | `src/routes/settings/GeneralPanel.tsx` (`rows`), `src/routes/settings/SettingsShell.tsx` (passes `providers`) | `GeneralPanel.test.tsx` — "lista só os provedores encontrados na varredura" |
| QSRC-02 | `src/routes/settings/GeneralPanel.tsx` (`locked`) | `GeneralPanel.test.tsx` — "provedor achado sem cota segue travado" |
| QSRC-03 | `src/routes/settings/GeneralPanel.tsx` (`profileOptions`) | `GeneralPanel.test.tsx` — "achado em dois terminais mostra o seletor", "achado em um só não mostra seletor" |
| QSRC-04 | `src-tauri/src/db/quota_prefs.rs` (`QuotaProvider::profile_id`), `GeneralPanel.tsx` (`chooseProfile`) | `quota_prefs.rs` — `set_seguido_de_get_preserva_o_profile_id`; `GeneralPanel.test.tsx` — "marcar um terminal persiste a escolha" |
| QSRC-05 | `src-tauri/src/quota.rs` (`credential_candidates`), `src-tauri/src/commands/quota.rs` | `quota.rs` — `candidatos_com_escolha_explicita_tem_so_o_escolhido` |
| QSRC-06 | `src-tauri/src/quota.rs` (`credential_candidates`) | `quota.rs` — `candidatos_sem_escolha_mantem_padrao_e_demais` |
| QSRC-07 | `src/routes/settings/GeneralPanel.tsx` (`profileOptions`) | `GeneralPanel.test.tsx` — "rótulo sem perfil correspondente não vira opção" |
| QSRC-08 | `src/components/shell/QuotaIndicator.tsx` (`listedProviderIds`, `POLL_MS`), `src/App.tsx` boot fetch | `QuotaIndicator.test.tsx` — existing popover/poll coverage |
| QSRC-09 | `src/routes/settings/GeneralPanel.tsx` (`toggleProvider`) | `GeneralPanel.test.tsx` — "alternar o switch preserva o terminal marcado" |
