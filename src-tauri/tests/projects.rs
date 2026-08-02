//! Integration tests for `ProjectService` (projects/T1).
//!
//! Run against a real SQLite file, not in-memory — same reason as
//! `tests/db.rs`: a migration/service is only proven against the real
//! database. Directories used for project paths are real temp dirs too
//! (`tempfile::tempdir()`), since `create`/`update` validate existence on
//! disk. Not parallel-safe — see `.specs/codebase/TESTING.md`.

use swarmdeck_lib::db::Db;
use swarmdeck_lib::projects::service::{self, ProjectError};

fn temp_db_path() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("criar diretório temporário do banco");
    let path = dir.path().join("swarmdeck.db");
    (dir, path)
}

#[test]
fn create_com_diretorio_existente_devolve_projeto_com_cor() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let project_dir = tempfile::tempdir().expect("criar diretório do projeto");

    let project = service::create(db.conn(), "SwarmDeck", project_dir.path())
        .expect("create deve funcionar com nome e diretório válidos");

    assert_eq!(project.name, "SwarmDeck");
    assert!(!project.color.is_empty(), "cor deve ter sido atribuída");
    assert!(!project.id.is_empty());
    assert_eq!(project.last_used, None);
}

#[test]
fn create_com_diretorio_inexistente_e_recusado() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let project_dir = tempfile::tempdir().expect("criar diretório temporário");
    let inexistente = project_dir.path().join("nao-existe-de-verdade");

    let result = service::create(db.conn(), "Fantasma", &inexistente);

    match result {
        Err(ProjectError::PathNotFound(path)) => {
            assert_eq!(path, inexistente, "erro deve apontar o caminho recusado");
        }
        other => panic!("esperava PathNotFound, veio {other:?}"),
    }
}

#[test]
fn create_com_diretorio_ja_usado_e_recusado_apontando_dono() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let project_dir = tempfile::tempdir().expect("criar diretório do projeto");

    let dono = service::create(db.conn(), "Dono Original", project_dir.path())
        .expect("primeiro create deve funcionar");

    let result = service::create(db.conn(), "Segundo Nome", project_dir.path());

    match result {
        Err(ProjectError::PathAlreadyUsed {
            existing_id,
            existing_name,
            ..
        }) => {
            assert_eq!(existing_id, dono.id);
            assert_eq!(existing_name, "Dono Original");
        }
        other => panic!("esperava PathAlreadyUsed apontando o dono, veio {other:?}"),
    }
}

#[test]
fn dois_projetos_em_sequencia_recebem_cores_distintas() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let dir_a = tempfile::tempdir().expect("dir a");
    let dir_b = tempfile::tempdir().expect("dir b");

    let projeto_a = service::create(db.conn(), "A", dir_a.path()).expect("create A");
    let projeto_b = service::create(db.conn(), "B", dir_b.path()).expect("create B");

    assert_ne!(
        projeto_a.color, projeto_b.color,
        "o segundo projeto deve receber a próxima cor da paleta, não repetir a primeira"
    );
}

#[test]
fn depois_de_esgotar_a_paleta_a_proxima_cor_e_a_menos_usada() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");

    // A paleta tem 8 cores (documentado em service.rs). Cria 8 projetos —
    // um por cor — e mantém os TempDirs vivos até o fim do teste, senão o
    // diretório é apagado e a validação de existência do próximo create
    // falharia por um motivo errado.
    let mut dirs = Vec::new();
    let mut cores_das_8_primeiras = Vec::new();

    for i in 0..8 {
        let dir = tempfile::tempdir().unwrap_or_else(|_| panic!("dir {i}"));
        let projeto = service::create(db.conn(), &format!("Projeto {i}"), dir.path())
            .unwrap_or_else(|_| panic!("create {i}"));
        cores_das_8_primeiras.push(projeto.color);
        dirs.push(dir);
    }

    // 8 projetos, 8 cores da paleta: cada cor deve ter sido usada
    // exatamente uma vez, ou seja, todas distintas entre si.
    let mut distintas = cores_das_8_primeiras.clone();
    distintas.sort();
    distintas.dedup();
    assert_eq!(
        distintas.len(),
        8,
        "as 8 primeiras cores devem ser as 8 cores distintas da paleta"
    );

    // O 9º projeto força reciclagem: como todas as cores têm contagem 1,
    // o empate deve resolver para a primeira da paleta na ordem declarada —
    // que é exatamente a cor do primeiro projeto criado.
    let dir_9 = tempfile::tempdir().expect("dir 9");
    let projeto_9 =
        service::create(db.conn(), "Projeto 9", dir_9.path()).expect("create do 9º projeto");

    assert_eq!(
        projeto_9.color, cores_das_8_primeiras[0],
        "com a paleta esgotada e todas as cores empatadas em uso, a reciclagem \
         deve pegar a primeira cor da paleta na ordem declarada"
    );
}

#[test]
fn update_muda_campos_e_join_com_tasks_reflete_a_mudanca() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let dir_original = tempfile::tempdir().expect("dir original");
    let dir_novo = tempfile::tempdir().expect("dir novo");

    let projeto =
        service::create(db.conn(), "Nome Antigo", dir_original.path()).expect("create do projeto");

    // Task vinculada via SQL direto, como o brief pede — sem passar pelo
    // service de tasks, que não é o alvo deste teste.
    db.conn()
        .execute(
            "INSERT INTO tasks (title, status, project_id, terminal_id, created_at, updated_at)
             VALUES ('Tarefa vinculada', 'pending', ?1, 't1', 0, 0)",
            rusqlite::params![projeto.id],
        )
        .expect("inserir task vinculada");

    let atualizado = service::update(
        db.conn(),
        &projeto.id,
        Some("Nome Novo"),
        Some(dir_novo.path()),
        Some("#000000"),
    )
    .expect("update deve funcionar");

    assert_eq!(atualizado.name, "Nome Novo");
    assert_eq!(atualizado.color, "#000000");

    // A prova de "propagação" pedida no brief: a task não guarda nome/cor
    // duplicado nenhum, então o SELECT com JOIN precisa refletir os campos
    // atuais do projeto, não os de quando a task foi criada.
    let (nome_via_join, cor_via_join): (String, String) = db
        .conn()
        .query_row(
            "SELECT p.name, p.color
             FROM tasks t JOIN projects p ON p.id = t.project_id
             WHERE t.title = 'Tarefa vinculada'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("ler projeto da task via join");

    assert_eq!(nome_via_join, "Nome Novo");
    assert_eq!(cor_via_join, "#000000");
}

// Bug real encontrado por mcp-task-server/T3: `Path::canonicalize()` no
// Windows devolve o formato verbatim/extended-length (`\\?\C:\...`), que
// quebra `projects::resolve::resolve` (nenhum `cwd` real carrega o prefixo
// `\\?\`, então a comparação por componentes nunca casa nem em match
// exato). Só existe no Windows — em outras plataformas `canonicalize` nunca
// produz esse prefixo, então o teste é `#[cfg(windows)]` para não ficar
// vazio/trivial no CI (ubuntu-22.04).
#[cfg(windows)]
#[test]
fn create_em_diretorio_real_nao_grava_prefixo_verbatim_do_windows() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let project_dir = tempfile::tempdir().expect("criar diretório do projeto");

    let project = service::create(db.conn(), "SwarmDeck", project_dir.path())
        .expect("create deve funcionar com diretório válido");

    assert!(
        !project.path.starts_with(r"\\?\"),
        "path gravado não pode carregar o prefixo verbatim do Windows: {}",
        project.path
    );
}

#[test]
fn delete_de_projeto_com_2_tasks_conta_2_e_desvincula_sem_apagar() {
    let (_db_dir, db_path) = temp_db_path();
    let db = Db::open(&db_path).expect("abrir banco novo");
    let dir = tempfile::tempdir().expect("dir do projeto");

    let projeto =
        service::create(db.conn(), "Projeto com tasks", dir.path()).expect("create do projeto");

    for i in 0..2 {
        db.conn()
            .execute(
                "INSERT INTO tasks (title, status, project_id, terminal_id, created_at, updated_at)
                 VALUES (?1, 'pending', ?2, 't1', 0, 0)",
                rusqlite::params![format!("Tarefa {i}"), projeto.id],
            )
            .unwrap_or_else(|_| panic!("inserir tarefa {i}"));
    }

    let afetadas = service::delete(db.conn(), &projeto.id).expect("delete deve funcionar");
    assert_eq!(afetadas, 2, "delete deve contar as 2 tarefas vinculadas");

    let total_tasks: i64 = db
        .conn()
        .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
        .expect("contar tasks após delete");
    assert_eq!(total_tasks, 2, "as tarefas não podem ser apagadas");

    let com_project_id_nulo: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE project_id IS NULL",
            [],
            |r| r.get(0),
        )
        .expect("contar tasks sem projeto");
    assert_eq!(
        com_project_id_nulo, 2,
        "as 2 tarefas devem ficar com project_id NULL após o delete"
    );
}
