// SPEC: mcp-task-server (MCP-02, MCP-03, MCP-04, MCP-05, MCP-08)

//! The 15 tools from `TOOL-CONTRACT.md` other than `check_active` (wired up
//! separately in `main.rs`, T6). Every method here follows the same shape:
//!
//! 1. Take a typed `Parameters<...>` struct matching the contract's schema
//!    (so `rmcp` generates a real input schema an agent can introspect).
//! 2. Build the `args` JSON object and call [`client::call_tool`].
//! 3. Relay the result: `Ok(value)` deserializes into a typed `Output`
//!    struct (so `rmcp` also generates an output schema) and comes back as
//!    `Json<Output>`; `Err(message)` comes back as `Err(message)` —
//!    `String: IntoContents` turns that into an MCP tool error result
//!    (`is_error: true`, per `rmcp::handler::server::tool::IntoCallToolResult`'s
//!    blanket `Result<T, E>` impl) with the app's error text as the content.
//!
//! No method here decides anything about whether a task/terminal/project
//! operation is valid — that's `src-tauri`'s `IpcServer`/`TaskService`/
//! `TerminalMetaService`/`ProjectService`. This module only shapes JSON in
//! and JSON out ("sem lógica de negócio", design.md).
//!
//! Deserializing the app's `result` into a typed `Output` struct is not
//! "reinterpreting" it in the sense the design rule forbids — no field is
//! recomputed or derived, this only declares the shape those exact values
//! already have, the same way `main.rs`'s `CheckActiveResult` does for
//! `check_active` (T6).
//!
//! Registered on a router named `tools_router` (not the default
//! `tool_router` — `main.rs`'s own `#[tool_router]` block on `check_active`
//! already claims that name) and merged into `SwarmDeckMcp`'s router in
//! `SwarmDeckMcp::new` via `ToolRouter`'s `Add` impl.

use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::{schemars, serde_json, tool, tool_router};
use serde::{Deserialize, Serialize};

use crate::client;
use crate::SwarmDeckMcp;

// ---- Task shape, mirrored from TOOL-CONTRACT.md's `Task` schema ---------

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskResult {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub plan: Option<String>,
    pub implementation: Option<String>,
    pub status: String,
    pub project_id: Option<String>,
    pub terminal_id: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// `TaskResult` plus the `truncated` flag `update_task_plan`/
/// `update_task_implementation` add on top (TOOL-CONTRACT.md, sourced from
/// design.md's truncation signal).
#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskUpdateResult {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub plan: Option<String>,
    pub implementation: Option<String>,
    pub status: String,
    pub project_id: Option<String>,
    pub terminal_id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct TaskListResult {
    pub tasks: Vec<TaskResult>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct SimilarTaskEntry {
    pub task: TaskResult,
    pub score: f64,
    pub recommendation: String,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct ProjectResult {
    pub id: String,
    pub name: String,
    pub path: String,
    pub color: String,
    pub last_used: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct SetTitleResult {
    pub applied: bool,
    pub title_source: String,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct ActivityResult {
    pub ok: bool,
    pub logged_at: i64,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct SetStatusResult {
    pub applied: bool,
    pub status: String,
}

// ---- Per-tool parameter shapes -------------------------------------------

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskParams {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TaskIdParams {
    pub task_id: i64,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskPlanParams {
    pub task_id: i64,
    pub plan: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskImplementationParams {
    pub task_id: i64,
    pub implementation: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct FindRelatedActiveTasksParams {
    pub query: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SearchTasksParams {
    pub query: String,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTasksParams {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetTerminalTitleParams {
    pub title: String,
    #[serde(default)]
    pub long_title: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTerminalActivityParams {
    pub activity: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetTerminalStatusParams {
    pub status: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateProjectParams {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetProjectTasksParams {
    pub project_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskProjectParams {
    pub task_id: i64,
    pub project_id: String,
}

/// Deserializes the app's relayed `result` value into `T`, or a
/// descriptive error string if the shape doesn't match — this should never
/// happen in practice (the app is the only thing that ever writes this
/// JSON, and it's built from `TOOL-CONTRACT.md`'s own schema), but a
/// mismatch must still surface as an MCP tool error, not a panic.
fn into_output<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> Result<T, String> {
    serde_json::from_value(value)
        .map_err(|err| format!("unexpected response shape from SwarmDeck app: {err}"))
}

#[tool_router(router = tools_router, vis = "pub(crate)")]
impl SwarmDeckMcp {
    // ---- MCP-02 / MCP-03: task lifecycle ---------------------------------

    #[tool(
        description = "Create a new task. Project and terminal are inferred by the app, never passed by the caller."
    )]
    async fn create_task(
        &self,
        Parameters(params): Parameters<CreateTaskParams>,
    ) -> Result<Json<TaskResult>, String> {
        let args = serde_json::json!({ "title": params.title, "description": params.description });
        let result = client::call_tool("create_task", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(
        description = "Move a task to in_progress, from any status including completed (reopens it)."
    )]
    async fn start_task(
        &self,
        Parameters(params): Parameters<TaskIdParams>,
    ) -> Result<Json<TaskResult>, String> {
        let args = serde_json::json!({ "task_id": params.task_id });
        let result = client::call_tool("start_task", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(
        description = "Advance a task along the mandatory testing path: in_progress -> in_testing on the first call, in_testing -> completed on the next."
    )]
    async fn complete_task(
        &self,
        Parameters(params): Parameters<TaskIdParams>,
    ) -> Result<Json<TaskResult>, String> {
        let args = serde_json::json!({ "task_id": params.task_id });
        let result = client::call_tool("complete_task", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(
        description = "Overwrite a task's plan text. Long text is truncated by the app; `truncated` signals it."
    )]
    async fn update_task_plan(
        &self,
        Parameters(params): Parameters<UpdateTaskPlanParams>,
    ) -> Result<Json<TaskUpdateResult>, String> {
        let args = serde_json::json!({ "task_id": params.task_id, "plan": params.plan });
        let result = client::call_tool("update_task_plan", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(
        description = "Overwrite a task's implementation writeup. Long text is truncated by the app; `truncated` signals it."
    )]
    async fn update_task_implementation(
        &self,
        Parameters(params): Parameters<UpdateTaskImplementationParams>,
    ) -> Result<Json<TaskUpdateResult>, String> {
        let args = serde_json::json!({ "task_id": params.task_id, "implementation": params.implementation });
        let result = client::call_tool("update_task_implementation", args).await?;
        Ok(Json(into_output(result)?))
    }

    // ---- MCP-07: similarity, search, listing -----------------------------

    #[tool(
        description = "Find active (non-completed) tasks similar to a candidate title/description, with a reuse/ask_user/create_new recommendation."
    )]
    async fn find_related_active_tasks(
        &self,
        Parameters(params): Parameters<FindRelatedActiveTasksParams>,
    ) -> Result<Json<Vec<SimilarTaskEntry>>, String> {
        let args = serde_json::json!({ "query": params.query });
        let result = client::call_tool("find_related_active_tasks", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(description = "Free-text search over task title/description, paginated.")]
    async fn search_tasks(
        &self,
        Parameters(params): Parameters<SearchTasksParams>,
    ) -> Result<Json<TaskListResult>, String> {
        let args = serde_json::json!({ "query": params.query, "limit": params.limit, "offset": params.offset });
        let result = client::call_tool("search_tasks", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(description = "List tasks, optionally filtered by status, paginated.")]
    async fn list_tasks(
        &self,
        Parameters(params): Parameters<ListTasksParams>,
    ) -> Result<Json<TaskListResult>, String> {
        let args = serde_json::json!({ "status": params.status, "limit": params.limit, "offset": params.offset });
        let result = client::call_tool("list_tasks", args).await?;
        Ok(Json(into_output(result)?))
    }

    // ---- MCP-04 / MCP-05 / MCP-06: terminal title, activity, status ------

    #[tool(
        description = "Set the terminal tab's short title. A prior manual rename by the user always wins over this call (applied: false, title_source: \"user\")."
    )]
    async fn set_terminal_title(
        &self,
        Parameters(params): Parameters<SetTerminalTitleParams>,
    ) -> Result<Json<SetTitleResult>, String> {
        let args = serde_json::json!({ "title": params.title, "long_title": params.long_title });
        let result = client::call_tool("set_terminal_title", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(
        description = "Append one entry to the terminal's activity log. Never changes the tab title."
    )]
    async fn update_terminal_activity(
        &self,
        Parameters(params): Parameters<UpdateTerminalActivityParams>,
    ) -> Result<Json<ActivityResult>, String> {
        let args = serde_json::json!({ "activity": params.activity });
        let result = client::call_tool("update_terminal_activity", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(
        description = "Set the terminal's status badge to a catalog id (e.g. \"working\", \"needs_input\", \"needs_testing\", \"done\"), or \"clear\" to remove the badge."
    )]
    async fn set_terminal_status(
        &self,
        Parameters(params): Parameters<SetTerminalStatusParams>,
    ) -> Result<Json<SetStatusResult>, String> {
        let args = serde_json::json!({ "status": params.status });
        let result = client::call_tool("set_terminal_status", args).await?;
        Ok(Json(into_output(result)?))
    }

    // ---- MCP-08: project resolution ---------------------------------------

    #[tool(description = "List every registered project.")]
    async fn get_projects(&self) -> Result<Json<Vec<ProjectResult>>, String> {
        let result = client::call_tool("get_projects", serde_json::json!({})).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(
        description = "Register a new project at an existing directory. Color is assigned automatically."
    )]
    async fn create_project(
        &self,
        Parameters(params): Parameters<CreateProjectParams>,
    ) -> Result<Json<ProjectResult>, String> {
        let args = serde_json::json!({ "name": params.name, "path": params.path });
        let result = client::call_tool("create_project", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(description = "List every task belonging to a project.")]
    async fn get_project_tasks(
        &self,
        Parameters(params): Parameters<GetProjectTasksParams>,
    ) -> Result<Json<Vec<TaskResult>>, String> {
        let args = serde_json::json!({ "project_id": params.project_id });
        let result = client::call_tool("get_project_tasks", args).await?;
        Ok(Json(into_output(result)?))
    }

    #[tool(
        description = "Manually correct which project a task belongs to, overriding the automatic cwd-based resolution."
    )]
    async fn update_task_project(
        &self,
        Parameters(params): Parameters<UpdateTaskProjectParams>,
    ) -> Result<Json<TaskResult>, String> {
        let args =
            serde_json::json!({ "task_id": params.task_id, "project_id": params.project_id });
        let result = client::call_tool("update_task_project", args).await?;
        Ok(Json(into_output(result)?))
    }
}

#[cfg(test)]
mod tests {
    //! Round-trip tests for the 15 tools this file adds, driven through the
    //! **real MCP protocol** (`tools/call` over a `tokio::io::duplex` pipe,
    //! same pattern `main.rs`'s own handshake test uses) so a `#[tool]`
    //! method's whole path is exercised: schema-checked args in, real
    //! `client::call_tool` out to a scripted fake "app" bound at a
    //! uniquely-named socket, relayed back as a real `CallToolResult`.
    //!
    //! `client::call_tool` normally connects to the fixed `SOCKET_NAME`, but
    //! honors `SWARMDECK_MCP_TEST_SOCKET_NAME` as a test-only override (see
    //! `client.rs`'s doc comment on it) — that's what lets each test below
    //! bind its own throwaway socket instead of racing to rebind one shared
    //! literal name. An earlier version of these tests bound the literal
    //! production name directly and hit real, reproducible
    //! `ERROR_ACCESS_DENIED` flakiness on Windows when run back-to-back
    //! (`cargo test` default parallelism); the per-test unique name fixes
    //! the actual cause instead of adding a retry loop around it. `serial`
    //! still guards every test here regardless, because `TERMINAL_ID_ENV_VAR`
    //! and the socket override are both process-global env vars — two tests
    //! setting different values concurrently could still cross-talk without it.

    use std::io::{Read, Write};

    use interprocess::local_socket::traits::Listener as _;
    use interprocess::local_socket::{GenericFilePath, ListenerOptions, ToFsName};
    use rmcp::model::CallToolRequestParams;
    use rmcp::ServiceExt;
    use serde_json::{json, Value};

    use crate::client::{env_var_test_lock, socket_path, TERMINAL_ID_ENV_VAR};
    use crate::SwarmDeckMcp;

    const SOCKET_OVERRIDE_ENV_VAR: &str = "SWARMDECK_MCP_TEST_SOCKET_NAME";

    /// Sets `SWARMDECK_TERMINAL_ID` and the test socket-name override for
    /// the duration of the guard's lifetime, clearing both on drop
    /// (including during a panic's unwind) so a failing assertion never
    /// leaks either value into a later test.
    struct TestEnvGuard;
    impl Drop for TestEnvGuard {
        fn drop(&mut self) {
            unsafe {
                std::env::remove_var(TERMINAL_ID_ENV_VAR);
                std::env::remove_var(SOCKET_OVERRIDE_ENV_VAR);
            }
        }
    }
    fn set_test_env(terminal_id: &str, socket_name: &str) -> TestEnvGuard {
        unsafe {
            std::env::set_var(TERMINAL_ID_ENV_VAR, terminal_id);
            std::env::set_var(SOCKET_OVERRIDE_ENV_VAR, socket_name);
        }
        TestEnvGuard
    }

    /// A socket name unique to this test run (PID + a per-process counter),
    /// so no two tests — in this file or any other — ever bind the same
    /// path, regardless of run order or `cargo test`'s parallelism.
    fn unique_socket_name(label: &str) -> String {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        format!(
            "swarmdeck-mcp-tools-test-{}-{label}-{n}",
            std::process::id()
        )
    }

    /// Binds a fake "app" at `socket_name` and answers `script.len()`
    /// sequential connections in order — one `(expected_tool_name,
    /// response_json)` pair per connection, since `client::call_tool` opens
    /// a fresh connection for every call. Panics (inside the spawned
    /// thread, surfaced via `.join()`) if a request names a different tool
    /// than expected, so a wiring bug fails loud instead of silently
    /// answering the wrong script entry.
    fn spawn_fake_app(
        socket_name: &str,
        script: Vec<(&'static str, Value)>,
    ) -> std::thread::JoinHandle<()> {
        let fs_name = socket_path(socket_name)
            .to_fs_name::<GenericFilePath>()
            .expect("nome de socket válido");
        let listener = ListenerOptions::new()
            .name(fs_name)
            .create_sync()
            .expect("bind do socket de teste");

        std::thread::spawn(move || {
            for (expected_tool, response) in script {
                let mut conn = listener.accept().expect("accept deve funcionar");

                let mut len_buf = [0u8; 4];
                conn.read_exact(&mut len_buf).expect("ler o length prefix");
                let len = u32::from_le_bytes(len_buf) as usize;
                let mut payload = vec![0u8; len];
                conn.read_exact(&mut payload).expect("ler o payload");
                let request: Value =
                    serde_json::from_slice(&payload).expect("payload deve ser JSON válido");
                assert_eq!(
                    request["tool"], expected_tool,
                    "ferramenta inesperada; requisição: {request}"
                );

                let response_bytes = serde_json::to_vec(&response).expect("serializar a resposta");
                conn.write_all(&(response_bytes.len() as u32).to_le_bytes())
                    .expect("escrever o length prefix");
                conn.write_all(&response_bytes).expect("escrever o payload");
            }
        })
    }

    fn task_response(id: i64, status: &str) -> Value {
        json!({
            "ok": true,
            "result": {
                "id": id,
                "title": "Nova task",
                "description": Value::Null,
                "plan": Value::Null,
                "implementation": Value::Null,
                "status": status,
                "project_id": Value::Null,
                "terminal_id": "term-mcp-1",
                "created_at": 0,
                "updated_at": 0,
            },
        })
    }

    /// Full task lifecycle round trip **through the real MCP interface**:
    /// `create_task` -> `start_task` -> `complete_task` (in_progress ->
    /// in_testing) -> `complete_task` again (in_testing -> completed).
    /// Matches T7's `Verify`: "Ciclo completo criar→iniciar→concluir→concluir
    /// pela interface MCP".
    /// Not `#[tokio::test]`: `env_var_test_lock` returns a `std::sync::MutexGuard`,
    /// and clippy's `await_holding_lock` (this workspace runs `-D warnings`)
    /// refuses to let one survive across an `.await` — a `tokio::sync::Mutex`
    /// would need a new Cargo feature this task isn't meant to add. Building
    /// a runtime and `block_on`-ing the async body keeps the guard held
    /// across a single synchronous call instead, which the lint permits.
    /// Same pattern in every test below.
    #[test]
    fn ciclo_completo_create_start_complete_complete_via_interface_mcp() {
        let _guard = env_var_test_lock();
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let socket_name = unique_socket_name("ciclo-completo");
            let _env = set_test_env("term-mcp-1", &socket_name);

            let server_thread = spawn_fake_app(
                &socket_name,
                vec![
                    ("create_task", task_response(1, "pending")),
                    ("start_task", task_response(1, "in_progress")),
                    ("complete_task", task_response(1, "in_testing")),
                    ("complete_task", task_response(1, "completed")),
                ],
            );

            let (server_io, client_io) = tokio::io::duplex(4096);
            let mcp_server = tokio::spawn(async move {
                let service = SwarmDeckMcp::new()
                    .serve(server_io)
                    .await
                    .expect("server aceita o initialize");
                service.waiting().await.expect("server encerra limpo");
            });
            let client = ().serve(client_io).await.expect("client completa o handshake");

            let created = client
                .call_tool(
                    CallToolRequestParams::new("create_task")
                        .with_arguments(as_object(json!({"title": "Nova task"}))),
                )
                .await
                .expect("create_task deve responder");
            assert_ne!(
                created.is_error,
                Some(true),
                "create_task não deve ser erro: {created:?}"
            );
            assert_eq!(
                created.structured_content.as_ref().unwrap()["status"],
                "pending"
            );

            let started = client
                .call_tool(
                    CallToolRequestParams::new("start_task")
                        .with_arguments(as_object(json!({"task_id": 1}))),
                )
                .await
                .expect("start_task deve responder");
            assert_eq!(
                started.structured_content.as_ref().unwrap()["status"],
                "in_progress"
            );

            let first_complete = client
                .call_tool(
                    CallToolRequestParams::new("complete_task")
                        .with_arguments(as_object(json!({"task_id": 1}))),
                )
                .await
                .expect("complete_task deve responder");
            assert_eq!(
                first_complete.structured_content.as_ref().unwrap()["status"],
                "in_testing",
                "a primeira chamada de complete_task deve parar em in_testing"
            );

            let second_complete = client
                .call_tool(
                    CallToolRequestParams::new("complete_task")
                        .with_arguments(as_object(json!({"task_id": 1}))),
                )
                .await
                .expect("complete_task deve responder");
            assert_eq!(
                second_complete.structured_content.as_ref().unwrap()["status"],
                "completed"
            );

            client.cancel().await.expect("client encerra limpo");
            mcp_server
                .await
                .expect("server task não deve entrar em pânico");
            server_thread
                .join()
                .expect("fake app não deve entrar em pânico");
        });
    }

    #[test]
    fn set_terminal_status_via_interface_mcp() {
        let _guard = env_var_test_lock();
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let socket_name = unique_socket_name("set-status");
            let _env = set_test_env("term-mcp-2", &socket_name);

            let server_thread = spawn_fake_app(
                &socket_name,
                vec![(
                    "set_terminal_status",
                    json!({"ok": true, "result": {"applied": true, "status": "working"}}),
                )],
            );

            let (server_io, client_io) = tokio::io::duplex(4096);
            let mcp_server = tokio::spawn(async move {
                let service = SwarmDeckMcp::new()
                    .serve(server_io)
                    .await
                    .expect("server aceita o initialize");
                service.waiting().await.expect("server encerra limpo");
            });
            let client = ().serve(client_io).await.expect("client completa o handshake");

            let response = client
                .call_tool(
                    CallToolRequestParams::new("set_terminal_status")
                        .with_arguments(as_object(json!({"status": "working"}))),
                )
                .await
                .expect("set_terminal_status deve responder");

            assert_ne!(response.is_error, Some(true), "recebido: {response:?}");
            assert_eq!(
                response.structured_content.as_ref().unwrap()["applied"],
                true
            );
            assert_eq!(
                response.structured_content.as_ref().unwrap()["status"],
                "working"
            );

            client.cancel().await.expect("client encerra limpo");
            mcp_server
                .await
                .expect("server task não deve entrar em pânico");
            server_thread
                .join()
                .expect("fake app não deve entrar em pânico");
        });
    }

    #[test]
    fn set_terminal_title_via_interface_mcp() {
        let _guard = env_var_test_lock();
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let socket_name = unique_socket_name("set-title");
            let _env = set_test_env("term-mcp-3", &socket_name);

            let server_thread = spawn_fake_app(
                &socket_name,
                vec![(
                    "set_terminal_title",
                    json!({"ok": true, "result": {"applied": true, "title_source": "agent"}}),
                )],
            );

            let (server_io, client_io) = tokio::io::duplex(4096);
            let mcp_server = tokio::spawn(async move {
                let service = SwarmDeckMcp::new()
                    .serve(server_io)
                    .await
                    .expect("server aceita o initialize");
                service.waiting().await.expect("server encerra limpo");
            });
            let client = ().serve(client_io).await.expect("client completa o handshake");

            let response = client
                .call_tool(
                    CallToolRequestParams::new("set_terminal_title")
                        .with_arguments(as_object(json!({"title": "Minimize Terminals"}))),
                )
                .await
                .expect("set_terminal_title deve responder");

            assert_ne!(response.is_error, Some(true), "recebido: {response:?}");
            assert_eq!(
                response.structured_content.as_ref().unwrap()["applied"],
                true
            );
            assert_eq!(
                response.structured_content.as_ref().unwrap()["title_source"],
                "agent"
            );

            client.cancel().await.expect("client encerra limpo");
            mcp_server
                .await
                .expect("server task não deve entrar em pânico");
            server_thread
                .join()
                .expect("fake app não deve entrar em pânico");
        });
    }

    /// The app's `ok:false` (e.g. `task_id` that doesn't exist) must reach
    /// the agent as a real MCP tool error (`is_error: true`, the error text
    /// in `content`) — not a panic, not a silently-empty success.
    #[test]
    fn erro_do_app_chega_como_erro_mcp_descritivo() {
        let _guard = env_var_test_lock();
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let socket_name = unique_socket_name("erro-propagado");
            let _env = set_test_env("term-mcp-4", &socket_name);

            let server_thread = spawn_fake_app(
                &socket_name,
                vec![(
                    "complete_task",
                    json!({"ok": false, "error": "task not found: 999"}),
                )],
            );

            let (server_io, client_io) = tokio::io::duplex(4096);
            let mcp_server = tokio::spawn(async move {
                let service = SwarmDeckMcp::new()
                    .serve(server_io)
                    .await
                    .expect("server aceita o initialize");
                service.waiting().await.expect("server encerra limpo");
            });
            let client = ().serve(client_io).await.expect("client completa o handshake");

            let response = client
                .call_tool(
                    CallToolRequestParams::new("complete_task")
                        .with_arguments(as_object(json!({"task_id": 999}))),
                )
                .await
                .expect("tools/call deve responder mesmo quando a ferramenta falha");

            assert_eq!(response.is_error, Some(true), "recebido: {response:?}");
            let text = response
                .content
                .first()
                .and_then(|content| content.as_text())
                .map(|text| text.text.as_str())
                .unwrap_or_default();
            assert!(
                text.contains("task not found: 999"),
                "conteúdo do erro: {text}"
            );

            client.cancel().await.expect("client encerra limpo");
            mcp_server
                .await
                .expect("server task não deve entrar em pânico");
            server_thread
                .join()
                .expect("fake app não deve entrar em pânico");
        });
    }

    fn as_object(value: Value) -> serde_json::Map<String, Value> {
        match value {
            Value::Object(map) => map,
            other => panic!("esperava um objeto JSON, recebido: {other}"),
        }
    }
}
