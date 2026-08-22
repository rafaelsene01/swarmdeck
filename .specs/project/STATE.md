# STATE

> **Reconstructed on 2026-08-20.** `.specs/` is listed in `.gitignore` and was absent from this clone, so the tree restarts here. Decisions `AD-001` through `AD-024` survive only as references inside code comments (`grep -rn "AD-0" src src-tauri/src`) and are not recoverable in full. Numbering resumes at `AD-025` so no existing code reference is invalidated.
>
> **Path note:** `.claude/rules/spec-driven-changes.md:12` refers to `.specs/project/STATE.md`; the `tlc-spec-driven` skill's `memory.md:3` refers to `.specs/STATE.md`. This file, at the repo rule's path, is the only one — treat the skill's path as an alias for it.

## Decisions

### AD-025

- **Decision**: The terminal setting is an execution profile (`Host` or `Wsl { distro }`) that governs process spawn, agent-CLI detection, and `git init` — not a shell string that only replaces the PTY program.
- **Reason**: On Windows the app resolves agent CLIs in the host `PATH`. Replacing only the PTY program leaves the agent catalog empty for a user whose CLIs live inside WSL, so half the reported failure would survive the fix.
- **Trade-off**: More call sites route through one module than a shell-string setting would touch, and a new `shells` module exists where none did. Rejected the cheaper shell dropdown because it ships a setting that looks like a fix and is not one.
- **Scope**: `src-tauri/src/shells/`, `terminal::manager`, `agents::catalog`, `projects::service`, and any future code that spawns a process on behalf of the user.
- **Date**: 2026-08-20
- **Status**: active

### AD-026

- **Decision**: No path translation between Windows and Linux path forms. The app stores one Windows-shaped absolute path per project and hands it to `wsl.exe --cd`, which performs the conversion.
- **Reason**: Verified on the reference machine that `--cd` accepts `\\wsl.localhost\<distro>\...`, `C:\...`, and native Linux paths. `strip_verbatim_prefix` (`projects/service.rs:425`) already round-trips UNC WSL paths through `canonicalize`. The `/mnt` prefix is user-configurable via `/etc/wsl.conf`, so a hand-written mapping table would be a guess that fails silently.
- **Trade-off**: The app cannot show the Linux form of a path in its UI without asking WSL for it. Accepted: the UNC form is a real, clickable path on Windows and is what the folder dialog produces.
- **Scope**: Any feature storing, comparing, or displaying a project path.
- **Date**: 2026-08-20
- **Status**: active

### AD-027

- **Decision**: Commands crossing into WSL are built from argv entries only, using `env` as the program to carry variables. No shell string, no `WSLENV`, no quoting layer.
- **Reason**: A `$var` inside `bash -lc '...'` was observed being consumed before `bash` saw it when invoking `wsl.exe`, and an interactive login shell leaks the MOTD into the PTY stream the terminal status parser reads. `env PATH=<login> KEY=VALUE <program> <args>` was verified to work with spaces in both the `--cd` path and the arguments.
- **Trade-off**: The login `PATH` must be probed separately and cached, instead of being inherited from a login shell. Accepted: one cached probe per profile is cheaper and far more predictable than a quoting layer.
- **Scope**: `shells::wrap` and every caller. Any future feature launching a process inside a profile must go through it rather than composing its own command string.
- **Date**: 2026-08-20
- **Status**: active

### AD-028

- **Decision**: An unavailable profile is a hard error. The app never falls back to the host shell when the selected distro is missing, unregistered, or fails to start.
- **Reason**: A silent fallback would run the agent against a different filesystem with different credentials while the UI reported success — including `claude --resume <session-id>` against a machine where that session does not exist.
- **Trade-off**: A user whose distro is temporarily unavailable gets an error instead of a usable window. Accepted: `wsl.exe` returns `255` for both a missing distro and a missing `cwd`, so the error must carry its stderr text verbatim rather than interpret the code.
- **Scope**: `terminal::manager` spawn errors, `commands::terminal`, and the terminal pane error surface.
- **Date**: 2026-08-20
- **Status**: active

### AD-029

- **Decision**: `CREATE_NO_WINDOW` lives in exactly one function, `crate::proc::hide_console`, and every non-PTY `std::process::Command` the app runs for a user goes through it. Call sites do not carry the flag themselves.
- **Reason**: The reported flash came from `terminal::manager::check_wsl_profile`, which runs synchronously right before the interactive session opens. Patching only that one would have left `shells::wrap::fetch_login_path` and `agents::catalog::real_wsl_probe` flashing on the very same click, and `editors.rs` and `shells::list` already carried two independent copies of the same three lines — the duplication is what let the third and fourth site be written without it.
- **Trade-off**: One more module in the crate root, and a `&mut Command -> &mut Command` shape that reads slightly unusual at the call site. Rejected the alternative of a `spawn_hidden` wrapper that owns the whole spawn: the sites differ in `output()` / `status()` / `spawn()` and in whether they set `current_dir`, so the wrapper would need every one of those as a parameter.
- **Scope**: `src-tauri/src/proc.rs` and every current or future caller of `std::process::Command` outside `#[cfg(test)]`. Does NOT cover `portable_pty::CommandBuilder`: a ConPTY child is headless by construction.
- **Date**: 2026-08-20
- **Status**: active

### AD-030

- **Decision**: The boot overlay is released by counting terminals that report a *settled* `pty_spawn` — success or failure alike — with a 15 s no-progress ceiling that is suspended while the restore modal is open.
- **Reason**: "Settled" rather than "succeeded" because AD-028 makes an unavailable profile a hard error: a user restoring a workspace whose distro was unregistered would otherwise stare at a loading screen forever while the pane behind it already held the explanation. The ceiling is armed off `boot`'s identity, which changes on every pane that reports, so it measures a stall rather than total boot time.
- **Trade-off**: A pane whose PTY is genuinely slow past 15 s releases the screen early, showing its own skeleton inside an interactive window. Accepted: that degrades to the behaviour before this feature, which is strictly better than a hung window. Rejected a fixed total-boot timeout, which would punish a legitimate four-terminal restore on a cold WSL distro.
- **Scope**: `src/App.tsx` boot state, `TerminalPane.onReady`, `BootSplash`. Any future feature that mounts terminals at boot must feed `onReady` or it will hold the overlay for the full ceiling.
- **Date**: 2026-08-20
- **Status**: active

### AD-031

- **Decision**: The boot overlay has three independent gates — the profile/agent sweep, the session restore, and the quota — all opened in parallel and all required before the screen is released. The single 15 s no-progress ceiling covers all three.
- **Reason**: The user asked for the loading screen to cover the quota fetch and the terminal/agent validation "before showing the initial screen", alongside the session restore that already existed. Sequencing them would add their latencies (a `wsl.exe` probe per distro, then a network call); running them in parallel makes the boot as slow as the slowest one instead of the sum. Independent booleans rather than a phase enum because the completion order is not fixed.
- **Trade-off**: The phase label can only name one gate at a time, so it shows the most informative pending one by a fixed priority (terminals-with-a-count → modal → sweep → session → quota) rather than the literal truth "three things are pending". Accepted: a label listing all pending work reads worse and tells the user less.
- **Scope**: `src/App.tsx` boot state. Any new boot-time prerequisite must add a gate and a label branch, or it will race the release.
- **Date**: 2026-08-20
- **Status**: active

### AD-032

- **Decision**: Agent detection is per terminal profile, and the wizard's AGENT step uses the profile that the **chosen path** implies — not the saved default profile. `agent_catalog_all` sweeps every profile once at boot; `shell_profile_for_path` maps a path to a profile id.
- **Reason**: `agent_catalog` resolved only `shells::prefs::resolve_default`, so a user whose `claude` lives inside a WSL distro saw it marked "não encontrado no PATH" and the tile disabled whenever the default profile was the host — for a folder that was going to run inside the distro. WSLP-06 already detects agents inside a distro; nothing carried that answer to the wizard.
- **Trade-off**: The boot pays one `wsl.exe` per registered distro before the screen is released. Accepted: it is exactly the cost the wizard used to pay lazily on first open, and `agents::catalog`'s per-distro cache lives for the whole process, so it is paid once either way. The path→profile mapping is an IPC round trip per project selection rather than a pure frontend function — deliberate, so the prefix rule (`\\wsl.localhost\`, `\\wsl$\`) has exactly one implementation.
- **Scope**: `commands::agents::agent_catalog_all`, `commands::shells::shell_profile_for_path`, `src/types/agents.ts`, `PaneWizard`, `AgentStep`. `agent_catalog` stays for the Settings panel, which is about the default profile by definition. The `defaultAgentId` (AGT-01) is still resolved against the default profile only — a per-profile default was not asked for.
- **Date**: 2026-08-20
- **Status**: active

### AD-033

- **Decision**: `providerMeta().hasQuota` is the single predicate for a quota provider being shown at all. A provider without a consumption endpoint (`codex-cli`, `opencode` today) renders its Settings switch as **off and locked**, and is **not listed** in the ring's hover popover. `db::quota_prefs::default_providers` and the frontend's `DEFAULT_QUOTA_PREFS` seed only `claude-code`.
- **Reason**: Reported by the user: the two switches read `true` while being disabled — "ligado e você não pode desligar" — because migration 007 seeded all three as enabled while the UI locked the rows whose provider has no quota API. The value was not meaningless (it did control the popover), so the honest fix had to settle both sides on the same predicate rather than just repaint the switch.
- **Trade-off**: **Revokes** the part of QUOTA-26 that listed a non-quota provider in the popover with a "sem cota" badge and an explanatory note. That information is gone from the popover; the hint text survives in Settings › Geral. Migration 007 was deliberately **not** rewritten and **no** migration was added: an existing DB keeps `codex-cli`/`opencode` as `enabled: true` and behaves identically, because consumers derive from `hasQuota`. The day a second provider gains an endpoint, both the switch and the popover come back together with no stale data to fix. Cost of that choice: `default_providers()` no longer mirrors the 007 seed, so `quota_prefs`'s test asserts the seed literally instead of comparing against the function.
- **Scope**: `db::quota_prefs::default_providers`, `QuotaIndicator` (`listedProviderIds`, removal of the `!hasQuota` branch), `GeneralPanel` (locked row renders `false`), `SettingsShell::DEFAULT_QUOTA_PREFS`. There is no `.specs/features/quota-indicator/` file to annotate — the folder was lost with the pre-2026-08-20 `.specs` tree, so this AD is the record of the QUOTA-26 revocation.
- **Date**: 2026-08-20
- **Status**: active

### AD-034

- **Decision**: The Claude credential is read from the terminal **profile**, not from the host home. `quota::fetch` takes the default profile; `credential_path_in` resolves `dirs::home_dir()` for `Host` and `shells::home::wsl_home(distro)` (a `\\wsl.localhost\<distro>\<HOME>` UNC path) for a WSL profile. If the default profile has no readable credential, the remaining profiles from `list_profiles()` are tried in order, default first.
- **Reason**: Reported by the user: the ring never showed a quota on a Windows machine where "esta tudo configurado no ubunto da wsl". `credential_path()` was `dirs::home_dir()/.claude/.credentials.json`, i.e. `C:\Users\<user>\...`, which never existed there — every fetch ended in `QuotaError::NoCredential`. Same class of defect as AD-032: the app looked at the host while the agent lived in the distro.
- **Trade-off**: The fallback can surface a quota from a profile the user is not currently running in. Accepted, and it is why the fallback exists at all: a credential describes an **account**, and the usage endpoint returns that account's quota regardless of which machine ran `claude login` — so finding one anywhere beats showing nothing. The default profile is tried first precisely for the case where host and distro have *different* accounts logged in. Second cost: `real_read_credential` calls `list_profiles()` (one `wsl.exe -l -v`) on a cache miss, so at most once per 5-minute cache floor, plus once more on the single 401 re-read (QUOTA-21).
- **Scope**: `shells::home` (new), `quota::credential_path_in` / `credential_candidates` / `real_read_credential` / `fetch`, `commands::quota::quota_claude`. `read_credential` itself is untouched — the 64 KB abort and the read-only open (QUOTA-18, QUOTA-24) apply to the WSL path exactly as before, because it is still a plain `&Path` read over the 9P mount. No token is ever passed through a command line or a process pipe.
- **Date**: 2026-08-20
- **Status**: active

### AD-035

- **Decision**: The terminal profile is derived from the folder path only. The "Perfil de terminal" selector in Settings › Geral is removed, along with `shell_profiles_list` / `shell_profile_get` / `shell_profile_set`. The wizard's AGENT step lists **only** the agents installed in the profile the chosen path resolves to, and pre-selects "Terminal" (plain shell) rather than any agent.
- **Reason**: Three symptoms, one cause — a global "which machine" preference competing with a per-path fact. (a) The user reported the AGENT step pre-selecting `antigravity-cli`: `agent_default` → `resolve_effective_default` picks *the first installed agent in catalog order* against the **host** PATH, so on a Windows box with `claude` inside the distro and Antigravity on Windows, the pre-selection landed on a tile `AgentStep.SELECTABLE` does not even allow choosing. (b) The grid showed the whole catalog with the absent ones disabled, which on a host with no agent at all is a wall of dead tiles. (c) The selector could be set to a profile that contradicts the folder — and since `resolve_profile` already lets the path win (WSLP-07/WSLP-08), the setting only ever mattered for the *fallback*, while looking like it decided everything.
- **Trade-off**: Choosing Claude is now one extra click even when it is the only agent available — "Terminal" is pre-selected unconditionally, as asked, rather than "the default agent when it is genuinely available in this profile". Settings › Agentes still stores a default agent, but that preference no longer affects the wizard's pre-selection; it is now only the label in that panel. Say the word and it becomes "honour the stored default when the resolved profile actually has it installed". Second cost: with no selector, `prefs::resolve_default` always returns `Host` in production, so `\C:\...` folders resolve to Host and only `\\wsl.localhost\...` folders resolve to a distro — which is the intended behaviour, but it means a user cannot force a `C:\` folder to run inside WSL any more.
- **Scope**: `GeneralPanel`, `SettingsShell`, `commands::shells`, `lib.rs` invoke_handler, `PaneWizard`, `App` (`agent_default` / `defaultAgentId` dropped). Kept on purpose: migration 011, `prefs::default_profile`, `prefs::resolve_default` and `list_profiles` — the stored value is still the documented fallback of `profile_for_path`, and `list_profiles` feeds `agent_catalog_all` (BOOT-10) and the quota credential search (AD-034). Revokes WSLP-01, WSLP-02, WSLP-13, WSLP-19 (annotated in `.specs/features/wsl-terminal-profile/spec.md`) and the wizard half of AGT-01.
- **Date**: 2026-08-20
- **Status**: active

### AD-036

- **Decision**: `agents::launch::resolve_launch_command` now takes the `TerminalProfile` and probes **that** machine (`detect_installed_in`), and inside a distro the resolved absolute path from `type -P` replaces the bare command name in the argv. The WSL probe cache therefore stores `(agent id, absolute path)` instead of only the `installed` boolean, and `catalog::command_path_in` exposes it.
- **Reason**: Reported by the user: picking a provider for a WSL project opened a plain shell instead of the agent. `resolve_launch_command` called `detect_installed()` — the **Windows** `PATH` — even when `SessionConfig.profile` was `Wsl`, so `claude` living only inside the distro resolved as not installed and `spawn` fell back to a bare shell with a warning (AGT-04). `WSLP-06` was implemented for the catalog UI (`agent_catalog_all`) but never for the launch path, which is the half that actually runs the CLI. The absolute path matters for the same reason `WSLP-04` asked for it: `wrap`'s `env K=V ... <program>` argv is not a login shell, so a bare `claude` would only resolve if it sat in the distro's non-login `PATH` — never true for nvm, asdf or `~/.local/bin`.
- **Trade-off**: On the host the bare command name is kept (`command_path_in` returns `None` there) rather than switching to the absolute path: `resolve_command_in_path` prefers the `%PATHEXT%` match, but launching a resolved path re-introduces the `code`-shim-vs-`code.cmd` hazard that `editors.rs` already had to work around, and nothing was broken there. Second cost: the in-distro probe result is cached for the process lifetime, so installing an agent inside the distro mid-session still needs a restart — unchanged from `WSLP-06`.
- **Scope**: `agents::catalog` (`wsl_found`, `command_path_in`, cache type), `agents::launch` (`resolve_launch_command` signature, `apply_profile_command`), `terminal::manager::spawn_with` (one call site), `tests/agent_launch.rs`.
- **Date**: 2026-08-21
- **Status**: active

### AD-037

- **Decision**: Editors that accept `--remote` (VS Code and its forks: Insiders, Cursor, Windsurf, Trae, VSCodium) are launched as `--remote wsl+<distro> <path inside the distro>` when the folder resolves to a WSL profile. Declared as a `wsl_remote` column on `EditorDescriptor`, not a `match` on id. The UNC→POSIX split lives in `shells::wsl_path_parts`, which `profile_for_path` now also reads instead of parsing the prefix itself. This promotes the out-of-scope row of `wsl-terminal-profile` into `WSLP-21`.
- **Reason**: Reported by the user: opening a WSL folder in the editor lands in Restricted Mode. The original out-of-scope note assumed the Windows editor would "re-home the window itself" and that remoting would need the editor CLI installed inside the distro. Both were wrong: a `\\wsl.localhost\...` path is a network share to the host editor, hence untrusted (Restricted Mode: no extensions, no tasks, no in-distro terminal), and the host `code.cmd` installs its own server in the distro when given `--remote`. The note's own exit condition ("add when a manual test proves auto-remote does not fire") was met.
- **Trade-off**: The `wsl_remote` flag is a static guess per editor — a fork that drops `--remote` support would fail to open until the column is corrected, which is why editors not on the list keep receiving the UNC path (worse experience, but it always opens). Zed, Sublime and the JetBrains family therefore still land in whatever their own WSL handling is; wiring their per-vendor remote flags (`jetbrains-gateway`, Sublime's absence of one) is a separate feature. Also: `editors::open` derives the profile from the path with a `Host` default, like `git_init_command`, so it never reads the stored preference — one rule, one behavior.
- **Scope**: `shells::wsl_path_parts` + `profile_for_path` (refactor, same behavior — the existing derivation tests still pass unchanged), `editors::{EditorDescriptor, open_args, build_open_command, open}`, `.specs/features/wsl-terminal-profile/spec.md` (out-of-scope row struck, P4 story, `WSLP-21`, edge case).
- **Date**: 2026-08-21
- **Status**: active

### AD-038

- **Decision**: `commands::shells::shell_profile_for_path` now derives the profile with `TerminalProfile::Host` as a hardcoded default, never `prefs::resolve_default`. Same rule `git_init_command` and `editors::open` already followed (AD-037).
- **Reason**: Reported by the user: opening a plain Windows project (`C:\Users\...\OneDrive...`) was recognized as a WSL project, and the "Terminal" choice launched inside the distro instead of `cmd.exe`. AD-035's own trade-off note assumed "with no selector, `prefs::resolve_default` always returns `Host` in production" — true only on a fresh DB. A user who had picked a WSL default through the now-removed selector, before AD-035 shipped, still has that row in `terminal_profile_prefs`; if that distro is still registered, `resolve_default_with` returns it, not `Host`. `shell_profile_for_path` was the one remaining call site still asking `resolve_default` for that fallback, so a Windows-only `cwd` (no `\\wsl.localhost\` / `\\wsl$\` prefix) inherited a stale global preference instead of resolving to `Host`.
- **Trade-off**: A user cannot make a plain `C:\` folder default to WSL any more through any surviving mechanism — the last one is gone. Matches AD-035's stated intent exactly; this closes the gap between that intent and what the code actually did. `prefs::resolve_default` / `default_profile` / migration 011 stay untouched — `agent_catalog` and `agent_catalog_all` (no path context available) still need some default and keep reading the stored value.
- **Scope**: `commands::shells::shell_profile_for_path` (dropped the `db: State<Mutex<Db>>` parameter, now a pure wrapper with no I/O), `.specs/features/wsl-terminal-profile/spec.md` (`WSLP-02`, `WSLP-13` revoked-notes updated).
- **Date**: 2026-08-21
- **Status**: active

### AD-039

- **Decision**: Every in-distro probe re-execs into the distro user's own login shell in interactive mode — `bash -lc 'exec "${SHELL:-/bin/sh}" -lic "<script>"'` — and reads only the output that follows a `__SWARMDECK_PROBE__` marker. The wrapping and the marker stripping live in one place, `shells::probe`, used by `wrap::fetch_login_path`, `home::fetch_home` and `catalog::real_wsl_probe`. Separately, `commands::terminal::resolve_profile` stops reading `prefs::resolve_default` and hardcodes `Host`, finishing what AD-038 did for `shell_profile_for_path`; `pty_spawn` no longer touches the DB. New requirements `WSLP-22`, `WSLP-23`, `WSLP-24`; `WSLP-08` revoked.
- **Reason**: Reported by the user: with a WSL project and the Claude Code provider, the agent opened but every `SessionStart` hook died with `/bin/sh: 1: node: not found`, while the plain-terminal profile ran the same agent fine. `bash -lc` never reads a zsh user's `~/.zshrc`, which is where asdf, nvm and fnm install their shims, so the `PATH=` that `wrap` injects into the argv was missing `~/.asdf/shims`. Verified on the reference machine: `bash -lc 'printenv PATH'` returns no asdf entry, `bash -lc 'exec "$SHELL" -lic "printenv PATH"'` returns `/home/<user>/.asdf/shims` and resolves `node`. The second defect is the AD-038 one at the call site that actually spawns: `pty_spawn` still asked `resolve_default`, so a `C:\` project inherited the pre-AD-035 stored distro.
- **Trade-off**: An interactive shell runs the full rc, which is slower than `bash -lc` and can print a banner — hence the marker, and hence keeping the result cached per distro for the process lifetime. A rc that reads from stdin or hard-fails without a tty would break the probe where `bash -lc` worked; accepted, because that same rc already breaks the user's own terminal. `login_shell_script` interpolates a caller-supplied script without escaping single quotes, guarded by a `debug_assert`: every caller passes a literal from this codebase, and adding an escaper for a string no user can reach would be dead code.
- **Scope**: `shells::probe` (new), `shells::wrap::fetch_login_path`, `shells::home::fetch_home`, `agents::catalog::real_wsl_probe`, `commands::terminal::{resolve_profile, pty_spawn}`, `.specs/features/wsl-terminal-profile/spec.md` (P5 story, `WSLP-22`/`WSLP-23`/`WSLP-24`, `WSLP-08` revoked, two edge cases).
- **Date**: 2026-08-21
- **Status**: active

### AD-040

- **Decision**: The terminal pane sets an explicit `fontFamily` ending in `'Symbols Nerd Font Mono'`, and that font ships in the bundle as an unsubsetted 2.6 MB TTF under `src/assets/fonts/`. New feature `terminal-font` (`TFONT-01`..`TFONT-03`).
- **Reason**: Reported by the user: the ZSH prompt drew its git-branch glyph as a box. Two causes had to be closed together — xterm.js was left on its default `courier-new, courier, monospace`, and the machine has no Nerd Font at all (`fc-list | grep -i nerd` empty on Linux, and nothing matching in `/mnt/c/Windows/Fonts`). Fixing only the `fontFamily` would have named a font that does not exist on the target; shipping the file without the `fontFamily` would never be reached. The symbols-only variant goes last in the list so the system monospace still supplies the cell metrics, and only the missing code points fall through — that is the WebView's per-character fallback doing the work instead of a second font stack.
- **Trade-off**: 2.6 MB added to the bundle. Rejected converting to woff2 (~half the size): it needs `fonttools`+`brotli` installed locally, and the conversion would have to be re-run by hand on every font bump, for a saving that is noise next to the Tauri bundle. Rejected the ready-made woff2 the Nerd Fonts site serves: it is the proportional variant, whose icons would render wider than one cell and push the prompt out of alignment. Rejected shipping a full patched font (JetBrains Mono NF, ~4 MB) — it would also override the text face, a change nobody asked for.
- **Scope**: `src/components/terminal/TerminalPane.tsx` (`TERMINAL_FONT_FAMILY`), `src/styles.css` (`@font-face`), `src/assets/fonts/`. Any future terminal surface that constructs its own xterm must reuse `TERMINAL_FONT_FAMILY`, or it reintroduces the boxes. `src/lib/terminalSnapshot.ts` inherits the family through `term.options.fontFamily` and needs no change.
- **Date**: 2026-08-21
- **Status**: active

### AD-041

- **Decision**: The new-version notice is a toast rendered by `App.tsx` off the same `update://available` event that already lights the header dot (REL-51), gated on `!booting`, and governed by its own persisted preference (`update_settings.toast_enabled`, migration 012) — separate from `auto_check`. New feature `update-toast` (`TOAST-01`..`TOAST-10`).
- **Reason**: The user asked for a toast at the bottom center once the home screen is released, with a button that lands on Settings › Updates, plus a switch to turn the toast off. Reusing the existing event costs nothing: `apply.rs` already emits `{ version }` hourly and at boot, so the toast needs no second network path and no new backend polling. The preference is its own column because the user's stated reason for the switch is the toast being intrusive — folding it into `auto_check` would force someone who dislikes the toast to also stop checking for updates, and would silently kill the header dot they may still want.
- **Trade-off**: A second boolean in the same single-row table, and `SettingsShell` grew an `initialSection` prop so the toast's button can land on the right section. Rejected a general toast/notification system: one caller, one message — a second use case can generalize it. Rejected auto-dismiss (the user chose "stays until closed"): a notice that vanishes on its own reproduces the very problem the dot already has.
- **Scope**: `src-tauri/src/db/migrations/012_update_toast.sql`, `db::settings`, `commands::update`, `lib.rs` handler, `src/App.tsx`, `src/components/shell/UpdateToast.tsx`, `src/routes/settings/SettingsShell.tsx`, `src/components/settings/UpdateSettings.tsx`. Any future consumer of `update://available` must not assume the toast is the only listener — the header dot reads the same event with different rules.
- **Date**: 2026-08-21
- **Status**: active

### AD-042

- **Decision**: The `main` window's geometry is persisted in a single-row `window_state` table (migration 013) and applied inside `setup` by `window_geometry::resolve`, a pure function over rectangles. A window closed while maximized reopens with the 90%-centered fallback on the monitor that held it, not maximized. New feature `window-geometry` (`WGEO-01`..`WGEO-09`).
- **Reason**: The user asked for the window to reopen exactly where and how it was closed, with a defined fallback when a monitor is gone (primary monitor, centered, 90% x 90%). `tauri-plugin-window-state` covers the persistence but its out-of-bounds fallback is "let the OS place it", so the required behavior would have to be detected after the fact and overridden — more code than owning the decision. Keeping the decision in a pure `resolve(saved, monitors, primary)` is what makes the monitor-removed case testable at all: no window and no monitor are needed to exercise it.
- **Trade-off**: The maximized state is deliberately not restored as maximized (user decision): restoring it faithfully would also require tracking the pre-maximize rectangle so un-maximize behaves, and the user preferred the 90% default. Writes are debounced by a 1 s flusher loop rather than written per event, so a crash loses at most one second of geometry. Rejected storing logical pixels: every Tauri monitor and window API in this path is physical, and a scale-factor round trip would only add rounding error.
- **Scope**: `src-tauri/src/windows/geometry.rs`, `src-tauri/src/db/window_state.rs`, `src-tauri/src/db/migrations/013_window_state.sql`, `db/mod.rs`, `lib.rs` `setup`. Any future window whose geometry should persist must get its own row — the table is keyed to `id = 1` and belongs to `main` alone.
- **Date**: 2026-08-21
- **Status**: active

### AD-043

- **Decision**: SwarmDeck renews the Claude Code OAuth access token itself when it is expired — `POST https://platform.claude.com/v1/oauth/token` with `grant_type=refresh_token` — and **writes the rotated token pair back** into the same `~/.claude/.credentials.json` it read. This revokes `QUOTA-18` ("the credential file is opened read-only"). New feature `quota-token-refresh` (`QTR-01`..`QTR-15`). Rejected: spawning hidden `claude`/`codex`/`opencode` processes at boot to make the CLI write the file.
- **Reason**: The reported symptom was a Windows machine whose quota ring stayed empty until the user opened a terminal and ran `claude`. The boot warm-up (BOOT-09) was already running and already blocking the overlay — what it read was an expired token. The CLI is documented as failing to refresh its own token when run as a subprocess without a TTY (anthropics/claude-code #28827, #53063, #50743), so the spawn approach the user first asked for would cost one process per profile per provider at every boot and produce nothing; AD-033 also means no provider other than Claude Code has a usage endpoint to feed. Writing back is not optional: the endpoint rotates the refresh token, so renewing without persisting would invalidate the CLI's own login.
- **Trade-off**: The app now writes a file owned by another program. Mitigated by an atomic write (temp + `sync_all` + rename, original unix mode preserved), by touching only `accessToken`/`refreshToken`/`expiresAt` inside a clone of the original JSON, and by a process-wide `tokio::sync::Mutex` so two concurrent fetches never spend the same rotation. Not mitigated: a `claude` process refreshing at the same instant — rotation means one of the two writers loses and the user re-logs in. `OAUTH_CLIENT_ID` and the endpoint are values observed in the CLI's issue tracker, not a public contract; a wrong value fails the request and degrades to the previous behavior.
- **Scope**: `src-tauri/src/quota.rs` (the only place in the app that writes the credential file), `src-tauri/src/shells/home.rs` (marker), `src/components/shell/QuotaIndicator.tsx`. Any future feature reading that file must go through `locate_credential`/`ensure_fresh` rather than opening the path itself, or it will race with the refresh.
- **Date**: 2026-08-21
- **Status**: active

### AD-044

- **Decision**: Configurações › Geral lists only providers the scan found (`provider_prefs.found_in` non-empty) — this **revokes `QUOTA-31`**, which mandated the full Rust catalog with the missing ones rendered locked. A provider found in more than one terminal profile gets a selector in the center of its row, and the marked profile is the **only** place the quota fetch reads that provider's credential. With nothing marked, the candidate chain of `QUOTA-15` still applies. New feature `quota-provider-source` (`QSRC-01`..`QSRC-09`).
- **Reason**: The catalog-wide list showed five rows on a machine with one CLI installed, four of them locked and useless, while the scan next door already knew which were real. The per-profile choice exists because host and distro can hold **different accounts**: the old chain would silently show the host account's quota for a user who runs everything inside the distro. Keeping the chain when nothing is chosen is what prevents a regression for anyone who never opens the window — the reported case that motivated `QUOTA-15` (Windows whose `.claude/` only exists inside WSL) still works untouched.
- **Trade-off**: The selector pairs `found_in` **labels** with `agent_catalog_all` profiles by label, because `found_in` stores labels (PROV-02) and the persisted value is a `profileId`. A label with no match silently drops out of the options instead of becoming a dead radio. Rejected changing `provider_prefs.found_in` to carry ids: it would mean a data migration plus touching the Provedores panel, to buy exactness in a case (`label` collision) that `list_profiles` does not produce. Also rejected: marking nothing when the user has not chosen — the row would say nothing about where the quota comes from, while the backend does have an answer (the default profile).
- **Scope**: `src/routes/settings/GeneralPanel.tsx`, `src/routes/settings/SettingsShell.tsx`, `src-tauri/src/db/quota_prefs.rs` (`profileId` inside the existing JSON column — no migration), `src-tauri/src/quota.rs` (`credential_candidates`), `src-tauri/src/commands/quota.rs`. Any future provider that gains a consumption endpoint inherits both the row and the selector by flipping `providerMeta().hasQuota`.
- **Date**: 2026-08-21
- **Status**: active

### AD-045

- **Decision**: The terminal pane refuses a proposed geometry below a column floor (`MIN_COLS = 20`) instead of applying whatever `FitAddon` returns, and every resize path in the pane — the initial fit included — goes through the same guarded `syncSize`. New feature `terminal-resize-floor` (`TRSZ-01`..`TRSZ-03`).
- **Reason**: `FitAddon` clamps its proposal at `MINIMUM_COLS = 2` rather than declining, so any frame that measures the pane box narrow (but not zero, the only case the old guard caught) drove the xterm — and, through `pty_resize`, the provider itself — to 2 columns. An Ink-based CLI then emits its own `\r\n` per segment, so each character becomes a *logical* line, and xterm's widening reflow only rejoins lines marked `isWrapped`. The user's report — scrollback collapsed into a one-character strip on the left — is that damage, and it is permanent for the life of the pane.
- **Trade-off**: A pane genuinely narrower than 20 columns keeps its previous size, so the shell there wraps at a width that no longer matches the box. Accepted: `tauri.conf.json` pins `minWidth: 900`, which leaves ~55 columns in the narrowest 2×2 cell, so the floor never bites a real layout — and a 19-column pane is unreadable either way. Rejected a second clamp inside `pty_resize` (Rust): the frontend owns the geometry it measures, and a floor in two languages is a floor to keep in sync. Also raised `scrollback` to 10 000 (`TRSZ-03`): a legitimate narrowing re-wraps history and the library default of 1000 discards the overflow — measured, 600 lines became 11.
- **Scope**: `src/components/terminal/TerminalPane.tsx`. Any future code that resizes a pane or forwards dimensions to a PTY must route through `syncSize` rather than calling `fit()` directly.
- **Date**: 2026-08-21
- **Status**: active

### AD-046

- **Decision**: The terminal pane forces xterm to re-measure the cell and drop its glyph width cache by assigning `terminal.options.fontFamily` a value **different** from the canonical one and then restoring it — at two points: when `document.fonts.ready` resolves after `terminal.open()`, and inside `syncSize` after both guards and before `fitAddon.fit()`, on every applied resize. New feature `terminal-glyph-metrics` (`TGLY-01`..`TGLY-03`).
- **Reason**: The DOM renderer's `WidthCache._measure` **stores `0`** when `offsetWidth` reads zero, unlike `CharSizeService`, which keeps its previous value. Nothing clears that cache afterwards: only `setFont()` or a char-size-changed event, and the second one never fires — when the pane becomes measurable again `RenderService` re-measures and gets the same metrics back, because the system monospace never changed. Every later repaint reuses the zeroed widths, which is why the CLI's own `/clear` cannot help, and the next `fit()` reflows the buffer against the wrong cell width. That single wrong metric explains all three reported symptoms at once — the character strip pinned to the left edge, letters landing at irregular offsets, and rows clipped mid-word on the right. Assigning the *same* `fontFamily` back would be a silent no-op: `OptionsService` fires `onOptionChange` only when the assigned value differs from the stored one — hence TGLY-03, tested as a sequence rather than a single write. The hypothesis that AD-045's column floor was firing in a hidden pane was **falsified** before writing the spec: `syncSize` returns before `fit()` when the proposal is below `MIN_COLS`, and `FitAddon.proposeDimensions()` returns `undefined` when the measured cell is zero, so no degenerate geometry can be applied.
- **Trade-off**: One extra measure-element read plus a width-cache rebuild for the visible rows per settled resize, at the existing 100 ms debounce — on top of a full refresh that `fit()` already triggered through `RenderService.handleResize`. Accepted: it rewrites the visible rows once, not the 10 000-line scrollback. Rejected reaching into `terminal._core` to call the renderer's invalidation directly: it is private API that a minor xterm bump can rename, and the public option write reaches the same `setFont()`. Rejected detecting *which* resize followed a degenerate measurement (a "was the box measurable" flag): more code for narrower coverage, and the user-confirmed trigger is the drag/resize itself, not the return of a hidden pane.
- **Scope**: `src/components/terminal/TerminalPane.tsx` (`refreshMetrics`, the `document.fonts.ready` hook, `syncSize`). Any future code path that applies a geometry to a pane must go through `syncSize`, which now owns the invalidation as well as the floor. Does NOT repair a buffer already corrupted by the AD-045 mechanism: those are real characters in real buffer lines, and only restarting that terminal clears them.
- **Date**: 2026-08-22
- **Status**: active

## Handoff

- **Feature**: `terminal-glyph-metrics` (`.specs/features/terminal-glyph-metrics/`) — AD-046
- **Phase / Task**: Execute in progress. T1 done, T2 done, T3 (real-app verification) pending.
- **Completed**: `TerminalPane` gained `refreshMetrics`, which writes a non-canonical `fontFamily` and then restores `TERMINAL_FONT_FAMILY`; it is called from a `document.fonts.ready` hook guarded by `disposed` (TGLY-01) and from inside `syncSize`, after both guards and before `fitAddon.fit()` (TGLY-02). Tests: 5 new in `TerminalPane.test.tsx` — the xterm mock's `options` is a `Proxy` that records every `fontFamily` write into the same ordered log as each `fit()`, which is what proves the invalidation happens *before* the fit and passes through a different value first (TGLY-03); the `ResizeObserver` mock now captures its callback so a settled resize between two legitimate sizes can be driven. `npx vitest run` 529 passed, `npx tsc --noEmit` clean. Discrimination sensor: 3 mutations (drop the call in `syncSize`; collapse to a single assignment; move the call above the guards), 3 killed.
- **Next step**: T3 — run `npm run tauri dev` on the Windows machine, open the `claude` provider in a single tab, build up history, then **drag/resize the pane** (the repro the user executed) and compare against `print/bug_terminal.png`. If an artifact survives, capture `terminal.buffer.active.getLine(y).translateToString(true)` for the dirty row: dirty text in the buffer is AD-045 residue (restart that pane, covered by the non-goal); a clean buffer under dirty pixels is the compositor, and that earns a new spec for `WEBKIT_DISABLE_DMABUF_RENDERER=1`. Not observable from this WSL2 environment.
- **Blockers**: none.
- **Uncommitted files**: `src/components/terminal/TerminalPane.tsx`, `src/components/terminal/TerminalPane.test.tsx`, `.specs/features/terminal-glyph-metrics/tasks.md`, `.specs/features/terminal-resize-floor/spec.md`, `.specs/project/STATE.md`. Nothing committed — AD-013 (no agent commits in this base).
- **Branch**: `master`

### Previous handoff — `terminal-resize-floor`

- **Feature**: `terminal-resize-floor` (`.specs/features/terminal-resize-floor/`) — AD-045
- **Phase / Task**: Execute complete (Small scope: Design and Tasks skipped). TRSZ-01..TRSZ-03 implemented; verification pass done (`validation.md`, verdict PASS).
- **Completed**: `TerminalPane` gained `MIN_COLS = 20` and `TERMINAL_SCROLLBACK = 10_000`; `syncSize` now consults `fitAddon.proposeDimensions()` and refuses to apply anything below the floor (so neither the xterm nor `pty_resize` receives it); the bare initial `fitAddon.fit()` was replaced by a `syncSize()` call, putting the mount path behind the same guard. Tests: 4 new in `TerminalPane.test.tsx` (mock `FitAddon` gained a controllable `proposeDimensions`, and the new cases stub `clientWidth`/`clientHeight`, which jsdom reports as 0). `npx vitest run` 475 passed, `npx tsc --noEmit` clean. Discrimination sensor: 3 mutations, 3 killed. Root cause reproduced independently with `@xterm/headless@5.5.0` before writing the spec.
- **Next step**: Confirm on the real app, with a provider running, that scrolling back no longer shows the one-character strip. The pane whose history is already corrupted stays corrupted — restart that terminal. Not observable from this WSL2 environment.
- **Blockers**: none.
- **Uncommitted files**: everything from the previous handoff plus `src/components/terminal/TerminalPane.tsx`, `src/components/terminal/TerminalPane.test.tsx`, and the new `.specs/features/terminal-resize-floor/`. Nothing committed — no commit was requested.
- **Branch**: `master`

### Previous handoff — `quota-provider-source`

- **Feature**: `quota-provider-source` (`.specs/features/quota-provider-source/`) — AD-044 (revokes QUOTA-31)
- **Phase / Task**: Execute complete (Medium scope: Design and Tasks inline). QSRC-01..QSRC-09 implemented.
- **Completed**: `QuotaProvider` gained `profile_id` (serde-default, inside the existing `providers` JSON — no migration); `credential_candidates` takes `chosen` and returns a single-element list when the user chose; `locate_credential`/`ensure_fresh`/`fetch` thread it through and skip `list_profiles` entirely in that case; `quota_claude` resolves the choice via a new pure `chosen_profile`. Front: `GeneralPanel` takes `providers`/`profiles`/`defaultProfileId` instead of `agentIds`, lists only found providers, and renders a radio group of terminal chips when a provider was found in more than one; `SettingsShell` fetches `agent_catalog_all` so the shell works in the standalone settings window too. Discrimination sensor: 5 mutations, 5 killed.
- **Next step**: Visual/behavior check on the Windows + WSL machine — that the chips show both terminals for `claude-code` and that marking the distro makes the ring read that account's quota. Not reproducible from this Linux dev box (`list_profiles` returns host only).
- **Blockers**: none.
- **Uncommitted files**: the four files of the previous handoff plus `src-tauri/src/db/quota_prefs.rs`, `src-tauri/src/quota.rs`, `src-tauri/src/commands/quota.rs`, `src/routes/settings/GeneralPanel.tsx`, `src/routes/settings/GeneralPanel.test.tsx`, `src/routes/settings/SettingsShell.tsx`, `src/routes/settings/SettingsShell.test.tsx`. Nothing committed — no commit was requested.
- **Branch**: `master`

### Previous handoff — `terminal-header-accent`

- **Feature**: `terminal-header-accent` (`.specs/features/terminal-header-accent/`) — no AD: nothing previously decided was revoked, the color already existed in the project record and was simply unused by the frontend.
- **Phase / Task**: Execute complete (Small scope: Design and Tasks skipped). HACC-01..HACC-03 implemented.
- **Completed**: `TerminalHeader` gained an `accentColor` prop applied as the header's inline `borderColor`; `.terminal-header` in `src/App.tsx` went from `border-bottom` to a full `border` on all four sides; `fetchProjectNames` became `fetchProjects` and now carries `{ name, color }` per normalized path (`projectByPath`, `projectColorFor`), fed by the same `project_list` call. Tests: 2 in `TerminalHeader.test.tsx`, 2 in `App.test.tsx`. Discrimination sensor: 1 mutation (`borderColor: undefined`), killed by both header and App tests.
- **Next step**: Visual check on a real window — the header outline sits just inside the pane's own 1px border, so the two lines are adjacent by design. Not verifiable from this WSL2 environment.
- **Blockers**: none.
- **Uncommitted files**: `src/App.tsx`, `src/App.test.tsx`, `src/components/terminal/TerminalHeader.tsx`, `src/components/terminal/TerminalHeader.test.tsx`. Nothing committed — no commit was requested.
- **Branch**: `master`

### Previous handoff — `quota-token-refresh`

- **Feature**: `quota-token-refresh` (`.specs/features/quota-token-refresh/`) — AD-043
- **Phase / Task**: Execute complete. QTR-01..QTR-15 implemented; standalone verification pass done (`validation.md`, verdict PASS), `validate_spec.py` and `validate_state.py` clean.
- **Completed**: `quota.rs` gained `RefreshToken`, `expiresAt`/`refreshToken` parsing, `locate_credential`, `needs_refresh`, `parse_refresh_response`, `apply_refreshed`, `write_credential_atomic`, `ensure_fresh_with`/`ensure_fresh` behind a `tokio::sync::Mutex`, wired ahead of the fetch in `quota::fetch`. `QuotaIndicator` gained a 30 s retry effect for the `no_credential`/`unauthorized` states. `cargo test` 302 passed / 1 failed (pre-existing WSL argv test), `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt` applied, `npx tsc --noEmit` clean, `npx vitest run` 444 passed. Discrimination sensor: 8 mutations, 8 killed.
- **Next step**: Confirm on a real machine that the exchange actually succeeds — `OAUTH_TOKEN_URL` and `OAUTH_CLIENT_ID` were taken from the CLI's issue tracker, not from a documented contract. The safe test is a machine whose token has expired: the ring should fill at boot, and `claude` should still work afterwards. Nothing here can be proven from this Linux dev environment.
- **Blockers**: no Windows machine and no expired credential available in this environment.
- **Uncommitted files**: `src-tauri/src/quota.rs`, `src-tauri/src/shells/home.rs`, `src-tauri/Cargo.toml`, `src/components/shell/QuotaIndicator.tsx`, `src/components/shell/QuotaIndicator.test.tsx`. Nothing committed — no commit was requested.
- **Branch**: `master`

### Previous handoff — `window-geometry` (committed as `28494a2`)

- **Feature**: `window-geometry` (`.specs/features/window-geometry/`) — AD-042
- **Phase / Task**: Execute complete. WGEO-01..WGEO-09 implemented; standalone verification pass done (`validation.md`, verdict PASS), `validate_spec.py` and `validate_state.py` clean.
- **Completed**: migration 013 + `db::window_state`, `windows/geometry.rs` (`resolve`/`restore`/`watch`/`spawn_flusher`/`flush`), wiring in `lib.rs` `setup`. `cargo test` 282 passed / 1 failed (pre-existing `terminal::manager::tests::build_command_wsl_inclui_id_do_terminal_como_entrada_de_env`, unrelated), `cargo check --all-targets` clean. Discrimination sensor: 14 mutations, 2 survivors found and closed by new boundary tests.
- **Next step**: Visual check on a real display — that the window is never painted at the `tauri.conf.json` default before the restored geometry lands (WGEO-04), and that a real unplugged-monitor case falls back as specified. Neither is exercisable from this WSL2 environment.
- **Blockers**: no display for a GUI run on this machine.
- **Uncommitted files**: `src-tauri/src/windows/geometry.rs`, `src-tauri/src/db/window_state.rs`, `src-tauri/src/db/migrations/013_window_state.sql`, `src-tauri/src/db/mod.rs`, `src-tauri/src/lib.rs`. Nothing committed — the user was not asked for a commit.
- **Branch**: `master`

### Previous handoff — `wsl-terminal-profile` post-ship defect run

- **Feature**: `wsl-terminal-profile` — post-ship defect run (AD-036, AD-037)
- **Phase / Task**: Execute. Two defects reported by the user and fixed: the provider not launching inside the distro (AD-036, `WSLP-04`/`WSLP-06` conformance) and the editor opening in Restricted Mode (AD-037, new `WSLP-21`).
- **Completed**: `cargo test -p swarmdeck` green (16 suites, 0 failed), `cargo clippy -p swarmdeck --all-targets -- -D warnings` clean, `cargo fmt --check` clean. Frontend untouched, so no `tsc`/`vitest` run was needed.
- **Next step**: Manual verification on the reference Windows machine — the two new behaviors are pure-function tested (`wsl_path_parts`, `open_args`, `apply_profile_command`, `wsl_found_with`) but cannot be exercised from this Linux dev environment, which has no registered `wsl.exe` distro.
- **Blockers**: same platform constraint as every WSL branch in this feature.
- **Uncommitted files**: `src-tauri/src/{shells/mod.rs,agents/catalog.rs,agents/launch.rs,editors.rs,terminal/manager.rs}`, `src-tauri/tests/agent_launch.rs`. Nothing committed.
- **Branch**: `master`

### Previous handoff — `terminal-boot-loading`

- **Feature**: `terminal-boot-loading` (`.specs/features/terminal-boot-loading/`)
- **Phase / Task**: Execute complete. BOOT-01 through BOOT-12 implemented; `cargo check --workspace --all-targets`, `cargo clippy -- -D warnings`, `cargo fmt --check` and `npx tsc --noEmit` clean, full `vitest` suite green (431 tests).
- **Completed**: BOOT-01 (shared `proc::hide_console` + 7 call sites), BOOT-02/03 (pane skeleton + `onReady`), BOOT-04..BOOT-07 (`BootSplash` and the boot state machine in `App.tsx`), BOOT-08 (existing tokens only, `prefers-reduced-motion` honoured), BOOT-09 (quota gate + backend cache warm-up), BOOT-10 (`agent_catalog_all` sweep), BOOT-11/BOOT-12 (path → profile → that profile's agents in the wizard).
- **In-progress**: none.
- **Next step**: Manual verification on the reference Windows machine (checklist in `.specs/features/terminal-boot-loading/spec.md`) — the console-flash fix and the WSL restore path cannot be exercised from this Linux dev environment. The user asked to review before any commit.
- **Blockers**: same platform constraint recorded for `wsl-terminal-profile`: no registered `wsl.exe` distro in CI or on this dev machine, so BOOT-01 is proven by inspection (`grep` over the call sites) rather than by execution.
- **Uncommitted files**: this feature's diff. Nothing committed — the user asked to review first.
- **Branch**: `master`

### Previous handoff — `wsl-terminal-profile`

- **Feature**: `wsl-terminal-profile` (`.specs/features/wsl-terminal-profile/`)
- **Phase / Task**: Execute complete. All 15 tasks (T1-T15) implemented and gate-checked; independent Verifier ran and returned **PASS** (`.specs/features/wsl-terminal-profile/validation.md`).
- **Completed**: T1-T15, all of P1/P2/P3 plus edge cases (WSLP-01 through WSLP-20).
- **In-progress**: none.
- **Next step**: Local commit(s) — the user asked to commit everything together at the end of the session rather than per task, so nothing has been committed yet. Then run the manual verification checklist in `spec.md` on the reference Windows machine (the WSL branch cannot be exercised by CI or by this Linux dev environment).
- **Blockers**: The WSL branch cannot be exercised by CI (`.github/workflows/ci.yml` runs on `ubuntu-22.04` and `windows-latest` with no registered distro) or by this development machine (Linux/WSL2, no real `wsl.exe` distro to spawn). Every branch is covered by pure-function tests against fixtures instead; the Verifier's discrimination sensor confirmed those tests actually catch regressions (3/3 injected mutations killed).
- **Uncommitted files**: the full feature diff (28 files via `git status --porcelain`) plus `package-lock.json` (modified, pre-existing, unrelated). `.specs/` stays untracked and gitignored.
- **Branch**: `master`

### AD-036

- **Decision**: Configurações › Provedores stops choosing a "default agent" and becomes the switchboard for which providers the new-terminal wizard offers. Per-provider state (enabled + the terminal profiles where the CLI was found) is persisted in `provider_prefs` (migration 014), and `AgentStep`'s hard-coded `SELECTABLE = {claude-code}` is gone: a tile is clickable when the provider is enabled **and** installed in the profile that path resolves to.
- **Reason**: AD-035 had already revoked the decision the old card grid took (the wizard pre-selects "Terminal", not an agent), so the panel was steering a preference nothing read. Worse, it fed on `agent_catalog`, which only inspects the default profile — on a Windows host with the CLIs inside WSL it labelled an installed `claude` "não encontrado no PATH". The user asked for the switch to be what gates the wizard, and for the scan result to be saved.
- **Trade-off**: AGT-01/AGT-03/AGT-04 lose their UI. `agent_default`, `agents::prefs` and table `agent_prefs` (migration 004) stay in the Rust with no frontend caller — removing them is a diff this feature does not need to pay, and the commands stay registered. Also, every catalog provider now becomes launchable: only Claude Code declares session (`--session-id`/`--resume`) and permission-mode flags, so the others open without session restore and without quota reading. Accepted explicitly by the user.
- **Scope**: `src/routes/settings/AgentPanel.tsx`, `src/routes/settings/SettingsShell.tsx`, `src/components/terminal/{AgentStep,PaneWizard}.tsx`, `src/App.tsx`, `src-tauri/src/commands/providers.rs`, `src-tauri/src/db/provider_prefs.rs`. Any future feature adding a catalog agent inherits the switch for free — it must not re-introduce a per-id allow-list in the frontend.
- **Date**: 2026-08-21
- **Status**: active

### AD-037

- **Decision**: The host terminal profile is labelled "Windows", not "Windows (padrão)".
- **Reason**: The label is now read in a list of *where a provider was found*, where "(padrão)" says nothing about the place — and the default profile is no longer a user-facing choice (AD-035 removed the selector).
- **Trade-off**: `shells::list::host_entry` is the single source, so the rename lands in both the providers list and the wizard badge at once; BOOT-12's acceptance text and `wsl-terminal-profile/design.md` were updated to match.
- **Scope**: `src-tauri/src/shells/list.rs` and every consumer of `ProfileEntry::label`.
- **Date**: 2026-08-21
- **Status**: active
