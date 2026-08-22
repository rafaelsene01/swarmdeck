# terminal-resize-floor

**Prefix**: `TRSZ` · **Status**: implemented · **Opened**: 2026-08-21

## Problem

Reported by the user: in a terminal running a provider (an agent CLI), scrolling
back shows the old output collapsed into a vertical strip of one or two
characters against the left edge, while the current output at the bottom reads
normally.

Confirmed mechanism, reproduced with `@xterm/headless@5.5.0` outside the app:

1. `FitAddon` clamps its proposal at `MINIMUM_COLS = 2`
   (`node_modules/@xterm/addon-fit/src/FitAddon.ts:23`) instead of declining to
   resize. Any moment the pane box is measured narrow — but not zero, which is
   the only case `syncSize` guards — drives the xterm to **2 columns**.
2. `TerminalPane.tsx` then forwards that to the child process via `pty_resize`,
   so the provider itself re-renders at 2 columns. An Ink-based CLI emits its
   own `\r\n` per wrapped segment, so each character becomes a **logical
   line**.
3. When the box widens again, xterm's reflow only rejoins lines marked
   `isWrapped`. Logical one-character lines survive forever — that is the strip
   the user sees.

Measured on the reproduction: shrinking a 600-line scrollback to 2 columns and
widening back leaves 11 lines (the 1000-line scrollback cap discards the rest);
writing 22 characters while at 2 columns leaves 22 one-character lines that
widening never repairs.

The initial `fitAddon.fit()` right after `terminal.open()` carries no size guard
at all, so it can apply the degenerate width before the first byte arrives.

## Requirements

| ID | Requirement |
| --- | --- |
| TRSZ-01 | Before resizing, the terminal pane SHALL ask the fit addon for the proposed dimensions and SHALL NOT apply them — neither to the xterm instance nor to the PTY via `pty_resize` — when the proposed column count is below a legibility floor. The pane SHALL keep its previous size instead. |
| TRSZ-02 | The floor SHALL be a single constant used by every resize path in the pane, the initial fit included, so no path can apply a width the other paths reject. |
| TRSZ-03 | The xterm instance SHALL be created with an explicit `scrollback` above the library default of 1000 lines, so a legitimate narrowing (a second pane opening, the window shrinking) reflows without discarding the history it re-wraps. |

## Non-goals

- Clamping in the Rust backend. `pty_resize` stays a thin pass-through
  (`src-tauri/src/commands/terminal.rs:97`); the frontend owns the geometry it
  measures, and a second floor in a second language is a second thing to keep
  in sync.
- Repairing scrollback already corrupted by an earlier session. The damage is in
  the xterm buffer of a live pane; restarting the terminal clears it.
- Finding which specific event measures the narrow box. The floor makes every
  such event harmless, whichever it is — window restore, a layout frame, an OS
  resize.
- Persisting or configuring the floor. It is a legibility constant, not a
  preference.

## Assumptions

- A floor of **20 columns** never bites a legitimate layout: `tauri.conf.json`
  pins `minWidth: 900`, so the narrowest cell in a 2×2 grid is ~442 px, about
  55 columns at the current cell metrics.
- A pane measured below the floor is unreadable anyway, so freezing its size is
  strictly better than forwarding it to the provider.

## Traceability

| Requirement | Implementation | Check |
| --- | --- | --- |
| TRSZ-01 | `src/components/terminal/TerminalPane.tsx` (`syncSize`) | `src/components/terminal/TerminalPane.test.tsx` — "não redimensiona quando a caixa é medida abaixo do piso de colunas" |
| TRSZ-02 | `src/components/terminal/TerminalPane.tsx` (`MIN_COLS`, initial `syncSize()` call) | same test file — "o fit inicial passa pelo mesmo piso" |
| TRSZ-03 | `src/components/terminal/TerminalPane.tsx` (`new Terminal({ scrollback })`) | same test file — "cria o xterm com scrollback acima do padrão da biblioteca" |
