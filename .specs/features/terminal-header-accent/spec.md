# terminal-header-accent

**Prefix**: `HACC` · **Status**: implemented · **Opened**: 2026-08-21

## Problem

Every project registered in SwarmDeck already carries a color: `ProjectFormModal`
asks for one from a fixed palette, `projects::service::Project` stores it, and
`project_list` returns it. The frontend throws it away — `fetchProjectNames` in
`src/App.tsx` keeps only `name` and `path`, so with four terminals open on four
projects the panes are told apart by reading their titles.

The user asked for the terminal header to carry a border in the project's
configured color, and chose a full outline around the header (not a recolored
bottom rule), so the title bar reads as a box in the project's color.

## Requirements

| ID | Requirement |
| --- | --- |
| HACC-01 | The terminal header SHALL render a 1px border on all four sides, colored with the `color` of the project whose directory the terminal is running in. |
| HACC-02 | The app SHALL read the project color from the same `project_list` call that already feeds the header title, without a second IPC round trip. |
| HACC-03 | A terminal whose `cwd` matches no registered project (or whose project has no color) SHALL fall back to `var(--border)`, the header's current border color — an unregistered folder never renders a colorless or transparent outline. |

## Non-goals

- Coloring anything else with the project color (pane border, tab strip, status
  badge). The request was the terminal header.
- A per-terminal color override or any new setting. The color is the project's,
  edited where projects are edited.
- Refetching on project edits beyond the refresh points that already exist
  (boot and wizard confirm).

## Traceability

| Requirement | Implementation | Check |
| --- | --- | --- |
| HACC-01 | `src/components/terminal/TerminalHeader.tsx` (`accentColor` prop), `.terminal-header` rule in `src/App.tsx` | `src/components/terminal/TerminalHeader.test.tsx` — "pinta a borda do header com a cor do projeto" |
| HACC-02 | `src/App.tsx` (`fetchProjects`, `projectByPath`, `projectColorFor`) | `src/App.test.tsx` — "passa a cor do projeto ao header do terminal" |
| HACC-03 | `src/components/terminal/TerminalHeader.tsx` (`accentColor ?? undefined`) | `src/components/terminal/TerminalHeader.test.tsx` — "sem cor de projeto mantém a borda padrão" |
