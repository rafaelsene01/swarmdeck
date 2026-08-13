# AGENTS.md

SwarmDeck — desktop multi-terminal orchestrator for AI coding agents, built with Tauri 2 (Rust) + React/TypeScript. This file was empty since it was created (commit `94b9fcc`); populated during `spec-triage` run 006 (2026-08-03) to close the gap between what other docs assumed it said and what it actually contained.

## Language

- Code, comments, identifiers, and commit messages: **English**.
- Documentation under `.specs/**` (specs, roadmap, state, triage/journal runs): **Portuguese** — that's the language the project has been planned and specified in since inception.
- Don't mix: a Portuguese comment in `.rs`/`.tsx` source, or an English heading in `.specs/`, is a style violation, not a free choice.

## Traceability marker

Every file created or edited to implement a requirement carries a `// SPEC: <feature> (<IDs>)` comment, in English, at the top of the file — before imports. Full rule, including the exception for shared/infrastructure files (`Cargo.toml`, `lib.rs`) where the marker goes immediately above the implementing block instead of at the top: `.claude/rules/spec-driven-changes.md`.

Requirement IDs are per-feature prefixes matching `.specs/features/<name>/spec.md` — e.g. `TERM-` (multi-terminal), `AGT-` (agent-selection), `PROJ-` (projects), `REL-` (release-distribution), `KAN-` (task-kanban), `STAT-` (terminal-statuses), `MCP-` (mcp-task-server). Never invent an ID — if the requirement doesn't exist yet, it needs to exist in the spec first.

Verify: `grep -rn "SPEC:" src/ src-tauri/src/`.

## Commits

The agent never runs `git commit` or `git push` in this repository — both are in the `deny` list in `.claude/settings.json`, structurally, not just by convention. The maintainer commits by hand from the file→task→message map a task's `tasks.md` entry provides. Never bypass this by suggesting `--no-verify` or a different commit mechanism.

## Build & test

Standard cargo/npm build, lint, format, and test commands apply — see `package.json` scripts and `Cargo.toml`. Note: `cargo build` already builds the whole workspace (including `crates/swarmdeck-mcp`); `--workspace` is valid but redundant.

Full gate-to-task mapping and parallelism rules: `.specs/codebase/TESTING.md`.

## Specs describe what exists today

`.specs/` is the source of truth for what this project is planned to do and what it currently does — not what it once did or might do later. A requirement or task that no longer applies is struck through with the reason and the decision that revoked it (never silently deleted); a spec describing a feature that was removed from the code is exactly the failure mode `spec-triage` exists to catch and fix. Before trusting a claim in any `.specs/**` file about what code does, prefer checking the code itself — specs drift, and periodic `spec-triage` runs reconcile them, but between runs they can be stale.
