// SPEC: agent-selection (AGT-03, AGT-04)

//! Testes de integração de `agent-selection/T2` — lançamento do agente na
//! sessão.
//!
//! Ficam em arquivo próprio (e não em `tests/manager.rs`) porque testam a
//! ponte nova entre `TerminalManager::spawn` e
//! `agents::launch::resolve_launch_command`, não a mecânica de PTY em si —
//! essa já está coberta por `tests/manager.rs`.
//!
//! Um teste aqui não pode assumir se o CLI de um agente do catálogo real
//! (`claude`, `codex` etc.) está instalado na máquina que roda a suíte —
//! isso varia entre a máquina de desenvolvimento e o runner de CI. Por isso
//! `sessao_com_agente_usa_a_mesma_resolucao_de_resolve_launch_command`
//! verifica **consistência** entre o que `resolve_launch_command` decide e
//! o que `TerminalManager::spawn` de fato guarda, em vez de fixar um
//! resultado esperado.
//!
//! Spawnam PTY real, então seguem a mesma regra de serialização de
//! `manager.rs`: não paralelizáveis (ConPTY/openpty real).

use std::sync::{Mutex, MutexGuard, OnceLock};

use swarmdeck_lib::agents::resolve_launch_command;
use swarmdeck_lib::terminal::{SessionConfig, TerminalManager};

/// Serializa os testes de PTY — mesmo motivo de `tests/manager.rs`.
fn serial() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Isola o `PATH` do processo para a duração do teste, restaurando-o ao
/// sair de escopo (mesmo em pânico). `trocar_agente_pedido_nao_afeta_sessao_ja_aberta`
/// só quer provar persistência do campo `agent` na `Entry` — não pode
/// depender do que a máquina que roda a suíte tem instalado (numa máquina
/// real, `codex` por exemplo pode resolver a um shim do npm sem extensão
/// que o Windows recusa executar diretamente; isso é uma característica de
/// `detect_installed`/`portable-pty`, não algo que este teste deveria
/// exercitar).
struct PathIsoladoGuard {
    original: Option<String>,
    _dir: tempfile::TempDir,
}

impl PathIsoladoGuard {
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("tempdir para isolar o PATH");
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

fn default_config() -> SessionConfig {
    SessionConfig {
        cwd: std::env::temp_dir(),
        shell: None,
        agent: None,
        session_id: None,
        resume: false,
        permission_mode: None,
        env: Default::default(),
    }
}

/// Prova que `TerminalManager::spawn` realmente delega a decisão de qual
/// comando lançar para `resolve_launch_command`, em vez de ignorá-la — sem
/// depender de qual CLI está instalado na máquina que roda o teste.
///
/// Chama `resolve_launch_command` diretamente com o mesmo `agent_id` que
/// `spawn` recebe; os dois precisam concordar sobre se houve aviso (e, se
/// houve, sobre o texto). Como o spawn nunca falha por causa de um agente
/// ausente (AGT-04), isto cobre tanto "lança o agente" (quando a máquina
/// tem o CLI) quanto "CLI ausente cai para shell com aviso" (quando não
/// tem) — o mesmo teste vale nos dois cenários.
#[test]
fn sessao_com_agente_usa_a_mesma_resolucao_de_resolve_launch_command() {
    let _g = serial();
    let agent_id = "claude-code";
    let esperado = resolve_launch_command(Some(agent_id), None, None);

    let manager = TerminalManager::new();
    let cfg = SessionConfig {
        agent: Some(agent_id.to_string()),
        ..default_config()
    };
    let id = manager
        .spawn(cfg)
        .expect("spawn nunca deve falhar por causa de um agente ausente do PATH");

    let snapshot = manager
        .list()
        .into_iter()
        .find(|s| s.id == id)
        .expect("a sessão recém-criada deve aparecer em list()");

    assert_eq!(
        snapshot.launch_warning, esperado.warning,
        "o aviso exposto pela sessão precisa bater com o que resolve_launch_command \
         decidiu para o mesmo agent_id — senão spawn() não está usando a resolução"
    );
    assert_eq!(snapshot.agent, Some(agent_id.to_string()));
    assert_eq!(snapshot.cwd, std::env::temp_dir());

    manager.kill(id).expect("kill");
}

/// AGT-03: sobrescrita por sessão. "Trocar o agente padrão" não existe como
/// estado persistente nesta task — é só o argumento passado a cada `spawn`.
/// Simula a troca spawnando uma segunda sessão com outro agente e confirma
/// que a primeira, já aberta, mantém o agente com que foi criada.
#[test]
fn trocar_agente_pedido_nao_afeta_sessao_ja_aberta() {
    let _g = serial();
    let _path = PathIsoladoGuard::new();
    let manager = TerminalManager::new();

    let cfg_a = SessionConfig {
        agent: Some("claude-code".to_string()),
        ..default_config()
    };
    let id_a = manager.spawn(cfg_a).expect("spawn sessão A");

    let agente_a_antes = manager
        .list()
        .into_iter()
        .find(|s| s.id == id_a)
        .expect("sessão A deve estar listada")
        .agent;
    assert_eq!(agente_a_antes, Some("claude-code".to_string()));

    // "Muda o agente padrão": nova sessão pedindo um agente diferente.
    let cfg_b = SessionConfig {
        agent: Some("codex-cli".to_string()),
        ..default_config()
    };
    let id_b = manager.spawn(cfg_b).expect("spawn sessão B");

    let lista = manager.list();
    let entrada_a = lista
        .iter()
        .find(|s| s.id == id_a)
        .expect("sessão A ainda deve existir");
    let entrada_b = lista
        .iter()
        .find(|s| s.id == id_b)
        .expect("sessão B deve existir");

    assert_eq!(
        entrada_a.agent,
        Some("claude-code".to_string()),
        "spawnar uma sessão nova com outro agente não pode mudar o agente \
         de uma sessão A já aberta"
    );
    assert_eq!(entrada_b.agent, Some("codex-cli".to_string()));

    manager.kill(id_a).expect("kill A");
    manager.kill(id_b).expect("kill B");
}
