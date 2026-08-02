//! Local IPC: how the `swarmdeck-mcp` sidecar (one per terminal, spawned by
//! the agent's CLI over stdio — see `.specs/features/mcp-task-server/design.md`
//! → Arquitetura) talks back to this already-running app.

pub mod server;
pub mod transport;
