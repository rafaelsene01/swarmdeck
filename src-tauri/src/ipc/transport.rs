// SPEC: mcp-task-server (MCP-01)

//! Local IPC transport: named pipe on Windows, Unix domain socket
//! everywhere else, both hidden behind [`IpcTransport`]/[`IpcConnection`] so
//! `server.rs`'s routing code never branches on platform.
//!
//! DESVIO (documented per task brief, not a blocker): `design.md` left the
//! choice between the raw `interprocess::os::windows::named_pipe` /
//! `interprocess::os::unix::udsocket` modules open ("ou o módulo equivalente
//! da versão instalada — confirme a API exata"). Having added `interprocess`
//! 2.4.3 (current on crates.io at the time this task ran) and read its
//! source, it ships `local_socket` — a first-party façade *specifically*
//! over those two primitives: its module doc states "Windows only using
//! named pipe based local sockets and Unix only using Unix-domain socket
//! based local sockets" for this crate version, with a stability guarantee
//! that the OS primitive per name type never changes within a major
//! version. Building `IpcTransport` on `local_socket` instead of hand
//! `#[cfg(windows)]`/`#[cfg(unix)]`-splitting the raw modules avoids
//! duplicating platform branching interprocess already tested, while still
//! landing on the exact OS primitives the architecture decision named.
//! `GenericFilePath` (not `GenericNamespaced`) is the name type used below,
//! specifically because it resolves to a real filesystem socket file on
//! Unix (so `.mode(0o600)` has something to apply to) rather than Linux's
//! abstract namespace, which carries no permission bits at all.

use std::io::{self, Read, Write};
use std::path::PathBuf;

use interprocess::local_socket::traits::Listener as _;
use interprocess::local_socket::{GenericFilePath, Listener, ListenerOptions, ToFsName};

#[cfg(unix)]
use interprocess::os::unix::local_socket::ListenerOptionsExt;

/// Name of the production socket/pipe. `\\.\pipe\swarmdeck-mcp` on
/// Windows, `<std::env::temp_dir()>/swarmdeck-mcp.sock` elsewhere (see
/// [`socket_path`]).
pub const SOCKET_NAME: &str = "swarmdeck-mcp";

/// One accepted connection, byte-stream only. Routing code reads/writes
/// length-prefixed frames through this trait and never learns whether it's
/// talking to a named pipe or a Unix socket.
pub trait IpcConnection: Read + Write + Send {}
impl<T: Read + Write + Send> IpcConnection for T {}

/// A bound server endpoint that hands out [`IpcConnection`]s. `server.rs`
/// depends only on this trait — never on [`LocalSocketTransport`] directly
/// — so the routing/handling code has no idea whether it's running over a
/// named pipe or a Unix domain socket.
pub trait IpcTransport: Send + Sync {
    fn accept(&self) -> io::Result<Box<dyn IpcConnection>>;
}

/// Named pipe (Windows) / Unix domain socket (elsewhere) transport, scoped
/// to the current user (MCP-01, "socket com escopo de usuário").
pub struct LocalSocketTransport {
    listener: Listener,
}

impl LocalSocketTransport {
    /// Binds a listener at `name`. See [`socket_path`] for how `name` maps
    /// to a platform path.
    ///
    /// Security notes (MCP-01 "recusa requisição cujo terminal_id não
    /// corresponda a uma sessão viva. Sem isso, qualquer processo local
    /// escreveria no board" — this covers the socket-scope half of that
    /// requirement, `server.rs` covers the terminal-validation half):
    /// - **Unix**: the socket is a real filesystem entry, created with mode
    ///   `0600` via `interprocess`'s `fchmod`-before-`bind()` (avoids the
    ///   umask race a post-hoc `chmod` would have) — only the owning user
    ///   can open it.
    /// - **Windows**: no custom security descriptor is attached here, so
    ///   the pipe keeps the OS default ACL. That default already scopes the
    ///   pipe to the local machine (no remote access is possible for named
    ///   pipes opened this way) — this code never *widens* that default by
    ///   attaching an open ACL. DESVIO/limitation: the OS default DACL for
    ///   `CreateNamedPipe` grants the `Everyone` group *read* access (per
    ///   Win32 docs), so on a shared machine another local, non-admin user
    ///   could observe (not write) traffic; tightening this to
    ///   current-user-only would require building a custom
    ///   `SecurityDescriptor`/SDDL string via
    ///   `interprocess::os::windows::local_socket::ListenerOptionsExt`,
    ///   which is out of this task's scope and is not required by its
    ///   Done-when bullet ("named pipe já é local-machine por padrão... —
    ///   confirme que não está criando ACL aberta").
    pub fn bind(name: &str) -> io::Result<Self> {
        let socket_name = socket_path(name).to_fs_name::<GenericFilePath>()?;
        #[cfg_attr(not(unix), allow(unused_mut))]
        let mut options = ListenerOptions::new().name(socket_name);

        #[cfg(unix)]
        {
            options = options.mode(0o600);
        }

        let listener = options.create_sync()?;
        Ok(Self { listener })
    }
}

impl IpcTransport for LocalSocketTransport {
    fn accept(&self) -> io::Result<Box<dyn IpcConnection>> {
        let stream = self.listener.accept()?;
        Ok(Box::new(stream))
    }
}

/// Maps a logical socket name to the platform-specific path `local_socket`
/// expects when using the [`GenericFilePath`] name type: a named pipe path
/// on Windows, a real socket file elsewhere. `pub` so tests (and, later,
/// the `swarmdeck-mcp` sidecar client) can compute the exact same name a
/// server bound with [`LocalSocketTransport::bind`].
#[cfg(windows)]
pub fn socket_path(name: &str) -> PathBuf {
    PathBuf::from(format!(r"\\.\pipe\{name}"))
}

#[cfg(not(windows))]
pub fn socket_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("{name}.sock"))
}
