//! Testes de integração da persistência de layout (T11).
//!
//! Rodam contra SQLite real via `Db::open`, como `db.rs` — ver
//! `.specs/codebase/TESTING.md`.

use swarmdeck_lib::db::Db;
use swarmdeck_lib::terminal::layout::{restore, save};
use swarmdeck_lib::terminal::LayoutEntry;

fn temp_db() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().expect("criar diretório temporário");
    let path = dir.path().join("swarmdeck.db");
    let db = Db::open(&path).expect("abrir banco");
    (dir, db)
}

fn entry(id: &str, slot: i64, cwd: &str) -> LayoutEntry {
    LayoutEntry {
        id: id.to_string(),
        slot,
        frac_w: 0.5,
        frac_h: 1.0,
        cwd: cwd.to_string(),
        agent_id: None,
        title: None,
        title_source: "agent".to_string(),
        minimized: false,
        updated_at: 1_700_000_000,
        cwd_fallback_from: None,
    }
}

#[test]
fn salva_e_substitui_o_estado_anterior() {
    let (dir, db) = temp_db();
    let cwd = dir.path().to_string_lossy().into_owned();

    save(&db, &[entry("velho", 0, &cwd)]).expect("primeira gravação");
    save(&db, &[entry("novo", 0, &cwd)]).expect("segunda gravação substitui a primeira");

    let contagem: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM terminal_layout", [], |r| r.get(0))
        .expect("contar linhas");
    assert_eq!(
        contagem, 1,
        "save() deve substituir o layout anterior por completo, não fazer merge"
    );

    let id: String = db
        .conn()
        .query_row("SELECT id FROM terminal_layout", [], |r| r.get(0))
        .expect("ler id restante");
    assert_eq!(id, "novo", "a linha antiga deve ter sido apagada");
}

#[test]
fn restaura_com_mesmos_cwd_e_fracoes() {
    let (dir, db) = temp_db();
    let cwd = dir.path().to_string_lossy().into_owned();
    let home = std::env::temp_dir();

    let salvos = vec![
        LayoutEntry {
            frac_w: 0.3,
            ..entry("t1", 0, &cwd)
        },
        LayoutEntry {
            frac_w: 0.7,
            ..entry("t2", 1, &cwd)
        },
    ];
    save(&db, &salvos).expect("salvar layout 2x1");

    let restaurados = restore(&db, &home).expect("restaurar layout");

    assert_eq!(restaurados.len(), 2);
    assert_eq!(restaurados[0].id, "t1");
    assert_eq!(restaurados[0].cwd, cwd, "cwd deve bater com o que foi salvo");
    assert_eq!(restaurados[0].frac_w, 0.3, "fração deve bater com o que foi salvo");
    assert_eq!(restaurados[1].id, "t2");
    assert_eq!(restaurados[1].frac_w, 0.7);
}

#[test]
fn cwd_inexistente_cai_para_home_e_sinaliza_o_diretorio_sumido() {
    let (_dir, db) = temp_db();
    let home = std::env::temp_dir();
    let cwd_sumido = "D:\\este\\caminho\\nao\\existe\\swarmdeck-teste";

    save(&db, &[entry("t1", 0, cwd_sumido)]).expect("salvar com cwd que não existe");

    let restaurados = restore(&db, &home).expect("restaurar");

    assert_eq!(restaurados.len(), 1);
    assert_eq!(
        restaurados[0].cwd,
        home.to_string_lossy(),
        "cwd sumido deve cair para home"
    );
    assert_eq!(
        restaurados[0].cwd_fallback_from.as_deref(),
        Some(cwd_sumido),
        "o diretório original precisa ser nomeado para o aviso ao usuário"
    );
}

#[test]
fn banco_vazio_restaura_um_unico_terminal_em_home() {
    let (_dir, db) = temp_db();
    let home = std::env::temp_dir();

    let restaurados = restore(&db, &home).expect("restaurar banco vazio");

    assert_eq!(
        restaurados.len(),
        1,
        "sem layout salvo, o app deve abrir com exatamente 1 terminal"
    );
    assert_eq!(restaurados[0].cwd, home.to_string_lossy());
    assert!(
        restaurados[0].cwd_fallback_from.is_none(),
        "não houve fallback — o padrão já nasce em home"
    );
}
