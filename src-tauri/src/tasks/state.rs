// SPEC: mcp-task-server (MCP-03)

//! Task status state machine.
//!
//! The state diagram lives in `.specs/features/mcp-task-server/design.md`
//! ("Máquina de estados"). This module is a direct translation of that
//! diagram into a transition table — the core business rule is that there is
//! **no edge** from `InProgress` straight to `Completed`. The mandatory
//! testing phase is guaranteed by the absence of that arrow, not by an `if`
//! that someone could remove later.
//!
//! ```text
//! [*] --> pending: create_task
//! pending --> in_progress: start_task
//! in_progress --> in_testing: complete_task
//! in_testing --> completed: complete_task
//! in_testing --> in_progress: start_task
//! completed --> in_progress: start_task
//! ```

use std::fmt;

/// A task's current status, mirroring the `status` CHECK constraint on the
/// `tasks` table (`db/migrations/002_tasks.sql` / `003_tasks.sql`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskStatus {
    Pending,
    InProgress,
    InTesting,
    Completed,
}

impl TaskStatus {
    fn as_str(self) -> &'static str {
        match self {
            TaskStatus::Pending => "pending",
            TaskStatus::InProgress => "in_progress",
            TaskStatus::InTesting => "in_testing",
            TaskStatus::Completed => "completed",
        }
    }

    /// Actions that are valid to call from this state. Used both to decide
    /// transitions and to build the error message when an invalid one is
    /// attempted.
    fn valid_actions(self) -> &'static [TaskAction] {
        match self {
            TaskStatus::Pending => &[TaskAction::Start],
            TaskStatus::InProgress => &[TaskAction::Start, TaskAction::Complete],
            TaskStatus::InTesting => &[TaskAction::Start, TaskAction::Complete],
            TaskStatus::Completed => &[TaskAction::Start],
        }
    }
}

impl fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The two actions exposed by the MCP tools that move a task between
/// statuses (`start_task`, `complete_task`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskAction {
    Start,
    Complete,
}

impl TaskAction {
    fn as_str(self) -> &'static str {
        match self {
            TaskAction::Start => "start",
            TaskAction::Complete => "complete",
        }
    }
}

impl fmt::Display for TaskAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A transition that the state machine does not allow, e.g. `complete` from
/// `pending`, or `complete` from `completed`. `in_progress -> completed`
/// falls under this error too: there is simply no `(InProgress, Complete)`
/// arm mapping to `Completed` in `try_transition`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidTransition {
    pub from: TaskStatus,
    pub action: TaskAction,
}

impl fmt::Display for InvalidTransition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let valid: Vec<&str> = self
            .from
            .valid_actions()
            .iter()
            .map(|a| a.as_str())
            .collect();
        write!(
            f,
            "cannot '{}' a task in state '{}'; valid actions from '{}': {}",
            self.action,
            self.from,
            self.from,
            valid.join(", ")
        )
    }
}

impl std::error::Error for InvalidTransition {}

impl TaskStatus {
    /// Applies `action` to a task currently in status `from`.
    ///
    /// `start` always succeeds and lands on `InProgress`, regardless of the
    /// current state — including from `Completed`, which is how a finished
    /// task gets reopened.
    ///
    /// `complete` only succeeds from `InProgress` (-> `InTesting`) and from
    /// `InTesting` (-> `Completed`); every other combination is an
    /// `InvalidTransition`. In particular, there is no arm that takes
    /// `InProgress` directly to `Completed` — reaching `Completed` always
    /// requires having passed through `InTesting` first.
    pub fn try_transition(
        from: TaskStatus,
        action: TaskAction,
    ) -> Result<TaskStatus, InvalidTransition> {
        match (from, action) {
            // DESVIO (documented, not a blocker — see task brief): the spec's
            // state diagram doesn't say what `start` does when the task is
            // already `in_progress`. Chosen: idempotent, stays in
            // `in_progress` rather than erroring, since re-issuing
            // `start_task` on an already-active task is a harmless no-op for
            // the calling agent.
            (_, TaskAction::Start) => Ok(TaskStatus::InProgress),

            (TaskStatus::InProgress, TaskAction::Complete) => Ok(TaskStatus::InTesting),
            (TaskStatus::InTesting, TaskAction::Complete) => Ok(TaskStatus::Completed),

            (invalid_from, TaskAction::Complete) => Err(InvalidTransition {
                from: invalid_from,
                action,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_from_pending_moves_to_in_progress() {
        let result = TaskStatus::try_transition(TaskStatus::Pending, TaskAction::Start);
        assert_eq!(result, Ok(TaskStatus::InProgress));
    }

    #[test]
    fn start_from_in_progress_is_idempotent() {
        // DESVIO: spec doesn't define this case; decided idempotent (see
        // comment on try_transition). Stays in_progress, no error.
        let result = TaskStatus::try_transition(TaskStatus::InProgress, TaskAction::Start);
        assert_eq!(result, Ok(TaskStatus::InProgress));
    }

    #[test]
    fn start_from_in_testing_moves_to_in_progress() {
        let result = TaskStatus::try_transition(TaskStatus::InTesting, TaskAction::Start);
        assert_eq!(result, Ok(TaskStatus::InProgress));
    }

    #[test]
    fn start_from_completed_reopens_to_in_progress() {
        let result = TaskStatus::try_transition(TaskStatus::Completed, TaskAction::Start);
        assert_eq!(result, Ok(TaskStatus::InProgress));
    }

    #[test]
    fn complete_from_in_progress_moves_to_in_testing() {
        let result = TaskStatus::try_transition(TaskStatus::InProgress, TaskAction::Complete);
        assert_eq!(result, Ok(TaskStatus::InTesting));
    }

    #[test]
    fn complete_from_in_testing_moves_to_completed() {
        let result = TaskStatus::try_transition(TaskStatus::InTesting, TaskAction::Complete);
        assert_eq!(result, Ok(TaskStatus::Completed));
    }

    #[test]
    fn complete_from_pending_is_rejected_no_phase_skip() {
        // Proves explicitly that there is no shortcut past the testing
        // phase: `complete` only exists as an edge from `in_progress` and
        // `in_testing`. From `pending` (and, by the same table, from
        // `completed`) it is simply not a valid action.
        let result = TaskStatus::try_transition(TaskStatus::Pending, TaskAction::Complete);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert_eq!(err.from, TaskStatus::Pending);
        assert_eq!(err.action, TaskAction::Complete);
    }

    #[test]
    fn invalid_transition_error_lists_valid_actions() {
        let err = TaskStatus::try_transition(TaskStatus::Completed, TaskAction::Complete)
            .expect_err("complete from completed has no edge");

        let message = err.to_string();
        assert!(
            message.contains("start"),
            "error message should name the valid transition(s) from this state: {message}"
        );
        assert!(message.contains("completed"), "message: {message}");
    }
}
