//! Integration test for `TerminalMetaService::push_activity` log cap
//! (mcp-task-server/T4, MCP-04).
//!
//! Real SQLite file, not in-memory — same reasoning as `tests/task_service.rs`
//! and `tests/settings.rs`: the cut at 200 rows is a `DELETE` against the
//! real `terminal_activity` table, and belongs with the other db-backed
//! integration suites. Not parallel-safe — see `.specs/codebase/TESTING.md`.

use swarmdeck_lib::db::Db;
use swarmdeck_lib::terminal::TerminalMetaService;

fn temp_db_path() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("criar diretório temporário do banco");
    let path = dir.path().join("swarmdeck.db");
    (dir, path)
}

#[test]
fn mais_de_200_atividades_mantem_so_as_200_mais_recentes_em_ordem() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");
    let service = TerminalMetaService::new();

    let total = 250;
    for i in 0..total {
        service
            .push_activity(db.conn(), "t1", &format!("activity-{i}"))
            .expect("push_activity deve funcionar");
    }

    let count: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM terminal_activity WHERE terminal_id = 't1'",
            [],
            |r| r.get(0),
        )
        .expect("contar linhas de terminal_activity");
    assert_eq!(
        count, 200,
        "o log deve reter só as 200 entradas mais recentes"
    );

    let mut stmt = db
        .conn()
        .prepare("SELECT activity FROM terminal_activity WHERE terminal_id = 't1' ORDER BY id ASC")
        .expect("preparar select ordenado");
    let rows: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .expect("query_map")
        .collect::<Result<_, _>>()
        .expect("coletar linhas");

    // As 200 sobreviventes são as mais recentes: da atividade 50
    // (250 - 200) até a 249, em ordem cronológica.
    assert_eq!(rows.first().unwrap(), "activity-50");
    assert_eq!(rows.last().unwrap(), "activity-249");
    assert_eq!(rows.len(), 200);

    // A mais antiga que restou (activity-50) é mais nova que qualquer uma
    // que foi cortada (activity-0 .. activity-49).
    assert!(!rows.contains(&"activity-49".to_string()));
    assert!(!rows.contains(&"activity-0".to_string()));
}
