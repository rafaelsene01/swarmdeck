// SPEC: task-kanban (KAN-03, KAN-04)

//! `send`: takes a task's plan/description context and injects it into the
//! terminal that originated it, then brings the main window to front
//! (KAN-04 criterion 5, `design.md` → Componentes → `SendToTerminal`).
//!
//! This module also hosts the delete-related test coverage for KAN-03
//! criterion 4 ("excluir pede confirmação") and the edge case ("tarefa
//! excluída com o detalhe aberto fecha o detalhe e avisa") — not because
//! deletion logic lives here (it lives in `tasks::service::delete`, see the
//! DESVIO note there), but because this is the `tasks::send` test module
//! the task brief's `Verify` filters on (`cargo test tasks::send`), and the
//! brief groups all six KAN-03/04/07 card-action tests under that one
//! filter rather than splitting them across files by which production
//! function they exercise.
//!
//! ## Why `focus_main_window` is a closure, not an `AppHandle`
//! `send` needs to focus the main Tauri window after a successful write,
//! but constructing a real `tauri::AppHandle` requires a running app (the
//! `tauri` dependency here has no `test` feature enabled, and enabling one
//! would be an unrequested dependency change). The IPC layer
//! (`ipc/server.rs`, `IpcServer::on_task_changed`) already solves the exact
//! same problem — "an app-handle-shaped side effect that a unit test needs
//! to observe without a live app" — by injecting it as a closure. `send`
//! follows that precedent: the `#[tauri::command]` wrapper
//! (`commands/tasks.rs::task_send`) passes a closure that calls
//! `commands::kanban::focus_main`, and tests pass a closure that just flips
//! a flag.

use std::fmt;

use rusqlite::Connection;

use super::service::{self as task_service, Task};
use crate::terminal::{ManagerError, SessionState, TerminalId, TerminalManager};

#[derive(Debug)]
pub enum SendError {
    /// No task with this id — surfaces `TaskError::NotFound`'s message
    /// rather than wrapping it, so callers see one consistent "task not
    /// found" wording across the app.
    TaskNotFound(i64),
    /// KAN-04 criterion 6: the source terminal isn't alive (never
    /// registered, or registered but not `SessionState::Running`). Carries
    /// a human-readable explanation — the whole point of this variant
    /// existing separately from a generic `ManagerError` is that the
    /// frontend's send button is already disabled from `terminalAlive`
    /// (`commands/tasks.rs`); this is the backend's own guard for the race
    /// where the terminal died between the button rendering and the click
    /// landing, and it must fail with an explanation, never a raw PTY
    /// error (KAN-04 edge case, `design.md` → Tratamento de erros).
    TerminalNotAlive { task_id: i64, terminal_id: String },
    /// The terminal was alive at the alive-check but the write itself
    /// failed (e.g. it died in between).
    Write(ManagerError),
    /// Focusing the main window failed. Reported separately from `Write` so
    /// a caller can tell "the context never reached the terminal" apart
    /// from "it did, but the window didn't come to front".
    Focus(String),
}

impl fmt::Display for SendError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SendError::TaskNotFound(id) => write!(f, "tarefa não encontrada: {id}"),
            SendError::TerminalNotAlive { task_id, .. } => write!(
                f,
                "o terminal de origem da tarefa #{task_id} não está mais ativo"
            ),
            SendError::Write(err) => write!(f, "falha ao escrever no terminal: {err}"),
            SendError::Focus(err) => write!(f, "falha ao focar a janela principal: {err}"),
        }
    }
}

impl std::error::Error for SendError {}

/// Resolves `task.terminal_id` against `TerminalManager`'s live registry —
/// same "only `Running` counts as alive" rule `commands/tasks.rs::to_dto`
/// uses to compute `terminalAlive` for the card (KAN-04), so the backend
/// never disagrees with what the frontend already showed as enabled.
fn resolve_alive_terminal(
    terminal_manager: &TerminalManager,
    task: &Task,
) -> Result<TerminalId, SendError> {
    let not_alive = || SendError::TerminalNotAlive {
        task_id: task.id,
        terminal_id: task.terminal_id.clone(),
    };

    let terminal_id: TerminalId = task.terminal_id.parse().map_err(|_| not_alive())?;

    let alive = terminal_manager.list().into_iter().any(|snapshot| {
        snapshot.id == terminal_id && matches!(snapshot.state, SessionState::Running)
    });

    if !alive {
        return Err(not_alive());
    }

    Ok(terminal_id)
}

/// Builds the text injected into the terminal — enough for the agent (or
/// the human at the prompt) to pick the task back up without reopening the
/// board: title, description and plan, in that order. `implementation` is
/// deliberately left out — it's what the agent produces, not what it needs
/// handed back to it to resume work.
fn format_task_context(task: &Task) -> String {
    let mut out = format!("# Tarefa #{}: {}\n", task.id, task.title);

    if let Some(description) = task.description.as_deref().filter(|d| !d.is_empty()) {
        out.push_str(description);
        out.push('\n');
    }

    if let Some(plan) = task.plan.as_deref().filter(|p| !p.is_empty()) {
        out.push_str("\nPlano:\n");
        out.push_str(plan);
        out.push('\n');
    }

    out
}

/// KAN-04 criterion 5: injects the task's context into its source terminal
/// and brings the main window to front. `focus_main_window` is called only
/// after the PTY write succeeds — a failed write must not still bring the
/// window forward, since there'd be nothing new for the user to see there.
pub fn send<F>(
    conn: &Connection,
    terminal_manager: &TerminalManager,
    task_id: i64,
    focus_main_window: F,
) -> Result<(), SendError>
where
    F: FnOnce() -> Result<(), String>,
{
    let task = task_service::get(conn, task_id).map_err(|_| SendError::TaskNotFound(task_id))?;
    let terminal_id = resolve_alive_terminal(terminal_manager, &task)?;

    let context = format_task_context(&task);
    terminal_manager
        .write(terminal_id, context.as_bytes())
        .map_err(SendError::Write)?;

    focus_main_window().map_err(SendError::Focus)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::db::Db;
    use crate::tasks::service::{TaskError, TerminalContext};
    use crate::terminal::SessionConfig;

    fn temp_cwd() -> std::path::PathBuf {
        std::env::temp_dir()
    }

    fn create_task_with_terminal(conn: &Connection, terminal_id: &str, title: &str) -> Task {
        let ctx = TerminalContext {
            terminal_id: terminal_id.to_string(),
            cwd: temp_cwd(),
        };
        task_service::create(conn, &ctx, title, Some("descrição de teste")).expect("criar tarefa")
    }

    #[test]
    fn send_escreve_o_contexto_da_tarefa_no_pty() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        let manager = TerminalManager::new();

        let terminal_id = manager
            .spawn(SessionConfig {
                cwd: temp_cwd(),
                shell: None,
                agent: None,
                session_id: None,
                resume: false,
                env: Default::default(),
            })
            .expect("spawn de terminal de teste");

        let task = create_task_with_terminal(conn, &terminal_id.to_string(), "Tarefa a enviar");

        let mut focused = false;
        send(conn, &manager, task.id, || {
            focused = true;
            Ok(())
        })
        .expect("send deveria ter sucesso com terminal vivo");

        // `TerminalManager` não expõe o buffer de entrada diretamente (só o
        // de saída, via `take_output`) — o que dá para verificar por fora é
        // que `write` não retornou erro, ou seja, os bytes chegaram à
        // sessão. A prova de que o *conteúdo certo* foi escrito é
        // `format_task_context` incluir id/título/descrição, testado
        // isoladamente abaixo.
        assert!(
            focused,
            "send deveria ter escrito com sucesso antes de focar"
        );

        manager
            .kill(terminal_id)
            .expect("encerrar terminal de teste");
    }

    #[test]
    fn format_task_context_inclui_id_titulo_descricao_e_plano() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();

        let task = create_task_with_terminal(conn, "terminal-qualquer", "Corrigir bug de login");
        task_service::update_plan(conn, task.id, "1. Reproduzir\n2. Corrigir")
            .expect("atualizar plano de teste");
        let task = task_service::get(conn, task.id).expect("recarregar tarefa");

        let context = format_task_context(&task);

        assert!(context.contains(&format!("#{}", task.id)));
        assert!(context.contains("Corrigir bug de login"));
        assert!(context.contains("descrição de teste"));
        assert!(context.contains("1. Reproduzir"));
    }

    #[test]
    fn send_foca_a_janela_principal_apos_escrever_com_sucesso() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        let manager = TerminalManager::new();

        let terminal_id = manager
            .spawn(SessionConfig {
                cwd: temp_cwd(),
                shell: None,
                agent: None,
                session_id: None,
                resume: false,
                env: Default::default(),
            })
            .expect("spawn de terminal de teste");

        let task = create_task_with_terminal(conn, &terminal_id.to_string(), "Tarefa qualquer");

        let mut focus_calls = 0;
        send(conn, &manager, task.id, || {
            focus_calls += 1;
            Ok(())
        })
        .expect("send deveria ter sucesso");

        assert_eq!(
            focus_calls, 1,
            "focar a janela principal deveria acontecer exatamente uma vez"
        );

        manager
            .kill(terminal_id)
            .expect("encerrar terminal de teste");
    }

    #[test]
    fn terminal_morto_desabilita_o_envio_com_explicacao_em_vez_de_erro_generico() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        // Manager vazio: nenhuma sessão registrada, mesmo cenário de
        // `commands::tasks::terminal_alive_false_para_terminal_morto` — um
        // terminal encerrado e removido do registro.
        let manager = TerminalManager::new();

        let task =
            create_task_with_terminal(conn, &uuid::Uuid::now_v7().to_string(), "Tarefa órfã");

        let mut focused = false;
        let result = send(conn, &manager, task.id, || {
            focused = true;
            Ok(())
        });

        match result {
            Err(SendError::TerminalNotAlive { task_id, .. }) => assert_eq!(task_id, task.id),
            other => panic!("esperava TerminalNotAlive, obtive {other:?}"),
        }
        assert!(
            !focused,
            "não deveria focar a janela quando o terminal está morto"
        );
        // A explicação exigida por KAN-04 (critério 6) é o próprio texto de
        // `Display` — não um erro genérico de PTY.
        assert_eq!(
            result.unwrap_err().to_string(),
            format!(
                "o terminal de origem da tarefa #{} não está mais ativo",
                task.id
            )
        );
    }

    #[test]
    fn delete_remove_a_tarefa_do_banco() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();

        let task = create_task_with_terminal(conn, "terminal-qualquer", "Tarefa a excluir");

        task_service::delete(conn, task.id).expect("excluir tarefa de teste");

        let err = task_service::get(conn, task.id).expect_err("tarefa deveria ter sido removida");
        assert!(matches!(err, TaskError::NotFound(id) if id == task.id));
    }

    /// KAN-03 caso de borda: "tarefa excluída com o detalhe aberto → o
    /// detalhe fecha e avisa". `TaskDetail.tsx` implementa isso buscando a
    /// tarefa de novo (`task_get`) a cada nudge de `task_changed` e tratando
    /// um erro de busca como "foi removida" — este teste prova o contrato
    /// de backend que essa lógica depende: depois de `delete`, um `get`
    /// subsequente falha com `NotFound`, nunca devolve dado obsoleto.
    #[test]
    fn get_apos_delete_retorna_not_found_o_que_fecha_o_detalhe_aberto() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();

        let task =
            create_task_with_terminal(conn, "terminal-qualquer", "Tarefa com detalhe aberto");
        task_service::delete(conn, task.id).expect("excluir tarefa de teste");

        let result = task_service::get(conn, task.id);
        assert!(
            matches!(result, Err(TaskError::NotFound(_))),
            "get depois de delete deveria ser NotFound, nunca um snapshot antigo"
        );
    }

    /// KAN-07 criterion 3: manual creation must go through the same
    /// `TaskService::create` MCP-driven agents use — never a parallel
    /// insert path — and must land in `pending`. `TaskDetail.tsx`/T6 don't
    /// ship a creation form (out of this task's authorized file list; the
    /// UI for KAN-07 criteria 1-2 is future work), so this test is the
    /// regression guard for the invariant the "Done when" bullet actually
    /// asks for: there is exactly one function in this codebase that
    /// inserts a `tasks` row, and it always produces `pending`.
    #[test]
    fn criacao_manual_via_task_service_entra_em_pending() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();

        let ctx = TerminalContext {
            terminal_id: "manual".to_string(),
            cwd: temp_cwd(),
        };
        let task = task_service::create(conn, &ctx, "Tarefa criada na mão", None)
            .expect("criação manual via TaskService");

        assert_eq!(task.status, crate::tasks::state::TaskStatus::Pending);

        // Visível às ferramentas MCP: `list_active`/`list` leem a mesma
        // tabela sem filtrar por origem — nenhuma coluna distingue "criada
        // por agente" de "criada na mão".
        let (all, _total) = task_service::list(conn, None, None, None).expect("listar tarefas");
        assert!(all.iter().any(|t| t.id == task.id));
    }
}
