# update-toast

**Prefix**: `TOAST` · **Status**: implemented · **Opened**: 2026-08-21

## Problem

The background checker already finds new releases and emits `update://available`
with `{ version }` (`src-tauri/src/update/apply.rs:92`), and `App.tsx` already
turns that into a dot on the settings icon (REL-51). The dot is the whole
notice: a user who does not look at the gear never learns a new version exists,
and nothing tells them where to go once they do.

The user asked for a toast, centered at the bottom, shown once the home screen
is released from the boot overlay, naming that a new version is available and
carrying a button that takes them to Settings › Updates. Because a toast is more
intrusive than a dot, the same Updates section must offer a switch to turn it
off.

## Decisions taken with the user

- The checker is asynchronous and may resolve after boot. The toast appears at
  boot release when the version is already known, **and** later if the event
  arrives afterwards — never on top of the boot splash.
- The toast has no auto-dismiss. It stays until the user closes it or opens the
  Updates section from it.
- The new switch governs **only** the toast. The Header dot (REL-51) and the
  background checking (`auto_check`, REL-35/36) are untouched by it.

## Requirements

| ID | Requirement |
| --- | --- |
| TOAST-01 | WHILE the boot overlay is on screen, the app SHALL NOT display the update toast. |
| TOAST-02 | WHEN the boot overlay is released and a new version is already known, the app SHALL display a toast anchored to the bottom center of the window. |
| TOAST-03 | WHEN `update://available` arrives after the boot overlay is released, the app SHALL display the toast at that moment. |
| TOAST-04 | The toast SHALL name the available version, taking it from the `version` field of the `update://available` payload. |
| TOAST-05 | The toast SHALL NOT dismiss itself. It SHALL close only on its close control or on its "Abrir" button. |
| TOAST-06 | The toast SHALL carry an "Abrir" button that opens the settings shell **already on the Updates section**, and closes the toast. |
| TOAST-07 | Once dismissed, the toast SHALL NOT reappear for the rest of the session, including when a later `update://available` fires for the same or another version. |
| TOAST-08 | Settings › Updates SHALL offer a switch that turns the toast on and off, persisted across restarts, defaulting to on for an existing install and a fresh one alike. |
| TOAST-09 | WHILE the switch is off, no toast SHALL be displayed. The Header dot (REL-51), the `auto_check` toggle and the background checker SHALL behave exactly as before. |
| TOAST-10 | WHEN reading the toast preference fails, the app SHALL fall back to on — the same failure posture the section already takes for `auto_check` (SET-09). |

## Non-goals

- Changing when or how the app checks for updates. `spawn_background_checker`,
  `status_gated` and `auto_check` are untouched.
- A general-purpose toast/notification system. One component, one caller; a
  second use case can generalize it.
- Download or install from the toast. The toast routes to the section that
  already owns those two steps (SILENT-37/39).
- Reacting to `skip_version` (REL-23). The background checker already decides
  what counts as "available"; the toast only reports what it emits.

## Traceability

| Requirement | Implementation | Check |
| --- | --- | --- |
| TOAST-01..TOAST-03, TOAST-07 | `src/App.tsx` (`updateToast` state, `update://available` listener) | `src/App.test.tsx` |
| TOAST-04, TOAST-05, TOAST-06 | `src/components/shell/UpdateToast.tsx` | `src/components/shell/UpdateToast.test.tsx` |
| TOAST-06 (destination) | `src/routes/settings/SettingsShell.tsx` (`initialSection` prop), `src/App.tsx` (`settingsSection` state) | `src/routes/settings/SettingsShell.test.tsx`, `src/App.test.tsx` |
| TOAST-08, TOAST-10 | `src-tauri/src/db/migrations/012_update_toast.sql`, `src-tauri/src/db/settings.rs` (`toast_enabled` / `set_toast_enabled`), `src-tauri/src/commands/update.rs` (`update_toast_get` / `update_toast_set`), `src-tauri/src/lib.rs` (handler), `src/routes/settings/SettingsShell.tsx`, `src/components/settings/UpdateSettings.tsx` | `cargo test -p swarmdeck`, `src/components/settings/UpdateSettings.test.tsx` |
| TOAST-09 | `src/App.tsx` (preference gate before showing the toast) | `src/App.test.tsx` |
