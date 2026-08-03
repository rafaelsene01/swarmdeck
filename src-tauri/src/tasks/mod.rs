// SPEC: mcp-task-server (MCP-02, MCP-03, MCP-07, MCP-08)

//! Task domain: status transitions and the task service.

pub mod service;
pub mod similarity;
pub mod state;
// DESVIO: not in task-kanban/T6's authorized file list, but required for
// `send.rs` (which is authorized) to be reachable as `tasks::send` at all —
// same category of necessary-prerequisite gap as the `task_get` GAP called
// out in the task brief, just not pre-identified there. Pure module
// declaration, implements no requirement itself, so per
// `spec-driven-changes.md` it needs no `SPEC:` marker of its own.
pub mod send;
