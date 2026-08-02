//! Integration tests for `TaskService` (mcp-task-server/T3).
//!
//! Real SQLite file, not in-memory — same reasoning as `tests/projects.rs`:
//! a service is only proven against the real database. Project directories
//! are real temp dirs too, since `ProjectService::create` validates
//! existence on disk; `TaskService::create`'s own `cwd` argument does *not*
//! need to exist (project resolution never touches the filesystem — see
//! `projects::resolve`), so several tests below point `cwd` at subpaths that
//! were never actually created. Not parallel-safe — see
//! `.specs/codebase/TESTING.md`.

use swarmdeck_lib::db::Db;
use swarmdeck_lib::projects::service as project_service;
use swarmdeck_lib::tasks::service::{self, TaskError, TerminalContext, TEXT_CAP};
use swarmdeck_lib::tasks::state::TaskStatus;

fn temp_db_path() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("criar diretório temporário do banco");
    let path = dir.path().join("swarmdeck.db");
    (dir, path)
}

fn ctx(terminal_id: &str, cwd: &std::path::Path) -> TerminalContext {
    TerminalContext {
        terminal_id: terminal_id.to_string(),
        cwd: cwd.to_path_buf(),
    }
}

fn count_tasks(conn: &rusqlite::Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
        .expect("contar tasks")
}

#[test]
fn create_com_cwd_igual_ao_path_do_projeto_infere_o_project_id() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let project_dir = tempfile::tempdir().expect("dir do projeto");

    let project = project_service::create(db.conn(), "SwarmDeck", project_dir.path())
        .expect("create do projeto");

    let task = service::create(
        db.conn(),
        &ctx("t1", project_dir.path()),
        "Implementar TaskService",
        None,
    )
    .expect("create da task deve funcionar");

    assert_eq!(task.project_id, Some(project.id));
    assert_eq!(task.terminal_id, "t1");
    assert_eq!(task.status, TaskStatus::Pending);
}

#[test]
fn create_com_cwd_em_subpasta_do_projeto_resolve_o_mesmo_projeto() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let project_dir = tempfile::tempdir().expect("dir do projeto");

    let project = project_service::create(db.conn(), "SwarmDeck", project_dir.path())
        .expect("create do projeto");

    let subpasta = project_dir.path().join("src-tauri").join("src");
    let task = service::create(db.conn(), &ctx("t1", &subpasta), "Task em subpasta", None)
        .expect("create deve resolver a subpasta ao projeto");

    assert_eq!(task.project_id, Some(project.id));
}

#[test]
fn dois_projetos_candidatos_o_mais_especifico_vence_ponta_a_ponta() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let outer_dir = tempfile::tempdir().expect("dir externo");
    let inner_dir = outer_dir.path().join("src-tauri");
    std::fs::create_dir(&inner_dir).expect("criar subpasta interna");

    let _outer = project_service::create(db.conn(), "Repo Inteiro", outer_dir.path())
        .expect("create do projeto externo");
    let inner = project_service::create(db.conn(), "Backend", &inner_dir)
        .expect("create do projeto interno");

    let cwd = inner_dir.join("src").join("projects");
    let task = service::create(db.conn(), &ctx("t1", &cwd), "Task no mais fundo", None)
        .expect("create deve resolver ao projeto mais específico");

    assert_eq!(
        task.project_id,
        Some(inner.id),
        "o projeto mais profundo (mais específico) deve vencer, não o mais externo"
    );
}

#[test]
fn create_sem_projeto_correspondente_deixa_project_id_nulo_sem_criar_projeto() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let project_dir = tempfile::tempdir().expect("dir do projeto cadastrado");
    let outro_dir = tempfile::tempdir().expect("dir não relacionado");

    project_service::create(db.conn(), "SwarmDeck", project_dir.path())
        .expect("create do projeto cadastrado");

    let task = service::create(db.conn(), &ctx("t1", outro_dir.path()), "Task órfã", None)
        .expect("create deve funcionar mesmo sem projeto correspondente (fallback)");

    assert_eq!(
        task.project_id, None,
        "sem projeto correspondente, project_id deve ficar NULL (fallback), não criar projeto novo"
    );

    let total_projects: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
        .expect("contar projetos");
    assert_eq!(
        total_projects, 1,
        "o fallback não deve criar um projeto novo a partir do nome da pasta"
    );

    // Confirma direto no banco, não só via valor de retorno.
    let project_id_no_banco: Option<String> = db
        .conn()
        .query_row(
            "SELECT project_id FROM tasks WHERE id = ?1",
            rusqlite::params![task.id],
            |r| r.get(0),
        )
        .expect("ler project_id da task");
    assert_eq!(project_id_no_banco, None);
}

#[test]
fn start_numa_task_recem_criada_vira_in_progress() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let dir = tempfile::tempdir().expect("dir");

    let task = service::create(db.conn(), &ctx("t1", dir.path()), "Task", None)
        .expect("create deve funcionar");
    assert_eq!(task.status, TaskStatus::Pending);

    let started = service::start(db.conn(), task.id).expect("start deve funcionar");
    assert_eq!(started.status, TaskStatus::InProgress);
}

#[test]
fn complete_a_partir_de_in_progress_leva_a_in_testing_nunca_direto_a_completed() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let dir = tempfile::tempdir().expect("dir");

    let task = service::create(db.conn(), &ctx("t1", dir.path()), "Task", None)
        .expect("create deve funcionar");
    service::start(db.conn(), task.id).expect("start deve funcionar");

    // Primeira chamada: in_progress -> in_testing. Prova explícita de que a
    // fase de teste não é pulada na primeira chamada de `complete`: o status
    // resultante é in_testing, nunca completed.
    let first = service::complete(db.conn(), task.id).expect("complete deve funcionar");
    assert_eq!(
        first.status,
        TaskStatus::InTesting,
        "a primeira chamada de complete deve parar em in_testing, nunca ir direto a completed"
    );
    assert_ne!(first.status, TaskStatus::Completed);
}

#[test]
fn complete_a_partir_de_in_testing_leva_a_completed() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let dir = tempfile::tempdir().expect("dir");

    let task = service::create(db.conn(), &ctx("t1", dir.path()), "Task", None)
        .expect("create deve funcionar");
    service::start(db.conn(), task.id).expect("start deve funcionar");
    service::complete(db.conn(), task.id).expect("primeiro complete (in_progress -> in_testing)");

    // Segunda chamada: in_testing -> completed — o outro destino válido.
    let second = service::complete(db.conn(), task.id).expect("segundo complete deve funcionar");
    assert_eq!(second.status, TaskStatus::Completed);
}

#[test]
fn complete_ou_start_com_task_id_inexistente_falha_sem_criar_linha() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");

    assert_eq!(count_tasks(db.conn()), 0);

    let complete_result = service::complete(db.conn(), 999);
    assert!(matches!(complete_result, Err(TaskError::NotFound(999))));

    let start_result = service::start(db.conn(), 999);
    assert!(matches!(start_result, Err(TaskError::NotFound(999))));

    assert_eq!(
        count_tasks(db.conn()),
        0,
        "uma chamada de start/complete em id inexistente não pode criar nenhuma linha"
    );
}

#[test]
fn update_plan_acima_do_teto_trunca_e_sinaliza_abaixo_do_teto_nao_trunca() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let dir = tempfile::tempdir().expect("dir");

    let task = service::create(db.conn(), &ctx("t1", dir.path()), "Task", None)
        .expect("create deve funcionar");

    // Acima do teto: texto ASCII de TEXT_CAP + 500 caracteres.
    let texto_grande = "a".repeat(TEXT_CAP + 500);
    let result = service::update_plan(db.conn(), task.id, &texto_grande)
        .expect("update_plan deve funcionar mesmo truncando");

    assert!(
        result.truncated,
        "texto acima do teto deve sinalizar truncamento"
    );
    let plano_salvo = result.task.plan.expect("plan deve ter sido salvo");
    assert_eq!(
        plano_salvo.chars().count(),
        TEXT_CAP,
        "o texto salvo deve ter exatamente o tamanho do teto"
    );

    // Abaixo do teto: não trunca, não sinaliza.
    let texto_pequeno = "b".repeat(100);
    let result2 = service::update_plan(db.conn(), task.id, &texto_pequeno)
        .expect("update_plan deve funcionar com texto pequeno");

    assert!(
        !result2.truncated,
        "texto abaixo do teto não deve sinalizar truncamento"
    );
    assert_eq!(result2.task.plan, Some(texto_pequeno));
}
