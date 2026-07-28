//! Testes de integração da camada de banco (T2).
//!
//! Rodam contra arquivo SQLite real, não in-memory: uma migração que só
//! foi validada em memória não está validada. Por isso também não são
//! paralelizáveis — ver `.specs/codebase/TESTING.md`.

use swarmdeck_lib::db::Db;

fn temp_db_path() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("criar diretório temporário");
    let path = dir.path().join("swarmdeck.db");
    (dir, path)
}

#[test]
fn aplica_migracoes_em_banco_novo() {
    let (_dir, path) = temp_db_path();

    let db = Db::open(&path).expect("abrir banco novo");

    assert_eq!(
        db.schema_version().expect("ler versão"),
        1,
        "banco novo deve chegar na versão mais recente"
    );
    assert!(path.exists(), "o arquivo do banco deve ter sido criado");
}

#[test]
fn migracao_e_idempotente() {
    let (_dir, path) = temp_db_path();

    {
        let db = Db::open(&path).expect("primeira abertura");
        assert_eq!(db.schema_version().unwrap(), 1);
    }

    // Segunda abertura sobre o mesmo arquivo: não deve reaplicar nada.
    let db = Db::open(&path).expect("segunda abertura");
    assert_eq!(db.schema_version().unwrap(), 1);

    let aplicadas: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| r.get(0))
        .expect("contar migrações");

    assert_eq!(
        aplicadas, 1,
        "reabrir o banco não pode registrar a mesma migração de novo"
    );
}

#[test]
fn cria_o_schema_de_terminal_layout() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco");

    let existe: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name = 'terminal_layout'",
            [],
            |r| r.get(0),
        )
        .expect("consultar sqlite_master");
    assert_eq!(existe, 1, "tabela terminal_layout deve existir");

    // Uma inserção válida prova que as colunas e defaults batem com o design.
    db.conn()
        .execute(
            "INSERT INTO terminal_layout (id, slot, frac_w, frac_h, cwd, updated_at)
             VALUES ('t1', 0, 0.5, 1.0, 'D:\\ide', 0)",
            [],
        )
        .expect("inserir linha válida");

    let (title_source, minimized): (String, i64) = db
        .conn()
        .query_row(
            "SELECT title_source, minimized FROM terminal_layout WHERE id = 't1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("ler a linha inserida");

    assert_eq!(title_source, "agent", "default de title_source é 'agent'");
    assert_eq!(minimized, 0, "default de minimized é 0");
}

#[test]
fn title_source_so_aceita_agent_ou_user() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco");

    let resultado = db.conn().execute(
        "INSERT INTO terminal_layout
             (id, slot, frac_w, frac_h, cwd, title_source, updated_at)
         VALUES ('t2', 0, 0.5, 1.0, 'D:\\ide', 'sistema', 0)",
        [],
    );

    assert!(
        resultado.is_err(),
        "o CHECK deve recusar title_source fora de ('agent','user') — \
         é o que sustenta a regra de que rename manual vence o agente"
    );
}

#[test]
fn registra_a_versao_aplicada() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco");

    let (version, applied_at): (i64, i64) = db
        .conn()
        .query_row(
            "SELECT version, applied_at FROM schema_migrations WHERE version = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("ler registro da migração");

    assert_eq!(version, 1);
    assert!(applied_at > 0, "applied_at deve ter timestamp real");
}
