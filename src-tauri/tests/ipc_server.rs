// SPEC: mcp-task-server (MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08)

//! Integration tests for `IpcServer` (mcp-task-server/T5).
//!
//! Real named pipe / Unix socket, real `TerminalManager` sessions (spawns
//! actual PTYs, same reasoning as `tests/manager.rs`: a mock terminal
//! registry wouldn't prove the "session actually vive" check). Not
//! parallel-safe for two independent reasons per `.specs/codebase/TESTING.md`
//! (IPC endpoint + PTY spawn), so every test takes the same `serial()` guard
//! `tests/manager.rs` uses. Each test also binds its own uniquely-named
//! socket/pipe, so a leftover listener from a previous run (or from another
//! test file racing during `cargo test`'s default cross-binary parallelism)
//! can never collide with it.

use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

use interprocess::local_socket::traits::Stream as _;
use interprocess::local_socket::{GenericFilePath, Stream, ToFsName};

use swarmdeck_lib::db::Db;
use swarmdeck_lib::ipc::server::{read_frame, write_frame, IpcServer};
use swarmdeck_lib::ipc::transport::{socket_path, LocalSocketTransport};
use swarmdeck_lib::terminal::{SessionConfig, TerminalManager, TerminalMetaService, TitleSource};

/// Same serialization reasoning as `tests/manager.rs` / `tests/session.rs`:
/// concurrent real ConPTY/PTY spawns are flaky, so every test in this file
/// runs one at a time.
fn serial() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn default_config() -> SessionConfig {
    SessionConfig {
        cwd: std::env::temp_dir(),
        shell: None,
        agent: None,
        env: Default::default(),
    }
}

/// A unique socket/pipe name per test, so no two tests (in this file or any
/// other) can ever bind the same endpoint.
fn unique_name(label: &str) -> String {
    format!("swarmdeck-test-{label}-{}", uuid::Uuid::now_v7())
}

/// Everything a test needs to drive an `IpcServer` and also inspect/seed
/// the state it routes against directly (bypassing IPC) when a scenario
/// needs that — e.g. seeding `title_source: User` before asserting the
/// agent-facing `set_terminal_title` tool backs off.
struct SpawnedServer {
    name: String,
    manager: Arc<TerminalManager>,
    terminal_meta: Arc<TerminalMetaService>,
    db: Arc<Mutex<Db>>,
}

/// Binds an `IpcServer` on a uniquely-named transport and runs its accept
/// loop on a dedicated background thread — mirrors how `serve()` is meant
/// to be run (see its doc comment).
fn spawn_server(label: &str) -> SpawnedServer {
    let name = unique_name(label);
    let transport = LocalSocketTransport::bind(&name).expect("bind do transporte deve funcionar");
    let manager = Arc::new(TerminalManager::new());
    let terminal_meta = Arc::new(TerminalMetaService::new());
    let db = Arc::new(Mutex::new(
        Db::open_in_memory().expect("abrir banco em memória"),
    ));
    let server = Arc::new(IpcServer::new(
        Box::new(transport),
        Arc::clone(&manager),
        Arc::clone(&db),
        Arc::clone(&terminal_meta),
        Arc::new(|_info| {}), // sem AppHandle real em teste — ver server.rs para o teste de wiring
    ));

    std::thread::spawn(move || server.serve());
    // Dá tempo do accept loop entrar no primeiro accept() antes do teste
    // tentar conectar.
    std::thread::sleep(std::time::Duration::from_millis(50));

    SpawnedServer {
        name,
        manager,
        terminal_meta,
        db,
    }
}

fn connect(name: &str) -> Stream {
    let socket_name = socket_path(name)
        .to_fs_name::<GenericFilePath>()
        .expect("nome de socket válido");
    Stream::connect(socket_name).expect("cliente deve conseguir conectar ao servidor")
}

fn request(stream: &mut Stream, value: &serde_json::Value) -> serde_json::Value {
    let bytes = serde_json::to_vec(value).expect("serializar requisição");
    write_frame(stream, &bytes).expect("escrever o frame da requisição");

    let response_bytes = read_frame(stream)
        .expect("ler o frame da resposta")
        .expect("servidor não deve fechar a conexão após uma requisição válida");
    serde_json::from_slice(&response_bytes).expect("resposta deve ser JSON válido")
}

#[test]
fn cliente_conecta_e_recebe_resposta_bem_formada_de_volta() {
    let _g = serial();
    let SpawnedServer { name, .. } = spawn_server("conecta");

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": "qualquer", "tool": "uma_ferramenta_que_nao_existe", "args": {}}),
    );

    assert_eq!(
        response["ok"], false,
        "uma ferramenta não implementada ainda deve responder ok:false, não derrubar a conexão"
    );
    assert!(
        response["error"]
            .as_str()
            .unwrap_or_default()
            .contains("tool not implemented"),
        "a mensagem de erro deve nomear a ferramenta não implementada; recebido: {response}"
    );
}

#[test]
fn check_active_com_terminal_vivo_responde_ok_e_active_true() {
    let _g = serial();
    let SpawnedServer { name, manager, .. } = spawn_server("check-active-vivo");

    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "check_active", "args": {}}),
    );

    assert_eq!(
        response["ok"], true,
        "terminal vivo deve ser aceito; recebido: {response}"
    );
    assert_eq!(response["result"]["active"], true);
    assert_eq!(response["result"]["terminal_id"], terminal_id.to_string());

    manager.kill(terminal_id).expect("kill");
}

#[test]
fn check_active_com_terminal_que_nunca_existiu_e_recusado() {
    let _g = serial();
    let SpawnedServer { name, .. } = spawn_server("check-active-inexistente");

    let terminal_id_inexistente = uuid::Uuid::now_v7().to_string();

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id_inexistente, "tool": "check_active", "args": {}}),
    );

    assert_eq!(
        response["ok"], false,
        "terminal que nunca existiu deve ser recusado"
    );
    assert_eq!(response["error"], "unknown terminal");
}

#[test]
fn check_active_com_terminal_morto_e_recusado_dinamicamente() {
    let _g = serial();
    let SpawnedServer { name, manager, .. } = spawn_server("check-active-morto");

    // Prova que a checagem é dinâmica (estado atual), não uma lista fixa
    // capturada no momento em que o servidor subiu: o terminal esteve vivo,
    // foi morto, e só então a requisição chega.
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");
    manager.kill(terminal_id).expect("kill deve funcionar");

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "check_active", "args": {}}),
    );

    assert_eq!(response["ok"], false, "terminal morto deve ser recusado");
    assert_eq!(response["error"], "unknown terminal");
}

#[test]
fn cliente_desconecta_abruptamente_servidor_continua_aceitando_novas_conexoes() {
    let _g = serial();
    let SpawnedServer { name, .. } = spawn_server("desconexao-abrupta");

    {
        let mut stream = connect(&name);
        let response = request(
            &mut stream,
            &serde_json::json!({"terminal_id": "x", "tool": "check_active", "args": {}}),
        );
        assert_eq!(response["ok"], false); // "x" não é um uuid válido, então é recusado — o que importa aqui é a conexão em si, não o resultado
                                           // Fecha a conexão abruptamente, sem nenhum protocolo de encerramento
                                           // (apenas o drop do socket/pipe ao sair do escopo).
    }

    // O servidor não pode ter derrubado a accept loop por causa disso: uma
    // segunda conexão, totalmente nova, precisa funcionar normalmente.
    let mut segunda_stream = connect(&name);
    let segunda_resposta = request(
        &mut segunda_stream,
        &serde_json::json!({"terminal_id": "y", "tool": "check_active", "args": {}}),
    );
    assert_eq!(
        segunda_resposta["ok"], false,
        "a segunda conexão deve ser atendida normalmente, provando que o servidor sobreviveu"
    );
    assert_eq!(segunda_resposta["error"], "unknown terminal");
}

/// Confirma a implementação do framing em si (não coberta pelas rotas
/// acima, que já a exercitam indiretamente): duas mensagens em sequência na
/// mesma conexão, cada uma lida e respondida de forma independente — prova
/// de que o length-prefix delimita corretamente uma mensagem da próxima no
/// mesmo stream de bytes.
#[test]
fn duas_requisicoes_na_mesma_conexao_sao_delimitadas_corretamente() {
    let _g = serial();
    let SpawnedServer { name, manager, .. } = spawn_server("duas-requisicoes");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let mut stream = connect(&name);

    let primeira = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "check_active", "args": {}}),
    );
    assert_eq!(primeira["ok"], true);

    let segunda = request(
        &mut stream,
        &serde_json::json!({"terminal_id": "nao-e-um-uuid", "tool": "check_active", "args": {}}),
    );
    assert_eq!(segunda["ok"], false);
    assert_eq!(segunda["error"], "unknown terminal");

    manager.kill(terminal_id).expect("kill");
}

// ---- mcp-task-server/T7: routing for the other 15 tools -----------------
//
// The tests above (T5) only ever exercise `check_active` — the only tool
// that was really routed until now. These prove `IpcServer::route` really
// dispatches to `TaskService`/`TerminalMetaService`/`ProjectService`
// through the real socket, not just that the domain layer works in
// isolation (already covered by `tests/task_service.rs` and
// `tests/terminal_meta.rs`).

/// Full task lifecycle round trip, driven entirely over the IPC socket:
/// `create_task` -> `start_task` -> `complete_task` (in_progress ->
/// in_testing) -> `complete_task` again (in_testing -> completed). Matches
/// T7's `Verify`: "Ciclo completo criar→iniciar→concluir→concluir pela
/// interface MCP" (here: pela interface IPC que o MCP sidecar usa).
#[test]
fn ciclo_completo_create_start_complete_complete_via_ipc() {
    let _g = serial();
    let SpawnedServer { name, manager, .. } = spawn_server("ciclo-completo-task");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let mut stream = connect(&name);

    let created = request(
        &mut stream,
        &serde_json::json!({
            "terminal_id": terminal_id.to_string(),
            "tool": "create_task",
            "args": {"title": "Implementar roteamento MCP", "description": "via IPC"},
        }),
    );
    assert_eq!(
        created["ok"], true,
        "create_task deve funcionar; recebido: {created}"
    );
    assert_eq!(created["result"]["status"], "pending");
    assert_eq!(created["result"]["title"], "Implementar roteamento MCP");
    let task_id = created["result"]["id"]
        .as_i64()
        .expect("id da task deve ser um inteiro");

    let started = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "start_task", "args": {"task_id": task_id}}),
    );
    assert_eq!(started["ok"], true);
    assert_eq!(started["result"]["status"], "in_progress");

    let first_complete = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "complete_task", "args": {"task_id": task_id}}),
    );
    assert_eq!(first_complete["ok"], true);
    assert_eq!(
        first_complete["result"]["status"], "in_testing",
        "a primeira chamada de complete_task deve parar em in_testing, nunca ir direto a completed"
    );

    let second_complete = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "complete_task", "args": {"task_id": task_id}}),
    );
    assert_eq!(second_complete["ok"], true);
    assert_eq!(second_complete["result"]["status"], "completed");

    manager.kill(terminal_id).expect("kill");
}

/// `update_task_plan`/`update_task_implementation` round trip: both must
/// come back with the field written and `truncated: false` for
/// short text.
#[test]
fn update_task_plan_e_implementation_gravam_e_devolvem_truncated_false() {
    let _g = serial();
    let SpawnedServer { name, manager, .. } = spawn_server("update-plan-impl");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let mut stream = connect(&name);
    let created = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "create_task", "args": {"title": "Task"}}),
    );
    let task_id = created["result"]["id"].as_i64().unwrap();

    let plan_response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "update_task_plan", "args": {"task_id": task_id, "plan": "1. Fazer X"}}),
    );
    assert_eq!(plan_response["ok"], true);
    assert_eq!(plan_response["result"]["plan"], "1. Fazer X");
    assert_eq!(plan_response["result"]["truncated"], false);

    let impl_response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "update_task_implementation", "args": {"task_id": task_id, "implementation": "Feito"}}),
    );
    assert_eq!(impl_response["ok"], true);
    assert_eq!(impl_response["result"]["implementation"], "Feito");
    assert_eq!(impl_response["result"]["truncated"], false);

    manager.kill(terminal_id).expect("kill");
}

/// MCP-06 through the socket: a title already owned by `TitleSource::User`
/// (seeded directly on the shared `TerminalMetaService`, bypassing IPC —
/// there is no agent-facing tool for a *manual* rename) must win over a
/// subsequent agent `set_terminal_title` call.
#[test]
fn set_terminal_title_com_rename_manual_vencendo() {
    let _g = serial();
    let SpawnedServer {
        name,
        manager,
        terminal_meta,
        ..
    } = spawn_server("set-title-rename-manual");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    terminal_meta.set_title(
        &terminal_id.to_string(),
        "Nome do Usuário",
        TitleSource::User,
    );

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({
            "terminal_id": terminal_id.to_string(),
            "tool": "set_terminal_title",
            "args": {"title": "Nome do Agente", "long_title": "Descrição longa do agente"},
        }),
    );

    assert_eq!(
        response["ok"], true,
        "a ferramenta responde ok mesmo quando descarta; recebido: {response}"
    );
    assert_eq!(
        response["result"]["applied"], false,
        "um rename manual (title_source: user) deve vencer a chamada do agente"
    );
    assert_eq!(response["result"]["title_source"], "user");

    let meta = terminal_meta
        .get(&terminal_id.to_string())
        .expect("meta deve existir");
    assert_eq!(
        meta.title,
        Some("Nome do Usuário".to_string()),
        "o título do usuário não pode ter sido sobrescrito pela chamada do agente"
    );

    manager.kill(terminal_id).expect("kill");
}

/// Sem rename manual prévio, `set_terminal_title` do agente é aplicado
/// normalmente.
#[test]
fn set_terminal_title_do_agente_e_aplicado_sem_rename_manual_previo() {
    let _g = serial();
    let SpawnedServer {
        name,
        manager,
        terminal_meta,
        ..
    } = spawn_server("set-title-agente");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({
            "terminal_id": terminal_id.to_string(),
            "tool": "set_terminal_title",
            "args": {"title": "Minimize Terminals"},
        }),
    );

    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["applied"], true);
    assert_eq!(response["result"]["title_source"], "agent");

    let meta = terminal_meta
        .get(&terminal_id.to_string())
        .expect("meta deve existir");
    assert_eq!(meta.title, Some("Minimize Terminals".to_string()));

    manager.kill(terminal_id).expect("kill");
}

/// `set_terminal_status` com um id do catálogo, seguido de `"clear"`: o
/// segundo não passa pela validação de catálogo (não é um id real) e zera
/// o badge.
#[test]
fn set_terminal_status_com_clear_remove_o_badge() {
    let _g = serial();
    let SpawnedServer {
        name,
        manager,
        terminal_meta,
        ..
    } = spawn_server("set-status-clear");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let mut stream = connect(&name);

    let set_working = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "set_terminal_status", "args": {"status": "working"}}),
    );
    assert_eq!(set_working["ok"], true);
    assert_eq!(set_working["result"]["applied"], true);
    assert_eq!(set_working["result"]["status"], "working");
    assert_eq!(
        terminal_meta
            .get(&terminal_id.to_string())
            .unwrap()
            .status_id,
        Some("working".to_string())
    );

    let cleared = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "set_terminal_status", "args": {"status": "clear"}}),
    );
    assert_eq!(
        cleared["ok"], true,
        "clear deve responder ok:true; recebido: {cleared}"
    );
    assert_eq!(cleared["result"]["applied"], true);
    assert_eq!(cleared["result"]["status"], "clear");
    assert_eq!(
        terminal_meta
            .get(&terminal_id.to_string())
            .unwrap()
            .status_id,
        None,
        "clear deve zerar o status_id em memória"
    );

    manager.kill(terminal_id).expect("kill");
}

/// `set_terminal_status` com um id que não existe no catálogo é recusado
/// com uma resposta estruturada, listando os ids válidos.
#[test]
fn set_terminal_status_invalido_e_recusado_com_valid_statuses() {
    let _g = serial();
    let SpawnedServer { name, manager, .. } = spawn_server("set-status-invalido");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "set_terminal_status", "args": {"status": "nao-existe"}}),
    );

    assert_eq!(response["ok"], false);
    assert!(
        response["error"]
            .as_str()
            .unwrap_or_default()
            .contains("nao-existe"),
        "recebido: {response}"
    );
    let valid_statuses = response["valid_statuses"]
        .as_array()
        .expect("valid_statuses deve ser um array");
    let valid_statuses: Vec<&str> = valid_statuses.iter().map(|v| v.as_str().unwrap()).collect();
    assert!(valid_statuses.contains(&"working"));
    assert!(valid_statuses.contains(&"needs_input"));

    manager.kill(terminal_id).expect("kill");
}

/// `task_id` inexistente em `start_task`/`complete_task`/`update_task_plan`
/// chega ao chamador como uma resposta `ok:false` estruturada, nunca
/// derruba a conexão nem cria uma linha nova.
#[test]
fn task_id_inexistente_retorna_ok_false_estruturado_sem_derrubar_conexao() {
    let _g = serial();
    let SpawnedServer {
        name, manager, db, ..
    } = spawn_server("task-id-inexistente");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "complete_task", "args": {"task_id": 999999}}),
    );

    assert_eq!(response["ok"], false, "recebido: {response}");
    assert!(
        response["error"]
            .as_str()
            .unwrap_or_default()
            .contains("999999"),
        "a mensagem de erro deve nomear o id inexistente; recebido: {response}"
    );

    let count: i64 = db
        .lock()
        .unwrap()
        .conn()
        .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
        .expect("contar tasks");
    assert_eq!(
        count, 0,
        "task_id inexistente não pode ter criado nenhuma linha"
    );

    // A conexão sobrevive: uma segunda requisição na mesma conexão ainda
    // funciona normalmente.
    let segunda = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "check_active", "args": {}}),
    );
    assert_eq!(segunda["ok"], true);

    manager.kill(terminal_id).expect("kill");
}

/// `create_task` com um `terminal_id` que não é uma sessão viva é recusado
/// exatamente como `check_active` recusaria — sem criar nenhuma linha.
#[test]
fn create_task_com_terminal_desconhecido_e_recusado() {
    let _g = serial();
    let SpawnedServer { name, db, .. } = spawn_server("create-task-terminal-desconhecido");

    let terminal_id_inexistente = uuid::Uuid::now_v7().to_string();

    let mut stream = connect(&name);
    let response = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id_inexistente, "tool": "create_task", "args": {"title": "Task órfã"}}),
    );

    assert_eq!(response["ok"], false);
    assert_eq!(response["error"], "unknown terminal");

    let count: i64 = db
        .lock()
        .unwrap()
        .conn()
        .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
        .expect("contar tasks");
    assert_eq!(
        count, 0,
        "terminal desconhecido não pode ter criado nenhuma task"
    );
}

/// `get_projects`/`create_project`/`get_project_tasks`/`update_task_project`
/// round trip, provando MCP-08 pela interface IPC.
#[test]
fn projetos_round_trip_create_get_e_update_task_project() {
    let _g = serial();
    let SpawnedServer { name, manager, .. } = spawn_server("projetos-round-trip");
    let terminal_id = manager
        .spawn(default_config())
        .expect("spawn deve funcionar");
    let project_dir = tempfile::tempdir().expect("dir do projeto");

    let mut stream = connect(&name);

    let empty_projects = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "get_projects", "args": {}}),
    );
    assert_eq!(empty_projects["ok"], true);
    assert_eq!(empty_projects["result"].as_array().unwrap().len(), 0);

    let created_project = request(
        &mut stream,
        &serde_json::json!({
            "terminal_id": terminal_id.to_string(),
            "tool": "create_project",
            "args": {"name": "SwarmDeck", "path": project_dir.path().to_string_lossy()},
        }),
    );
    assert_eq!(created_project["ok"], true, "recebido: {created_project}");
    let project_id = created_project["result"]["id"]
        .as_str()
        .expect("project id")
        .to_string();

    let created_task = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "create_task", "args": {"title": "Task sem projeto ainda"}}),
    );
    let task_id = created_task["result"]["id"].as_i64().unwrap();
    // O `cwd` da sessão de teste (`default_config()`) não bate com
    // `project_dir`, então `create_task` deveria ter resolvido sem projeto.
    assert_eq!(
        created_task["result"]["project_id"],
        serde_json::Value::Null
    );

    let updated_task = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "update_task_project", "args": {"task_id": task_id, "project_id": project_id}}),
    );
    assert_eq!(updated_task["ok"], true, "recebido: {updated_task}");
    assert_eq!(updated_task["result"]["project_id"], project_id);

    let project_tasks = request(
        &mut stream,
        &serde_json::json!({"terminal_id": terminal_id.to_string(), "tool": "get_project_tasks", "args": {"project_id": project_id}}),
    );
    assert_eq!(project_tasks["ok"], true);
    let tasks = project_tasks["result"].as_array().expect("array de tasks");
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0]["id"], task_id);

    manager.kill(terminal_id).expect("kill");
}
