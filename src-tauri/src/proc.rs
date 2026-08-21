// SPEC: terminal-boot-loading (BOOT-01)

//! Single place that decides how the app spawns a helper process.
//!
//! Every `std::process::Command` the app runs on the user's behalf goes
//! through `hide_console`. Without `CREATE_NO_WINDOW` each of those spawns
//! flashes a console window on Windows — the `wsl.exe` probe fired right
//! before opening a terminal is the visible one, but `icacls`, `reg` and
//! `git init` flash the same way. Fixing it here instead of at each call
//! site is what keeps the next spawn from reintroducing the flash.
//!
//! PTY sessions are NOT covered here: `portable_pty` attaches the child to a
//! ConPTY, which is headless by construction, and it takes a
//! `CommandBuilder`, not a `Command`.

use std::process::Command;

/// Suppresses the console window Windows would otherwise create for `cmd`.
/// Returns `cmd` so it chains inside a builder expression. No-op on every
/// other platform.
#[cfg(windows)]
pub fn hide_console(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    // `CREATE_NO_WINDOW` (winbase.h). Hardcoded to avoid pulling `windows-sys`
    // in for a single constant.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(windows))]
pub fn hide_console(cmd: &mut Command) -> &mut Command {
    cmd
}
