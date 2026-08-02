//! Testes de integração das preferências de atualização (T14).
//!
//! Rodam contra arquivo SQLite real, não in-memory — mesmo motivo do
//! `tests/db.rs`: uma migração só está validada contra o banco de verdade.
//! Por isso também não são paralelizáveis — ver `.specs/codebase/TESTING.md`.

use swarmdeck_lib::db::{auto_check, is_version_skipped, skip_version, Db};

fn temp_db_path() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("criar diretório temporário");
    let path = dir.path().join("swarmdeck.db");
    (dir, path)
}

#[test]
fn auto_check_nasce_ligado_num_banco_novo() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");

    assert!(
        auto_check(db.conn()).expect("ler auto_check"),
        "auto_check deve nascer ligado (REL-34)"
    );
}

#[test]
fn versao_pulada_persiste_e_e_lida_de_volta() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco");

    skip_version(db.conn(), "0.1.3").expect("pular 0.1.3");

    assert!(
        is_version_skipped(db.conn(), "0.1.3").expect("ler 0.1.3"),
        "0.1.3 deve estar marcada como pulada depois de skip_version"
    );
}

#[test]
fn pular_uma_versao_nao_afeta_outra_versao() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco");

    skip_version(db.conn(), "0.1.3").expect("pular 0.1.3");

    assert!(
        !is_version_skipped(db.conn(), "0.1.4").expect("ler 0.1.4"),
        "pular 0.1.3 não pode marcar 0.1.4 como pulada (REL-23)"
    );
}

#[test]
fn migracao_de_settings_e_idempotente() {
    let (_dir, path) = temp_db_path();

    {
        let db = Db::open(&path).expect("primeira abertura");
        assert_eq!(db.schema_version().unwrap(), 4);
    }

    // Segunda abertura sobre o mesmo arquivo: não deve reaplicar nada.
    let db = Db::open(&path).expect("segunda abertura");
    assert_eq!(db.schema_version().unwrap(), 4);

    let linhas: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM update_settings", [], |r| r.get(0))
        .expect("contar linhas de update_settings");

    assert_eq!(
        linhas, 1,
        "reabrir o banco não pode duplicar a linha única de update_settings"
    );

    let aplicadas: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = 2",
            [],
            |r| r.get(0),
        )
        .expect("contar migração 2 aplicada");

    assert_eq!(
        aplicadas, 1,
        "reabrir o banco não pode registrar a migração 2 de novo"
    );
}
