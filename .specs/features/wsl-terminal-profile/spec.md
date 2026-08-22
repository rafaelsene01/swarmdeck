# WSL Terminal Profile Specification

> **Partial revocation, 2026-08-20 (AD-035).** `WSLP-01`, `WSLP-02`, `WSLP-13`
> and `WSLP-19` described the "Perfil de terminal" selector in Settings ›
> Geral. That selector was removed: the profile is derived from the folder path
> (`WSLP-07`/`WSLP-08`, exposed as `shell_profile_for_path`), so a global
> preference had nothing left to decide — and picking it wrong hid the agents
> installed inside the distro. Everything else in this spec stands, including
> the whole path→profile derivation, the argv construction and the hard error
> on an unavailable profile.

## Problem Statement

On Windows, SwarmDeck spawns the OS default program in the PTY (`CommandBuilder::new_default_prog()`, `src-tauri/src/terminal/manager.rs:52`) and detects agent CLIs by resolving bare binary names in the host Windows `PATH` (`src-tauri/src/agents/catalog.rs:187`). A developer whose entire toolchain lives inside WSL — repos under `\\wsl.localhost\<distro>\home\...`, `claude` installed only in the distro, nothing installed in PowerShell or `cmd` — gets an app that cannot run anything. Observed on the reference machine: picking a WSL folder in the project form opens `cmd.exe`, which prints `Não há suporte para caminhos UNC. Padronizando para pasta do Windows.` and lands in `C:\Windows`, and the agent catalog lists every CLI as not installed.

The fix is not a path-translation layer. `wsl.exe --cd` already accepts UNC, `C:\`, and Linux paths, and `strip_verbatim_prefix` (`src-tauri/src/projects/service.rs:425`) already stores UNC WSL paths correctly. What is missing is a chosen execution profile: *which machine* a terminal, a CLI probe, and `git init` run on.

## Goals

- [ ] A Windows user with WSL can open a terminal in a WSL-hosted project and get a shell whose `pwd` is that project inside the distro.
- [ ] With a WSL profile active, the agent catalog reports the CLIs actually installed inside that distro, and launching one runs the in-distro binary with the app's session and permission-mode flags intact.
- [ ] Nothing that works today on the host regresses: host projects, host CLIs, macOS and Linux behavior are untouched.
- [ ] Zero schema change to `projects` and zero path-translation code.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| ~~`code --remote wsl+<distro>` on editor launch~~ | **Promoted into scope as `WSLP-21` (AD-037, 2026-08-21).** The exit condition written here — "add when a manual test proves auto-remote does not fire" — was met: the user reported that opening a `\\wsl.localhost\...` project lands the window in Restricted Mode. The assumption that the editor CLI would have to live inside the distro was wrong: the host `code.cmd` takes `--remote wsl+<distro>` and installs its own server in the distro. |
| POSIX shell picker (zsh / fish / bash) on macOS and Linux | Choosing a login shell is a cosmetic preference; crossing a filesystem and toolchain boundary is not the same problem. The preference is stored as a string enum so this costs no migration later. |
| A `profile_id` column on `projects` | The profile is derivable from the stored path (`\\wsl.localhost\<distro>\...`), so a column would add a migration, a backfill, and duplicate rows for the same directory without answering a question the path cannot. |
| Hand-written `C:\x` to `/mnt/c/x` translation | `wsl.exe --cd` performs the conversion, and `/mnt` is user-configurable via `/etc/wsl.conf` — any table we wrote would be a guess. |
| Browsing the WSL filesystem inside the app | The Tauri folder dialog already reaches `\\wsl.localhost\...`. No new picker needed. |
| Per-terminal profile override | The default preference plus path derivation covers both real cases. Add when a user needs two profiles for the same directory at once. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Legacy `\\wsl$\<distro>\` prefix | Treated as a synonym of `\\wsl.localhost\<distro>\` in path derivation | Only `.localhost` was verified on the reference machine, but `\\wsl$` is the older documented form and still emitted by some Windows builds; ignoring it would silently drop those paths to the default profile | n |
| WSL1 distros | Listed and selectable, tagged `WSL1` in the label | `--cd` and `bash -lc` work on WSL1; blocking it would remove a working setup on a guess. The tag lets a user correlate odd behavior with the version | n |
| `git init` when the path is `C:\...` but the default profile is WSL | Runs inside the profile, so the working directory becomes `/mnt/c/...` | Same derivation rule as the terminal — one rule, one behavior. Splitting them would mean a repo initialized by a different git than the one the terminal uses | n |
| `.specs/` tree | Recreated from this feature onward; `.specs/` is gitignored and absent from this clone | Prior specs are unrecoverable from the repo; `AD-001` through `AD-024` survive only as code-comment references, so the decision log resumes at `AD-025` | n |
| UI strings | New strings written inline in pt-BR, like the rest of the app | No `en.json` or `pt.json` exists; introducing i18n would be a separate feature | n |
| Requirement prefix | `WSLP`, added to the prefix list in `.claude/rules/spec-driven-changes.md` | Free — existing prefixes are AGT, CHROME, EDITOR, EMPTY, HDR, KAN, LAYOUT, MCP, MIN, PERM, PROJ, QUOTA, REL, SESS, SET, SHOT, SILENT, STAT, TAB, TERM, WIN | n |
| Detection cache invalidation | Cached per profile until the stored preference changes or the app restarts | A CLI installed mid-session is rare; re-probing on every catalog read would boot a stopped distro and cost seconds | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Run terminals and agent CLIs inside a WSL distro (MVP)

**User Story**: As a Windows developer whose toolchain lives in WSL, I want to pick my WSL distro as the terminal SwarmDeck uses, so that a terminal opens in my WSL repo and `claude` actually runs.

**Why P1**: Without it the app is unusable for this setup — the terminal lands in `C:\Windows` and every agent shows as not installed.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHERE the host is Windows and at least one non-internal WSL distro is registered, the system SHALL offer a profile list containing the host shell plus one entry per distro.
2. WHEN the user selects a profile in Settings THEN the system SHALL persist that selection and apply it to every terminal opened afterwards.
3. WHEN a terminal is opened with a WSL profile and no agent THEN the system SHALL spawn `wsl.exe -d <distro> --cd <cwd>` with no trailing `--`, so the distro login shell runs.
4. WHEN a terminal is opened with a WSL profile and an installed agent THEN the system SHALL spawn `wsl.exe -d <distro> --cd <cwd> -- env PATH=<login PATH> SWARMDECK_TERMINAL_ID=<id> <absolute CLI path> <agent flags>`.
5. The system SHALL build that command as argv entries only, containing no shell metacharacter that a shell would have to expand.
6. WHILE the active profile is a WSL distro, the system SHALL detect agent CLIs by running `bash -lc 'type -P <commands>'` inside that distro instead of scanning the Windows `PATH`.
7. The system SHALL resolve a `cwd` beginning with `\\wsl.localhost\<distro>\` or `\\wsl$\<distro>\` to that distro profile, overriding the stored default.
8. IF the `cwd` names no distro THEN the system SHALL use the stored default profile.
9. The system SHALL pass `SWARMDECK_TERMINAL_ID` to the in-distro child process.

**Independent Test**: On Windows with Ubuntu-24.04 registered, select the Ubuntu profile in Settings, add the project `\\wsl.localhost\Ubuntu-24.04\home\<user>\<repo>`, open a terminal with the Claude Code agent: the pane shows Claude Code running with `pwd` equal to `/home/<user>/<repo>`, and the Settings agent list marks Claude Code installed.

---

### P2: Fail loudly when the profile is unavailable

**User Story**: As a user whose distro was renamed, stopped, or unregistered, I want the app to tell me the profile is unusable, so that I never debug an agent that silently ran on the wrong machine.

**Why P2**: Not needed to make the happy path work, but a silent host fallback would run `claude --resume <session-id>` against a filesystem where that session does not exist — data written to the wrong place, and a UI that reports success.

**Acceptance Criteria**:

1. IF the active profile distro cannot be started THEN the system SHALL fail the spawn with an error carrying the profile name and the `wsl.exe` stderr text verbatim.
2. IF a spawn fails because of the profile THEN the system SHALL NOT fall back to the Windows default shell.
3. WHEN a profile spawn fails THEN the system SHALL surface that error message in the terminal pane.
4. WHILE the stored default profile names a distro that is no longer registered, the system SHALL show that preference as unavailable in Settings.

**Independent Test**: Stop and unregister the selected distro, then open a terminal — an error mentioning the profile and the `wsl.exe` message appears, and no `cmd.exe` pane opens.

---

### P3: Initialize new repositories with the profile git

**User Story**: As a user creating a project inside the WSL filesystem, I want `git init` to run with the distro git, so that the repo does not carry host `core.filemode` and CRLF settings the in-distro git disagrees with.

**Why P3**: Only affects project creation with the git-init option, and the damage is a config mismatch rather than a broken app — but it persists on disk, which is why it is in scope at all.

**Acceptance Criteria**:

1. WHEN a project is created with git init enabled and its path resolves to a WSL profile THEN the system SHALL run `git init` inside that distro.
2. WHILE the resolved profile is the host, the system SHALL run `git init` exactly as it does today.

**Independent Test**: Create a project under `\\wsl.localhost\Ubuntu-24.04\home\<user>\new-repo` with git init checked, then run `git config core.filemode` inside the distro — it reports the Linux default rather than the git-for-Windows value.

---

### P4: Open the editor inside the distro, not in Restricted Mode

**User Story**: As a Windows developer whose repo lives in WSL, I want the editor button to open the folder *inside* the distro, so that I do not get a Restricted Mode window with no extensions and no in-distro terminal.

**Why P4**: Added after P1-P3 shipped (AD-037). Same defect class as `WSLP-06` and AD-034 — the app looked at the host while the project lived in the distro — but it degrades a working feature rather than breaking one: the folder does open, just untrusted and detached from the distro toolchain.

**Acceptance Criteria**:

1. WHEN the editor is launched on a path that resolves to a WSL profile AND the chosen editor accepts `--remote` THEN the system SHALL spawn it with `--remote wsl+<distro>` and the path *inside* the distro, never the UNC path.

**Independent Test**: With a project under `\\wsl.localhost\Ubuntu-24.04\home\<user>\<repo>`, click the VS Code glyph: the window title reports `[WSL: Ubuntu-24.04]`, no Restricted Mode banner appears, and the integrated terminal opens a shell inside the distro.

---

### P5: The in-distro environment is the user's real one

**User Story**: As a developer whose distro toolchain is managed by asdf, nvm, or fnm under a non-bash login shell, I want the agent launched by SwarmDeck to see the same `PATH` my own terminal sees, so that the agent's own child processes find `node`.

**Why P5**: Added after P1-P4 shipped (AD-039). `WSLP-04` and `WSLP-06` already say the CLI runs with the login `PATH` inside the distro; the implementation asked `bash -lc` for it, which is a different shell from the user's. The agent starts and then fails from inside — on the reference machine, Claude Code launched and every `SessionStart` hook died with `/bin/sh: 1: node: not found`, while the plain-terminal profile ran the same agent fine.

**Acceptance Criteria**:

1. WHILE the active profile is a WSL distro, the system SHALL run every in-distro probe (`PATH`, `HOME`, agent detection) through the distro user's own login shell in interactive mode, so a tool manager configured in that shell's rc file is on the resolved `PATH`.
2. WHEN a probe's output carries text the rc file printed before the answer THEN the system SHALL discard everything up to its own output marker and parse only what follows.
3. IF the `cwd` names no distro THEN the system SHALL resolve to the host profile at every call site, never to the stored default profile.

**Independent Test**: On the reference machine, whose `node` comes from asdf loaded in `~/.zshrc`, open a WSL project with the Claude Code provider: the banner appears with no `SessionStart:startup hook error` line, and `node -v` inside that pane answers.

---

## Edge Cases

- IF an editor does not accept `--remote` (Zed, Sublime, the JetBrains family) THEN the system SHALL pass the UNC path exactly as it does today — an unrecognized flag would stop the folder from opening at all, which is worse than Restricted Mode.
- IF `wsl.exe` is absent or returns a non-zero status when listing distros THEN the system SHALL offer the host profile alone, without surfacing an error.
- IF the distro list contains `docker-desktop` or `docker-desktop-data` THEN the system SHALL exclude those entries.
- WHERE a listed distro reports WSL version 1, the system SHALL label it `WSL1` in the profile list.
- WHERE the host is not Windows, the system SHALL omit the profile selector and keep resolving the OS default program as it does today.
- IF the `cwd` does not exist inside the distro THEN the system SHALL surface the `wsl.exe` stderr verbatim, because exit status `255` cannot distinguish a missing directory from a missing distro.
- WHEN the distro list is queried, the system SHALL decode `wsl.exe -l -v` output as UTF-16LE and strip carriage returns before parsing.
- IF a requested agent CLI is not found inside the active profile THEN the system SHALL fall back to the plain shell with a warning, exactly as it does on the host today.
- IF a probe's output carries no marker at all THEN the system SHALL parse the whole output, which is the pre-`WSLP-23` behavior — a shell that never reached the marker already fails on the empty or non-zero result.
- WHERE the distro user's login shell is unset, the system SHALL fall back to `/bin/sh`; the probe then resolves whatever `/bin/sh` resolves, which is the situation before this requirement existed.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| WSLP-01 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | **REVOKED by AD-035** (2026-08-20) — the Settings selector it fed is gone. `shells::list::list_profiles` survives as the source for `agent_catalog_all` and the quota credential search. |
| WSLP-02 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | **REVOKED by AD-035** (2026-08-20) — no UI writes the default profile any more (`shell_profile_set` removed). Migration 011 and `prefs::default_profile` stay, but **AD-038** (2026-08-21) stopped `shell_profile_for_path` from reading the stored value as fallback: a leftover row from before AD-035 was making a plain Windows `cwd` resolve to the previously-saved WSL profile. `commands::shells::shell_profile_for_path` now hardcodes `Host`, matching `git_init_command` and `editors::open`. |
| WSLP-03 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | Done (T3) |
| WSLP-04 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | Done (T3) |
| WSLP-05 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | Done (T3) |
| WSLP-06 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | Done (T6) |
| WSLP-07 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | Done (T1) |
| WSLP-08 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | **REVOKED by AD-039** (2026-08-21) — superseded by `WSLP-24`. "Use the stored default profile" was the rule the whole AD-035/AD-038/AD-039 sequence unwound: with no selector left, the stored value is a leftover, and every remaining reader of it as a path fallback has been removed. |
| WSLP-09 | P1: Run terminals and agent CLIs inside a WSL distro | Tasks | Done (T3) |
| WSLP-10 | P2: Fail loudly when the profile is unavailable | Tasks | Done (T7) |
| WSLP-11 | P2: Fail loudly when the profile is unavailable | Tasks | Done (T7) |
| WSLP-12 | P2: Fail loudly when the profile is unavailable | Tasks | Done (T14) |
| WSLP-13 | P2: Fail loudly when the profile is unavailable | Tasks | **REVOKED by AD-035** (2026-08-20) — there is no selector left to mark "saved profile unavailable" in. The backend half survives: `prefs::resolve_default` still falls back to `Host` when the stored distro is no longer listed — but that only helps when the stored distro *is* gone. **AD-038** removed the only call site (`shell_profile_for_path`) where a still-listed stored WSL distro could leak into a Windows-only path's resolution. |
| WSLP-14 | P3: Initialize new repositories with the profile git | Tasks | Done (T11) |
| WSLP-15 | P3: Initialize new repositories with the profile git | Tasks | Done (T11) |
| WSLP-16 | Edge cases | Tasks | Done (T2) |
| WSLP-17 | Edge cases | Tasks | Done (T2) |
| WSLP-18 | Edge cases | Tasks | Done (T2) |
| WSLP-19 | Edge cases | Tasks | **REVOKED by AD-035** (2026-08-20) — the requirement was "hide the selector when there is only one profile"; with no selector there is nothing to hide. |
| WSLP-20 | Edge cases | Tasks | Done (T2) |
| WSLP-21 | P4: Open the editor inside the distro | Execute | Done (AD-037) — `shells::wsl_path_parts`, `editors::open_args`, `EditorDescriptor::wsl_remote` |
| WSLP-22 | P5: The in-distro environment is the user's real one | Execute | Done (AD-039) — `shells::probe::login_shell_script`, used by `wrap::fetch_login_path`, `home::fetch_home`, `catalog::real_wsl_probe` |
| WSLP-23 | P5: The in-distro environment is the user's real one | Execute | Done (AD-039) — `shells::probe::strip_banner` |
| WSLP-24 | P5: The in-distro environment is the user's real one | Execute | Done (AD-039) — `commands::terminal::resolve_profile` now defaults to `Host`, finishing what AD-038 started in `shell_profile_for_path` |

**ID mapping:** `WSLP-22` through `WSLP-24` are P5 criteria 1 to 3. `WSLP-01` through `WSLP-09` are P1 criteria 1 to 9 in order. `WSLP-10` through `WSLP-13` are P2 criteria 1 to 4. `WSLP-14` and `WSLP-15` are P3 criteria 1 and 2. `WSLP-16` is the no-`wsl.exe` / listing-failure case. `WSLP-17` is the internal-distro exclusion. `WSLP-18` is the WSL1 label. `WSLP-19` is the non-Windows host keeping current behavior. `WSLP-20` is UTF-16LE decoding of the distro list. The remaining edge cases (missing `cwd`, agent CLI absent inside the profile) are covered by `WSLP-10` and by existing `AGT-04` behavior respectively.

**Coverage:** 24 total, 24 mapped to tasks, 0 unmapped. `WSLP-21` is P4 criterion 1; the "editor without `--remote`" edge case is covered by the same tests as `WSLP-21`.

---

## Success Criteria

- [ ] On the reference Windows machine, a terminal opened on a `\\wsl.localhost\Ubuntu-24.04\...` project reports that path as its `pwd` inside the distro — never `C:\Windows`.
- [ ] With the Ubuntu profile active, the Settings agent list marks Claude Code installed, and launching it starts `claude` with `--session-id` and `--permission-mode` applied.
- [ ] With the host profile active, every existing behavior is identical to `v0.1.33`: same program, same detection, same `git init`.
- [ ] `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run build`, and `npm run test` all pass.
- [ ] Unregistering the selected distro produces a visible error and zero `cmd.exe` panes.
- [ ] (AD-036) Picking Claude Code for a `\\wsl.localhost\...` project opens a pane where `claude` is *running*, not a bare shell with a "não encontrado no PATH" warning.
- [ ] (AD-037) The editor button on a `\\wsl.localhost\...` project opens `[WSL: <distro>]` without a Restricted Mode banner.
