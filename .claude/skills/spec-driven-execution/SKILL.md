---
name: spec-driven-execution
description: >-
  Orchestrate feature work in this MMO repo by dispatching Planner, Implementer,
  and Verifier sub-agents through the tlc-spec-driven pipeline. The orchestrator
  picks the ROADMAP phase, cleans env, sequences sub-agents, and handles
  PASS/FAIL — it does not plan, implement, or verify itself. Use for "build the
  next phase", "implement this feature", "advance the roadmap", "/loop".
---

# Spec-Driven Execution

**Driver only.** All planning, task format, implementation rules, and validation
live in `tlc-spec-driven`. This skill does not duplicate them.

## What this repo adds

| Delta                   | Meaning                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sub-agent roles**     | Planner → Implementer → Verifier, each a fresh Composer 2.5 sub-agent (`model: composer-2.5`). Orchestrator sequences them; never writes spec/code/tests. |
| **Single Implementer**  | One sub-agent runs every task in `tasks.md`. Skip tlc's per-phase worker offer.                                                                           |
| **Auto-commit in flow** | Implementer may commit per task without asking (only while this flow is active).                                                                          |
| **ROADMAP loop**        | Autonomous mode walks `.specs/ROADMAP.md` one unchecked phase at a time.                                                                                  |

## Orchestrator flow

1. Pick phase — `.specs/ROADMAP.md` (or loop payload); resume in-flight work from `.specs/STATE.md` `## Handoff` if present.
2. Clean env — free ports **2567** and **4200** before gates.
3. Dispatch **Planner** sub-agent.
4. Dispatch **Implementer** sub-agent (only after Planner artifacts exist under `.specs/features/<feature>/`).
5. Dispatch **Verifier** sub-agent (always; orchestrator handles fix→re-verify ≤3 iterations per tlc).
6. On Verifier **PASS** — flip ROADMAP `[x]`, update `STATE.md` Handoff, commit `docs(spec): mark phase <N> complete in ROADMAP and STATE`.

## Sub-agent prompts

Sub-agents cannot see this chat. Each prompt is self-contained:

1. **Activate** `tlc-spec-driven` **by name** and follow it for the assigned role (Specify/Design/Tasks, Execute, or Validate). If the skill cannot be activated, STOP.
2. **Feature context** — ROADMAP phase title + goal, feature slug, output dir `.specs/features/<feature>/`, repo path `/Users/wneto/Dev/nj`.
3. **Autonomous mode** (loop / unattended) — resolve ambiguities as spec assumptions; no user confirmation gates.
4. **Project glue** (below) — repo inputs tlc does not know about.
5. **Role footnotes only:**

- _Implementer:_ paths to existing `spec.md` / `design.md` / `tasks.md`; authorized to commit per task; do **not** run Verifier.
- _Verifier:_ git diff/commit range for the feature; Implementer deviation summary if any.

Do not paste tlc templates, reference filenames, or quality rules into the prompt — the skill owns that.

## Project glue

Append to every sub-agent prompt. Point at repo docs; do not restate their contents.

- `.specs/ROADMAP.md` — phase scope and dependencies
- `.specs/STATE.md` — `## Decisions` (`AD-NNN`), `## Handoff`
- `AGENTS.md` — testing contract for this monorepo
- L2J Classic reference (parse only, never depend): `~/Dev/L2J_Mobius/L2J_Mobius_Classic_1.0/dist/game/data/`