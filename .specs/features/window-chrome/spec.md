# window-chrome

Own title bar for the main window, replacing the native OS decorations.

Opened on 18/08/2026 at the user's request: the native title bar was light on
Windows and carried the app icon and name, which duplicated chrome the app
already renders below it.

## Requirements

- **WIN-01** — WHEN the main window is shown, THE SYSTEM SHALL render the top
  bar with the app's dark surface tokens (`--surface-2` background,
  `--surface` bottom border), never the OS default colours.
- **WIN-02** — THE SYSTEM SHALL NOT render an app icon or the app name in the
  title bar; its left side stays empty.
- **WIN-03** — THE SYSTEM SHALL render minimize, maximize/restore and close
  controls on the right side of the title bar, each acting on the current
  window.
- **WIN-04** — THE SYSTEM SHALL keep the title bar draggable, so the window can
  be moved by its empty area.

## Traceability

| Requirement | Implementation | Test |
| --- | --- | --- |
| WIN-01, WIN-02, WIN-03, WIN-04 | `src/components/shell/TitleBar.tsx`, `src/App.tsx` | `src/components/shell/TitleBar.test.tsx` |
| WIN-01, WIN-02 (native bar removed) | `src-tauri/tauri.conf.json` (`decorations: false`) | manual |
| WIN-03, WIN-04 (permissions) | `src-tauri/capabilities/default.json` | manual |

## Out of scope

Custom snap layouts, double-click-to-maximize on the drag region, and a
per-OS control style (macOS traffic lights). The native window still resizes
by its borders.
