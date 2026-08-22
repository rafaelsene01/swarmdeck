# terminal-glyph-metrics

**Prefix**: `TGLY` · **Status**: specified · **Opened**: 2026-08-22

## Problem Statement

Reported by the user with two screenshots (`print/bug_terminal.png`,
`print/bug_clear.png`): in a terminal running the `claude` provider the text
renders corrupted — leftover characters pinned to the left edge over roughly two
columns, single letters scattered at irregular positions inside the CLI's
welcome box, and lines clipped mid-word at the right edge. Running the CLI's
`/clear` repaints the banner and the artifacts survive.

This is **not** the mechanism of AD-045 (`terminal-resize-floor`) happening
again. That floor holds: `syncSize` returns before `fitAddon.fit()` when the
proposal is below `MIN_COLS`, and `FitAddon.proposeDimensions()` returns
`undefined` when the measured cell is zero — no 2-column resize can be applied.
The mechanism here lives one layer lower, in the renderer's own cache.

Confirmed mechanism, read from `@xterm/xterm@5.5.0`:

1. The DOM renderer keeps a per-codepoint glyph width cache
   (`node_modules/@xterm/xterm/src/browser/renderer/dom/WidthCache.ts:28-99`).
   `_measure()` reads `offsetWidth` and, when it is `0`, **stores `0`**
   (`WidthCache.ts:162-166`) — unlike `CharSizeService`, which keeps its
   previous value in that case (`CharSizeService.ts:63-69`).
2. A pane measures zero whenever its box is transiently degenerate. The user
   confirmed the reported pane was a single tab, always visible, never
   minimized — and that the artifacts appeared right after **moving and
   resizing** it. Dragging a pane reorders it without remounting the component
   (the effect keys on `[cwd, agent]`), so the DOM node is moved and the grid
   hands it transient frames; `display: none` panes (inactive tab,
   `src/App.tsx:976`; minimize or a sibling's maximize, `src/App.tsx:1024`) are
   a second, rarer way into the same state. The pane is never unmounted, by
   design — the ConPTY DSR handshake needs the xterm element to exist
   (`src/components/terminal/TerminalPane.tsx:112-119`).
3. Nothing clears that poisoned cache. It is invalidated only by `setFont()` —
   reached from a change to `fontFamily`, `fontSize`, `fontWeight` or
   `fontWeightBold` (`WidthCache.ts:105-128`, `DomRenderer.ts:415-421`) — or by
   `handleCharSizeChanged` (`DomRenderer.ts:318-322`). The second one does not
   fire: when the pane becomes visible again, `RenderService` re-measures
   (`RenderService.ts:124-126`), gets the **same** metrics back (the system
   monospace never changed, and `CharSizeService` had retained the old value),
   so no char-size change event is emitted.
4. Every later repaint reuses the zeroed widths. `renderRows()` rewrites each
   row wholesale via `replaceChildren()` (`DomRenderer.ts:438-469`), which is
   why the CLI's `/clear` cannot help: the text changes, the broken metric does
   not. The next `fit()` is what makes the damage visible — it reflows the
   buffer against the wrong cell width — which matches the user's observation
   that the artifacts surfaced on resize.

The same wrong metric explains all three symptoms at once — collapsed
characters at the left, letters landing at irregular offsets, and rows whose
computed width overflows the box and gets clipped by `overflow: hidden`.

A second, independent path feeds the same cache: the embedded Nerd Font is a
2.6 MB TTF declared with `font-display: block` (`src/styles.css:7-13`), and
`document.fonts` is never awaited before `terminal.open()`. xterm registers no
`FontFaceSet` listener, so a font that resolves after `open()` leaves both the
cell metric and the width cache stale with no event to correct them.

## User Stories

- As a user running a provider in a terminal pane, I want the text to render
  correctly after switching tabs, minimizing, or maximizing a pane, so that I
  can read the agent's output without restarting the terminal.
- As a user, I want the pane that already shows corrupted text to repair itself
  on the next resize, so that the fix is something I observe instead of
  something I have to trust.

## Requirements

| ID | Requirement |
| --- | --- |
| TGLY-01 | WHEN the document's fonts finish loading after the xterm instance is open, the terminal pane SHALL force xterm to re-measure the cell and discard its glyph width cache. |
| TGLY-02 | WHEN the pane applies a new size — every settled resize that clears the column floor, whatever caused it: window resize, layout change, drag-reorder, or a pane becoming visible again — the pane SHALL force the same re-measure BEFORE handing the new dimensions to the fit addon. |
| TGLY-03 | The forced re-measure SHALL assign a `fontFamily` value different from the current one and then restore the canonical value. `OptionsService` fires `onOptionChange` only when the assigned value differs from the stored one, so re-assigning the same value is a silent no-op that invalidates nothing. |

## Out of Scope

- Repairing a buffer already corrupted by the AD-045 mechanism. Those are real
  characters in real buffer lines; only restarting that terminal clears them.
  `terminal.reset()` is rejected — it would destroy the user's history.
- Environment mitigation for WebKitGTK under WSLg (`WEBKIT_DISABLE_DMABUF_RENDERER`
  and friends). The forced re-measure already triggers a full refresh, which
  repaints every row. Nothing is set until evidence shows a clean buffer under
  stale pixels.
- A row floor, and ending the silent refusal in `syncSize` that freezes the
  previous `cols`. The right-edge clipping is explained by the wrong metric; if
  it survives this fix it earns its own spec — and now it has a named
  reproduction (drag the pane), so that spec would not start from zero.
- Any change in the Rust backend. `throttle.rs` discards from the start of the
  buffer only past 1 MiB inside a 16 ms window; a TUI never reaches that rate,
  and no ANSI stream is being mangled.
- Making the invalidation configurable. It is a correctness step, not a
  preference.

## Assumptions & Open Questions

- The zeroed widths come only from measuring inside a hidden container. Any
  other source would also be fixed by the same invalidation, so the assumption
  costs nothing if wrong.
- Re-measuring on every settled resize is cheaper than detecting which resize
  followed a degenerate measurement. `fit()` already triggers a full refresh on
  that same path (`RenderService.handleResize` → `_fullRefresh`), so the added
  cost is one measure-element read plus the cache rebuild for the visible rows,
  at a 100 ms debounce. Tracking a "was the box measurable" flag would be more
  code for narrower coverage.
- The poisoning window in the reported case was the drag/resize transient, not
  a hidden ancestor: the user confirmed the pane was a single always-visible
  tab and that moving it is what surfaced the artifacts. TGLY-02 covers that
  window without needing to name which frame was degenerate.
- A full refresh at these two rare edges is imperceptible: it rewrites the
  visible rows once, not the 10 000-line scrollback.
- The user runs 0.1.46, which already carries AD-045 and AD-040, so the
  2-column corruption is not happening live — what is left is this cache.

Open questions: none. The one that was open — whether the pane had ever been
hidden — was answered: it never was, and moving/resizing it is what made the
bug appear. That answer is what turned TGLY-02 from a conditional transition
into an unconditional step on the resize path.

## Requirement Traceability

| Requirement | Implementation | Check |
| --- | --- | --- |
| TGLY-01 | `src/components/terminal/TerminalPane.tsx` (`document.fonts.ready` hook after `terminal.open()`) | `src/components/terminal/TerminalPane.test.tsx` — "remede a métrica quando a fonte termina de carregar" |
| TGLY-02 | `src/components/terminal/TerminalPane.tsx` (`syncSize`, before `fitAddon.fit()`) | same test file — "remede a métrica antes de cada fit aplicado" |
| TGLY-03 | `src/components/terminal/TerminalPane.tsx` (`refreshMetrics`) | same test file — "a invalidação passa por um valor de fontFamily diferente antes de voltar ao canônico" |
