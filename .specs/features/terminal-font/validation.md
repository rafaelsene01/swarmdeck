# terminal-font — validation

**Verdict**: PASS · **Date**: 2026-08-21 · **Diff range**: working tree (uncommitted), `src/styles.css`, `src/components/terminal/TerminalPane.tsx`, `src/components/terminal/TerminalPane.test.tsx`, `src/assets/fonts/`

## Per-requirement evidence

| ID | Evidence |
| --- | --- |
| TFONT-01 | `src/components/terminal/TerminalPane.tsx:20` defines `TERMINAL_FONT_FAMILY` with the system monospace families first and `'Symbols Nerd Font Mono'` last; `TerminalPane.tsx:112` passes it to the `Terminal` constructor. Asserted by `src/components/terminal/TerminalPane.test.tsx` — "cria o xterm com a Nerd Font embarcada como último fallback" (16/16 in that file, 427/427 across the suite). |
| TFONT-02 | `src/styles.css:8` declares the `@font-face`; `npm run build` emitted `dist/assets/SymbolsNerdFontMono-Regular-CwubXUDQ.ttf` (2,610,012 bytes), so Vite resolves and bundles the file. |
| TFONT-03 | `src/assets/fonts/SymbolsNerdFontMono-Regular.ttf`, taken from the Nerd Fonts `NerdFontsSymbolsOnly` release — the `Mono` member of that archive, not the proportional one. |

## Discrimination sensor

Mutant: delete the `fontFamily` line from the `Terminal` constructor, so xterm falls back to its own default. Result: the TFONT-01 test failed (`1 failed | 15 passed`), so the test discriminates. The working tree was restored from a scratch copy and `git status --porcelain` matched the pre-sensor baseline.

## Open

Visual confirmation that the glyph occupies a single cell (TFONT-03's second clause) is pending — it needs a running window, and this dev environment has no display.
