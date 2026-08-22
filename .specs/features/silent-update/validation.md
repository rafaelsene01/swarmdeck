# Silent Update — Validation Report (Independent Verifier)

**Verifier**: independent pass per `tlc-spec-driven` Execute step 9. Did not author the implementation.
**Diff range covered**: `cd9241d..93674b4` (merged into `master` as `4b0f749` mid-session — see note below).
**Date**: 2026-08-15

## Note on commit state

The task briefed this as an uncommitted working-tree diff (`git diff cd9241d`). Partway through
verification, `git status --porcelain` came back clean and `git log` showed the exact same 12-file
change set landed as commit `93674b43` ("Implement silent update functionality…"), folded into a
merge `4b0f749` that also carries an unrelated version bump (`CHANGELOG.md`, `Cargo.toml`,
`Cargo.lock`, `package.json`, `package-lock.json`). This was not done by this Verifier — no `git
commit` was run in this session, per repo policy. Confirmed via `git diff cd9241d 93674b4 --stat`
that the committed file set is byte-for-byte the same set of 12 files this report analyzes, so the
findings below stand unchanged. Diff-range references below use `cd9241d..93674b4` for precision.

## Overall verdict: **PASS with gaps**

The core mechanism (manifest fetch → confirm → download → verify → swap → registry) is solidly
implemented and well covered: 39/39 Rust unit tests for the `update` module pass, 21/21 frontend
tests pass, `cargo clippy --all-targets -- -D warnings` is clean, and all 27 `scripts/*.test.mjs`
tests pass. The discrimination sensor killed 4 of 5 injected faults on the first try; the fifth
(SILENT-19's "registry failure must not invalidate the update") survived, exposing a real,
previously undocumented test gap. There is also a stale `SPEC:` marker and a chunk of dead
compat code shipped past its stated expiry — both real, both fixable in minutes, neither one
breaks the feature at runtime.

Nothing here blocks shipping the feature to users; the app behaves per spec on the two P1 stories.
The gaps are quality-gate misses (docs and one missing test), not functional defects.

---

## Requirement traceability (28/28)

Evidence-or-zero: every row cites `file:line` and the exact assertion. "Inspection" rows are
requirements that are structural/negative claims (a function is *not* called anywhere) that no
unit test can express by itself — code was read to confirm, and where a positive test exists that
depends on the same structural fact, it's cited too.

| ID | Requirement (short) | Evidence | Verdict |
|----|---|---|---|
| SILENT-01 | Manifest read via one HTTP path, shared by display + apply | `manifest.rs:78` `fetch()` is the module's only `reqwest::` call; consumed by `check.rs:145` (`|| manifest::fetch(&endpoint_url)`) and `apply.rs:170` (same closure pattern). Verified by inspection — `grep reqwest:: src-tauri/src/update/*.rs` shows exactly 2 hits, `manifest.rs:79` (manifest GET) and `apply.rs:172` (artifact download, a different concern) | Covered |
| SILENT-02 | Confirmed apply downloads the platform artifact | `apply.rs:509-532` `caminho_feliz_baixa_aplica_a_troca_e_devolve_a_versao` — asserts `result.unwrap() == "0.2.0"` and `fs::read(&exe_path) == DATA` | Covered |
| SILENT-03 | No download before confirmation; `run` is the only download door | `apply.rs:459-483` `pasta_nao_gravavel_reprova_antes_do_download` (download fake panics if called) + `apply.rs:486-506` `chave_de_plataforma_ausente...sem_baixar` (same fake) + structural: `check_only_with` (`apply.rs:94-114`) takes no download parameter at all | Covered |
| SILENT-04 | Verify minisign signature over full bytes before writing any file | `swap.rs:311-328` `apply_swap_rejeita_bytes_truncados_pela_assinatura_do_arquivo_completo` — asserts `Err(SignatureMismatch)` and `fs::read(&exe_path)` unchanged | Covered |
| SILENT-05 | On valid signature, rename running exe to `.old` and write new bytes | `swap.rs:239-251` `apply_swap_com_sucesso_troca_o_executavel_e_preserva_o_old` — asserts new content at `exe_path` and old content at `exe_path.old` | Covered |
| SILENT-06 | No NSIS/MSI installer invoked on Windows apply path | Inspection: `apply.rs:148-182` `#[cfg(windows)] pub async fn run` never references `Update::install`; that call exists only in `#[cfg(not(windows))]` at `apply.rs:217`. No unit test possible (would require a live Windows install), but the `#[cfg]` split is structurally exclusive | Covered by inspection (not test-provable) |
| SILENT-07 | On app start, delete a stray `.old` | `swap.rs:281-289` `cleanup_stale_old_apaga_o_old_quando_existe` + wired at `lib.rs:70` inside `setup()` | Covered |
| SILENT-08 | Non-Windows: apply via `tauri-plugin-updater`, no file swap | Inspection only: `apply.rs:189-225` `#[cfg(not(windows))] pub async fn run` uses `UpdaterExt`/`Update::install`. **Zero test coverage** — `Update` has no public constructor and `tauri::test::mock_builder` fails on this stack (documented limitation, `design.md` §C4). Pre-existing constraint, not introduced by this feature | Covered by inspection; untestable by design (documented) |
| SILENT-09 | Show installed + latest even when equal | `check.rs:329-346` `versao_remota_igual_a_instalada_reporta_latest_sem_atualizacao` asserts `!has_update && latest == Some("0.1.0")`; `UpdateSettings.test.tsx:21-27` renders both numbers | Covered |
| SILENT-10 | installed ≥ latest ⇒ "already on latest", no apply button | `UpdateSettings.test.tsx:21-27` — `queryByRole('button', {name: 'Baixar e atualizar'})` is null | Covered |
| SILENT-11 | latest > installed ⇒ show apply action + new version | `UpdateSettings.test.tsx:29-40` — button present, click invokes `onApply` | Covered |
| SILENT-12 | On successful swap, show "Atualizado para X..." + Reiniciar agora | `UpdateSettings.test.tsx:56-63` + `SettingsShell.test.tsx:260-285` (`update_apply` → `applied` state end to end) | Covered |
| SILENT-13 | "Reiniciar agora" restarts the process | `SettingsShell.test.tsx:287-311` asserts `invoke` called with `'update_restart'`; `commands/update.rs:33-36` `update_restart` calls `app.restart()` (1-liner, no unit test possible without a live `AppHandle` — consistent with the rest of the crate's documented constraint) | Covered (wiring); restart call itself untestable by design |
| SILENT-14 | No background download, no install on window close | Structural: `grep -rn "CloseRequested\|on_window_event" src-tauri/src` shows only `windows/kanban.rs` and `windows/settings.rs` (unrelated windows) — none for `main`/update. `PendingUpdate`/`handle_close`/`check_and_download` absent from the crate (confirmed by grep) | Covered by inspection |
| SILENT-15 | Auto-check queries on boot + every 60 min, never downloads | `apply.rs:359-380` `run_loop_dispara_ciclo_no_boot_e_repete_no_intervalo` — event order `[cycle, wait:3600, cycle, wait:3600, cycle]`; `check_only_with` (`apply.rs:94-114`) has no download-capable parameter | Covered |
| SILENT-16 | Background query finding a new, unskipped version emits `update://available` | `apply.rs:314-326` `ciclo_com_versao_nova_emite_uma_vez` asserts `emitida == Some("0.2.0")` | Covered |
| SILENT-17 | Auto-check off ⇒ no background query; Settings display still works | `check.rs:311-326` `auto_check_desligado_nao_sai_para_a_rede` (fetch fake panics if called) proves the gate at `status_with`'s level, which `check_only` (`apply.rs:70-88`) delegates to via `status_gated`. **No direct end-to-end test of `check_only` itself with the flag off** — task doc's own SPEC_DEVIATION at `tasks.md:256` names this and argues it would be tautological; reasoning holds since `check_only` has no branch of its own to test (it's a straight pass-through). `update::status()` (`check.rs:125-127`) always passes `true`, so Settings keeps working regardless of the toggle | Covered (compositionally, honestly caveated) |
| SILENT-18 | Installed flavor: write `DisplayVersion` after a successful swap | `apply.rs:556-586` `flavor_instalado_aciona_o_gravador_de_registro` + `swap.rs:380-399` `grava_e_relê_display_version_numa_subchave_descartavel` (real `reg query` round-trip) | Covered |
| SILENT-19 | Registry write failure is logged, never invalidates the applied update | Code correctly implements this (`apply.rs:275-281`: `if let Err(err) = set_registry(...) { eprintln!(...) }` — falls through to `Ok(manifest.version)` regardless). **No test exercises `set_registry` returning `Err` inside `run_with`.** Confirmed by mutation: forcing a registry-Err path to instead early-return `Err` from `run_with` left all 39 tests green (see Discrimination Sensor #5 below) | **GAP — uncovered** |
| SILENT-20 | Release publishes `windows-x86_64-silent` entry with raw signed exe | `.github/workflows/release.yml` diff: new step "Executável cru assinado (Windows)" uploads `SwarmDeck_<version>_x64.exe(.sig)`; `finalize` job's new step calls `patch-latest-json.mjs --key windows-x86_64-silent`. Automated test coverage (`scripts/patch-latest-json.test.mjs`, all 27 passing) proves the `--key`-parametrized mechanism generically, using `windows-x86_64-portable` as its literal test key — not the literal string `windows-x86_64-silent`. `tasks.md` itself flags the real assurance as the "Verificação manual obrigatória" post-T12 checklist (manual, not automated) | Covered (mechanism); literal key string is only manually verified, as the task doc itself says |
| SILENT-21 | Missing platform-key entry ⇒ "não disponível para esta instalação", no download | `apply.rs:486-506` `chave_de_plataforma_ausente_devolve_platform_unavailable_sem_baixar` — `Err(PlatformUnavailable)`, download fake never invoked | Covered |
| SILENT-22 | Bad signature ⇒ abort, leave app folder untouched | `swap.rs:194-208` `verify_signature_rejeita_assinatura_adulterada` / `_dados_adulterados` | Covered |
| SILENT-23 | Write failure ⇒ restore `.old`, report failure | `swap.rs:257-278` `apply_swap_restaura_o_executavel_anterior_quando_a_escrita_falha` — asserts original content restored, no `.old` left over | Covered |
| SILENT-24 | Non-writable folder ⇒ abort before any byte is downloaded | `swap.rs:216-234` `apply_swap_reprova_pasta_somente_leitura_antes_de_verificar_assinatura` + `apply.rs:459-483` `pasta_nao_gravavel_reprova_antes_do_download` | Covered |
| SILENT-25 | Manifest query failure ⇒ show installed version + explicit failure message, no latest version | `check.rs:411-425` `erro_na_consulta_remota_nao_propaga_e_vira_latest_none` (`latest == None`) + `UpdateSettings.test.tsx:42-48` (`unavailable` state, no remote number shown) + `SettingsShell.test.tsx:247-258` | Covered |
| SILENT-26 | Interrupted download ⇒ signature rejects partial bytes, no file touched | `swap.rs:300-328` `apply_swap_rejeita_bytes_truncados_pela_assinatura_do_arquivo_completo` — literally simulates a truncated download (`&DATA[..2]`) | Covered |
| SILENT-27 | Background query failure ⇒ log, keep cadence | `apply.rs:342-354` `ciclo_com_falha_na_consulta_loga_e_nao_emite` + `apply.rs:384-398` `run_loop_sobrevive_a_ciclo_com_falha` (cadence continues) | Covered |
| SILENT-28 | Double-click on "Baixar e atualizar" while applying is ignored | `apply.rs:535-553` `segunda_chamada_com_applying_true_nao_baixa` — `Err(AlreadyApplying)`, `fetch_manifest` fake never called | Covered |

**Score: 26/28 fully covered by automated tests, 1/28 covered only by inspection (SILENT-08, a
documented pre-existing platform limitation), 1/28 genuinely uncovered (SILENT-19).**

---

## Discrimination sensor — 5 mutations, isolated scratch copy

Method: copied `Cargo.toml`, `Cargo.lock`, `package.json`, `src-tauri/`, `crates/` (1.5 MB total —
`target/` excluded, 27 GB, not needed) into
`%TEMP%\claude\...\scratchpad\mutant`, built and ran `cargo test --lib update:: --offline` there
(baseline: 39/39 pass, matches the real tree exactly). Mutated one behavior at a time, reran, then
reverted before the next mutation. Scratch directory deleted at the end; `git status --porcelain`
on the real repo confirmed clean throughout and after.

| # | Target | Mutation | Result |
|---|---|---|---|
| 1 | `swap.rs::verify_signature` — signature gates the swap | Bypass the Ed25519 check, always `Ok(())` | **Killed** — `verify_signature_rejeita_dados_adulterados` and `apply_swap_rejeita_bytes_truncados_pela_assinatura_do_arquivo_completo` fail |
| 2 | `apply.rs::run_with` — `Applying` double-click guard | `if false && *guard { return Err(AlreadyApplying) }` | **Killed** — `segunda_chamada_com_applying_true_nao_baixa` fails (`fetch_manifest não deveria ser chamado`) |
| 3 | `check.rs::status_with` — `has_update` computation | `remote_v > current_v` → `remote_v >= current_v` (off-by-one on equal versions) | **Killed** — `versao_remota_igual_a_instalada_reporta_latest_sem_atualizacao` fails (`!result.has_update`) |
| 4 | `apply.rs::run_with` — writability check ordering | `if false && !paths::is_writable(exe_dir) { return Err(NotWritable) }` (gate disabled) | **Killed** — `pasta_nao_gravavel_reprova_antes_do_download` fails (`download não deveria ser chamado`) |
| 5 | `apply.rs::run_with` — SILENT-19 registry-failure tolerance | `set_registry(...)?` instead of `if let Err(err) = set_registry(...) { eprintln!(...) }` — a registry failure now aborts the apply | **SURVIVED — 39/39 still green.** Confirms the SILENT-19 gap above is real, not a documentation nitpick: this exact regression would ship silently today |

4/5 mutations killed on the first try — the suite has real teeth on the highest-risk behaviors
(signature gate, double-click guard, version-comparison boundary, writability ordering). The one
survivor is a genuine, previously undocumented hole.

---

## SPEC_DEVIATION notes in `tasks.md` — audited

| Task | Claim | Audit |
|---|---|---|
| T3 | "1 novo" not written for `update_status` — passthrough, untestable without a real `AppHandle` | Accurate. `commands/update.rs:20-23` is a 1-line delegation with no internal branch; consistent with the rest of the crate's documented `AppHandle`-construction limitation |
| T6 | "auto-check off ⇒ no bg query" not tested at `check_only` itself, reused from `status_with`'s gate | Accurate, see SILENT-17 row above — traced the delegation chain (`check_only` → `status_gated` → `status_with`) and confirmed the gate really is tested one layer down, not merely asserted |
| T7 | `#[cfg(not(windows))]` branch needed because `release.yml` also builds `ubuntu-22.04` | Confirmed — `release.yml:155` has `os: ubuntu-22.04` in the build matrix; without the branch the crate wouldn't compile there |
| T10/T11 | Gated together because splitting the gate would crash at runtime (props reshaped) | Plausible and consistent with what shipped — both files changed together, and the full suite (21/21 frontend tests) passes as landed. Not independently re-verifiable without reverting one file, but nothing about it contradicts the evidence |

None of the four audited SPEC_DEVIATION notes hide a real gap — they're accurately described.

**However, two issues exist that `tasks.md` does *not* flag anywhere** (see Gaps below): the stale
`mod.rs` marker, and dead compat code in `check.rs` that was explicitly scoped ("até T6/T7
retirarem") but survived T6 and T7 landing.

---

## Test-count cross-check (tasks.md claims vs. actual file contents)

| File | Task claim | Actual `#[test]`/`it(` count | Match |
|---|---|---|---|
| `manifest.rs` | 4 | 4 | ✅ |
| `check.rs` | 7 existing + 3 new = 10 | 10 | ✅ |
| `swap.rs` | 9 (T4) + 2 (T5) = 11 | 11 | ✅ |
| `apply.rs` | 5 (T6) + 6 (T7) = 11 | 11 | ✅ |
| `commands/update.rs` | T8: "3 existentes + 1 novo" (implies 4) | 3 total | ❌ arithmetic error in the doc (T3 already claimed only 2 existing; 2+1=3 is what the file actually has) |
| `UpdateSettings.test.tsx` | 7 | 7 | ✅ |
| `SettingsShell.test.tsx` (Atualizações block) | 4 new | 4 | ✅ |

All actual Rust/TS test suites run and pass: `cargo test` → 39/39 (update module) and full crate
build clean; `npm run test` → 21/21 for the two touched files; `npm run test:scripts` → 27/27;
`cargo clippy --all-targets -- -D warnings` → clean.

---

## Gaps found, ranked

1. **[Medium] SILENT-19 has zero test coverage, confirmed by a surviving mutation.** `apply::run_with` (`src-tauri/src/update/apply.rs:275-281`) correctly logs and tolerates a `set_registry` failure without invalidating the update, but no test forces that closure to return `Err`. A future refactor could silently turn a cosmetic registry-write failure into a hard update failure, and the suite would not catch it — proven above (mutation #5 survived, 39/39 green). Fix: one test in `apply.rs`'s `run_with` block passing a `set_registry` closure that returns `Err(...)`, asserting the overall result is still `Ok(version)`.

2. **[Low] Stale `SPEC:` marker in `src-tauri/src/update/mod.rs`.** The file was edited by this feature (`git diff cd9241d -- src-tauri/src/update/mod.rs` shows real changes: `portable` module split into `manifest`+`swap`, new `status`/`UpdateStatus` exports) but its top-of-file marker still reads `// SPEC: release-distribution (REL-19, REL-21, REL-24)` and its doc-comment still describes the old two-owner design with a task list (T16-T18) that no longer exists. This is exactly the "marker que mente com autoridade" case `.claude/rules/spec-driven-changes.md` calls out as worse than no marker. Fix: update the marker to `// SPEC: silent-update (SILENT-01, SILENT-04, SILENT-05, ...)` and rewrite the doc-comment to reflect the current 4-stage flow.

3. **[Low] Dead compat code in `check.rs`, past its stated expiry.** `check.rs:55-120` defines `UpdateInfo` and `pub async fn check(...)`, explicitly commented "Compat provisório para `apply.rs`/`commands/update.rs`, que ainda esperam o formato antigo até T6/T7 retirarem o download automático." T6 and T7 have both landed; `grep -rn "UpdateInfo\|update::check\b"` across `src-tauri/src` (excluding the definition site) finds zero callers outside `mod.rs`'s re-export. The unused `UpdateError::Plugin` variant (`check.rs:49-52`, same comment pattern) is equally dead. `clippy -D warnings` doesn't catch this because both are `pub` and re-exported, so nothing internal is unreachable by the lint's definition — but nothing in the crate actually calls them. Not flagged by any SPEC_DEVIATION note. Fix: delete `check()`, `UpdateInfo`, and `UpdateError::Plugin`, and drop them from `mod.rs`'s `pub use`.

4. **[Info, not a gap] SILENT-08's Windows non-path (`tauri-plugin-updater` delegation) has no automated test.** This is pre-existing, documented (`design.md` §C4: `Update` has no public constructor, `tauri::test::mock_builder` fails with `STATUS_ENTRYPOINT_NOT_FOUND` on this stack), and out of this feature's power to fix. Listed for completeness, not counted against the verdict.

5. **[Info, cosmetic] `tasks.md:319`'s T8 test-count arithmetic doesn't add up** ("3 existentes + 1 novo" when the file has 3 tests total, not 4). No functional impact — purely a doc bookkeeping slip.

---

## Commands run (all against the real repo, read-only except the isolated scratch copy)

- `cargo test --lib update::` → 39 passed, 0 failed
- `cargo clippy --all-targets -- -D warnings` → clean
- `npx vitest run src/components/settings/UpdateSettings.test.tsx src/routes/settings/SettingsShell.test.tsx` → 21 passed
- `npm run test:scripts` → 27 passed
- Discrimination sensor: 5 builds + test runs in `%TEMP%\...\scratchpad\mutant` (deleted after use); `git status --porcelain` on `D:\ide` confirmed clean before, during, and after

---

## Re-verification addendum (same session, after this report)

Gaps 1-3 above were fixed and re-gated by the orchestrator (not the Verifier) immediately after this report landed:

1. **SILENT-19 test added**: `src-tauri/src/update/apply.rs` — `falha_no_registro_nao_invalida_a_troca_ja_aplicada`, in `run_with`'s test block. Passes a `set_registry` closure returning `Err(std::io::Error::other(...))`; asserts `result.unwrap() == "0.2.0"` and the file swap already happened. This is the exact case the surviving mutation exposed.
2. **`update/mod.rs` marker fixed**: now `// SPEC: silent-update (SILENT-01, SILENT-09)`; doc-comment rewritten to describe the current `manifest`/`check`/`swap`/`apply::run` flow instead of the old two-owner design and its T16-T18 references.
3. **Dead compat code removed**: `check()`, `UpdateInfo`, and `UpdateError::Plugin` deleted from `check.rs`; `mod.rs`'s `pub use` no longer re-exports `check`/`UpdateInfo`. Confirmed zero remaining callers before deletion (`grep -rn "check::check\b|UpdateInfo\b|UpdateError::Plugin" src-tauri/src`, excluding the definition site, returned nothing).
4. **T8 test-count typo (gap 5) corrected** in `tasks.md:319`.

Re-ran the full gate after the fixes: `cargo test` → 155 passed, 0 failed (was 154; +1 for the new SILENT-19 test); `cargo fmt --all -- --check` → clean; `cargo clippy --all-targets -- -D warnings` → clean. Frontend/scripts suites untouched by this addendum, still green from the original run.

Gap 4 (SILENT-08 non-Windows path) remains open by design — pre-existing, documented, untestable on this stack.

**Updated score**: 26/28 fully test-covered (27/28 after adding the SILENT-19 test), 1/28 covered by inspection only (SILENT-08, documented limitation). No open gaps that affect shipping.

---

## Post-review fix #2: real Linux CI compile failure (not caught by this session's gates)

After the addendum above, the user ran a build that failed with `E0425` (`deny_write`/`allow_write`
not found) and two `dead_code` errors (`run_with`, `pubkey` "never used") under `-D warnings`.

**Root cause**: `.github/workflows/ci.yml`'s `rust` and `clippy` jobs both run on `runs-on:
ubuntu-22.04` — a fact never checked during T7-T9 or by this Verifier, both of which only built/
tested on the local Windows dev machine. `apply::run_with` and `check::pubkey` are private /
`pub(crate)` respectively, with their only production caller being `#[cfg(windows)] apply::run`.
On a `ubuntu-22.04` build, that branch doesn't exist, so both functions have zero callers and trip
`-D dead-code`. The T7 test helpers `deny_write`/`allow_write` were only defined `#[cfg(windows)]`
(missing the `#[cfg(unix)]` counterpart `swap.rs`'s equivalent tests already have), so the
Windows-only test that calls them failed to link on Linux with E0425.

**Fix**: `run_with` and `pubkey` gated `#[cfg(windows)]` at their definitions (mirrors the existing
pattern of `swap::set_registry_display_version`, already `cfg(windows)`-gated for the same reason
— fully-`pub` items in a lib crate are exempt from `dead_code` as potential external API, but
private/`pub(crate)` items are not). Their entire test block (7 tests + fixtures) moved into a
`#[cfg(windows)] mod run_tests`. The `Path` and `paths::{self, Flavor}` imports in `apply.rs`,
which became unused everywhere except that now-gated code, were gated the same way.

**Verification limits**: re-confirmed on Windows only (`cargo test` 155/155, `cargo fmt --check`
clean, `cargo clippy --all-targets -- -D warnings` clean). No Linux target/sysroot is installed on
this machine, so the fix is reasoned from rustc's dead-code/pub-visibility semantics, not literally
cross-compiled. **Not yet confirmed against the actual `ubuntu-22.04` CI job** — push and watch CI
before trusting this closed.

**Process note**: this is exactly the class of gap the Verifier's own scope should have caught —
"does this compile on every platform CI builds for" is a spec-anchored check (SILENT-08 / AD-005
explicitly split behavior by platform) that neither the implementation session nor the Verifier
session actually exercised, because both only ever ran `cargo test`/`cargo clippy` locally on
Windows. Worth remembering for any future feature that branches on `cfg(windows)`: check
`ci.yml`'s `runs-on` before declaring the gate green.
