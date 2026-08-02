// SPEC: mcp-task-server (MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-08)

//! `swarmdeck-mcp`: the MCP stdio sidecar the CLI agent spawns as a
//! subprocess (design.md, "Pesquisa" — the agent can only talk to MCP
//! servers over stdio, and the app is already running as its own process,
//! so it cannot be that subprocess itself).
//!
//! Design rule this file exists to honor: **"sem estado e sem lógica de
//! negócio — só traduz MCP → IPC. Toda decisão é do app."** Every `#[tool]`
//! method here does nothing but call into `client.rs` and reshape the
//! resulting JSON into a schema'd MCP return type — it never decides
//! whether a terminal is real, whether a task transition is legal, or
//! anything else. That authority lives in `src-tauri`'s `IpcServer` /
//! `TaskService` (see client.rs's module doc for the exact wire format the
//! two sides agree on).
//!
//! ## `check_active` vs. the other 15 tools (mcp-task-server/T6 + T7)
//! `check_active` is wired up right here — it's the tool the design doc
//! calls out as needing no dedicated handshake mechanism, because a
//! connection attempt itself *is* the handshake (design.md, "check_active
//! cai fora de graça"). The other 15 tools from `TOOL-CONTRACT.md` live in
//! `tools.rs`, registered on their own `#[tool_router(router = tools_router)]`
//! block (a second `impl SwarmDeckMcp` there, merged into
//! [`SwarmDeckMcp::new`]'s router below via `ToolRouter`'s `Add` impl) —
//! kept in a separate file/router rather than crammed into this one so
//! `main.rs` stays focused on process wiring (stdio transport, `ServerHandler`),
//! matching the module doc's design rule that this crate holds no business
//! logic of its own either way.

mod client;
mod tools;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::model::*;
use rmcp::transport::stdio;
use rmcp::{schemars, tool, tool_handler, tool_router, Json, ServerHandler, ServiceExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// MCP-shaped mirror of the app's `check_active` response
/// (`src-tauri/src/ipc/server.rs::IpcServer::check_active` /
/// `client.rs::check_active`'s module doc). Exists only so `rmcp`'s
/// `Json<T>` wrapper can generate a schema for structured output — the
/// values themselves are never computed here, only relayed.
#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct CheckActiveResult {
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_id: Option<String>,
}

/// The sidecar's MCP tool router. Stateless by design (design.md: "sem
/// estado e sem lógica de negócio") — `Clone`/`Default` are trivial because
/// there is nothing here but the generated `tool_router` table.
#[derive(Clone, Default)]
pub struct SwarmDeckMcp {
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl SwarmDeckMcp {
    pub fn new() -> Self {
        // `tool_router()` (this block, `check_active` only) merged with
        // `tools_router()` (`tools.rs`, the other 15 tools) — `ToolRouter`
        // implements `Add`, so this is a plain union of both maps.
        Self {
            tool_router: Self::tool_router() + Self::tools_router(),
        }
    }

    /// MCP-01 handshake tool (design.md, "check_active cai fora de
    /// graça"). Forwards to [`client::check_active`] and reshapes its JSON
    /// into [`CheckActiveResult`] — no decision happens in this method.
    #[tool(
        description = "Check whether this terminal is a live SwarmDeck session in the running app"
    )]
    async fn check_active(&self) -> Json<CheckActiveResult> {
        let response = client::check_active().await;
        Json(CheckActiveResult {
            active: response
                .get("active")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            terminal_id: response
                .get("terminal_id")
                .and_then(Value::as_str)
                .map(str::to_owned),
        })
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for SwarmDeckMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::from_build_env())
            .with_instructions(
                "SwarmDeck sidecar: relays task/terminal management tools to the running \
                 SwarmDeck app over local IPC. Requires SWARMDECK_TERMINAL_ID in the \
                 environment (set automatically for terminals opened inside the app).",
            )
    }
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("swarmdeck-mcp: fatal error: {err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let service = SwarmDeckMcp::new().serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Done-when: "Servidor MCP stdio sobe e responde ao handshake do
    /// protocolo". `rmcp` does not ship a canned in-process test client, so
    /// this follows the exact pattern the SDK's own tests use for the same
    /// thing (upstream `crates/rmcp/tests/test_client_initialization.rs`):
    /// a `tokio::io::duplex` in-memory pipe stands in for stdio, a real
    /// [`SwarmDeckMcp`] server and `rmcp`'s built-in do-nothing client
    /// (`()` implements `ClientHandler`) each `serve()` one end, and the
    /// real MCP initialize handshake plus a real `tools/list` call run
    /// over it — not a re-implementation of the protocol, the actual
    /// `rmcp` JSON-RPC wire format.
    #[tokio::test]
    async fn servidor_mcp_stdio_sobe_e_responde_ao_handshake() {
        let (server_io, client_io) = tokio::io::duplex(4096);

        let server_task = tokio::spawn(async move {
            let service = SwarmDeckMcp::new()
                .serve(server_io)
                .await
                .expect("server accepts initialize");
            service
                .waiting()
                .await
                .expect("server runs to a clean close");
        });

        let client = ().serve(client_io).await.expect("client completes initialize handshake");

        let peer_info = client
            .peer_info()
            .expect("initialize always retains peer info");
        assert!(
            peer_info.server_info.is_some(),
            "server must identify itself in the handshake"
        );

        let tools = client
            .list_all_tools()
            .await
            .expect("tools/list round-trip");
        assert!(
            tools.iter().any(|t| t.name == "check_active"),
            "check_active must be registered on the router; got {tools:?}"
        );

        client.cancel().await.expect("client shuts down cleanly");
        server_task
            .await
            .expect("server task joins without panicking");
    }

    /// mcp-task-server/T7: proves `tool_router() + tools_router()` in
    /// `SwarmDeckMcp::new` really merges both blocks — all 16 tools from
    /// `TOOL-CONTRACT.md` show up in one `tools/list`, not just
    /// `check_active`.
    #[tokio::test]
    async fn todas_as_16_ferramentas_do_contrato_estao_registradas() {
        let (server_io, client_io) = tokio::io::duplex(4096);

        let server_task = tokio::spawn(async move {
            let service = SwarmDeckMcp::new()
                .serve(server_io)
                .await
                .expect("server accepts initialize");
            service
                .waiting()
                .await
                .expect("server runs to a clean close");
        });

        let client = ().serve(client_io).await.expect("client completes initialize handshake");
        let tools = client
            .list_all_tools()
            .await
            .expect("tools/list round-trip");
        let names: std::collections::HashSet<&str> =
            tools.iter().map(|t| t.name.as_ref()).collect();

        const EXPECTED: &[&str] = &[
            "check_active",
            "create_task",
            "start_task",
            "update_task_plan",
            "update_task_implementation",
            "complete_task",
            "find_related_active_tasks",
            "search_tasks",
            "list_tasks",
            "set_terminal_title",
            "update_terminal_activity",
            "set_terminal_status",
            "get_projects",
            "create_project",
            "get_project_tasks",
            "update_task_project",
        ];
        for expected in EXPECTED {
            assert!(
                names.contains(expected),
                "ferramenta ausente: {expected}; registradas: {names:?}"
            );
        }
        assert_eq!(
            tools.len(),
            EXPECTED.len(),
            "número de ferramentas registradas não bate com o catálogo"
        );

        client.cancel().await.expect("client shuts down cleanly");
        server_task
            .await
            .expect("server task joins without panicking");
    }
}
