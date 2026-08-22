# WSL Terminal Profile Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/wsl-terminal-profile/design.md`
**Status**: Draft

Every file created or edited carries a `SPEC:` marker per `.claude/rules/spec-driven-changes.md`, in English, naming this feature and the requirement IDs the task lists. Shared entry points (`src-tauri/src/lib.rs`) take the marker immediately above the block that implements the requirement, not at the top.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.github/workflows/ci.yml` (gate commands), `package.json` (test scripts), `vite.config.ts:25` (test include glob). No `AGENTS.md`, `CONTRIBUTING.md`, or coverage threshold config exists - strong defaults applied for coverage depth.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Rust pure logic (`shells`, parsers, command builders) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `#[cfg(test)] mod tests` inline in the same file (repo convention, e.g. `src-tauri/src/terminal/manager.rs:241`) | `cargo test` |
| Rust persistence (profile preference) | unit | Key query paths plus the absent-row and stale-distro paths | inline `#[cfg(test)] mod tests` with an in-memory `Connection` | `cargo test` |
| Rust Tauri command wrappers | none | Build gate only - documented thin wrappers with no business rule (`src-tauri/src/commands/terminal.rs:4`). A wrapper that grows a rule gets a testable core function instead, following `kill_and_touch` (`commands/terminal.rs:99`) | - | build gate only |
| SQL migration | none | Build gate only - `cargo test` already applies every migration when opening a test database | `src-tauri/src/db/migrations` | build gate only |
| React component | unit | Every rendered state the task adds: present, absent, unavailable; plus the invoke call it triggers | co-located `*.test.tsx` next to the component | `npm run test` |
| Project rules and docs | none | Build gate only | `.claude/rules` | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `cargo test` for Rust tasks, `npm run test` for React tasks |
| Full | After tasks touching both sides | `cargo test && npm run test` |
| Build | After phase completion or migration, wrapper, and docs-only tasks | `cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test && npm run build && npm run test` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Profile core (pure Rust, no I/O)

```
T1 → T2 → T3
```

### Phase 2: Persistence and detection

```
T4 → T5 → T6
```

### Phase 3: Spawn integration

```
T7 → T8 → T9 → T10
```

### Phase 4: git init, UI, and rule update

```
T11 → T12 → T13 → T14 → T15
```

---

## Task Breakdown

### T1: Create the TerminalProfile type and path derivation

**What**: New module holding `enum TerminalProfile { Host, Wsl { distro } }`, `profile_for_path`, `id`, and `parse_id`; declared as `mod shells;` in the crate root.
**Where**: `src-tauri/src/shells/mod.rs`
**Depends on**: None
**Reuses**: The path shape `strip_verbatim_prefix` guarantees (`src-tauri/src/projects/service.rs:425`)
**Requirement**: WSLP-07, WSLP-08

**Tools**:

- MCP: `code-review-graph`
- Skill: NONE

**Done when**:

- [x] `profile_for_path` returns `Wsl { distro }` for `\\wsl.localhost\Ubuntu-24.04\home\x` and for the legacy `\\wsl$\Ubuntu-24.04\home\x`
- [x] `profile_for_path` returns the passed default for `C:\repos\x`, for a relative path, and for a path whose distro segment is empty
- [x] `id` round-trips through `parse_id` for both `host` and `wsl:Ubuntu-24.04`; `parse_id` returns `None` for an unknown string
- [x] `mod shells;` added to the crate root with a `SPEC:` marker above that declaration only
- [x] Gate check passes: `cargo test`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shells): add TerminalProfile and path-based profile derivation`

---

### T2: Enumerate WSL distros into selectable profiles

**What**: `parse_distro_list` (pure: UTF-16LE decode, header skip, internal-distro filter, WSL1 flag) plus `list_profiles`, which calls `wsl.exe -l -v` and always puts `Host` first.
**Where**: `src-tauri/src/shells/list.rs`
**Depends on**: T1
**Reuses**: The `CREATE_NO_WINDOW` flag pattern from `src-tauri/src/editors.rs:199`
**Requirement**: WSLP-01, WSLP-16, WSLP-17, WSLP-18, WSLP-19, WSLP-20

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] `parse_distro_list` parses a UTF-16LE fixture captured from the reference machine (a NAME / STATE / VERSION header, a starred `Ubuntu-24.04 Running 2` row, a `docker-desktop Stopped 2` row) into exactly one entry, `Ubuntu-24.04`, with `wsl1` false
- [x] `parse_distro_list` marks a VERSION of 1 as `wsl1` true and renders the label with a WSL1 suffix
- [x] `parse_distro_list` drops `docker-desktop` and `docker-desktop-data`, and returns an empty vector for empty input and for header-only input
- [x] `list_profiles` returns the host profile alone on non-Windows targets and when the `wsl.exe` call fails, surfacing no error
- [x] Gate check passes: `cargo test`
- [x] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shells): enumerate WSL distros as selectable profiles`

---

### T3: Build the profile-aware command

**What**: `wrap(profile, program, args, env, cwd) -> CommandBuilder` covering the four cases in `design.md`, plus `login_path(distro)` with a process-lifetime cache.
**Where**: `src-tauri/src/shells/wrap.rs`
**Depends on**: T2
**Reuses**: `portable_pty::CommandBuilder`; the argv test helper at `src-tauri/src/terminal/manager.rs:241`
**Requirement**: WSLP-03, WSLP-04, WSLP-05, WSLP-09

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] Host profile with no program produces the OS default program; host profile with a program produces that program plus its args - both argv-identical to today
- [x] WSL profile with no program produces exactly `wsl.exe -d <distro> --cd <cwd>`, with no trailing double dash
- [x] WSL profile with a program produces `wsl.exe -d <distro> --cd <cwd> -- env PATH=<login> SWARMDECK_TERMINAL_ID=<id> <program> <args>`
- [x] A test asserts that no argv entry produced for a WSL profile contains a dollar sign, backtick, semicolon, pipe, or ampersand
- [x] A cwd and an argument each containing a space survive as a single argv entry
- [x] `login_path` returning `None` omits the PATH entry and still produces a runnable argv
- [x] Gate check passes: `cargo test`
- [x] Test count: 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

> Correção de 22/08/2026: a asserção de WSLP-09 em
> `terminal::manager::tests::build_command_wsl_inclui_id_do_terminal_como_entrada_de_env`
> usava `CommandBuilder::get_env`, que mistura o que `cmd.env()` setou com o
> ambiente herdado que `CommandBuilder::new` copia do processo. Rodar
> `cargo test` de dentro de um terminal do próprio app — onde
> `SWARMDECK_TERMINAL_ID` já existe — fazia o teste falhar sem nenhum bug no
> `build_command`. Trocado por `iter_extra_env_as_str()`, que lista só as
> variáveis setadas explicitamente. Comportamento de produção inalterado.

**Commit**: `feat(shells): build argv-only commands for the active profile`

---

### T4: Add the terminal profile preference table

**What**: Migration creating `terminal_profile_prefs (id INTEGER PRIMARY KEY CHECK (id = 1), profile TEXT)`, unseeded, registered in the migration list.
**Where**: `src-tauri/src/db/migrations/011_terminal_profile.sql`
**Depends on**: T3
**Reuses**: The `004_agent_prefs.sql` shape and comment style
**Requirement**: WSLP-02

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] Migration added to the `include_str!` list at `src-tauri/src/db/mod.rs:28`
- [x] A fresh database opens with all eleven migrations applied and no error
- [x] No `SPEC:` marker on the SQL file itself; its leading comment cites WSLP-02 in prose, matching how `004_agent_prefs.sql` cites AGT-01
- [x] Gate check passes: `cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test && npm run build && npm run test`

**Tests**: none
**Gate**: build

**Commit**: `feat(db): add terminal_profile_prefs table`

---

### T5: Persist and resolve the default profile

**What**: `default_profile`, `set_default_profile`, and `resolve_default` (the stored value if its distro is still listed, otherwise the host profile plus an unavailable marker).
**Where**: `src-tauri/src/shells/prefs.rs`
**Depends on**: T4
**Reuses**: `src-tauri/src/agents/prefs.rs` line for line, including the not-seeded semantics
**Requirement**: WSLP-02, WSLP-13

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] `default_profile` returns `None` on a fresh database with no row, and on a row whose column is NULL
- [x] `set_default_profile` then `default_profile` round-trips both the host profile and a WSL profile
- [x] `set_default_profile` called twice leaves exactly one row
- [x] `resolve_default` returns the host profile marked unavailable when the stored distro is absent from the listed set, and the stored profile marked available when present
- [x] Gate check passes: `cargo test`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shells): persist and resolve the default terminal profile`

---

### T6: Detect agent CLIs inside the active profile

**What**: `detect_installed_in(profile)` plus the pure `parse_type_p_output`; the host branch keeps delegating to today's `detect_installed()` untouched.
**Where**: `src-tauri/src/agents/catalog.rs` (modify)
**Depends on**: T5
**Reuses**: `CATALOG` as the single list of commands to probe; `AgentStatus` unchanged; `resolve_command_in_path` left exactly as is because `editors.rs:187` depends on it
**Requirement**: WSLP-06

**Tools**:

- MCP: `code-review-graph`
- Skill: NONE

**Done when**:

- [x] `parse_type_p_output` maps `/home/x/.local/bin/claude` to the `claude-code` id by basename, ignores an unrecognized basename, and returns an empty vector for empty input
- [x] `parse_type_p_output` handles the found-subset case: three names probed, one line returned, only that agent reported installed
- [x] The WSL branch issues exactly one `bash -lc` probe per profile and caches the result until the stored preference changes
- [x] `detect_installed` and `resolve_command_in_path` keep their current signatures and behavior; the existing catalog tests and the editor tests at `editors.rs:246` still pass unmodified
- [x] `SPEC:` marker on the file updated to add `wsl-terminal-profile (WSLP-06)` alongside its existing features
- [x] Gate check passes: `cargo test`
- [x] Test count: 4 new tests pass, existing catalog and editor tests unchanged (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agents): detect agent CLIs inside the active terminal profile`

---

### T7: Route PTY spawn through the profile

**What**: `SessionConfig.shell` replaced by `profile`; `build_command` delegates to the wrapper; a new `ManagerError` variant carries the profile label and the `wsl.exe` stderr, with no host fallback.
**Where**: `src-tauri/src/terminal/manager.rs` (modify)
**Depends on**: T6
**Reuses**: `build_command` as the existing single choke point; the argv test helper at line 241; `TERMINAL_ID_ENV` at line 158
**Requirement**: WSLP-03, WSLP-04, WSLP-10, WSLP-11

**Tools**:

- MCP: `code-review-graph`
- Skill: NONE

**Done when**:

- [x] `build_command` produces the same argv as today for a host profile, in both the agent case and the shell-fallback case - asserted against the existing expectations at line 280
- [x] `build_command` with a WSL profile and an agent produces the env-prefixed argv from T3
- [x] The terminal id reaches the child as an env argv entry on a WSL profile and as a process environment variable on the host profile
- [x] A failed profile spawn returns the new `ManagerError` variant whose message contains the profile label and the raw stderr text, and no session is inserted
- [x] No code path falls back to the OS default program after a WSL spawn failure
- [x] `SPEC:` marker on the file updated to add `wsl-terminal-profile (WSLP-03, WSLP-04, WSLP-10, WSLP-11)`
- [x] Gate check passes: `cargo test`
- [x] Test count: 5 new tests pass, existing manager tests still pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(terminal): spawn PTY sessions through the active profile`

---

### T8: Resolve the profile in the spawn command

**What**: `pty_spawn` drops the `shell` parameter, reads the stored default, derives the effective profile from the cwd, and propagates the profile error to the frontend.
**Where**: `src-tauri/src/commands/terminal.rs` (modify)
**Depends on**: T7
**Reuses**: The testable-core pattern of `kill_and_touch` at line 99, so the resolution is asserted without a mounted Tauri app
**Requirement**: WSLP-07, WSLP-08, WSLP-10

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] A `resolve_profile(cwd, connection)` core function exists and is tested directly, mirroring `kill_and_touch`
- [x] A cwd naming a distro wins over a stored default naming a different one
- [x] A cwd naming no distro uses the stored default; with no stored preference it uses the host profile
- [x] The `shell` parameter is gone from the `pty_spawn` signature and the IPC contract comment at line 36 is updated to match
- [x] A profile spawn error reaches the caller as an error string containing the `wsl.exe` stderr
- [x] `SPEC:` marker on the file updated to add `wsl-terminal-profile (WSLP-07, WSLP-08, WSLP-10)`
- [x] Gate check passes: `cargo test`
- [x] Test count: 4 new tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(terminal): resolve the terminal profile from cwd and preference`

---

### T9: Expose the profile commands over IPC

**What**: New command module with `shell_profiles_list`, `shell_profile_get`, and `shell_profile_set`, registered in the invoke handler.
**Where**: `src-tauri/src/commands/shells.rs`
**Depends on**: T8
**Reuses**: The thin-wrapper convention documented at `src-tauri/src/commands/terminal.rs:4`; the quota preference get and set commands as the naming precedent
**Requirement**: WSLP-01, WSLP-02

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] Three commands defined, each a thin wrapper delegating to the list or preference module with no business rule of its own
- [x] All three registered in the invoke handler list in the crate root, and declared in `src-tauri/src/commands/mod.rs`
- [x] `shell_profile_set` rejects an id that `parse_id` does not recognize, returning an error rather than storing it
- [x] `SPEC:` marker at the top of the new file naming `wsl-terminal-profile (WSLP-01, WSLP-02)`
- [x] Gate check passes: `cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test && npm run build && npm run test`

**Tests**: none
**Gate**: build

**Commit**: `feat(commands): expose terminal profile list, get, and set`

---

### T10: Report the agent catalog for the active profile

**What**: `agent_catalog` resolves the stored default profile and calls `detect_installed_in` instead of `detect_installed`.
**Where**: `src-tauri/src/commands/agents.rs` (modify)
**Depends on**: T9
**Reuses**: `AgentCatalogEntry` and its shape unchanged, so the frontend type at `src/routes/settings/SettingsShell.tsx:43` needs no change
**Requirement**: WSLP-06

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] `agent_catalog` takes the database state and resolves the default profile before probing
- [x] The returned JSON shape is identical to today's, so the frontend type is untouched
- [x] `SPEC:` marker on the file updated to add `wsl-terminal-profile (WSLP-06)`
- [x] Gate check passes: `cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test && npm run build && npm run test`

**Tests**: none
**Gate**: build

**Commit**: `feat(commands): report the agent catalog for the active profile`

---

### T11: Run git init inside the resolved profile

**What**: `run_git_init` builds its command through the wrapper using the profile derived from the project path.
**Where**: `src-tauri/src/projects/service.rs` (modify)
**Depends on**: T10
**Reuses**: The wrapper and `profile_for_path`; the existing best-effort failure handling around `run_git_init` at line 531
**Requirement**: WSLP-14, WSLP-15

**Tools**:

- MCP: `code-review-graph`
- Skill: NONE

**Done when**:

- [x] A host-resolved path produces exactly today's git init argv
- [x] A `\\wsl.localhost` path produces the wrapped argv running git init inside that distro
- [x] SPEC_DEVIATION: this bullet originally read "a failing git init still leaves the project created" — false against the actual code (`create_with_options` removes the created folder and returns `Err` on any failure inside its closure, `run_git_init` included; never best-effort). User confirmed (2026-08-20): test the real behavior instead of changing it. Covered by `git_init_falho_devolve_erro_git_init_failed_como_antes`, asserting the unchanged `ProjectError::GitInitFailed` error path.
- [x] `SPEC:` marker on the file updated to add `wsl-terminal-profile (WSLP-14, WSLP-15)`
- [x] Gate check passes: `cargo test`
- [x] Test count: 3 new tests pass, existing project-service tests still pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(projects): run git init inside the resolved terminal profile`

---

### T12: Render the terminal profile selector

**What**: A profile selector in the General settings panel, rendered only when the profile list has more than one entry, marking a stored-but-unavailable profile.
**Where**: `src/routes/settings/GeneralPanel.tsx` (modify)
**Depends on**: T11
**Reuses**: The segmented-control pattern at line 249; the purely presentational panel contract (value plus an onChange callback, parent persists)
**Requirement**: WSLP-01, WSLP-13, WSLP-19

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] The selector is absent when the profile list has a single entry (non-Windows host, or Windows with no WSL)
- [x] The selector lists every entry with its label, and a WSL1 entry renders its suffix
- [x] A stored profile flagged unavailable renders as unavailable rather than as selected
- [x] Choosing an entry calls the onChange callback with that entry's id and does not persist by itself
- [x] New strings are pt-BR inline, matching the rest of the panel
- [x] `SPEC:` marker at the top of the file updated to include `wsl-terminal-profile (WSLP-01, WSLP-13, WSLP-19)`
- [x] Gate check passes: `npm run test`
- [x] Test count: 4 new co-located tests pass, existing tests unchanged (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(settings): render the terminal profile selector`

---

### T13: Wire the selector to the profile commands

**What**: The settings shell invokes the profile list and get commands when the General tab opens, and the set command on change.
**Where**: `src/routes/settings/SettingsShell.tsx` (modify)
**Depends on**: T12
**Reuses**: The quota preference get and set flow at lines 249 and 266
**Requirement**: WSLP-02

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] Opening the General tab invokes the profile list command and the profile get command once each
- [x] Changing the selection invokes the profile set command with the chosen id
- [x] A rejected set call leaves the previously selected value displayed
- [x] SPEC_DEVIATION: `ProfileEntry` is imported from `GeneralPanel.tsx` (where T12 already declared and exported it for the component's own props) instead of a second, duplicate declaration in `SettingsShell.tsx`. Same reuse pattern already used for `QuotaPrefs` in this file. Mirrors the Rust payload either way.
- [x] `SPEC:` marker at the top of the file updated to include `wsl-terminal-profile (WSLP-02)`
- [x] Gate check passes: `npm run test`
- [x] Test count: 3 new co-located tests pass, existing tests unchanged (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(settings): wire the profile selector to the IPC commands`

---

### T14: Surface a profile spawn failure in the terminal pane

**What**: The terminal pane renders the spawn rejection text instead of discarding it, and stops sending the retired `shell` field.
**Where**: `src/components/terminal/TerminalPane.tsx` (modify)
**Depends on**: T13
**Reuses**: The existing spawn invoke at line 189 and the pane's current error surface
**Requirement**: WSLP-12

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] A rejected spawn renders the rejection message verbatim in the pane
- [x] The rendered message includes the profile label and the `wsl.exe` text when the backend supplies them
- [x] The `shell` field is gone from the spawn payload
- [x] A successful spawn renders no error, unchanged from today
- [x] `SPEC:` marker at the top of the file updated to include `wsl-terminal-profile (WSLP-12)`
- [x] Gate check passes: `npm run test`
- [x] Test count: 3 new co-located tests pass, existing tests unchanged (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(terminal): surface profile spawn failures in the pane`

---

### T15: Register the WSLP requirement prefix

**What**: Add WSLP to the list of prefixes in use, so the rule stops contradicting the code.
**Where**: `.claude/rules/spec-driven-changes.md` (modify)
**Depends on**: T14
**Reuses**: The existing prefix list in item 3 of that rule
**Requirement**: WSLP-01

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] WSLP appears in the prefix list alongside SHELL, CHAT, CONN, and the rest
- [x] A `SPEC:` grep over the frontend and backend source lists every file this feature touched, each with a marker naming real requirement IDs (exception: `tests/manager.rs`, `tests/agent_launch.rs`, `tests/ipc_server.rs`, `tasks/send.rs`, `commands/tasks.rs` got a mechanical `shell: None` → `profile: TerminalProfile::Host` fix to keep compiling after T7 — they test PROJ-14/AGT-03-04/MCP-*/KAN-*, not any WSLP requirement, so no wsl-terminal-profile marker was added there; adding one would misrepresent what the file verifies)
- [x] Gate check passes: `cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test && npm run build && npm run test`

**Tests**: none
**Gate**: build

**Commit**: `docs(rules): register the WSLP requirement prefix`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5 ------→ T6
Phase 3:  T7 ------→ T8 ------→ T9 ------→ T10
Phase 4:  T11 -----→ T12 -----→ T13 -----→ T14 -----→ T15

Phase seams (the first task of a phase needs the last task of the previous one):
T3 → T4
T6 → T7
T10 → T11
```

Execution is strictly sequential - there is no intra-phase parallelism.

**Batch packing (15 tasks, about 7 per worker, whole phases only):**

| Batch | Phases | Tasks | Suggested tier |
| ----- | ------ | ----- | -------------- |
| 1 | Phase 1 plus Phase 2 | T1-T6 (6) | high reasoning - core domain; every later task depends on the wrapper being right |
| 2 | Phase 3 | T7-T10 (4) | high reasoning - the spawn boundary and the no-fallback rule |
| 3 | Phase 4 | T11-T15 (5) | standard - mechanical wiring against settled interfaces |

Three batches means the sub-agent offer applies. Batches run sequentially; the Verifier runs automatically after T15.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: TerminalProfile and derivation | 1 new module file | Granular |
| T2: Distro enumeration | 1 new file | Granular |
| T3: Command wrapping | 1 new file | Granular |
| T4: Migration | 1 SQL file | Granular |
| T5: Profile persistence | 1 new file | Granular |
| T6: Profile-aware detection | 1 file, modify | Granular |
| T7: Manager spawn | 1 file, modify | Granular |
| T8: Command resolution | 1 file, modify | Granular |
| T9: Profile IPC commands | 1 new file, 3 cohesive wrappers | OK - cohesive |
| T10: Agent catalog command | 1 file, modify | Granular |
| T11: git init | 1 function in 1 file | Granular |
| T12: Selector rendering | 1 component | Granular |
| T13: Selector wiring | 1 component | Granular |
| T14: Pane error surface | 1 component | Granular |
| T15: Prefix registration | 1 markdown file | Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | phase 1 head | Match |
| T2 | T1 | T1 to T2 | Match |
| T3 | T2 | T2 to T3 | Match |
| T4 | T3 | T3 to T4 (phase seam) | Match |
| T5 | T4 | T4 to T5 | Match |
| T6 | T5 | T5 to T6 | Match |
| T7 | T6 | T6 to T7 (phase seam) | Match |
| T8 | T7 | T7 to T8 | Match |
| T9 | T8 | T8 to T9 | Match |
| T10 | T9 | T9 to T10 | Match |
| T11 | T10 | T10 to T11 (phase seam) | Match |
| T12 | T11 | T11 to T12 | Match |
| T13 | T12 | T12 to T13 | Match |
| T14 | T13 | T13 to T14 | Match |
| T15 | T14 | T14 to T15 | Match |

---

## Test Co-location Validation

| Task | Layer touched | Matrix requires | Task declares | Status |
| ---- | ------------- | --------------- | ------------- | ------ |
| T1 | Rust pure logic | unit | unit | Match |
| T2 | Rust pure logic | unit | unit | Match |
| T3 | Rust pure logic | unit | unit | Match |
| T4 | SQL migration | none | none | Match |
| T5 | Rust persistence | unit | unit | Match |
| T6 | Rust pure logic | unit | unit | Match |
| T7 | Rust pure logic | unit | unit | Match |
| T8 | Rust pure logic, testable core | unit | unit | Match |
| T9 | Rust command wrapper | none | none | Match |
| T10 | Rust command wrapper | none | none | Match |
| T11 | Rust pure logic | unit | unit | Match |
| T12 | React component | unit | unit | Match |
| T13 | React component | unit | unit | Match |
| T14 | React component | unit | unit | Match |
| T15 | Project rules and docs | none | none | Match |

---

## Requirement Coverage

| Requirement | Tasks |
| ----------- | ----- |
| WSLP-01 | T2, T9, T12, T15 |
| WSLP-02 | T4, T5, T9, T13 |
| WSLP-03 | T3, T7 |
| WSLP-04 | T3, T7 |
| WSLP-05 | T3 |
| WSLP-06 | T6, T10 |
| WSLP-07 | T1, T8 |
| WSLP-08 | T1, T8 |
| WSLP-09 | T3 |
| WSLP-10 | T7, T8 |
| WSLP-11 | T7 |
| WSLP-12 | T14 |
| WSLP-13 | T5, T12 |
| WSLP-14 | T11 |
| WSLP-15 | T11 |
| WSLP-16 | T2 |
| WSLP-17 | T2 |
| WSLP-18 | T2 |
| WSLP-19 | T2, T12 |
| WSLP-20 | T2 |

20 of 20 requirements mapped to at least one task.

---

## Manual Verification (no CI runner can do this)

Neither CI job can exercise the WSL branch: the Ubuntu runner has no `wsl.exe` and the Windows runner has no registered distro. After T15, run this on the reference Windows machine and record the result in `validation.md`:

1. Settings shows the profile selector with the Ubuntu distro; select it.
2. Add a project under the distro's UNC path; open a terminal with Claude Code. The pane runs `claude` with the working directory reported as the Linux path.
3. Settings marks Claude Code installed.
4. Switch back to the host profile: everything behaves as it did in v0.1.33.
5. Unregister the distro, then open a terminal: an error naming the profile and quoting `wsl.exe` appears, and no `cmd.exe` pane opens.
