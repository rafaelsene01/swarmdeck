//! Testes de integração de `agent-selection/T3` — preferência de agente
//! padrão (AGT-01).
//!
//! Banco real (não in-memory), mesmo motivo de `tests/settings.rs`: a
//! migração só está provada contra o arquivo de verdade, e a persistência
//! entre reinícios exige reabrir o mesmo arquivo.
//!
//! Dois dos quatro testes isolam o `PATH` do processo para controlar quais
//! agentes do catálogo real aparecem como instalados, sem depender do que a
//! máquina que roda a suíte tem de fato instalado — mesma técnica de
//! `tests/agent_launch.rs::PathIsoladoGuard`. Como mutar `PATH` é estado do
//! processo inteiro (este arquivo compila para um binário de teste próprio,
//! rodado à parte de `agent_launch.rs`), os dois ficam serializados entre si
//! por um mutex local; os outros dois testes não tocam `PATH` e não
//! precisam do lock.

use std::sync::{Mutex, MutexGuard, OnceLock};

use swarmdeck_lib::agents::{default_agent, resolve_effective_default, set_default_agent};
use swarmdeck_lib::db::Db;

fn temp_db_path() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("criar diretório temporário");
    let path = dir.path().join("swarmdeck.db");
    (dir, path)
}

/// Serializa os testes que mexem no `PATH` do processo.
fn path_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Isola o `PATH` do processo para a duração do teste, restaurando-o ao
/// sair de escopo (mesmo em pânico).
struct PathIsoladoGuard {
    original: Option<String>,
    _dir: tempfile::TempDir,
}

impl PathIsoladoGuard {
    /// Cria um diretório temporário com um único binário falso (`codex`,
    /// extensão `.exe`) e o coloca como `PATH` inteiro do processo — assim
    /// só `codex-cli` resolve como instalado, e todo o resto do catálogo
    /// real (`claude-code`, `antigravity-cli`, `opencode`, `kimi-code`) fica
    /// ausente. Não porque a máquina não os tenha — porque o teste controla
    /// o PATH inteiro, então não importa o que está instalado de verdade.
    fn with_only_codex_instalado() -> Self {
        let dir = tempfile::tempdir().expect("tempdir para isolar o PATH");
        std::fs::write(dir.path().join("codex.exe"), b"").expect("criar binário falso");
        let original = std::env::var("PATH").ok();
        std::env::set_var("PATH", dir.path());
        Self {
            original,
            _dir: dir,
        }
    }
}

impl Drop for PathIsoladoGuard {
    fn drop(&mut self) {
        match &self.original {
            Some(v) => std::env::set_var("PATH", v),
            None => std::env::remove_var("PATH"),
        }
    }
}

#[test]
fn grava_e_le_de_volta_na_mesma_sessao() {
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");

    assert_eq!(
        default_agent(db.conn()).expect("ler antes de gravar"),
        None,
        "banco novo nasce sem preferência gravada"
    );

    set_default_agent(db.conn(), "claude-code").expect("gravar preferência");

    assert_eq!(
        default_agent(db.conn()).expect("ler depois de gravar"),
        Some("claude-code".to_string())
    );
}

#[test]
fn padrao_persiste_entre_reinicios() {
    let (_dir, path) = temp_db_path();

    {
        let db = Db::open(&path).expect("primeira abertura");
        set_default_agent(db.conn(), "opencode").expect("gravar preferência");
    }

    // Segunda abertura sobre o mesmo arquivo: o valor gravado na abertura
    // anterior precisa continuar lá.
    let db = Db::open(&path).expect("reabrir o mesmo arquivo");
    assert_eq!(
        default_agent(db.conn()).expect("ler após reabrir"),
        Some("opencode".to_string()),
        "reabrir o banco deve manter o valor gravado (AGT-01)"
    );
}

#[test]
fn sem_preferencia_gravada_usa_o_primeiro_agente_instalado() {
    let _lock = path_lock();
    let _path_guard = PathIsoladoGuard::with_only_codex_instalado();

    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");

    let resolved = resolve_effective_default(db.conn()).expect("resolver padrão efetivo");

    assert_eq!(
        resolved.agent_id,
        Some("codex-cli".to_string()),
        "sem preferência, deve cair para o primeiro agente instalado na ordem do catálogo \
         (claude-code vem antes mas não está instalado neste PATH isolado; codex-cli está)"
    );
    assert!(
        !resolved.fell_back,
        "sem preferência gravada não é um fallback, é o comportamento de primeiro uso"
    );
}

#[test]
fn agente_padrao_removido_do_sistema_cai_para_o_primeiro_disponivel_e_avisa() {
    let _lock = path_lock();
    let (_dir, path) = temp_db_path();
    let db = Db::open(&path).expect("abrir banco novo");

    set_default_agent(db.conn(), "claude-code").expect("gravar preferência");

    // Só depois de gravar a preferência isolamos o PATH — set_default_agent
    // não depende do catálogo nem do PATH, só do banco.
    let _path_guard = PathIsoladoGuard::with_only_codex_instalado();

    let resolved = resolve_effective_default(db.conn()).expect("resolver padrão efetivo");

    assert_eq!(
        resolved.agent_id,
        Some("codex-cli".to_string()),
        "claude-code não está mais instalado neste PATH isolado; deve cair para codex-cli"
    );
    assert!(
        resolved.fell_back,
        "preferência gravada que não pôde ser honrada precisa sinalizar o fallback"
    );
}
