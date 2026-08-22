# Validation — quota-token-refresh

**Result**: PASS — one criterion (QTR-03's atomicity under a real concurrent writer) verified by construction and unit test rather than by a race experiment; listed under "Not verified".

Standalone verification pass, run after implementation. Author and verifier are the same session — this session may not spawn sub-agents unless asked, so the independence the skill's Verifier provides is missing here. Stated rather than hidden.

Diff range: working tree against `fc460d7`. Files: `src-tauri/src/quota.rs`, `src-tauri/src/shells/home.rs` (marker only), `src-tauri/Cargo.toml` (tokio `sync` feature), `src/components/shell/QuotaIndicator.tsx`, `src/components/shell/QuotaIndicator.test.tsx`.

## Per-requirement evidence

| ID | Criterion | Evidence | Verdict |
| -- | --------- | -------- | ------- |
| QTR-01 | Expired token is exchanged before the usage request | `quota.rs:728` calls `ensure_fresh` before `fetch_cached_with`; the decision is `needs_refresh` (`quota.rs:446`) against `EXPIRY_SKEW_MS` (`quota.rs:42`). Tests `token_vencido_com_refresh_precisa_renovar`, `token_que_vence_dentro_da_margem_precisa_renovar`, `renova_e_grava_quando_o_token_esta_vencido`. | PASS |
| QTR-02 | New tokens written into the same file, other fields preserved | `apply_refreshed` (`quota.rs:490`) clones the original JSON and inserts only the three OAuth keys; the path comes from `locate_credential` (`quota.rs:416`), the same one that was read. Tests `apply_troca_os_tres_campos_e_preserva_o_resto` (asserts `scopes`, `subscriptionType` and an unknown top-level key survive) and the path assertion in `renova_e_grava_quando_o_token_esta_vencido`. | PASS |
| QTR-03 | Atomic write: temp in the same directory, then rename | `write_credential_atomic` (`quota.rs:515`) writes `.credentials.json.swarmdeck-tmp`, `sync_all`s, copies the original's unix mode, then `fs::rename`. Test `escrita_atomica_substitui_o_arquivo_e_limpa_o_temporario` asserts the content replaced and no temp left. | PASS (single-writer; see "Not verified") |
| QTR-04 | A valid token contacts nothing and writes nothing | Early return in `ensure_fresh_with` (`quota.rs:562`). Test `token_valido_nao_toca_rede_nem_disco` passes an HTTP closure that panics if called. | PASS |
| QTR-05 | Failed exchange leaves the file untouched | Two guards in `ensure_fresh_with` (`quota.rs:562`): transport `Err` and a body without `access_token` (`parse_refresh_response`, `quota.rs:459`). Tests `troca_que_falha_nao_grava`, `resposta_sem_access_token_nao_grava`, `parse_recusa_corpo_sem_access_token_utilizavel`. | PASS |
| QTR-06 | No `refreshToken` → skip | `needs_refresh` requires `credential.refresh.is_some()` (`quota.rs:446`); `parse_credential` (`quota.rs:212`) only fills it for a non-empty string. Tests `sem_refresh_token_nao_renova_mesmo_vencido`, `parse_credential_le_refresh_e_expiracao`. | PASS |
| QTR-07 | No credential anywhere → `no_credential`, no exchange | `ensure_fresh_with` returns on `locate() == None` (`quota.rs:562`); the existing `fetch_with` still maps that to `QuotaError::NoCredential`. Test `sem_credencial_nao_toca_rede_nem_disco` (HTTP closure panics if called). | PASS |
| QTR-08 | Concurrent fetches never refresh twice | `refresh_lock()` (`quota.rs:626`), a `tokio::sync::Mutex` held across the whole `ensure_fresh` (`quota.rs:634`). | PASS (code inspection — a two-task race is not exercised by a test; the lock is held for the entire critical section, which is what the requirement asks) |
| QTR-09 | Tokens never logged, emitted or serialized | `RefreshToken` (`quota.rs:155`) mirrors `AccessToken`: manual redacted `Debug`, no `Serialize`. The only log line in the new code prints an `io::Error`, which carries path and permission, never a token. Tests `debug_da_credencial_nao_mostra_token` and the pre-existing `nenhuma_variante_de_erro_contem_o_valor_do_token_no_debug`. | PASS |
| QTR-10 | 30 s retry while `no_credential`/`unauthorized` | `RETRY_MS`/`RETRY_STATES` (`QuotaIndicator.tsx:65`, `:70`) and the effect at `QuotaIndicator.tsx:174`. Test `no_credential e unauthorized insistem a cada 30 segundos` (both states, `force: true` asserted). | PASS |
| QTR-11 | Leaving those states stops the 30 s retry | The effect is keyed on `needsFastRetry` (`QuotaIndicator.tsx:168`, `:187`), so React tears the interval down. Test `estado ok nao insiste a cada 30 segundos`. | PASS |
| QTR-12 | The 5-minute cadence survives | Separate effect; the original interval is untouched. Test `o tick de 5 minutos sobrevive ao timer rapido` asserts the step crossing the 5-minute mark carries **two** fetches. | PASS |
| QTR-13 | Missing `expiresAt` → no refresh | `needs_refresh` requires `expires_at_ms.is_some_and(...)` (`quota.rs:446`). Test `sem_expires_at_nao_renova`. | PASS |
| QTR-14 | Response without a new `refreshToken` keeps the old one | The `if let Some` guard in `apply_refreshed` (`quota.rs:490`). Test `apply_sem_refresh_novo_preserva_o_do_arquivo`. | PASS |
| QTR-15 | Write failure logged, non-fatal | The `Err` arm of `ensure_fresh_with` (`quota.rs:562`) returns `false` after an `eprintln!`. Test `escrita_que_falha_devolve_false`. | PASS |

## Spec-anchored outcome check

The expiry tests assert the boundary the spec names (`now + 60 s` counts as expired, `now + 60 s + 1 ms` does not) rather than whatever `needs_refresh` happens to compute. `parse_usa_expires_in_em_segundos` asserts `NOW + 28_800_000` from `expires_in: 28800` — the conversion done by hand, not read back from the code. `apply_troca_os_tres_campos_e_preserva_o_resto` asserts the surviving fields by name, including a key (`outraChaveQueNaoConhecemos`) the app has no knowledge of, which is what QTR-02's "every other field" actually means.

No spec-precision gap survived this pass. One was closed while writing the spec: "expired" was made explicit as `expiresAt <= now + 60 s` instead of "in the past".

## Discrimination sensor

Mutations applied one at a time to a copy of `quota.rs` in the scratchpad, restoring the file after each. Baseline: 47 tests passing under the `quota::` filter.

| Mutation | Result |
| -------- | ------ |
| Drop the `refresh.is_some()` condition from `needs_refresh` | killed |
| `expires <= now + EXPIRY_SKEW_MS` → `expires <= now` (no margin) | killed |
| Remove the `!needs_refresh` early return (refresh even when valid) | killed |
| Accept an empty `access_token` in `parse_refresh_response` | killed |
| `expires_in` converted without adding `now_ms` | killed |
| `apply_refreshed` always writes `refreshToken`, blanking it when absent | killed |
| Write failure reported as success (`true` instead of `false`) | killed |
| `fs::rename(&temp, path)` → `fs::rename(path, &temp)` | killed |

8 mutations, 8 killed, no survivors. `git status --porcelain` after the sensor matched the pre-sensor state.

## Test run

- `cargo test` in `src-tauri`: **302 passed, 1 failed**. The failure is `terminal::manager::tests::build_command_wsl_inclui_id_do_terminal_como_entrada_de_env`, pre-existing and unrelated (`terminal/manager.rs` is untouched by this diff; it belongs to `wsl-terminal-profile`/WSLP-09).
- `cargo clippy --all-targets -- -D warnings`: clean. `cargo fmt`: applied.
- `npx tsc --noEmit`: clean. `npx vitest run`: **444 passed, 35 files**.

## Not verified

- The refresh against the real endpoint. `OAUTH_TOKEN_URL` and `OAUTH_CLIENT_ID` come from the CLI's issue tracker, not from a documented contract, and no live exchange was performed. If either is wrong the request fails and QTR-05 turns it into a no-op — the same behavior as before this feature, never a lost credential. **This is the one thing that needs a real machine to confirm.**
- QTR-03 against a genuinely concurrent writer (the `claude` CLI refreshing at the same instant). The spec's Out of Scope already records that refresh-token rotation makes one of the two writers lose regardless.
- QTR-08 under real contention; the lock is verified by reading, not by a race test.
