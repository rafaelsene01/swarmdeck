// SPEC: task-kanban (KAN-01, KAN-03, KAN-04)

//! Comandos Tauri do board Kanban: `task_list`/`task_get` (tarefas com
//! projeto embutido e `terminalAlive` derivado), `task_delete` e `task_send`
//! (`design.md` → Modelos de dados / Componentes).
//!
//! Invólucro fino no mesmo padrão de `commands/projects.rs`: nenhuma regra
//! de negócio nova mora aqui — `task_list`/`task_get` só compõem três fontes
//! já existentes (`tasks::service`, `projects::service`, `TerminalManager`)
//! e traduzem o resultado para o formato que `src/types/tasks.ts` (`Task`)
//! espera no frontend; `task_delete` delega a `tasks::service::delete`;
//! `task_send` delega a `tasks::send::send`.
//!
//! `terminal_alive` é **calculado a cada chamada**, nunca gravado no banco:
//! `task.terminal_id` (sempre presente hoje — `TaskService::create` exige um
//! `TerminalContext`) é comparado contra o registro de sessões vivas de
//! `TerminalManager::list()`, e só conta como viva a sessão cujo estado é
//! `SessionState::Running` — uma sessão `Exited`/`Failed` ainda registrada
//! não habilita a ação de enviar-ao-terminal (KAN-04, critério 6).

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::Db;
use crate::ipc::server::{emit_task_changed, TaskChangeInfo};
use crate::projects::service::{self as project_service, Project};
use crate::tasks::send::{self, SendError};
use crate::tasks::service::{self as task_service, Task};
use crate::terminal::{SessionState, TerminalId, TerminalManager};

/// Espelha `ProjectRef` de `src/types/tasks.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRefDto {
    pub id: String,
    pub name: String,
    pub color: String,
}

/// Espelha `Task` de `src/types/tasks.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDto {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub plan: Option<String>,
    pub implementation: Option<String>,
    pub status: String,
    pub project: Option<ProjectRefDto>,
    pub terminal_id: Option<String>,
    pub terminal_alive: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub fn task_list(
    db: State<'_, Mutex<Db>>,
    terminal_manager: State<'_, TerminalManager>,
) -> Result<Vec<TaskDto>, String> {
    let db = db.lock().expect("db mutex poisoned");
    list_with_projects(db.conn(), &terminal_manager)
}

/// Núcleo testável de `task_list`, sem o `State` do Tauri em volta —
/// `tauri::State` não é construível fora de um `AppHandle` real, então os
/// testes deste arquivo chamam esta função diretamente, com um
/// `Connection` e um `TerminalManager` montados à mão.
fn list_with_projects(
    conn: &Connection,
    terminal_manager: &TerminalManager,
) -> Result<Vec<TaskDto>, String> {
    let (tasks, _total) = task_service::list(conn, None, None, None).map_err(|e| e.to_string())?;
    let projects = project_service::list_all(conn).map_err(|e| e.to_string())?;
    let projects_by_id: HashMap<&str, &Project> =
        projects.iter().map(|p| (p.id.as_str(), p)).collect();
    let alive_ids = alive_terminal_ids(terminal_manager);

    Ok(tasks
        .into_iter()
        .map(|task| to_dto(task, &projects_by_id, &alive_ids))
        .collect())
}

// SPEC: task-kanban (KAN-03, KAN-04)
// GAP HERDADO DE T3: `useTaskStore.ts` já chama `invoke('task_get', { id })`
// para o caso "evento de tarefa desconhecida" (ver o comentário DESVIO ali)
// — o comando não existia. Mesmo padrão fino de `task_list`: núcleo
// testável (`get_with_project`) por trás do wrapper `#[tauri::command]`.
#[tauri::command]
pub fn task_get(
    db: State<'_, Mutex<Db>>,
    terminal_manager: State<'_, TerminalManager>,
    id: i64,
) -> Result<TaskDto, String> {
    let db = db.lock().expect("db mutex poisoned");
    get_with_project(db.conn(), &terminal_manager, id)
}

// task-kanban/T7: `pub(crate)` (was private) so `ipc::server::IpcServer` can
// build the exact same camelCase/project-embedded/`terminalAlive` shape for
// `task_changed`'s payload instead of re-deriving it — see
// `IpcServer::task_dto_json`.
pub(crate) fn get_with_project(
    conn: &Connection,
    terminal_manager: &TerminalManager,
    id: i64,
) -> Result<TaskDto, String> {
    let task = task_service::get(conn, id).map_err(|e| e.to_string())?;
    let projects = project_service::list_all(conn).map_err(|e| e.to_string())?;
    let projects_by_id: HashMap<&str, &Project> =
        projects.iter().map(|p| (p.id.as_str(), p)).collect();
    let alive_ids = alive_terminal_ids(terminal_manager);

    Ok(to_dto(task, &projects_by_id, &alive_ids))
}

/// KAN-03 criterion 4: deletes the task, then nudges every window via
/// `task_changed` — same emission the MCP-driven mutations use
/// (`ipc/server.rs::emit_task_changed`), so a delete from the Kanban board
/// and a delete-adjacent change from an agent look identical to any other
/// listener. The confirmation step itself is a frontend concern
/// (`TaskDetail.tsx`) — this command is the point of no return once called.
#[tauri::command]
pub fn task_delete(app: AppHandle, db: State<'_, Mutex<Db>>, id: i64) -> Result<(), String> {
    let db = db.lock().expect("db mutex poisoned");
    task_service::delete(db.conn(), id).map_err(|e| e.to_string())?;
    // task-kanban/T7: `op: "deleted"` carries `task: None` per
    // `TaskChangedEvent`'s contract (`src/types/tasks.ts`) — the row is
    // gone, so there is nothing to embed, and `useTaskStore.ts`'s
    // `applyTaskChangedEvent` only ever removes by `taskId` for this op.
    emit_task_changed(
        &app,
        &TaskChangeInfo {
            op: "deleted",
            task: None,
            task_id: id,
            previous_status: None,
        },
    );
    Ok(())
}

/// KAN-04 criterion 5: wraps `tasks::send::send`, supplying the two things
/// only a live app can provide — the `Connection`/`TerminalManager` state,
/// and the "focus the main window" closure backed by
/// `commands::kanban::focus_main` (KAN-08, already reused rather than
/// reimplemented).
#[tauri::command]
pub fn task_send(
    app: AppHandle,
    db: State<'_, Mutex<Db>>,
    terminal_manager: State<'_, TerminalManager>,
    id: i64,
) -> Result<(), String> {
    let db = db.lock().expect("db mutex poisoned");
    send::send(db.conn(), &terminal_manager, id, || {
        crate::commands::kanban::focus_main(&app).map_err(|e| e.to_string())
    })
    .map_err(|err: SendError| err.to_string())
}

/// Mesma regra "só `Running` conta como viva" usada por `to_dto` — extraída
/// para `task_get` reusar sem duplicar o filtro.
fn alive_terminal_ids(terminal_manager: &TerminalManager) -> HashSet<TerminalId> {
    terminal_manager
        .list()
        .into_iter()
        .filter(|snapshot| matches!(snapshot.state, SessionState::Running))
        .map(|snapshot| snapshot.id)
        .collect()
}

fn to_dto(
    task: Task,
    projects_by_id: &HashMap<&str, &Project>,
    alive_ids: &HashSet<TerminalId>,
) -> TaskDto {
    let project = task
        .project_id
        .as_deref()
        .and_then(|id| projects_by_id.get(id))
        .map(|p| ProjectRefDto {
            id: p.id.clone(),
            name: p.name.clone(),
            color: p.color.clone(),
        });

    // Um `terminal_id` que não faz parse de `TerminalId` (uuid) não pode
    // estar registrado no manager — trata como morto em vez de propagar o
    // erro de parse, já que esta função nunca falha por causa de um dado
    // de exibição derivado.
    let terminal_alive = task
        .terminal_id
        .parse::<TerminalId>()
        .map(|id| alive_ids.contains(&id))
        .unwrap_or(false);

    TaskDto {
        id: task.id,
        title: task.title,
        description: task.description,
        plan: task.plan,
        implementation: task.implementation,
        status: task.status.to_string(),
        project,
        terminal_id: Some(task.terminal_id),
        terminal_alive,
        created_at: task.created_at,
        updated_at: task.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::tasks::service::TerminalContext;
    use crate::terminal::SessionConfig;

    /// Diretório real e único por teste — `projects::service::create` exige
    /// que o caminho exista, e `resolve()` (usado por `TaskService::create`)
    /// casa `ctx.cwd` contra o `project.path` já canonicalizado, então usar
    /// o mesmo `PathBuf` cru dos dois lados é o que replica o uso real (a
    /// `cwd` de um terminal nunca chega canonicalizada).
    fn temp_project_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "swarmdeck-commands-tasks-test-{name}-{}",
            uuid::Uuid::now_v7()
        ));
        std::fs::create_dir_all(&dir).expect("criar diretório temporário do teste");
        dir
    }

    #[test]
    fn lista_tarefa_com_projeto_embutido() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        let manager = TerminalManager::new();

        let dir = temp_project_dir("com-projeto");
        let project =
            project_service::create(conn, "SwarmDeck", &dir).expect("criar projeto de teste");

        let ctx = TerminalContext {
            terminal_id: "terminal-qualquer".to_string(),
            cwd: dir.clone(),
        };
        task_service::create(conn, &ctx, "Tarefa com projeto", None)
            .expect("criar tarefa de teste");

        let dtos = list_with_projects(conn, &manager).expect("task_list");
        assert_eq!(dtos.len(), 1);

        let project_ref = dtos[0]
            .project
            .as_ref()
            .expect("tarefa deveria ter projeto embutido");
        assert_eq!(project_ref.id, project.id);
        assert_eq!(project_ref.name, project.name);
        assert_eq!(project_ref.color, project.color);
    }

    #[test]
    fn terminal_alive_true_para_sessao_viva_no_manager() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        let manager = TerminalManager::new();

        let terminal_id = manager
            .spawn(SessionConfig {
                cwd: std::env::temp_dir(),
                profile: crate::shells::TerminalProfile::Host,
                agent: None,
                session_id: None,
                resume: false,
                permission_mode: None,
                env: Default::default(),
            })
            .expect("spawn de terminal de teste");

        let ctx = TerminalContext {
            terminal_id: terminal_id.to_string(),
            cwd: std::env::temp_dir(),
        };
        task_service::create(conn, &ctx, "Tarefa com terminal vivo", None)
            .expect("criar tarefa de teste");

        let dtos = list_with_projects(conn, &manager).expect("task_list");
        assert_eq!(dtos.len(), 1);
        assert!(
            dtos[0].terminal_alive,
            "sessão recém-criada deveria contar como viva"
        );

        manager
            .kill(terminal_id)
            .expect("encerrar terminal de teste");
    }

    #[test]
    fn terminal_alive_false_para_terminal_morto() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        // Manager vazio: nenhuma sessão registrada — equivalente a um
        // terminal que já foi encerrado e removido do registro (ver
        // `TerminalManager::kill`).
        let manager = TerminalManager::new();

        let ctx = TerminalContext {
            terminal_id: uuid::Uuid::now_v7().to_string(),
            cwd: std::env::temp_dir(),
        };
        task_service::create(conn, &ctx, "Tarefa com terminal morto", None)
            .expect("criar tarefa de teste");

        let dtos = list_with_projects(conn, &manager).expect("task_list");
        assert_eq!(dtos.len(), 1);
        assert!(
            !dtos[0].terminal_alive,
            "terminal ausente do registro deveria contar como morto"
        );
    }

    #[test]
    fn projeto_fica_nulo_apos_exclusao() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        let manager = TerminalManager::new();

        let dir = temp_project_dir("excluido");
        let project = project_service::create(conn, "Projeto a excluir", &dir)
            .expect("criar projeto de teste");

        let ctx = TerminalContext {
            terminal_id: "terminal-qualquer".to_string(),
            cwd: dir.clone(),
        };
        task_service::create(conn, &ctx, "Tarefa com projeto excluído", None)
            .expect("criar tarefa de teste");

        project_service::delete(conn, &project.id).expect("excluir projeto de teste");

        let dtos = list_with_projects(conn, &manager).expect("task_list");
        assert_eq!(dtos.len(), 1);
        assert!(
            dtos[0].project.is_none(),
            "projeto excluído deveria deixar `project` nulo, não remover a tarefa"
        );
    }

    #[test]
    fn task_get_devolve_a_mesma_forma_que_task_list() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        let manager = TerminalManager::new();

        let dir = temp_project_dir("task-get");
        let project =
            project_service::create(conn, "SwarmDeck", &dir).expect("criar projeto de teste");
        let ctx = TerminalContext {
            terminal_id: "terminal-qualquer".to_string(),
            cwd: dir.clone(),
        };
        let created = task_service::create(conn, &ctx, "Tarefa buscada", None)
            .expect("criar tarefa de teste");

        let dto = get_with_project(conn, &manager, created.id).expect("task_get");

        assert_eq!(dto.id, created.id);
        assert_eq!(dto.title, "Tarefa buscada");
        assert_eq!(dto.project.expect("projeto embutido").id, project.id);
        assert!(!dto.terminal_alive);
    }

    #[test]
    fn task_get_para_id_inexistente_retorna_erro() {
        let db = Db::open_in_memory().expect("banco em memória");
        let conn = db.conn();
        let manager = TerminalManager::new();

        let result = get_with_project(conn, &manager, 999_999);

        assert!(result.is_err());
    }
}
