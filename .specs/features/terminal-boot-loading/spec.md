# terminal-boot-loading

**Prefix**: `BOOT` · **Status**: implemented · **Opened**: 2026-08-20

## Problem

Two visible symptoms, one reported together:

1. Clicking "new terminal" flashes a console window on Windows for a fraction of
   a second before the pane appears. The app spawns `wsl.exe` synchronously to
   check the profile (`terminal::manager::check_wsl_profile`), probe the login
   `PATH` (`shells::wrap::fetch_login_path`) and detect agent CLIs
   (`agents::catalog::real_wsl_probe`). None of those passed `CREATE_NO_WINDOW`.
   Only `shells::list::wsl_profiles` did — and it carried the flag inline, as a
   local copy of the same three lines that already existed privately in
   `editors.rs`.
2. Boot showed no progress. The window opened on an empty tab, the restore modal
   appeared some milliseconds later once `agent_catalog` settled, and after the
   choice the panes came up one by one over an already-interactive screen. Every
   intermediate state was a real, clickable UI the user was not supposed to act
   on yet.

## Requirements

| ID | Requirement |
| --- | --- |
| BOOT-01 | WHEN the app spawns a helper process on the user's behalf, the process SHALL NOT create a visible console window on Windows. The `CREATE_NO_WINDOW` flag SHALL live in exactly one place (`src-tauri/src/proc.rs::hide_console`) and every non-PTY `std::process::Command` outside `#[cfg(test)]` SHALL route through it. |
| BOOT-02 | WHILE a terminal pane's `pty_spawn` has not settled, the pane SHALL display a loading state covering its output area. |
| BOOT-03 | WHEN `pty_spawn` rejects, the pane SHALL leave the loading state and SHALL keep showing the verbatim error text that WSLP-12 already writes into the terminal. |
| BOOT-04 | WHEN the app window opens, it SHALL display a full-window loading overlay before any workspace decision is visible. |
| BOOT-05 | WHILE the restore modal is required, it SHALL render above the boot overlay, not behind it and not instead of it. |
| BOOT-06 | WHEN the user confirms a restore selection, the boot overlay SHALL remain until every restored terminal reports a settled `pty_spawn`, and SHALL show how many of them are ready. |
| BOOT-07 | The boot overlay SHALL clear when there is nothing saved, when the workspace read fails, when the workspace holds no terminal, on "Começar do zero", and after 15 s with no progress. The 15 s ceiling SHALL NOT run while the restore modal is open, because the wait there is the user's. |
| BOOT-08 | The overlay and the pane loading state SHALL be drawn with the tokens already in `src/styles.css`, SHALL honour `prefers-reduced-motion`, and SHALL add no asset and no dependency. |
| BOOT-09 | The boot overlay SHALL remain until the agent quota has been fetched, so the header ring appears with data rather than in its own loading state. A quota fetch that fails SHALL NOT hold the screen. |
| BOOT-10 | The boot overlay SHALL remain until the app has enumerated every available terminal profile (host plus each registered WSL distro) and, for each one, which catalog agents are installed **inside it**. One IPC call (`agent_catalog_all`); a failure SHALL NOT hold the screen. |
| BOOT-11 | WHEN a folder or project is chosen, the app SHALL resolve which terminal profile that path runs in (`shell_profile_for_path`, over the pure `shells::profile_for_path`). A failed resolution SHALL fall back to the default profile's catalog. |
| BOOT-12 | The wizard's AGENT step SHALL offer the agents installed in the profile the chosen path resolves to, not the default profile's, and SHALL name that profile on screen. An agent installed only inside a WSL distro SHALL therefore be selectable for a folder inside that distro. |

## Non-goals

- Path translation, profile selection, or anything else `wsl-terminal-profile`
  owns. BOOT-01 only changes *how* those processes are spawned, never *what*.
- A progress bar for the PTY itself. The backend reports "spawned"; there is no
  finer-grained signal, and inventing one would be a fake percentage.
- Hiding the `icacls`/`reg` spawns inside `#[cfg(test)]` helpers. Those never
  run for a user.

## Traceability

| Requirement | Implementation | Check |
| --- | --- | --- |
| BOOT-01 | `src-tauri/src/proc.rs`; call sites in `terminal/manager.rs`, `shells/wrap.rs`, `shells/list.rs`, `agents/catalog.rs`, `editors.rs`, `projects/service.rs`, `update/swap.rs` | `grep -rn "std::process::Command::new" src-tauri/src` — every hit outside `#[cfg(test)]` is followed by `crate::proc::hide_console` |
| BOOT-02, BOOT-03 | `src/components/terminal/TerminalPane.tsx` (`started` state, `.terminal-pane__boot`) | `src/components/terminal/TerminalPane.test.tsx` |
| BOOT-04..BOOT-07 | `src/App.tsx` (`boot` state, `handlePaneReady`, `BOOT_STALL_MS`) | `src/App.test.tsx` |
| BOOT-08 | `src/components/shell/BootSplash.tsx` | visual, on the reference Windows machine |
| BOOT-09 | `src/App.tsx` (`quotaReady`, prefetch of `quota_claude`) | `src/App.test.tsx` |
| BOOT-10 | `src-tauri/src/commands/agents.rs` (`agent_catalog_all`), `src/App.tsx` (`profileCatalogs`), `src/types/agents.ts` | `src/App.test.tsx` |
| BOOT-11 | `src-tauri/src/commands/shells.rs` (`shell_profile_for_path`), `src/components/terminal/PaneWizard.tsx` (`profileForPath`) | `src/components/terminal/PaneWizard.test.tsx` |
| BOOT-12 | `src/components/terminal/PaneWizard.tsx` (`stepAgents`/`stepInstalledIds`), `src/components/terminal/AgentStep.tsx` (`terminalLabel`) | `src/components/terminal/PaneWizard.test.tsx` |

## Manual verification (Windows reference machine)

The WSL branch cannot be exercised by CI or by the Linux dev environment, same
constraint `wsl-terminal-profile` records.

1. Open a terminal on a WSL profile. No console window flashes at any point.
2. Open a project folder in an editor that resolves to a `.cmd`. No flash.
3. Create a project with `git init`. No flash.
4. Close the app with 3 terminals open, reopen it: overlay → restore modal over
   the overlay → overlay with "0/3 … 3/3 terminais prontos" → screen released.
5. Restore a terminal whose distro was unregistered in the meantime: the pane
   shows the `wsl.exe` error verbatim and the screen still gets released.
6. BOOT-09/BOOT-10: the overlay's phase text runs through "Procurando terminais
   e agentes instalados…" and "Consultando a cota dos agentes…" before the
   screen is released, and the header quota ring shows data on the first frame
   after release instead of its own loading ring.
7. BOOT-12, the reported case: with `claude` installed **only** inside
   `Ubuntu-24.04`, open a new terminal on a project under
   `\\wsl.localhost\Ubuntu-24.04\...`. The AGENT step must show the badge
   "Ubuntu-24.04" and the Claude Code tile must be selectable. The same wizard
   on a `C:\...` project must show "Windows" (renamed from
   "Windows (padrão)" by AD-037) and keep the tile disabled only when the CLI
   is absent there — a present-but-disabled provider is now governed by
   `providers-panel` (PROV-14/PROV-15).
8. QUOTA-15 / AD-034 (not a BOOT requirement — listed here because it is what
   BOOT-09 waits for): on a Windows host whose Claude Code is logged in only
   *inside* the distro, the ring must show real percentages. Before AD-034 it
   showed "O Claude Code não está conectado." permanently. Check the popover
   text and that the plan badge (`Pro`, `Max 20x`) is not the generic
   "Assinatura" — the plan comes from `rateLimitTier` in the credential, so a
   generic badge means the file was found but the tier field was absent.

## References gathered for the design

- Splash handing over to a skeleton of the real layout rather than to blank
  content, and shimmer as the "work is happening now" signal:
  <https://www.uxpin.com/studio/blog/splash-screen/>,
  <https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a>
- Skeleton blocks mirroring the shape and position of the content they stand in
  for, to avoid a layout jump on hand-over:
  <https://playbook.ebay.com/design-system/components/loading-skeleton>
