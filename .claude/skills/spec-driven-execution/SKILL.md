---
name: spec-driven-execution
description: >-
  Orchestrate feature work in any repository by dispatching Planner, Implementer
  and Verifier sub-agents through the tlc-spec-driven pipeline. The orchestrator
  discovers the project's spec layout, gates and conventions, picks the next
  roadmap phase, cleans the environment, sequences sub-agents and handles
  PASS/FAIL — it does not plan, implement or verify itself. Optionally closes
  with spec-driven-eval for a comparable grade. Use for "build the next phase",
  "implement this feature", "advance the roadmap", "/loop".
---

# Spec-Driven Execution

**Driver only.** All planning, task format, implementation rules and validation live in
`tlc-spec-driven`. This skill does not duplicate them — it decides *what runs next, in
which order, and by whom*.

**This skill knows nothing about your project.** Where the specs live, what the gates are,
which processes must be free, which language the docs are written in, whether the repo
requires a traceability marker — all of it is discovered in Phase 0 and carried in the
**Project Profile**. Every path, command and port named below is an *example*, never a fact.

## What this skill adds over `tlc-spec-driven`

| Delta                   | Meaning                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sub-agent roles**     | Planner → Implementer → Verifier, each a **fresh sub-agent with no shared context**, each on a **per-role model** (see Model assignment). The orchestrator sequences them and never writes spec, code or tests itself. |
| **Single Implementer**  | One sub-agent runs every task in the feature's `tasks.md`. Skip tlc's per-batch worker offer — the batching decision is already made here.        |
| **Auto-commit in flow** | The Implementer commits per task without asking, following tlc's one-atomic-commit-per-task contract — **only** while this flow is active, and **only** if the repo's own rules permit commits (Phase 0). |
| **Roadmap loop**        | Autonomous mode walks the roadmap one unchecked phase at a time instead of waiting for a feature name.                                            |
| **Optional grading**    | A run can close with `spec-driven-eval` for a reproducible score (see the last section).                                                          |

---

## Phase 0 — Build the Project Profile (once per session, before anything else)

Discover these by reading the repo. Do **not** guess, and do **not** carry values from a
previous project. Everything found here is pasted verbatim into every sub-agent prompt.

| What                        | How to find it                                                                                                                     | If it does not exist                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Repo root**               | `git rev-parse --show-toplevel` (or the working directory when there is no VCS)                                                     | use the working directory, and note that resume/diff evidence will be weaker           |
| **Spec root**               | the directory holding `features/` plus a state file — commonly `.specs/`, `specs/`, `docs/specs/`                                    | **STOP.** There is nothing to drive; ask the user to run `tlc-spec-driven` first       |
| **Roadmap**                 | `ROADMAP.md` at the spec root **or** one level down (e.g. `<specs>/project/ROADMAP.md`)                                             | no roadmap loop — the phase must come from the user or the loop payload                |
| **State / decisions**       | `STATE.md` beside the roadmap — `## Decisions` (`AD-NNN`) and `## Handoff`                                                          | skip the resume step; nothing to flip on PASS                                          |
| **Cross-feature order**     | a global execution/dependency doc if the project keeps one (e.g. `EXECUTION.md`)                                                     | derive order from the roadmap alone                                                    |
| **Repo rules**              | `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.claude/rules/` — testing contract, commit policy, traceability marker, doc language  | tlc's defaults apply                                                                   |
| **Gates**                   | the test/build/lint commands the repo documents, **per scope** in a monorepo (workspace, crate, package)                            | ask the user for the gate command; never invent one                                    |
| **Gate baseline**           | run the gates **before** dispatching anything and record the numbers                                                                | a pre-existing red gate must be reported, not silently attributed to the Implementer   |
| **Environment to clean**    | what the project's dev docs say the app binds or locks: dev-server port, sidecar/game-server port, single-instance lock, stale watchers, test containers | nothing to clean                                                       |
| **Documentation language**  | the language the existing specs and commits are written in                                                                          | English                                                                                |
| **Model per role**          | the user's instruction for this run, else a project convention (agent definitions, project config), else the defaults below         | the harness default model for every role — but the *judge ≠ author* rule below still applies |

**Two rules about the profile:**

- **Artifacts follow the project's language, not this skill's.** Specs, commit messages,
  validation reports and roadmap edits come out in the profile's documentation language.
  This file is in English; that says nothing about the output.
- **Repo rules win over anything written here.** If the repo forbids commits, the
  auto-commit delta is off. If it mandates a traceability marker (`SPEC:` or similar),
  that requirement goes into the Implementer's prompt. Record any contradiction in the
  final report rather than resolving it silently.

---

## Orchestrator flow

1. **Pick the phase** — the next unchecked roadmap phase, or the loop payload, or the
   feature the user named. If `STATE.md` has an in-flight `## Handoff`, resume that first.
2. **Clean the environment** — free exactly what the profile lists. Never a hardcoded port.
3. **Measure the gate baseline** — so a failure later is attributable.
4. **Dispatch the Planner** sub-agent (Specify → Design → Tasks, auto-sized by tlc), on the
   Planner model from the profile — every dispatch below likewise carries its role's model.
5. **Dispatch the Implementer** — only after the Planner's artifacts actually exist under
   `<specs>/features/<feature>/`. Check the files; do not trust the summary.
6. **Dispatch the Verifier** — always, even on a one-task phase. On FAIL the orchestrator
   drives fix → re-verify, bounded to **3 iterations** per tlc, then escalates to the user.
7. **On PASS** — flip the roadmap checkbox, update the `## Handoff` in `STATE.md`, and
   commit the doc change on its own (e.g. `docs(spec): mark <phase> complete`).

---

## Sub-agent prompts

Sub-agents cannot see this chat. Each prompt must stand alone and contain:

1. **Activate `tlc-spec-driven` by name** and follow it for the assigned role
   (Specify/Design/Tasks, Execute, or Validate). **If the skill cannot be activated, STOP** —
   a sub-agent improvising the pipeline from memory is the main failure mode here.
2. **Feature context** — roadmap phase title and goal, feature slug, output directory
   `<specs>/features/<feature>/`, and the absolute repo root from the profile.
3. **Autonomous mode** (loop / unattended) — resolve ambiguity as an explicit spec
   assumption and keep going; no user-confirmation gates. Anything that genuinely needs a
   human decision comes back as a flagged assumption, it is not guessed silently.
4. **The Project Profile** — spec paths, gates for *that task's scope*, environment rules,
   repo rules, documentation language. Point at the repo's own docs; do not restate them.
5. **Role footnotes only:**

- *Planner:* the roadmap phase scope and its dependencies; the decisions (`AD-NNN`) that
  constrain it.
- *Implementer:* paths to the existing `spec.md` / `design.md` / `tasks.md`; authorized to
  commit per task (if the repo allows); must **not** run the Verifier.
- *Verifier:* the git diff or commit range covering the feature; the Implementer's
  deviation summary if there was one.

**Do not paste tlc templates, reference filenames or quality rules into the prompt** — the
skill owns those, and a stale copy here would silently override the real ones.

---

## Model assignment

Each role is dispatched on its own model. The orchestrator sets it **per dispatch** — one
run can plan on a strong reasoning model, implement on a cheaper one, and judge on a third.

**Where the value comes from,** in priority order:

1. **What the user said for this run** — "implement with model X, verify with model Y".
   An explicit instruction always wins and is recorded in the profile.
2. **A role agent the environment already defines** — a definition named for one of these
   roles (implementer, verifier, eval) that already carries a model, and often a reasoning
   effort. Prefer dispatching *through it* rather than re-specifying the model by hand.
3. **The defaults below.**

**Where the id comes from:** the harness, never this file. Whatever model selector the
running harness exposes for sub-agents is what gets used — a `model` argument on the
dispatch call, a field in an agent definition, a project setting. **Do not hardcode a model
id here**; a name that was current when this was written is a name that will be wrong later,
and a stale id fails the dispatch or silently downgrades the role.

**Reasoning effort, when the harness has it, usually lives only in the agent definition** —
not in the dispatch call. Where that holds, a dispatch that passes just a model name
**silently drops the effort setting** and runs the role at the default. So when a role agent
exists, dispatch by that agent; override the model inline only when there is no definition
to carry it.

| Role            | Default tier                    | Why                                                                                             |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Planner**     | strongest reasoning available   | Requirements, architecture and task decomposition are where a weak model costs the most — every downstream role inherits its mistakes. |
| **Implementer** | mid tier, or as the user asks   | Bounded work against an existing `tasks.md` with a gate that decides pass/fail. The cheapest role to economize on. |
| **Verifier**    | strong, and **≠ Implementer**   | It must falsify, not confirm. Same model as the author re-reads the author's intent (see below).   |
| **Eval**        | strong, and **≠ Implementer**   | `spec-driven-eval` Core rule 4 makes this a scoring rule, not a preference.                       |

**The one hard rule: judge ≠ author.** The Verifier and the Eval must not run on the same
model that wrote the code. LLM judges over-reward their own output (self-preference bias),
and a verifier sharing the author's model tends to re-derive the author's assumptions rather
than test them. **A higher reasoning effort on the same model does not satisfy this** — the
bias travels with the model, not with the effort dial. When the user pins both roles to the
same model anyway, that is their call: run it, but say so explicitly in the report, and, for
`spec-driven-eval`, follow its own instruction — flag it under *Assumptions* and treat every
borderline check as UNMET.

Everything else is a cost/quality dial the user owns. Record the actual per-role assignment
in the final report, next to the gate numbers — a run graded by a different model than the
last one is not comparable to it, and the reader has to be able to see that.

---

## Optional close — `spec-driven-eval`

The Verifier answers *"does this satisfy the spec?"*. `spec-driven-eval` answers *"how
completely, on a comparable scale?"* — useful when benchmarking or when the user wants a
grade rather than a verdict.

- It is **explicitly-invoked only** (`disable-model-invocation`). Run it when the user asks
  for a score, an audit, or a framework comparison — never as a routine step of every phase.
- Dispatch it as its own sub-agent, on the **Eval model** from the profile (≠ Implementer):
  the eval is read-only over the subject and must not be the author of what it grades.
- Feed it the PRD/spec, the implementation, the tests, and the derived `spec.md`/`tasks.md`.

---

## Never

- **Never plan, implement or verify in the orchestrator.** Its context has to survive the
  whole run; reading diffs and test output burns exactly the overview only it has.
- **Never let the Implementer verify its own work.** Author ≠ verifier is the point.
- **Never hardcode a path, port, gate or model id into a prompt** — it comes from the
  profile, or it does not go in.
- **Never mark a roadmap phase complete on a self-report.** Only a Verifier PASS flips it.
- **Never report a gate as green without running it.** A pre-existing red gate is recorded
  as such, with the baseline from Phase 0 as evidence.
