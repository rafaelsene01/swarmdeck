# terminal-resize-floor — validation

**Result**: PASS · **Date**: 2026-08-21 · **Diff**: working tree (uncommitted)
`src/components/terminal/TerminalPane.tsx`, `src/components/terminal/TerminalPane.test.tsx`

## Per-requirement evidence

| ID | Evidence | Verdict |
| --- | --- | --- |
| TRSZ-01 | `src/components/terminal/TerminalPane.tsx:201-202` — `syncSize` calls `fitAddon.proposeDimensions()` and returns before `fit()` and before `pty_resize` when `proposed.cols < MIN_COLS` (or the proposal is absent). Tests: `TerminalPane.test.tsx` — "não redimensiona quando a caixa é medida abaixo do piso de colunas" (proposal of 2 columns, the addon's own `MINIMUM_COLS`) and "proposta indisponível também não redimensiona". | PASS |
| TRSZ-02 | `src/components/terminal/TerminalPane.tsx:85` — single `MIN_COLS` constant; line 212 replaces the former bare `fitAddon.fit()` with `syncSize()`, so the initial fit passes the same floor. Test: the floor test above renders a fresh pane, where the only resize path reached before `pty_spawn` resolves is the initial one — a bare `fit()` there fails it (mutant 2 below). | PASS |
| TRSZ-03 | `src/components/terminal/TerminalPane.tsx:90,143` — `TERMINAL_SCROLLBACK = 10_000` passed to `new Terminal({ scrollback })`. Test: "cria o xterm com scrollback acima do padrão da biblioteca". | PASS |

## Spec-anchored outcome check

Each test asserts a spec-defined outcome, not an implementation shape: the floor
tests assert *no resize reaches the PTY* (`pty_resize` never invoked) rather than
inspecting how the decision is made; the scrollback test asserts the value is
above the library default of 1000 — the number the spec names — instead of
pinning 10 000.

Spec-precision gap: none found. The floor value (20) is stated as an assumption
in `spec.md`, with the `minWidth: 900` arithmetic that backs it.

## Discrimination sensor

Mutations applied in the real tree, each reverted immediately (backup copy, no
`git stash`); `git diff --stat` after the last revert matches the pre-sensor
baseline (41 insertions, 1 deletion in `TerminalPane.tsx`).

| # | Mutation | Result |
| --- | --- | --- |
| 1 | `MIN_COLS = 20` → `0` | KILLED — 1 failed / 19 passed |
| 2 | initial `syncSize()` → bare `fitAddon.fit()` (the pre-fix state) | KILLED — 2 failed / 18 passed |
| 3 | `TERMINAL_SCROLLBACK = 10_000` → `1_000` (library default) | KILLED — 1 failed / 19 passed |

3 mutations, 3 killed, 0 survivors.

## Gates

- `npx vitest run src/components/terminal/TerminalPane.test.tsx` — 20 passed.
- `npx vitest run` — 35 files, 475 tests passed.
- `npx tsc --noEmit` — clean (exit 0).
- Backend untouched, so no `cargo` run was needed.

## Not verifiable here

Which event measures the narrow box on the user's machine. The floor makes any
such event harmless, which is the requirement — but confirming the strip is gone
needs a real window with a provider running. `TRSZ-03`'s effect (a long history
surviving a narrowing) is likewise only observable in the running app.

## Reproduction that grounded the spec

`@xterm/headless@5.5.0`, outside the app (scratchpad, not committed): a 600-line
scrollback shrunk to 2 columns and widened back leaves 11 lines; 22 characters
written while at 2 columns leave 22 one-character logical lines that widening
never rejoins — `["linha larga do agente aaaa…","W","e","l","c","o","m","e"]`.
