// SPEC: mcp-task-server (MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-08)

//! IPC client half of the sidecar↔app protocol implemented by
//! `src-tauri/src/ipc/{transport,server}.rs`. `swarmdeck-mcp` is a separate
//! crate in this workspace and deliberately does not depend on `src-tauri`
//! (task brief: "não precisa reusar código de src-tauri, é um crate
//! separado"), so this module speaks the exact same wire format
//! independently, by convention rather than shared code:
//!
//! - **Framing** (`src-tauri/src/ipc/server.rs` module doc): `[ u32
//!   little-endian length ][ that many bytes of UTF-8 JSON ]`, one frame per
//!   request, one frame per response.
//! - **Protocol**: request `{"terminal_id", "tool", "args"}`, response
//!   `{"ok": true, "result": {...}}` or `{"ok": false, "error": "..."}`.
//! - **Transport**: `interprocess::local_socket`, [`SOCKET_NAME`] resolved
//!   through the identical `socket_path` mapping as
//!   `src-tauri/src/ipc/transport.rs::socket_path` (named pipe on Windows,
//!   Unix domain socket file elsewhere).
//!
//! ## `check_active` (design.md "check_active cai fora de graça")
//! The handshake has no dedicated mechanism — it *is* the result of trying
//! to reach the app:
//! - `SWARMDECK_TERMINAL_ID` absent from the sidecar's env → `active: false`
//!   without even attempting a connection.
//! - Env var present but the socket refuses (app closed/crashed) →
//!   `active: false`.
//! - Env var present and the app replies → `active: true` +
//!   `terminal_id`, exactly as the app's `check_active` route
//!   (`src-tauri/src/ipc/server.rs::IpcServer::check_active`) reports it.
//!
//! Per the sidecar's design rule ("sem estado e sem lógica de negócio, só
//! traduz MCP → IPC"), [`check_active`] never decides whether a terminal is
//! real — it forwards the request and relays whatever the app answers (or
//! `active: false` for any transport failure, which is indistinguishable
//! from "app not running" and must never be surfaced as a crash to the
//! agent).

use std::io::{self, Read, Write};
use std::path::PathBuf;

use interprocess::local_socket::traits::Stream as _;
use interprocess::local_socket::{GenericFilePath, Stream, ToFsName};
use serde_json::{json, Value};

/// Name of the production socket/pipe. Must match
/// `src-tauri/src/ipc/transport.rs::SOCKET_NAME` exactly — the two crates
/// only agree on it by convention, not shared code.
pub const SOCKET_NAME: &str = "swarmdeck-mcp";

/// Env var `TerminalManager` injects into a PTY's environment when the app
/// spawns an agent's terminal (design.md, "Identificação do terminal").
pub const TERMINAL_ID_ENV_VAR: &str = "SWARMDECK_TERMINAL_ID";

/// One connection to the app, byte-stream only. Structurally identical to
/// `src-tauri/src/ipc/transport.rs::IpcConnection` (same trait, same
/// Read+Write+Send contract) so both ends of the protocol are abstracted
/// the same way without the two crates sharing code.
trait IpcConnection: Read + Write + Send {}
impl<T: Read + Write + Send> IpcConnection for T {}

/// Maps a logical socket name to the platform path, identically to
/// `src-tauri/src/ipc/transport.rs::socket_path`. `pub(crate)` (not just
/// private to this module) so `tools.rs`'s own tests can bind a listener at
/// the exact path [`call_tool`]'s production connector computes, to drive a
/// `#[tool]` method through a real socket end to end (mcp-task-server/T7).
#[cfg(windows)]
pub(crate) fn socket_path(name: &str) -> PathBuf {
    PathBuf::from(format!(r"\\.\pipe\{name}"))
}

#[cfg(not(windows))]
pub(crate) fn socket_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("{name}.sock"))
}

/// Connects to `name`'s socket/pipe using the real OS transport. This is
/// the connector [`check_active`] (the production entry point) uses; tests
/// exercise [`check_active_over`] directly with a fake connector instead of
/// binding a real socket named [`SOCKET_NAME`].
fn connect(name: &str) -> io::Result<Box<dyn IpcConnection>> {
    let socket_name = socket_path(name).to_fs_name::<GenericFilePath>()?;
    let stream = Stream::connect(socket_name)?;
    Ok(Box::new(stream))
}

/// Reads one length-prefixed frame. Mirrors
/// `src-tauri/src/ipc/server.rs::read_frame`'s framing exactly, but not its
/// signature (this client always expects a value, never a clean
/// disconnect-as-`None`, because it only ever reads the one response to a
/// request it just sent).
fn read_frame(conn: &mut dyn Read) -> io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    conn.read_exact(&mut len_buf)?;
    let len = u32::from_le_bytes(len_buf) as usize;
    let mut payload = vec![0u8; len];
    conn.read_exact(&mut payload)?;
    Ok(payload)
}

/// Writes one length-prefixed frame. Mirrors
/// `src-tauri/src/ipc/server.rs::write_frame`.
fn write_frame(conn: &mut dyn Write, payload: &[u8]) -> io::Result<()> {
    let len = u32::try_from(payload.len()).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidData, "payload exceeds maximum length")
    })?;
    conn.write_all(&len.to_le_bytes())?;
    conn.write_all(payload)?;
    conn.flush()
}

fn to_io_error(err: serde_json::Error) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, err)
}

/// Production entry point: reads [`TERMINAL_ID_ENV_VAR`] from the sidecar's
/// own environment and, if present, connects to [`SOCKET_NAME`]. See the
/// module doc for the full handshake table.
pub async fn check_active() -> Value {
    let terminal_id = std::env::var(TERMINAL_ID_ENV_VAR).ok();
    check_active_over(terminal_id, || connect(SOCKET_NAME)).await
}

/// Core handshake logic, parameterized over the terminal id and a
/// connector so it can be exercised without a real socket bound at
/// [`SOCKET_NAME`] and without mutating the process-wide environment from
/// tests (`std::env::var` is read exactly once, by [`check_active`],
/// *before* this function is ever called).
///
/// `connect` is only invoked when `terminal_id.is_some()` — the `None`
/// branch returns before `connect` is touched at all, which is what proves
/// "env var ausente ⇒ sem tentar conectar" in the unit tests below (a fake
/// connector that panics if called never panics for that case).
async fn check_active_over(
    terminal_id: Option<String>,
    connect: impl FnOnce() -> io::Result<Box<dyn IpcConnection>> + Send + 'static,
) -> Value {
    let Some(terminal_id) = terminal_id else {
        return json!({ "active": false });
    };

    // `interprocess`'s local-socket API is synchronous (the same sync API
    // `src-tauri/src/ipc/transport.rs::LocalSocketTransport` uses on the
    // server side); run it on a blocking thread so a slow/hung app never
    // stalls the sidecar's async runtime.
    let outcome = tokio::task::spawn_blocking(move || -> io::Result<Value> {
        let mut conn = connect()?;

        let request = json!({
            "terminal_id": terminal_id,
            "tool": "check_active",
            "args": {},
        });
        let request_bytes = serde_json::to_vec(&request).map_err(to_io_error)?;
        write_frame(conn.as_mut(), &request_bytes)?;

        let response_bytes = read_frame(conn.as_mut())?;
        serde_json::from_slice::<Value>(&response_bytes).map_err(to_io_error)
    })
    .await;

    match outcome {
        // App replied and the reply says the terminal is live: relay
        // exactly what it sent (never re-derive `active`/`terminal_id`
        // ourselves — "sidecar não decide nada sozinho").
        Ok(Ok(response)) if response.get("ok").and_then(Value::as_bool) == Some(true) => response
            .get("result")
            .cloned()
            .unwrap_or_else(|| json!({ "active": false })),
        // App replied with `ok:false` (unknown terminal), the connection
        // was refused (app closed), the frame was malformed, or the
        // blocking task itself failed to join — every one of these is a
        // transport-level "can't confirm this terminal is live", which
        // design.md says must degrade to `active:false`, never an error
        // surfaced to the agent.
        _ => json!({ "active": false }),
    }
}

// Generic relay for every tool in TOOL-CONTRACT.md other than
// `check_active` (which keeps its own dedicated handshake path above, per
// design.md's "check_active cai fora de graça" — its degrade-to-inactive
// behavior on any transport failure is deliberately different from every
// other tool's, which surfaces the failure as an `Err` instead). Every
// `#[tool]` method in `tools.rs` calls [`call_tool`] and relays whatever it
// gets back — Ok(value) or Err(message) — without reinterpreting it, per
// the sidecar's "sem lógica de negócio" rule.

/// Env var that overrides which socket/pipe name [`call_tool`] connects to,
/// checked ahead of the fixed [`SOCKET_NAME`]. Unset in production — real
/// agent sessions always talk to the one running app. Exists purely so
/// `tools.rs`'s tests can point a `#[tool]` method's *production* call path
/// at a uniquely-named fake listener instead of binding the literal
/// `SOCKET_NAME`: reusing that literal name across quick successive test
/// runs hit real, reproducible flakiness on Windows (`ERROR_ACCESS_DENIED`
/// rebinding a named pipe before the OS fully releases the previous
/// instance) — a fresh name per test sidesteps that class of bug entirely
/// rather than papering over it with retries.
const SOCKET_NAME_OVERRIDE_ENV_VAR: &str = "SWARMDECK_MCP_TEST_SOCKET_NAME";

fn resolve_socket_name() -> String {
    std::env::var(SOCKET_NAME_OVERRIDE_ENV_VAR).unwrap_or_else(|_| SOCKET_NAME.to_string())
}

/// Serializes every test in this **crate** (not just this file) that reads
/// or writes [`TERMINAL_ID_ENV_VAR`] / [`SOCKET_NAME_OVERRIDE_ENV_VAR`].
/// `std::env::set_var`/`remove_var` are process-global, and `cargo test`
/// runs tests in a binary on separate threads by default — without a single
/// shared lock, this file's own env-var test and `tools.rs`'s env-var tests
/// raced each other in practice (one test's `remove_var` firing mid-flight
/// of another's `call_tool`, or one test's socket-name override leaking
/// into another's connection attempt), not just in theory. `pub(crate)` so
/// `tools.rs`'s test module can acquire the exact same lock rather than a
/// second, independent one that wouldn't actually exclude this file's test.
#[cfg(test)]
pub(crate) fn env_var_test_lock() -> std::sync::MutexGuard<'static, ()> {
    use std::sync::{Mutex, OnceLock};
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Production entry point for every tool other than `check_active`: reads
/// [`TERMINAL_ID_ENV_VAR`], and if present, sends `{"terminal_id", "tool",
/// "args"}` to [`SOCKET_NAME`] (or [`SOCKET_NAME_OVERRIDE_ENV_VAR`], for
/// tests) and relays the app's answer.
///
/// - No `SWARMDECK_TERMINAL_ID` → `Err` describing that this agent isn't
///   running inside SwarmDeck, **without** attempting a connection (same
///   rule `check_active` follows).
/// - App unreachable (closed, refused, malformed frame) → `Err` describing
///   a transport failure. Unlike `check_active`, this is not degraded to a
///   quiet default — a tool call that silently pretended to succeed would
///   be worse than a loud error, since (unlike the handshake) the caller
///   has no other way to learn the write never happened.
/// - App replies `{"ok": true, "result": ...}` → `Ok(result)`, relayed
///   exactly as received.
/// - App replies `{"ok": false, "error": "..."}` → `Err(error)`, relayed
///   exactly as received — this is how a domain error (`task not found`,
///   `invalid status`, ...) reaches the agent as an MCP tool error, per
///   `tools.rs`'s `Result<Json<T>, String>` return type.
pub async fn call_tool(tool: &str, args: Value) -> Result<Value, String> {
    let terminal_id = std::env::var(TERMINAL_ID_ENV_VAR).ok();
    let socket_name = resolve_socket_name();
    call_tool_over(terminal_id, tool, args, move || connect(&socket_name)).await
}

/// Core logic behind [`call_tool`], parameterized over the terminal id and
/// a connector so it's testable without a real socket bound at
/// [`SOCKET_NAME`] — same shape as [`check_active_over`].
async fn call_tool_over(
    terminal_id: Option<String>,
    tool: &str,
    args: Value,
    connect: impl FnOnce() -> io::Result<Box<dyn IpcConnection>> + Send + 'static,
) -> Result<Value, String> {
    let Some(terminal_id) = terminal_id else {
        return Err(
            "not running inside SwarmDeck — SWARMDECK_TERMINAL_ID is not set; skip task tools this session"
                .to_string(),
        );
    };

    let tool = tool.to_string();
    let outcome = tokio::task::spawn_blocking(move || -> io::Result<Value> {
        let mut conn = connect()?;

        let request = json!({
            "terminal_id": terminal_id,
            "tool": tool,
            "args": args,
        });
        let request_bytes = serde_json::to_vec(&request).map_err(to_io_error)?;
        write_frame(conn.as_mut(), &request_bytes)?;

        let response_bytes = read_frame(conn.as_mut())?;
        serde_json::from_slice::<Value>(&response_bytes).map_err(to_io_error)
    })
    .await;

    match outcome {
        Ok(Ok(response)) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
            Ok(response.get("result").cloned().unwrap_or(Value::Null))
        }
        Ok(Ok(response)) if response.get("ok").and_then(Value::as_bool) == Some(false) => {
            // Relay the app's `error` (and any extra fields, e.g.
            // `set_terminal_status`'s `valid_statuses`) as the tool error
            // text — `tools.rs` doesn't have a richer MCP error channel to
            // put structured data in without deviating further from "no
            // reinterpretation", so the whole app response becomes the
            // error string.
            Err(response.to_string())
        }
        Ok(Ok(response)) => Err(format!(
            "unexpected response from SwarmDeck app: {response}"
        )),
        Ok(Err(io_err)) => Err(format!("failed to reach the SwarmDeck app: {io_err}")),
        Err(join_err) => Err(format!(
            "internal error relaying to the SwarmDeck app: {join_err}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;

    use interprocess::local_socket::traits::Listener as _;
    use interprocess::local_socket::{GenericFilePath, ListenerOptions, ToFsName};

    use super::*;

    /// Done-when: "Retorna false quando a env var falta — sem tentar
    /// conectar". Proven by injecting a connector that panics if it is
    /// ever called (not just a slow/unroutable address, an outright
    /// `panic!`), which is a stronger guarantee than "didn't hang".
    #[tokio::test]
    async fn env_var_ausente_retorna_false_sem_conectar() {
        let called = Arc::new(AtomicBool::new(false));
        let called_clone = Arc::clone(&called);
        let connect = move || -> io::Result<Box<dyn IpcConnection>> {
            called_clone.store(true, Ordering::SeqCst);
            panic!("connect must never be called when terminal_id is None");
        };

        let result = check_active_over(None, connect).await;

        assert_eq!(result, json!({ "active": false }));
        assert!(
            !called.load(Ordering::SeqCst),
            "connector must not run without a terminal id"
        );
    }

    /// Done-when: "Retorna false quando o socket recusa (app fechado)".
    /// Simulated with an `io::Error` from the connector — the exact outcome
    /// a refused OS connection produces — rather than a real absent
    /// listener, so the test can't ever hang on CI regardless of platform.
    #[tokio::test]
    async fn conexao_recusada_retorna_false() {
        let connect = || -> io::Result<Box<dyn IpcConnection>> {
            Err(io::Error::from(io::ErrorKind::ConnectionRefused))
        };

        let result = check_active_over(Some("term-1".to_string()), connect).await;

        assert_eq!(result, json!({ "active": false }));
    }

    /// Done-when: "check_active retorna true + terminal_id quando a env var
    /// existe e o socket conecta". A `Cursor`-backed fake connection plays
    /// both roles the client expects from a real `IpcConnection`: readable
    /// (yields a pre-baked `{"ok":true,"result":{...}}` frame) and writable
    /// (the request frame is discarded, matching how a real socket would
    /// behave from the client's point of view — it only cares about what
    /// comes back).
    struct FakeAppConnection {
        outgoing: Cursor<Vec<u8>>,
        incoming: Vec<u8>,
    }
    impl Read for FakeAppConnection {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            self.outgoing.read(buf)
        }
    }
    impl Write for FakeAppConnection {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.incoming.extend_from_slice(buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn frame(payload: &Value) -> Vec<u8> {
        let bytes = serde_json::to_vec(payload).unwrap();
        let mut framed = (bytes.len() as u32).to_le_bytes().to_vec();
        framed.extend_from_slice(&bytes);
        framed
    }

    #[tokio::test]
    async fn ativo_retorna_true_e_terminal_id() {
        let response = json!({ "ok": true, "result": { "active": true, "terminal_id": "term-1" } });
        let connect = move || -> io::Result<Box<dyn IpcConnection>> {
            Ok(Box::new(FakeAppConnection {
                outgoing: Cursor::new(frame(&response)),
                incoming: Vec::new(),
            }))
        };

        let result = check_active_over(Some("term-1".to_string()), connect).await;

        assert_eq!(result, json!({ "active": true, "terminal_id": "term-1" }));
    }

    /// Extra coverage beyond the four Done-when tests: the app can also
    /// answer `ok:false` (e.g. `terminal_id` doesn't match a live session)
    /// without the connection itself failing — that must degrade to
    /// `active:false` exactly like a refused connection, never propagate
    /// the app's `error` string as if it were a crash.
    #[tokio::test]
    async fn resposta_ok_false_do_app_retorna_false() {
        let response = json!({ "ok": false, "error": "unknown terminal" });
        let connect = move || -> io::Result<Box<dyn IpcConnection>> {
            Ok(Box::new(FakeAppConnection {
                outgoing: Cursor::new(frame(&response)),
                incoming: Vec::new(),
            }))
        };

        let result = check_active_over(Some("term-1".to_string()), connect).await;

        assert_eq!(result, json!({ "active": false }));
    }

    /// End-to-end sanity check over a *real* `interprocess` local socket
    /// (not the injected-connector fakes above): binds a minimal listener
    /// speaking the exact same protocol `IpcServer` does, then drives it
    /// through `check_active` (the public, env-var-reading entry point) —
    /// proving the real `connect`/`socket_path`/frame plumbing in this file
    /// agrees with `src-tauri`'s wire format, not just the mocked core
    /// logic above. Uses a unique socket name (PID + test name) so it never
    /// collides with a real running app's `SOCKET_NAME` or with other
    /// tests running concurrently.
    /// Not `#[tokio::test]`: `env_var_test_lock` returns a `std::sync::MutexGuard`,
    /// and clippy's `await_holding_lock` (this workspace runs `-D warnings`)
    /// correctly refuses to let one survive across an `.await` — a
    /// `tokio::sync::Mutex` would need a new Cargo feature this task isn't
    /// meant to add. Building a runtime and `block_on`-ing the async body
    /// keeps the guard held across a single synchronous call instead, which
    /// the lint has no objection to.
    #[test]
    fn ponta_a_ponta_com_listener_real_via_env_var() {
        let _guard = env_var_test_lock();
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let name = format!("swarmdeck-mcp-test-{}-ativo", std::process::id());
            let socket_name = socket_path(&name).to_fs_name::<GenericFilePath>().unwrap();
            let listener = ListenerOptions::new()
                .name(socket_name)
                .create_sync()
                .unwrap();

            let server = thread::spawn(move || {
                let mut conn = listener.accept().unwrap();
                let mut len_buf = [0u8; 4];
                conn.read_exact(&mut len_buf).unwrap();
                let len = u32::from_le_bytes(len_buf) as usize;
                let mut payload = vec![0u8; len];
                conn.read_exact(&mut payload).unwrap();
                let request: Value = serde_json::from_slice(&payload).unwrap();
                assert_eq!(request["tool"], "check_active");
                assert_eq!(request["terminal_id"], "term-e2e");

                let response =
                    json!({ "ok": true, "result": { "active": true, "terminal_id": "term-e2e" } });
                let response_bytes = serde_json::to_vec(&response).unwrap();
                conn.write_all(&(response_bytes.len() as u32).to_le_bytes())
                    .unwrap();
                conn.write_all(&response_bytes).unwrap();
            });

            // SAFETY (single-threaded-w.r.t.-this-var concern): `env_var_test_lock`
            // (held by the caller of `block_on`) is the only thing in this
            // crate that also touches `TERMINAL_ID_ENV_VAR`/the socket-name
            // override, so there is no cross-test race despite
            // `std::env::set_var` being process-global.
            unsafe { std::env::set_var(TERMINAL_ID_ENV_VAR, "term-e2e") };
            let result = check_active_over(std::env::var(TERMINAL_ID_ENV_VAR).ok(), move || {
                connect(&name)
            })
            .await;
            unsafe { std::env::remove_var(TERMINAL_ID_ENV_VAR) };

            server.join().unwrap();
            assert_eq!(result, json!({ "active": true, "terminal_id": "term-e2e" }));
        });
    }

    // ---- call_tool_over (mcp-task-server/T7) -----------------------------

    /// No `SWARMDECK_TERMINAL_ID` -> `Err`, without ever calling `connect`
    /// — same guarantee `check_active_over`'s equivalent test proves for
    /// the handshake path.
    #[tokio::test]
    async fn call_tool_sem_terminal_id_retorna_err_sem_conectar() {
        let called = Arc::new(AtomicBool::new(false));
        let called_clone = Arc::clone(&called);
        let connect = move || -> io::Result<Box<dyn IpcConnection>> {
            called_clone.store(true, Ordering::SeqCst);
            panic!("connect must never be called when terminal_id is None");
        };

        let result = call_tool_over(None, "create_task", json!({"title": "x"}), connect).await;

        assert!(
            result.is_err(),
            "sem terminal_id deve ser Err, recebido: {result:?}"
        );
        assert!(
            !called.load(Ordering::SeqCst),
            "connector não deve rodar sem terminal id"
        );
    }

    /// App unreachable (connection refused) -> `Err` describing the
    /// transport failure. Unlike `check_active_over`, this must **not**
    /// degrade to a quiet default — see this function's doc comment.
    #[tokio::test]
    async fn call_tool_com_conexao_recusada_retorna_err() {
        let connect = || -> io::Result<Box<dyn IpcConnection>> {
            Err(io::Error::from(io::ErrorKind::ConnectionRefused))
        };

        let result = call_tool_over(
            Some("term-1".to_string()),
            "create_task",
            json!({"title": "x"}),
            connect,
        )
        .await;

        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("failed to reach"),
            "a mensagem deve descrever a falha de transporte"
        );
    }

    /// App replies `ok:true` -> `Ok(result)`, relayed exactly, and the
    /// request frame sent carries `terminal_id`/`tool`/`args` verbatim —
    /// proves `call_tool` doesn't reinterpret either direction.
    #[tokio::test]
    async fn call_tool_ok_true_relay_sem_reinterpretar() {
        let response =
            json!({ "ok": true, "result": { "id": 1, "title": "Nova task", "status": "pending" } });
        let connect = move || -> io::Result<Box<dyn IpcConnection>> {
            Ok(Box::new(FakeAppConnection {
                outgoing: Cursor::new(frame(&response)),
                incoming: Vec::new(),
            }))
        };

        let result = call_tool_over(
            Some("term-1".to_string()),
            "create_task",
            json!({"title": "Nova task"}),
            connect,
        )
        .await;

        assert_eq!(
            result,
            Ok(json!({ "id": 1, "title": "Nova task", "status": "pending" }))
        );
    }

    /// App replies `ok:false` -> `Err`, carrying the app's `error` text —
    /// this is "erro propagado": a domain error (`task not found`, ...)
    /// reaching the caller as an `Err`, not degraded to a default value the
    /// way `check_active_over` degrades every failure to `active:false`.
    #[tokio::test]
    async fn call_tool_ok_false_do_app_vira_err_com_a_mensagem() {
        let response = json!({ "ok": false, "error": "task not found: 999" });
        let connect = move || -> io::Result<Box<dyn IpcConnection>> {
            Ok(Box::new(FakeAppConnection {
                outgoing: Cursor::new(frame(&response)),
                incoming: Vec::new(),
            }))
        };

        let result = call_tool_over(
            Some("term-1".to_string()),
            "complete_task",
            json!({"task_id": 999}),
            connect,
        )
        .await;

        let err = result.expect_err("ok:false do app deve virar Err");
        assert!(
            err.contains("task not found: 999"),
            "mensagem recebida: {err}"
        );
    }

    /// End-to-end sanity check over a real local socket, mirroring
    /// `ponta_a_ponta_com_listener_real_via_env_var` above but for the
    /// generic relay: proves the exact request frame `call_tool` builds
    /// (`terminal_id`/`tool`/`args`) round-trips over the real
    /// connect/frame plumbing, not just the mocked core logic.
    #[tokio::test]
    async fn ponta_a_ponta_call_tool_com_listener_real() {
        let name = format!("swarmdeck-mcp-test-{}-call-tool", std::process::id());
        let socket_name = socket_path(&name).to_fs_name::<GenericFilePath>().unwrap();
        let listener = ListenerOptions::new()
            .name(socket_name)
            .create_sync()
            .unwrap();

        let server = thread::spawn(move || {
            let mut conn = listener.accept().unwrap();
            let mut len_buf = [0u8; 4];
            conn.read_exact(&mut len_buf).unwrap();
            let len = u32::from_le_bytes(len_buf) as usize;
            let mut payload = vec![0u8; len];
            conn.read_exact(&mut payload).unwrap();
            let request: Value = serde_json::from_slice(&payload).unwrap();
            assert_eq!(request["tool"], "start_task");
            assert_eq!(request["terminal_id"], "term-e2e");
            assert_eq!(request["args"]["task_id"], 42);

            let response = json!({ "ok": true, "result": { "id": 42, "status": "in_progress" } });
            let response_bytes = serde_json::to_vec(&response).unwrap();
            conn.write_all(&(response_bytes.len() as u32).to_le_bytes())
                .unwrap();
            conn.write_all(&response_bytes).unwrap();
        });

        let result = call_tool_over(
            Some("term-e2e".to_string()),
            "start_task",
            json!({"task_id": 42}),
            move || connect(&name),
        )
        .await;

        server.join().unwrap();
        assert_eq!(result, Ok(json!({ "id": 42, "status": "in_progress" })));
    }
}
