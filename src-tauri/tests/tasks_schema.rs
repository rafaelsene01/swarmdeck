//! Testes de integração da migração 003 — tasks, projects, terminal_statuses,
//! terminal_activity (mcp-task-server/T1).
//!
//! Rodam contra arquivo SQLite real, não in-memory — mesmo motivo do
//! `tests/db.rs`: uma migração só está validada contra o banco de verdade.
//! Por isso também não são paralelizáveis — ver `.specs/codebase/TESTING.md`.

use swarmdeck_lib::db::{latest_schema_version, Db};

fn temp_db_path() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("criar diretório temporário");
    let path = dir.path().join("swarmdeck.db");
    (dir, path)
}

#[test]
fn migracao_cria_as_4_tabelas() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");

    for tabela in [
        "tasks",
        "projects",
        "terminal_statuses",
        "terminal_activity",
    ] {
        let existe: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [tabela],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| panic!("consultar sqlite_master para {tabela}"));
        assert_eq!(existe, 1, "tabela {tabela} deve existir");
    }
}

#[test]
fn seed_insere_os_4_status_padrao() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");

    let total: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM terminal_statuses", [], |r| r.get(0))
        .expect("contar terminal_statuses");
    assert_eq!(total, 4, "seed deve inserir exatamente 4 status");

    let mut ids: Vec<String> = db
        .conn()
        .prepare("SELECT id FROM terminal_statuses ORDER BY id")
        .expect("preparar consulta")
        .query_map([], |r| r.get(0))
        .expect("executar consulta")
        .collect::<Result<_, _>>()
        .expect("coletar ids");
    ids.sort();

    assert_eq!(
        ids,
        vec!["done", "needs_input", "needs_testing", "working"],
        "os 4 ids de status esperados devem estar presentes"
    );
}

#[test]
fn deletar_projeto_deixa_project_id_nulo_na_task() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");

    db.conn()
        .execute(
            "INSERT INTO projects (id, name, path, color, last_used)
             VALUES ('p1', 'SwarmDeck', 'D:\\ide', '#000000', 0)",
            [],
        )
        .expect("inserir projeto");

    db.conn()
        .execute(
            "INSERT INTO tasks
                 (title, status, project_id, terminal_id, created_at, updated_at)
             VALUES ('Tarefa', 'pending', 'p1', 't1', 0, 0)",
            [],
        )
        .expect("inserir task");

    db.conn()
        .execute("DELETE FROM projects WHERE id = 'p1'", [])
        .expect("deletar projeto");

    let (existe, project_id): (i64, Option<String>) = db
        .conn()
        .query_row(
            "SELECT COUNT(*), MAX(project_id) FROM tasks WHERE title = 'Tarefa'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("ler a task após o delete");

    assert_eq!(existe, 1, "a task deve sobreviver à exclusão do projeto");
    assert_eq!(
        project_id, None,
        "project_id deve ficar NULL após ON DELETE SET NULL"
    );
}

#[test]
fn insert_com_status_invalido_falha() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");

    let resultado = db.conn().execute(
        "INSERT INTO tasks (title, status, created_at, updated_at)
         VALUES ('Tarefa', 'bloqueada', 0, 0)",
        [],
    );

    assert!(
        resultado.is_err(),
        "o CHECK deve recusar status fora de \
         ('pending','in_progress','in_testing','completed')"
    );
}

#[test]
fn migracao_003_e_idempotente() {
    let (_dir, path) = temp_db_path();

    {
        let db = Db::open(&path).expect("primeira abertura");
        assert_eq!(db.schema_version().unwrap(), latest_schema_version());
    }

    // Segunda abertura sobre o mesmo arquivo: não deve reaplicar nada.
    let db = Db::open(&path).expect("segunda abertura");
    assert_eq!(db.schema_version().unwrap(), latest_schema_version());

    let aplicadas: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = 3",
            [],
            |r| r.get(0),
        )
        .expect("contar migração 3 aplicada");
    assert_eq!(
        aplicadas, 1,
        "reabrir o banco não pode registrar a migração 3 de novo"
    );

    let status_count: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM terminal_statuses", [], |r| r.get(0))
        .expect("contar terminal_statuses");
    assert_eq!(
        status_count, 4,
        "reabrir o banco não pode duplicar o seed de status"
    );
}
