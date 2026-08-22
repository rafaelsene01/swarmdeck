# update-toast — validation

**Verdict**: PASS · **Date**: 2026-08-21 · **Diff range**: working tree (uncommitted) — `src-tauri/src/{db,commands,lib.rs}`, `src/App.tsx`, `src/components/shell/UpdateToast.tsx`, `src/routes/settings/SettingsShell.tsx`, `src/components/settings/UpdateSettings.tsx` and their tests

## Per-requirement evidence

| ID | Evidence |
| --- | --- |
| TOAST-01 | `src/App.tsx` renders the toast under `!booting`; `src/App.test.tsx` waits for `boot-splash` to unmount before any toast assertion, so a toast rendered during boot would break the "sem evento não há toast" baseline. |
| TOAST-02, TOAST-03, TOAST-04 | `src/App.tsx` listener stores `event.payload.version`; `src/App.test.tsx` — "o evento mostra o toast com a versão do payload". |
| TOAST-05 | `src/components/shell/UpdateToast.tsx` has no timer; `src/components/shell/UpdateToast.test.tsx` — "o X dispensa e nada mais dispensa" advances fake timers 60 s and asserts `onDismiss` was not called. |
| TOAST-06 | `src/App.tsx` (`setSettingsSection('updates')`), `src/routes/settings/SettingsShell.tsx` (`initialSection`); `src/App.test.tsx` — "Abrir" leaves the Updates button with `aria-current="page"` and the toast unmounted; `src/routes/settings/SettingsShell.test.tsx` — `initialSection="updates"`. |
| TOAST-07 | `updateToastDismissed` state; `src/App.test.tsx` — "depois de dispensado não volta, nem com evento novo". |
| TOAST-08 | `src-tauri/src/db/migrations/012_update_toast.sql`, `db::settings::{toast_enabled,set_toast_enabled}`, `commands::update::{update_toast_get,update_toast_set}`; `cargo test -p swarmdeck --lib toast` — "toast_nasce_ligado_e_e_independente_do_auto_check" passes. `src/components/settings/UpdateSettings.test.tsx` covers the switch itself. |
| TOAST-09 | `src/App.test.tsx` — "com a preferência desligada não há toast, e a bolinha continua"; the Rust test above asserts `auto_check` stays on after `set_toast_enabled(false)`. |
| TOAST-10 | `value !== false` in both readers; `src/routes/settings/SettingsShell.test.tsx` — "falha de `update_toast_get` mantém o switch ligado". |

## Suites

- `npx vitest run` — 441 passed (35 files), plus 3 consecutive clean runs of `src/App.test.tsx` to rule out flakiness.
- `cargo test -p swarmdeck` — 271 passed, **1 failed**: `terminal::manager::tests::build_command_wsl_inclui_id_do_terminal_como_entrada_de_env`. Pre-existing on `master`, confirmed by stashing this branch's Rust changes and re-running the same test (still failing, 270 filtered). Unrelated to this feature; recorded here, not fixed.

## Discrimination sensor

| Mutant | Result |
| --- | --- |
| Drop `!updateToastDismissed && updateToastEnabled` from the toast's render guard in `App.tsx` | 3 failed (TOAST-06, TOAST-07, TOAST-09) |
| Ignore `initialSection` in `SettingsShell` **and** drop the `update_toast_set` invoke | 3 failed (section, persistence, fallback) |

Both scratch copies were restored and `git status --porcelain` matched the pre-sensor baseline.

## Open

Visual confirmation of placement (bottom center, above the grid) needs a running window; not exercisable in this headless Linux environment.
