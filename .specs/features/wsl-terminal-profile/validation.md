# Validation — wsl-terminal-profile, run AD-039

**Result**: PASS

With a stated limit. The three new requirements are implemented and covered by tests that run on this machine. What no automated test on this machine can reach is the `cfg(windows)` code that actually calls `wsl.exe`; that half was verified by hand against the reference distro and is recorded below as manual evidence, not as a passing test.

**Diff range:** working tree against `7172807`. Files: `src-tauri/src/shells/probe.rs` (new), `shells/wrap.rs`, `shells/home.rs`, `shells/mod.rs`, `agents/catalog.rs`, `commands/terminal.rs`, `commands/shells.rs`, `lib.rs`.

## Per-requirement evidence

| Req | Evidence | Test |
| --- | -------- | ---- |
| WSLP-22 | `shells/probe.rs:24` builds `exec "${SHELL:-/bin/sh}" -lic '...'`; used at `shells/wrap.rs:111`, `shells/home.rs:78`, `agents/catalog.rs:366` — the only three in-distro environment probes in the tree. `terminal/manager.rs` (`-- true`) and `shells/list.rs` (`wsl.exe -l -v`) read no environment and are correctly left alone. | `probe.rs::script_reexecuta_no_shell_de_login_interativo`, `catalog.rs::wsl_probe_script_usa_command_v_um_por_comando` |
| WSLP-23 | `shells/probe.rs:37` (`strip_banner`) applied at `wrap.rs:118`, `home.rs:85`, `catalog.rs:369`. | `probe.rs::strip_banner_descarta_o_que_veio_antes_do_marcador`, `..._devolve_tudo_quando_nao_ha_marcador`, `..._usa_a_ultima_ocorrencia_do_marcador`, `catalog.rs::parse_command_paths_ignora_linha_de_alias` |
| WSLP-24 | `commands/terminal.rs:42` derives from the `cwd` alone with a hardcoded `Host`; `pty_spawn` no longer opens the DB. The other two path-derivation call sites already did this (`commands/shells.rs:26`, AD-038; `projects/service.rs:499`). `prefs::resolve_default` survives only in `commands/agents.rs:104,126`, which receive no `cwd` at all. | `commands/terminal.rs::resolve_profile_ignores_stored_wsl_preference_for_windows_path` |

## Discrimination sensor

Two findings from the independent verifier were real and were fixed in this run:

1. **The WSLP-24 test did not discriminate.** It wrote a WSL preference to a temp DB and asserted `Host`. On any non-Windows build `list_profiles()` returns the host alone (`shells/list.rs`, `cfg(not(windows))`), so `resolve_default` falls back to `Host` by itself — the test would have passed with the defect reinstated. Rewritten to attack the mutant through the deriver instead: it asserts that `profile_for_path` *does* honour a WSL default when given one, and that `resolve_profile` gives it none. That pair fails on this machine if anyone reintroduces a default parameter.
2. **`type -P` was a regression introduced by this very run.** It is a bash builtin and returns nothing under zsh, which would have made every provider fall back to a plain shell — the same class of failure the run set out to fix, moved one step later. Caught by running the generated probe against the reference distro before committing. Replaced with one `command -v <cmd>` per command (`command -v a b c` honours only the first name under `dash`), and pinned by `catalog.rs::wsl_probe_script_usa_command_v_um_por_comando`, which fails if `type -P` returns.

Remaining known gap, accepted: `fetch_login_path`, `fetch_home` and `real_wsl_probe` are `cfg(windows)` with no injectable seam, so the wiring between them and the `shells::probe` helpers is verified by reading and by the manual run below, never by a test. Splitting `wsl_probe_script` out of `real_wsl_probe` closed that gap for the detection probe; the other two still build their command inline.

## Manual evidence (reference machine, Ubuntu-24.04)

The probe strings were run verbatim through `wsl.exe` from this dev environment:

- `bash -lc 'printenv PATH'` — no `~/.asdf/shims` entry. This is the defect.
- `bash -lc 'exec "$SHELL" -lic "printenv PATH"'` — `/home/sene/.asdf/shims` present; `command -v node` answers `/home/sene/.asdf/shims/node`.
- The full detection probe returns `/home/sene/.local/bin/claude` and `/home/sene/.asdf/shims/opencode`.
- `env -i PATH="$HOME/.asdf/shims:/usr/bin:/bin" /bin/sh -c 'node -v'` answers `v24.18.0`, proving the injected `PATH` alone is enough — the asdf shim needs no other variable from the rc.

## Gates

`cargo test -p swarmdeck` green, `cargo clippy -p swarmdeck --all-targets -- -D warnings` clean, `cargo fmt --check` clean, `validate_spec.py` 0 errors, `grep -rn "WSLP-08" src-tauri/src` empty after the revocation.

**Still unproven:** the app itself on Windows. The user opening a WSL project with the Claude Code provider, and getting no `SessionStart:startup hook error`, is the acceptance test for P5 and has not run yet.
