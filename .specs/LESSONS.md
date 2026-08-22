# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - A boundary predicate with one comparison per side needs one test per side: covering a single edge left three inverted comparisons alive in the discrimination sensor.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `rust/geometry` · harmful: 0
- features: window-geometry
- evidence: src-tauri/src/windows/geometry.rs:104 (rust/geometry)
- last seen: 2026-08-22T00:15:13Z

### L-002 - When an AC says a rectangle 'intersects' or 'contains', state whether touching the edge counts — otherwise the half-open choice lives only in the implementation.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: window-geometry
- evidence: WGEO-03 (spec)
- last seen: 2026-08-22T00:15:13Z

### L-003 - An AC that says a token is 'expired' must name the comparison, including the clock skew, or the margin ends up living only in a constant.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: quota-token-refresh
- evidence: QTR-01 (spec)
- last seen: 2026-08-22T01:36:31Z

### L-004 - A single large advanceTimersByTimeAsync does not re-enter a setInterval created inside a microtask: advance in steps the size of the interval, or the test measures the fake clock instead of the component.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `vitest/timers` · harmful: 0
- features: quota-token-refresh
- evidence: src/components/shell/QuotaIndicator.test.tsx (vitest/timers)
- last seen: 2026-08-22T01:36:31Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
