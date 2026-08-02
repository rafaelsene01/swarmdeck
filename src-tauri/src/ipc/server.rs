// SPEC: mcp-task-server (MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08)

//! `IpcServer`: accepts sidecar connections over an [`IpcTransport`],
//! decodes one length-prefixed JSON request per frame, routes it, and
//! writes back a length-prefixed JSON response.
//!
//! ## Framing
//! Named pipes and Unix domain sockets are byte streams, not datagrams, so
//! message boundaries need to be explicit. Each message (request *and*
//! response) is:
//!
//! ```text
//! [ u32 little-endian length ][ that many bytes of UTF-8 JSON ]
//! ```
//!
//! ## Protocol
//! Request: `{"terminal_id": "...", "tool": "...", "args": {...}}`.
//! Response: `{"ok": true, "result": {...}}` or `{"ok": false, "error": "..."}`.
//!
//! ## Scope of this task (mcp-task-server/T7)
//! `T5` only wired up `check_active` — enough to prove the
//! accept/decode/route/respond path end to end. This task fills in the
//! other 15 tools from `TOOL-CONTRACT.md`, each a thin `route_*` method that
//! deserializes `args`, calls straight into `tasks::service`,
//! `tasks::similarity`, `terminal::meta::TerminalMetaService`, or
//! `projects::service`, and serializes whatever that layer returns — no
//! business logic is reimplemented here, this module only marshals.
//!
//! Every route that can fail on a bad `task_id`/transition/status build its
//! error message from the domain layer's own `Display` impl
//! (`TaskError`/`MetaError`/`ProjectError`), so the wording a caller sees is
//! defined once, in the layer that owns the rule.
//!
//! ## `task_changed` emission
//! `emit_task_changed` is the mechanism MCP-01's "toda mutação bem-sucedida
//! emite `task_changed`" requirement asks for, wired through
//! `IpcServer::on_task_changed` so routing code never touches `AppHandle`
//! directly (keeps `route()`/`handle_request()` testable without a live
//! Tauri app — see the unit test at the bottom of this file). Only the
//! tools that write task rows set `RouteResult::mutated = true`:
//! `create_task`, `start_task`, `complete_task`, `update_task_plan`,
//! `update_task_implementation`, `update_task_project`, `create_project`.
//! Terminal metadata (`set_terminal_title`, `update_terminal_activity`,
//! `set_terminal_status`) and every read-only tool never do — `task_changed`
//! is a nudge for the Kanban board specifically (design.md), not a generic
//! "something happened" event.
//!
//! ## DESVIO — `find_related_active_tasks` returns at most one entry
//! `TOOL-CONTRACT.md` describes the return shape as an array scored against
//! *every* active task. `tasks::similarity::find_similar` (frozen by T8,
//! not a file this task is authorized to touch) only ever reports the
//! single best match — `SimilarityRecommendation::{Reuse,AskUser}` carry a
//! `task_id`/`score` pair, `None` carries neither. Without editing
//! `similarity.rs` there is no way to recover a numeric score for every
//! other active task, so this route returns a 0- or 1-element array (empty
//! on `None`, one entry on `Reuse`/`AskUser`) rather than one entry per
//! active task. This is the best-faith fit against the contract available
//! without touching a file outside this task's authorized scope.
//!
//! ## DESVIO — `set_terminal_title`'s `long_title` is accepted, not stored
//! The contract's `set_terminal_title` takes `long_title: string | null`,
//! but `TerminalMetaService`/`TerminalMeta` (T4) has no field for it — only
//! `title`. This task's brief scopes `terminal/meta.rs` edits to adding
//! `clear_status` alone, so `route_set_terminal_title` deserializes
//! `long_title` (the MCP schema still advertises it, matching the contract)
//! and drops it rather than inventing new persistence in a file outside
//! that scope.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::{io, thread};

use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::Db;
use crate::projects;
use crate::tasks::{
    self,
    service::{Task, TaskError, TerminalContext, UpdateResult},
    similarity::SimilarityRecommendation,
    state::TaskStatus,
};
use crate::terminal::{MetaError, TerminalId, TerminalManager, TerminalMetaService, TitleSource};

use super::transport::{IpcConnection, IpcTransport};

/// Emits the `task_changed` event to every window, per MCP-01 / design.md
/// ("Toda mutação bem-sucedida emite task_changed para todas as janelas").
/// The event carries no payload — it's a nudge for listeners (the Kanban)
/// to refetch, not a data transport (design.md: "Kanban consome o evento
/// task_changed; nunca lê o banco por polling").
///
/// A failed emit (e.g. no window left to receive it) is not something the
/// caller of a successful mutation should fail over — the task write
/// already committed — so the error is deliberately swallowed here.
pub fn emit_task_changed(app: &tauri::AppHandle) {
    use tauri::Emitter;
    let _ = app.emit("task_changed", ());
}

#[derive(Debug, Deserialize)]
struct McpRequest {
    terminal_id: String,
    tool: String,
    #[serde(default)]
    args: Value,
}

/// Outcome of routing one request: the JSON to send back, plus whether a
/// mutation happened (decides whether `on_task_changed` fires).
struct RouteResult {
    response: Value,
    mutated: bool,
}

impl RouteResult {
    fn unmutated(response: Value) -> Self {
        Self {
            response,
            mutated: false,
        }
    }
}

fn ok_response(result: Value) -> Value {
    json!({ "ok": true, "result": result })
}

fn err_response(error: impl Into<String>) -> Value {
    json!({ "ok": false, "error": error.into() })
}

/// Same as [`err_response`], plus extra top-level fields merged in — used by
/// `set_terminal_status` to carry `valid_statuses` alongside `error`
/// (TOOL-CONTRACT.md #12: "falha: erro contendo `valid_statuses: string[]`").
fn err_response_with(error: impl Into<String>, extra: Value) -> Value {
    let mut response = err_response(error);
    if let (Value::Object(response_map), Value::Object(extra_map)) = (&mut response, extra) {
        response_map.extend(extra_map);
    }
    response
}

/// JSON shape of a `Task` per `TOOL-CONTRACT.md`'s `Task` schema. Built by
/// hand rather than `#[derive(Serialize)]` on `tasks::service::Task`:
/// `TaskStatus` (in `tasks::state`, a file this task is not authorized to
/// touch) has no `Serialize` impl of its own, only `Display` — this reuses
/// that `Display` (`to_string()`) instead of adding one.
fn task_json(task: &Task) -> Value {
    json!({
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "plan": task.plan,
        "implementation": task.implementation,
        "status": task.status.to_string(),
        "project_id": task.project_id,
        "terminal_id": task.terminal_id,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    })
}

/// `task_json` plus `truncated`, for `update_task_plan`/`update_task_implementation`
/// (TOOL-CONTRACT.md's `design.md`-sourced truncation signal).
fn task_update_json(result: &UpdateResult) -> Value {
    let mut value = task_json(&result.task);
    value["truncated"] = json!(result.truncated);
    value
}

fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Local IPC server. Owns a bound [`IpcTransport`] plus everything a route
/// handler needs; see the module doc for the framing/protocol it speaks.
pub struct IpcServer {
    transport: Box<dyn IpcTransport>,
    terminal_manager: Arc<TerminalManager>,
    db: Arc<Mutex<Db>>,
    terminal_meta: Arc<TerminalMetaService>,
    on_task_changed: Arc<dyn Fn() + Send + Sync>,
}

impl IpcServer {
    pub fn new(
        transport: Box<dyn IpcTransport>,
        terminal_manager: Arc<TerminalManager>,
        db: Arc<Mutex<Db>>,
        terminal_meta: Arc<TerminalMetaService>,
        on_task_changed: Arc<dyn Fn() + Send + Sync>,
    ) -> Self {
        Self {
            transport,
            terminal_manager,
            db,
            terminal_meta,
            on_task_changed,
        }
    }

    /// Convenience constructor for the real app: wires `on_task_changed` to
    /// [`emit_task_changed`] against a live `AppHandle`. Not called from
    /// anywhere in this task (wiring `IpcServer` into `run()`'s `setup` is
    /// out of this task's authorized file list — `lib.rs` isn't in it), but
    /// this is what that wiring will look like once a later task does it.
    pub fn for_app(
        transport: Box<dyn IpcTransport>,
        terminal_manager: Arc<TerminalManager>,
        db: Arc<Mutex<Db>>,
        terminal_meta: Arc<TerminalMetaService>,
        app: tauri::AppHandle,
    ) -> Self {
        Self::new(
            transport,
            terminal_manager,
            db,
            terminal_meta,
            Arc::new(move || emit_task_changed(&app)),
        )
    }

    /// Locks `self.db`, recovering from poison the same way every other
    /// `Mutex<Db>` consumer in this codebase does
    /// (`commands/projects.rs`'s `.expect("db mutex poisoned")` panics
    /// instead — deliberately different here: a route handler runs on a
    /// per-connection thread spawned from `serve()`, and one poisoned lock
    /// must not take down every other in-flight IPC connection).
    fn db(&self) -> std::sync::MutexGuard<'_, Db> {
        self.db
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Resolves `terminal_id` to its live session's `cwd`, the way
    /// `create_task` (MCP-08) infers which project a task belongs to.
    /// `Err` carries an already-built `ok:false` response — every caller
    /// just returns it — since "unknown terminal" here means the exact same
    /// thing `check_active` means by it, and this reuses that wording.
    fn terminal_cwd(&self, terminal_id: &str) -> Result<PathBuf, Value> {
        let id: TerminalId = terminal_id
            .parse()
            .map_err(|_| err_response("unknown terminal"))?;
        self.terminal_manager
            .list()
            .into_iter()
            .find(|session| session.id == id)
            .map(|session| session.cwd)
            .ok_or_else(|| err_response("unknown terminal"))
    }

    /// Runs the accept loop **on the calling thread** — callers spawn a
    /// dedicated `std::thread` to run this (mirrors the one-thread-per-PTY
    /// pattern `terminal::session` already uses internally). Each accepted
    /// connection is handed to its own thread, so one slow or misbehaving
    /// client never blocks new connections. A single failed `accept()`
    /// (e.g. a transient OS error) is logged and the loop continues — it
    /// must never take the whole server down.
    pub fn serve(self: Arc<Self>) {
        loop {
            match self.transport.accept() {
                Ok(conn) => {
                    let server = Arc::clone(&self);
                    thread::spawn(move || server.handle_connection(conn));
                }
                Err(err) => {
                    eprintln!("swarmdeck: ipc accept failed: {err}");
                }
            }
        }
    }

    /// Serves one connection until the client disconnects (cleanly or
    /// abruptly) or sends a frame this server can't make sense of as a
    /// stream boundary. Either way this just returns — never panics, never
    /// touches any other connection's state — so it can't take the accept
    /// loop down with it (Done-when: "cliente desconecta sem derrubar
    /// servidor").
    fn handle_connection(&self, mut conn: Box<dyn IpcConnection>) {
        loop {
            let request_bytes = match read_frame(conn.as_mut()) {
                Ok(Some(bytes)) => bytes,
                Ok(None) => return, // clean or abrupt disconnect
                Err(_) => return,   // malformed frame / IO error on this connection only
            };

            let result = self.handle_request(&request_bytes);
            self.notify_if_mutated(&result);

            let response_bytes = match serde_json::to_vec(&result.response) {
                Ok(bytes) => bytes,
                Err(_) => return,
            };

            if write_frame(conn.as_mut(), &response_bytes).is_err() {
                return;
            }
        }
    }

    /// Fires `on_task_changed` when (and only when) `result` came from a
    /// route that mutated task state. This is the exact mechanism MCP-01's
    /// `task_changed` emission requirement asks for (see module doc); it's
    /// a named method rather than an inline check so the unit test below
    /// can call the real production path, not a re-implementation of it.
    fn notify_if_mutated(&self, result: &RouteResult) {
        if result.mutated {
            (self.on_task_changed)();
        }
    }

    fn handle_request(&self, raw: &[u8]) -> RouteResult {
        match serde_json::from_slice::<McpRequest>(raw) {
            Ok(request) => self.route(request),
            Err(err) => RouteResult::unmutated(err_response(format!("invalid request: {err}"))),
        }
    }

    /// The single dispatch point every tool name goes through.
    fn route(&self, request: McpRequest) -> RouteResult {
        let McpRequest {
            terminal_id,
            tool,
            args,
        } = request;

        match tool.as_str() {
            "check_active" => RouteResult::unmutated(self.check_active(&terminal_id)),

            "create_task" => self.route_create_task(&terminal_id, args),
            "start_task" => self.route_task_action(args, tasks::service::start),
            "complete_task" => self.route_task_action(args, tasks::service::complete),
            "update_task_plan" => self.route_update_plan(args),
            "update_task_implementation" => self.route_update_implementation(args),
            "update_task_project" => self.route_update_task_project(args),

            "find_related_active_tasks" => self.route_find_related_active_tasks(args),
            "search_tasks" => self.route_search_tasks(args),
            "list_tasks" => self.route_list_tasks(args),

            "set_terminal_title" => self.route_set_terminal_title(&terminal_id, args),
            "update_terminal_activity" => self.route_update_terminal_activity(&terminal_id, args),
            "set_terminal_status" => self.route_set_terminal_status(&terminal_id, args),

            "get_projects" => self.route_get_projects(),
            "create_project" => self.route_create_project(args),
            "get_project_tasks" => self.route_get_project_tasks(args),

            other => RouteResult::unmutated(err_response(format!("tool not implemented: {other}"))),
        }
    }

    // ---- MCP-02 / MCP-03: task lifecycle -----------------------------

    fn route_create_task(&self, terminal_id: &str, args: Value) -> RouteResult {
        let args: CreateTaskArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };
        let cwd = match self.terminal_cwd(terminal_id) {
            Ok(cwd) => cwd,
            Err(response) => return RouteResult::unmutated(response),
        };
        let ctx = TerminalContext {
            terminal_id: terminal_id.to_string(),
            cwd,
        };

        let db = self.db();
        match tasks::service::create(db.conn(), &ctx, &args.title, args.description.as_deref()) {
            Ok(task) => RouteResult {
                response: ok_response(task_json(&task)),
                mutated: true,
            },
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    /// Shared by `start_task`/`complete_task`: both take only `task_id` and
    /// delegate straight to `tasks::state`'s transition table via
    /// `tasks::service`.
    fn route_task_action(
        &self,
        args: Value,
        action: fn(&Connection, i64) -> Result<Task, TaskError>,
    ) -> RouteResult {
        let args: TaskIdArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        match action(db.conn(), args.task_id) {
            Ok(task) => RouteResult {
                response: ok_response(task_json(&task)),
                mutated: true,
            },
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    fn route_update_plan(&self, args: Value) -> RouteResult {
        let args: UpdatePlanArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        match tasks::service::update_plan(db.conn(), args.task_id, &args.plan) {
            Ok(result) => RouteResult {
                response: ok_response(task_update_json(&result)),
                mutated: true,
            },
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    fn route_update_implementation(&self, args: Value) -> RouteResult {
        let args: UpdateImplementationArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        match tasks::service::update_implementation(db.conn(), args.task_id, &args.implementation) {
            Ok(result) => RouteResult {
                response: ok_response(task_update_json(&result)),
                mutated: true,
            },
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    // ---- MCP-07: similarity, search, listing -------------------------

    /// See the module doc's DESVIO note: returns a 0- or 1-element array,
    /// not one scored entry per active task, because `similarity::find_similar`
    /// (frozen, outside this task's scope) only ever exposes the single best
    /// match's `task_id`/`score`.
    fn route_find_related_active_tasks(&self, args: Value) -> RouteResult {
        let args: FindRelatedArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        let active = match tasks::service::list_active(db.conn()) {
            Ok(tasks) => tasks,
            Err(err) => return RouteResult::unmutated(err_response(err.to_string())),
        };

        let recommendation = tasks::similarity::find_similar(&args.query, None, &active);
        let entries = match recommendation {
            SimilarityRecommendation::Reuse { task_id, score } => {
                similar_entry(db.conn(), task_id, score, "reuse")
            }
            SimilarityRecommendation::AskUser { task_id, score } => {
                similar_entry(db.conn(), task_id, score, "ask_user")
            }
            SimilarityRecommendation::None => Vec::new(),
        };

        RouteResult::unmutated(ok_response(json!(entries)))
    }

    fn route_search_tasks(&self, args: Value) -> RouteResult {
        let args: SearchTasksArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        match tasks::service::search(db.conn(), &args.query, args.limit, args.offset) {
            Ok((tasks, total)) => {
                RouteResult::unmutated(ok_response(task_list_json(&tasks, total)))
            }
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    fn route_list_tasks(&self, args: Value) -> RouteResult {
        let args: ListTasksArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let status = match args.status.as_deref().map(parse_task_status).transpose() {
            Ok(status) => status,
            Err(message) => return RouteResult::unmutated(err_response(message)),
        };

        let db = self.db();
        match tasks::service::list(db.conn(), status, args.limit, args.offset) {
            Ok((tasks, total)) => {
                RouteResult::unmutated(ok_response(task_list_json(&tasks, total)))
            }
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    // ---- MCP-04 / MCP-05 / MCP-06: terminal title, activity, status --

    /// MCP-06's "rename manual vence o agente" precondition, applied here
    /// (not as a separate tool): a terminal already owned by
    /// `TitleSource::User` silently discards this call, and the response
    /// says so via `applied: false, title_source: "user"`.
    fn route_set_terminal_title(&self, terminal_id: &str, args: Value) -> RouteResult {
        let args: SetTerminalTitleArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };
        // See the module doc's DESVIO note: `long_title` is accepted (kept
        // in the schema so agents calling per-contract don't get a
        // deserialization error) but has nowhere to persist to, so it's
        // read and dropped here.
        let _ = args.long_title;

        let already_user_owned = self
            .terminal_meta
            .get(terminal_id)
            .map(|meta| meta.title_source == TitleSource::User)
            .unwrap_or(false);

        self.terminal_meta
            .set_title(terminal_id, &args.title, TitleSource::Agent);

        let (applied, title_source) = if already_user_owned {
            (false, "user")
        } else {
            (true, "agent")
        };
        RouteResult::unmutated(ok_response(
            json!({ "applied": applied, "title_source": title_source }),
        ))
    }

    fn route_update_terminal_activity(&self, terminal_id: &str, args: Value) -> RouteResult {
        let args: UpdateActivityArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        match self
            .terminal_meta
            .push_activity(db.conn(), terminal_id, &args.activity)
        {
            Ok(()) => {
                RouteResult::unmutated(ok_response(json!({ "ok": true, "logged_at": now_unix() })))
            }
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    /// `status: "clear"` is the sentinel meaning "remove the badge" — not a
    /// `terminal_statuses` catalog id — so it's special-cased to
    /// `TerminalMetaService::clear_status` before any catalog validation
    /// runs, per the task brief.
    fn route_set_terminal_status(&self, terminal_id: &str, args: Value) -> RouteResult {
        let args: SetStatusArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        if args.status == "clear" {
            self.terminal_meta.clear_status(terminal_id);
            return RouteResult::unmutated(ok_response(
                json!({ "applied": true, "status": "clear" }),
            ));
        }

        let db = self.db();
        match self
            .terminal_meta
            .set_status(db.conn(), terminal_id, &args.status)
        {
            Ok(()) => RouteResult::unmutated(ok_response(
                json!({ "applied": true, "status": args.status }),
            )),
            Err(MetaError::InvalidStatus { valid_ids, .. }) => {
                let valid_statuses: Vec<&str> =
                    valid_ids.split(", ").filter(|id| !id.is_empty()).collect();
                let message = format!(
                    "invalid status `{}`; valid statuses: {valid_ids}",
                    args.status
                );
                RouteResult::unmutated(err_response_with(
                    message,
                    json!({ "valid_statuses": valid_statuses }),
                ))
            }
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    // ---- MCP-08: project resolution -----------------------------------

    fn route_get_projects(&self) -> RouteResult {
        let db = self.db();
        match projects::service::list_all(db.conn()) {
            Ok(project_list) => RouteResult::unmutated(ok_response(json!(project_list))),
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    fn route_create_project(&self, args: Value) -> RouteResult {
        let args: CreateProjectArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        match projects::service::create(db.conn(), &args.name, std::path::Path::new(&args.path)) {
            Ok(project) => RouteResult {
                response: ok_response(json!(project)),
                mutated: true,
            },
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    fn route_get_project_tasks(&self, args: Value) -> RouteResult {
        let args: GetProjectTasksArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        match tasks::service::list_by_project(db.conn(), &args.project_id) {
            Ok(tasks) => {
                let entries: Vec<Value> = tasks.iter().map(task_json).collect();
                RouteResult::unmutated(ok_response(json!(entries)))
            }
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    fn route_update_task_project(&self, args: Value) -> RouteResult {
        let args: UpdateTaskProjectArgs = match parse_args(args) {
            Ok(args) => args,
            Err(response) => return RouteResult::unmutated(response),
        };

        let db = self.db();
        match tasks::service::update_project(db.conn(), args.task_id, &args.project_id) {
            Ok(task) => RouteResult {
                response: ok_response(task_json(&task)),
                mutated: true,
            },
            Err(err) => RouteResult::unmutated(err_response(err.to_string())),
        }
    }

    /// `check_active`: `{active: true, terminal_id}` when `terminal_id`
    /// names a session currently alive in `TerminalManager`, otherwise a
    /// refusal — never a crash, never silently accepted (MCP-01).
    fn check_active(&self, terminal_id: &str) -> Value {
        if is_live_terminal(&self.terminal_manager, terminal_id) {
            ok_response(json!({ "active": true, "terminal_id": terminal_id }))
        } else {
            err_response("unknown terminal")
        }
    }
}

/// `true` only if `terminal_id` parses as a [`TerminalId`] *and* that id is
/// in `manager`'s live session list **right now** — re-checked on every
/// call, never cached, so a terminal that was alive a moment ago and has
/// since been killed is correctly reported dead.
fn is_live_terminal(manager: &TerminalManager, terminal_id: &str) -> bool {
    terminal_id
        .parse::<TerminalId>()
        .map(|id| manager.list().iter().any(|session| session.id == id))
        .unwrap_or(false)
}

// ---- Per-tool argument shapes (TOOL-CONTRACT.md) -----------------------

#[derive(Debug, Deserialize)]
struct CreateTaskArgs {
    title: String,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TaskIdArgs {
    task_id: i64,
}

#[derive(Debug, Deserialize)]
struct UpdatePlanArgs {
    task_id: i64,
    plan: String,
}

#[derive(Debug, Deserialize)]
struct UpdateImplementationArgs {
    task_id: i64,
    implementation: String,
}

#[derive(Debug, Deserialize)]
struct FindRelatedArgs {
    query: String,
}

#[derive(Debug, Deserialize)]
struct SearchTasksArgs {
    query: String,
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ListTasksArgs {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct SetTerminalTitleArgs {
    title: String,
    #[serde(default)]
    long_title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateActivityArgs {
    activity: String,
}

#[derive(Debug, Deserialize)]
struct SetStatusArgs {
    status: String,
}

#[derive(Debug, Deserialize)]
struct CreateProjectArgs {
    name: String,
    path: String,
}

#[derive(Debug, Deserialize)]
struct GetProjectTasksArgs {
    project_id: String,
}

#[derive(Debug, Deserialize)]
struct UpdateTaskProjectArgs {
    task_id: i64,
    project_id: String,
}

/// Deserializes `args` into `T`, or an already-built `ok:false` response
/// naming the tool's args as invalid — every `route_*` method's first line.
fn parse_args<T: serde::de::DeserializeOwned>(args: Value) -> Result<T, Value> {
    serde_json::from_value(args).map_err(|err| err_response(format!("invalid arguments: {err}")))
}

/// One `{task, score, recommendation}` entry for `find_related_active_tasks`.
/// `task_id` not resolving to a real row (should not happen — it just came
/// out of `list_active`'s own query) degrades to an empty result rather than
/// panicking or surfacing a confusing error for a tool the caller didn't
/// misuse.
fn similar_entry(conn: &Connection, task_id: i64, score: f64, recommendation: &str) -> Vec<Value> {
    match tasks::service::get(conn, task_id) {
        Ok(task) => vec![json!({
            "task": task_json(&task),
            "score": score,
            "recommendation": recommendation,
        })],
        Err(_) => Vec::new(),
    }
}

fn task_list_json(tasks: &[Task], total: i64) -> Value {
    let entries: Vec<Value> = tasks.iter().map(task_json).collect();
    json!({ "tasks": entries, "total": total })
}

/// Parses a `list_tasks` `status` filter string into `TaskStatus`. Plain
/// literal matching — the same four strings `tasks::service`'s own
/// (private) `parse_status` matches against `tasks.status`'s `CHECK`
/// constraint — not a business rule of its own.
fn parse_task_status(status: &str) -> Result<TaskStatus, String> {
    match status {
        "pending" => Ok(TaskStatus::Pending),
        "in_progress" => Ok(TaskStatus::InProgress),
        "in_testing" => Ok(TaskStatus::InTesting),
        "completed" => Ok(TaskStatus::Completed),
        other => Err(format!(
            "invalid status `{other}`; valid statuses: pending, in_progress, in_testing, completed"
        )),
    }
}

/// Reads one length-prefixed frame: a `u32` little-endian length followed
/// by that many bytes. Returns `Ok(None)` on a clean disconnect that lands
/// exactly on a frame boundary (the common case for "client hung up").
/// `pub` so integration tests (and later the `swarmdeck-mcp` sidecar
/// client) can speak the exact same framing without reimplementing it.
pub fn read_frame(conn: &mut dyn Read) -> io::Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    match conn.read_exact(&mut len_buf) {
        Ok(()) => {}
        // Covers both a clean EOF (0 bytes available) and an abrupt
        // mid-frame disconnect (some bytes then EOF) — both mean "this
        // connection is over" from the server's point of view.
        Err(err) if err.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(err) => return Err(err),
    }

    let len = u32::from_le_bytes(len_buf) as usize;
    // Refuses to allocate an unbounded buffer for a corrupt/hostile length
    // prefix. 16 MiB is far above anything a task title/plan/implementation
    // (capped at TEXT_CAP=8000 chars, see tasks::service) could produce.
    const MAX_FRAME_LEN: usize = 16 * 1024 * 1024;
    if len > MAX_FRAME_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "frame exceeds maximum length",
        ));
    }

    let mut payload = vec![0u8; len];
    conn.read_exact(&mut payload)?;
    Ok(Some(payload))
}

/// Writes one length-prefixed frame: `payload.len()` as a `u32`
/// little-endian prefix, then `payload` itself, then flushes.
pub fn write_frame(conn: &mut dyn Write, payload: &[u8]) -> io::Result<()> {
    let len = u32::try_from(payload.len()).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidData, "payload exceeds maximum length")
    })?;
    conn.write_all(&len.to_le_bytes())?;
    conn.write_all(payload)?;
    conn.flush()
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    /// Transport that is never actually used — this test never calls
    /// `serve()`/`accept()`, it only needs *an* `IpcServer` to call the
    /// real (private) `notify_if_mutated` on.
    struct UnusedTransport;
    impl IpcTransport for UnusedTransport {
        fn accept(&self) -> io::Result<Box<dyn IpcConnection>> {
            Err(io::Error::other(
                "UnusedTransport::accept is never meant to be called",
            ))
        }
    }

    /// Test 5 of this task's Done-when: proves the connection between
    /// `RouteResult::mutated` and `on_task_changed` by calling the exact
    /// private method `handle_connection` calls (`notify_if_mutated`), not
    /// a re-implementation of it — this is the honest substitute the task
    /// brief allows for a case that can't be exercised through a live
    /// `AppHandle` outside a running Tauri app.
    ///
    /// `check_active` never sets `mutated: true` (it doesn't write
    /// anything), so no request in this task's scope reaches this path
    /// through the real socket end to end; `T7`'s mutating tools will be
    /// the first real callers of the `mutated: true` arm through
    /// `route()`. This test proves the wiring downstream of that flag is
    /// correct today, so `T7` only has to prove it *sets* the flag.
    #[test]
    fn notify_if_mutated_dispara_apenas_quando_a_rota_sinaliza_mutacao() {
        let contador = Arc::new(AtomicUsize::new(0));
        let contador_clone = Arc::clone(&contador);
        let on_task_changed: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
            contador_clone.fetch_add(1, Ordering::SeqCst);
        });

        let server = IpcServer::new(
            Box::new(UnusedTransport),
            Arc::new(TerminalManager::new()),
            Arc::new(Mutex::new(Db::open_in_memory().expect("banco em memória"))),
            Arc::new(TerminalMetaService::new()),
            on_task_changed,
        );

        let nao_mutou = RouteResult::unmutated(json!({"ok": true}));
        server.notify_if_mutated(&nao_mutou);
        assert_eq!(
            contador.load(Ordering::SeqCst),
            0,
            "uma rota que não mutou nada não deve disparar on_task_changed"
        );

        let mutou = RouteResult {
            response: json!({"ok": true}),
            mutated: true,
        };
        server.notify_if_mutated(&mutou);
        assert_eq!(
            contador.load(Ordering::SeqCst),
            1,
            "uma rota que mutou deve disparar on_task_changed exatamente uma vez"
        );
    }
}
