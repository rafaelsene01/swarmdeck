# terminal-font

**Prefix**: `TFONT` · **Status**: implemented · **Opened**: 2026-08-21

## Problem

Reported by the user: the shell prompt inside a SwarmDeck terminal renders its
icons as replacement boxes. The sample given was a Starship/oh-my-zsh prompt,
`sene in swarmdeck on  master [!]` — the git-branch glyph (`U+E0A0`, a
Powerline private-use code point) has no glyph in any font the pane can reach.

Two independent causes, both required for the defect:

1. `TerminalPane.tsx` created the `Terminal` without `fontFamily`, so xterm.js
   fell back to its own default, `courier-new, courier, monospace`. None of
   those carry Powerline, Devicons, Font Awesome or Codicon code points.
2. Nothing on the machine covers them either — `fc-list | grep -i nerd` came
   back empty on the reference machine, and so did the Windows font directory.
   Pointing `fontFamily` at a Nerd Font the user does not have installed would
   have changed nothing.

## Requirements

| ID | Requirement |
| --- | --- |
| TFONT-01 | The terminal pane SHALL create the xterm instance with an explicit `fontFamily` whose last entry is the bundled Nerd Font. System monospace families SHALL come first, because xterm.js derives the cell metrics from the first family that resolves; a symbols-only font in that position would size every cell by an icon. |
| TFONT-02 | The icon glyphs SHALL be available without the user installing anything. The font file SHALL ship inside the app bundle and be declared with `@font-face` in `src/styles.css`. |
| TFONT-03 | The bundled font SHALL be the *Mono* variant of Symbols Nerd Font, so each icon occupies a single terminal cell and the prompt does not drift out of column alignment. |

## Non-goals

- Making the terminal text itself a Nerd Font. The text keeps the system
  monospace family; only code points missing from it fall through to the
  bundled file, resolved by the WebView's per-character font fallback.
- A font picker or any setting. The user reported a broken prompt, not a
  preference.
- Subsetting the font. `SymbolsNerdFontMono-Regular.ttf` ships whole, at
  2.6 MB — see AD-040 for why the size was accepted instead of converted.

## Traceability

| Requirement | Implementation | Check |
| --- | --- | --- |
| TFONT-01 | `src/components/terminal/TerminalPane.tsx` (`TERMINAL_FONT_FAMILY`) | `src/components/terminal/TerminalPane.test.tsx` — "cria o xterm com a Nerd Font embarcada como último fallback" |
| TFONT-02 | `src/styles.css` (`@font-face`), `src/assets/fonts/SymbolsNerdFontMono-Regular.ttf` | `grep -n "Symbols Nerd Font Mono" src/styles.css` |
| TFONT-03 | `src/assets/fonts/SymbolsNerdFontMono-Regular.ttf` (the `Mono` variant of the Nerd Fonts 3.x symbols-only release) | visual, on the reference machine: the prompt glyph occupies one cell |

## License

The font ships under the terms in `src/assets/fonts/SymbolsNerdFont-LICENSE`
(MIT, Ryan L McIntyre / Nerd Fonts), kept next to the file it covers.
