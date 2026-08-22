# Window Geometry Specification

## Problem Statement

The `main` window is created from `tauri.conf.json` at a fixed 1400x900 wherever the OS decides to place it. Every launch discards where the user last left the window, so anyone who works with the app parked on a specific spot of a specific monitor has to move and resize it again on every start.

## Goals

- [ ] Reopen the `main` window at the exact position and size it had when it was closed.
- [ ] Never open the window off-screen: when the saved rectangle no longer fits any connected monitor (a monitor was unplugged), open centered on the primary monitor at 90% of its width and height.
- [ ] Survive an abrupt exit (crash, updater restart), not only a clean window close.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Restoring the maximized state as maximized | User decision (2026-08-21): a window closed while maximized reopens with the 90%-centered default instead. Keeping the flag would also require tracking the pre-maximize rectangle to make un-maximize behave. |
| Geometry for the `kanban` and `settings` windows | They are transient secondary windows created with a fixed size by `windows/kanban.rs` and `windows/settings.rs`. No reported pain, and each would need its own row. |
| Remembering one geometry per monitor layout | Would require identifying a monitor set (names change, order changes). One saved rectangle plus the fallback already covers the reported case. |
| Clamping a partially off-screen window back inside a monitor | A window whose rectangle still touches a monitor is reachable by the user; nudging it would move a window the user deliberately placed. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Which monitor the 90% fallback uses when the window was closed maximized | The monitor that contains the center of the saved rectangle; the primary monitor when that monitor is gone | The user asked for "90% e centralizado no display". A user who always works maximized on a secondary monitor would otherwise be thrown onto the primary monitor on every launch. | y |
| First run, with nothing saved | Same 90%-centered fallback | User decision (2026-08-21). Same code path, so the window is predictable from the very first launch. | y |
| When the geometry is written | On window close, plus a periodic flush at most 1 s after the last move/resize | User decision (2026-08-21): geometry must survive a crash or the updater restart, not only a clean close. A direct write per move event would hit SQLite dozens of times per drag. | y |
| Where the geometry is stored | Single-row `window_state` table in the existing app SQLite database | The database is already open in `setup` before any window work, already migrated, and already holds every other persisted preference. | y |
| Units stored | Physical pixels | `Monitor::position`/`size` and `Window::outer_position`/`inner_size` are all physical; converting to logical would introduce a scale-factor round trip for no gain. | y |
| Validity test for a saved rectangle | The rectangle intersects at least one available monitor | Matches the reported failure (monitor unplugged, window lands on coordinates no monitor covers). Any overlap leaves the window grabbable. | y |
| A write failure at exit | Logged to stderr, exit proceeds | Same rule the project already applies to `projects::service::touch_from_cwds` at `RunEvent::Exit`: a database failure on the way out must not block the exit. | y |

**Open questions:** none - all resolved or logged above.

Implicit-requirement dimensions: persistence, failure states and observability are covered by WGEO-02, WGEO-07 and WGEO-08. Remaining dimensions N/A for this scope (no external calls, no auth boundary, no multi-writer concurrency - only the `main` window writes this row).

---

## User Stories

### P1: Reopen where I left it ⭐ MVP

**User Story**: As a SwarmDeck user, I want the window to reopen at the size and position I left it so that I do not rearrange it on every launch.

**Why P1**: This is the whole feature; without it nothing is persisted.

**Acceptance Criteria**:

1. WHEN the `main` window is closed THEN the system SHALL persist its position, size and maximized state as physical pixels.
2. WHEN the `main` window is moved or resized THEN the system SHALL persist the new geometry no later than 1 s after the last such event.
3. WHEN the app starts and a saved non-maximized rectangle intersects at least one available monitor THEN the system SHALL place the `main` window at exactly the saved position and size.
4. The system SHALL apply the restored geometry inside `setup`, before the event loop starts, so the window is never painted at the `tauri.conf.json` default first.

**Independent Test**: Move and resize the window, close it, reopen it - the window occupies the same pixels.

---

### P2: Never open off-screen

**User Story**: As a user who sometimes disconnects a monitor, I want the app to open on a monitor I can actually see so that I do not have to blindly drag an invisible window back.

**Why P2**: Without P1 there is nothing to validate, but shipping P1 alone can strand the window off-screen.

**Acceptance Criteria**:

1. IF the saved rectangle intersects no available monitor THEN the system SHALL place the window centered on the primary monitor at 90% of that monitor's width and height.
2. IF no geometry is saved THEN the system SHALL place the window centered on the primary monitor at 90% of that monitor's width and height.
3. IF the saved geometry is marked maximized THEN the system SHALL place the window at 90% of the width and height of the monitor containing the center of the saved rectangle, centered on it, falling back to the primary monitor when that monitor is not available.

**Independent Test**: Write a rectangle at coordinates no monitor covers, start the app - the window opens centered on the primary monitor at 90% x 90%.

---

## Edge Cases

- IF persisting the geometry fails THEN the system SHALL log the error to stderr and SHALL NOT block the window close or the app exit.
- IF the OS reports no primary monitor THEN the system SHALL leave the `tauri.conf.json` geometry untouched and SHALL NOT return an error.
- WHEN the 90% fallback size is smaller than the configured `minWidth`/`minHeight` THEN the system SHALL let the window manager enforce the minimum instead of shrinking below it.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| WGEO-01 | P1: Reopen where I left it | Execute | Verified |
| WGEO-02 | P1: Reopen where I left it | Execute | Verified |
| WGEO-03 | P1: Reopen where I left it | Execute | Verified |
| WGEO-04 | P1: Reopen where I left it | Execute | Verified |
| WGEO-05 | P2: Never open off-screen | Execute | Verified |
| WGEO-06 | P2: Never open off-screen | Execute | Verified |
| WGEO-07 | P2: Never open off-screen | Execute | Verified |
| WGEO-08 | Edge case: write failure | Execute | Verified |
| WGEO-09 | Edge case: no primary monitor | Execute | Verified |

ID map: WGEO-01..04 are P1 criteria 1-4; WGEO-05..07 are P2 criteria 1-3; WGEO-08 and WGEO-09 are the first two edge cases.

**Coverage:** 9 total, 9 mapped, 0 unmapped.

---

## Success Criteria

- [ ] Close the window at an arbitrary position and size, reopen: same pixels.
- [ ] Saved rectangle outside every monitor: window opens centered on the primary monitor at 90% x 90%.
- [ ] Killing the process (no clean close) loses at most the last 1 s of geometry changes.
