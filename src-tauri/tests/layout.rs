// SPEC: multi-terminal (TERM-07), terminal-layout-options (LAYOUT-22, LAYOUT-23, LAYOUT-24, LAYOUT-27)

//! Testes de integração da persistência do workspace de terminais.
//!
//! Rodam contra SQLite real via `Db::open`, como `db.rs` — ver
//! `.specs/codebase/TESTING.md`.

use swarmdeck_lib::db::Db;
use swarmdeck_lib::terminal::layout::{restore, save, TabEntry};
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
        agent_session_id: None,
        permission_mode: None,
        title: None,
        title_source: "agent".to_string(),
        minimized: false,
        updated_at: 1_700_000_000,
        cwd_fallback_from: None,
    }
}

fn tab(id: &str, terminals: Vec<LayoutEntry>) -> TabEntry {
    TabEntry {
        id: id.to_string(),
        slot: 0,
        name: "Aba 1".to_string(),
        layout_mode: "horizontal".to_string(),
        layout_span: "first".to_string(),
        terminals,
    }
}

#[test]
fn salva_e_substitui_o_estado_anterior() {
    let (dir, db) = temp_db();
    let cwd = dir.path().to_string_lossy().into_owned();

    save(&db, &[tab("aba-velha", vec![entry("velho", 0, &cwd)])]).expect("primeira gravação");
    save(&db, &[tab("aba-nova", vec![entry("novo", 0, &cwd)])])
        .expect("segunda gravação substitui a primeira");

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

    let abas: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM terminal_tabs", [], |r| r.get(0))
        .expect("contar abas");
    assert_eq!(abas, 1, "a aba antiga também deve ter sido apagada");
}

#[test]
fn restaura_com_mesmos_cwd_e_fracoes() {
    let (dir, db) = temp_db();
    let cwd = dir.path().to_string_lossy().into_owned();
    let home = std::env::temp_dir();

    let salvos = vec![tab(
        "aba-1",
        vec![
            LayoutEntry {
                frac_w: 0.3,
                ..entry("t1", 0, &cwd)
            },
            LayoutEntry {
                frac_w: 0.7,
                ..entry("t2", 1, &cwd)
            },
        ],
    )];
    save(&db, &salvos).expect("salvar layout 2x1");

    let restaurados = restore(&db, &home).expect("restaurar layout");

    assert_eq!(restaurados.len(), 1);
    let terminais = &restaurados[0].terminals;
    assert_eq!(terminais.len(), 2);
    assert_eq!(terminais[0].id, "t1");
    assert_eq!(terminais[0].cwd, cwd, "cwd deve bater com o que foi salvo");
    assert_eq!(
        terminais[0].frac_w, 0.3,
        "fração deve bater com o que foi salvo"
    );
    assert_eq!(terminais[1].id, "t2");
    assert_eq!(terminais[1].frac_w, 0.7);
}

#[test]
fn cwd_inexistente_cai_para_home_e_sinaliza_o_diretorio_sumido() {
    let (_dir, db) = temp_db();
    let home = std::env::temp_dir();
    let cwd_sumido = "D:\\este\\caminho\\nao\\existe\\swarmdeck-teste";

    save(&db, &[tab("aba-1", vec![entry("t1", 0, cwd_sumido)])])
        .expect("salvar com cwd que não existe");

    let restaurados = restore(&db, &home).expect("restaurar");

    assert_eq!(restaurados.len(), 1);
    let terminal = &restaurados[0].terminals[0];
    assert_eq!(
        terminal.cwd,
        home.to_string_lossy(),
        "cwd sumido deve cair para home"
    );
    assert_eq!(
        terminal.cwd_fallback_from.as_deref(),
        Some(cwd_sumido),
        "o diretório original precisa ser nomeado para o aviso ao usuário"
    );
}

/// LAYOUT-24 revoga o comportamento antigo deste teste ("banco vazio restaura
/// um único terminal em home"): sem workspace salvo o app abre com uma aba
/// vazia e o `EmptyState`, então `restore` não pode inventar terminal nenhum.
#[test]
fn banco_vazio_restaura_workspace_vazio() {
    let (_dir, db) = temp_db();
    let home = std::env::temp_dir();

    let restaurados = restore(&db, &home).expect("restaurar banco vazio");

    assert!(
        restaurados.is_empty(),
        "sem workspace salvo, restore não deve inventar aba nem terminal"
    );
}
