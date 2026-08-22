# Validation — window-geometry

**Result**: PASS — with three criteria verified by code inspection only, listed in the table and repeated under "Not verified".

Independent pass run after implementation, standalone mode (no sub-agent dispatched — the session forbids spawning agents unless the user asks). Author and verifier are the same session; that is a real weakness of this report and is stated rather than hidden.

Diff range: working tree against `91322aa`. Files: `src-tauri/src/windows/geometry.rs` (new), `src-tauri/src/db/window_state.rs` (new), `src-tauri/src/db/migrations/013_window_state.sql` (new), `src-tauri/src/db/mod.rs`, `src-tauri/src/lib.rs`.

## Per-requirement evidence

| ID | Criterion | Evidence | Verdict |
| -- | --------- | -------- | ------- |
| WGEO-01 | Persist position, size and maximized state on close | `windows/geometry.rs:172` registers `CloseRequested` → `flush`; `flush` at `windows/geometry.rs:206` reads `outer_position`/`inner_size`/`is_maximized` and calls `db::set_window_state`. Round trip asserted at `db/window_state.rs:63`. | PASS |
| WGEO-02 | Persist no later than 1 s after the last move/resize | `Moved`/`Resized` set `DIRTY` (`windows/geometry.rs:172`); the flusher loop at `windows/geometry.rs:190` sleeps `FLUSH_INTERVAL = 1 s` (`windows/geometry.rs:30`) and writes when dirty. | PASS (code inspection — the 1 s bound is a wall-clock property of the loop, not covered by a test) |
| WGEO-03 | Saved non-maximized rect touching a live monitor restores exactly | `resolve` first arm, `windows/geometry.rs:69`. Tests: `retangulo_valido_restaura_exato` (`:266`), `retangulo_no_monitor_secundario_restaura_exato` (`:286`), `um_pixel_de_sobreposicao_restaura_exato` (`:448`). | PASS |
| WGEO-04 | Geometry applied inside `setup`, before the first paint | `lib.rs:72` reads the row and `lib.rs:80` applies it inside the `setup` closure, which Tauri runs before `app.run` starts the event loop. | PASS (code inspection — not observed visually; this machine is WSL2 without a display for the GUI) |
| WGEO-05 | Rect outside every monitor → 90% centered on the primary | `resolve` second arm falls through `.or(primary)` (`windows/geometry.rs:69`) into `centered_fallback` (`:91`). Test: `monitor_removido_cai_no_principal_a_90_por_cento` (`:307`). | PASS |
| WGEO-06 | Nothing saved → 90% centered on the primary | `resolve` `None` arm (`windows/geometry.rs:69`); the migration seeds no row on purpose (`db/migrations/013_window_state.sql`). Tests: `primeira_execucao_cai_no_principal_a_90_por_cento` (`:323`), and the first assertion of `banco_novo_nao_tem_geometria_e_gravacao_faz_round_trip` (`db/window_state.rs:63`). | PASS |
| WGEO-07 | Saved maximized → 90% of the monitor holding the rect's center, primary as fallback | `resolve` second arm (`windows/geometry.rs:69`). Tests: `maximizada_usa_90_por_cento_do_monitor_onde_estava` (`:340`), `maximizada_em_monitor_removido_cai_no_principal` (`:360`). | PASS |
| WGEO-08 | Write failure is logged and never blocks the close | `flush` swallows a poisoned mutex and a `DbError` into `eprintln!` (`windows/geometry.rs:206`); `restore` uses `unwrap_or_default`/`.ok()` throughout (`:133`); the read in `lib.rs:72` degrades to `None`. | PASS (code inspection — no fault-injection test; the failure paths need a poisoned mutex or an unwritable database) |
| WGEO-09 | No primary monitor reported → `tauri.conf.json` geometry untouched | `resolve` returns `None` and `restore` returns early (`windows/geometry.rs:133`). Test: `sem_monitor_principal_nao_decide_nada` (`:376`). | PASS |

## Spec-anchored outcome check

Every test asserts a full `Rect` computed from the spec's own numbers (90% of the monitor, centered), not a value read back from the implementation. Example: `monitor_removido_cai_no_principal_a_90_por_cento` asserts `1728x972 at (96, 54)` for a 1920x1080 primary — 90% of 1920 and 1080, centered, computed by hand.

One spec-precision gap found and closed during this pass: the spec said "intersects at least one available monitor" without saying whether touching an edge counts. The implementation is half-open (a window ending exactly where a monitor starts does **not** count), and that is now pinned by `encostar_por_qualquer_borda_nao_conta_como_visivel` (`:386`) and `area_do_monitor_e_meio_aberta_nos_quatro_lados` (`:412`).

## Discrimination sensor

Behavior-level mutations applied to a copy of `windows/geometry.rs` in the scratchpad, one at a time, restoring the file after each. `git status --porcelain` before and after matched (differing only in the staging state, which a session hook changed, not the sensor).

| Mutation | Result |
| -------- | ------ |
| Drop `!saved.maximized` from the first arm | killed |
| `FALLBACK_NUMERATOR` 9 → 8 (80% instead of 90%) | killed |
| `intersects` clause 1 `<` → `<=` | killed (after the fix below) |
| `intersects` clause 2 `<` → `<=` | killed |
| `intersects` clause 3 `<` → `<=` | killed (after the fix below) |
| `intersects` clause 4 `<` → `<=` | killed (after the fix below) |
| Drop `.or(primary)` | killed |
| Remove the x centering in `centered_fallback` | killed |
| Remove the y centering in `centered_fallback` | killed |
| `contains` `x >= rect.x` → `x >` | killed (after the fix below) |
| `contains` `y >= rect.y` → `y >` | killed (after the fix below) |
| `contains` right edge `<` → `<=` | killed |
| `contains` bottom edge `<` → `<=` | killed (after the fix below) |
| `center` without dividing by 2 | killed |

**Two survivors found, both fixed by adding coverage, not by weakening a test:**

1. `intersects` was only exercised on one of its four edges, so inverting the comparison on the other three survived. The single-edge test was replaced by a four-edge one (`:386`).
2. `contains` had no boundary coverage at all. `area_do_monitor_e_meio_aberta_nos_quatro_lados` (`:412`) was added, asserting that a center exactly on a monitor's top-left corner is inside it and a center exactly on the bottom edge is outside. The second case needs `primary` to differ from `monitors[0]` for the two outcomes to be distinguishable — that is why it passes `Some(SECOND)`.

## Test run

`cargo test` in `src-tauri`: **282 passed, 1 failed**. `cargo check --all-targets`: clean.

The failure is `terminal::manager::tests::build_command_wsl_inclui_id_do_terminal_como_entrada_de_env` (`terminal/manager.rs:443`), which asserts WSL argv construction and is **pre-existing and unrelated**: `git status` shows `src-tauri/src/terminal/manager.rs` unmodified by this feature, and nothing in this diff touches process spawning. It was not fixed here because it belongs to `wsl-terminal-profile` (WSLP-09), not to this spec.

## Not verified

- The absence of a visible flash at the `tauri.conf.json` default geometry (WGEO-04). Needs a GUI run; this machine is WSL2 and the app was not launched.
- The 1 s ceiling of WGEO-02 as wall-clock behavior.
- The stderr-and-continue paths of WGEO-08.
