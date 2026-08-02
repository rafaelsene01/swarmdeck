// SPEC: mcp-task-server (MCP-04, MCP-05, MCP-06)

//! `TerminalMetaService`: metadados de sessão por terminal — título e status
//! atual — mais o log de atividade.
//!
//! Segue o mesmo padrão de `TerminalManager` (`terminal::manager`): estado
//! vivo num `Mutex<HashMap<...>>`, recuperado de poison pelo `lock()`
//! interno. Só duas operações tocam o banco:
//!
//! - `push_activity` grava uma linha em `terminal_activity` a cada chamada
//!   (o log sobrevive a restart) e poda o que passar de
//!   [`ACTIVITY_LOG_CAP`] entradas para aquele terminal;
//! - `set_status` lê o catálogo `terminal_statuses` para validar o
//!   `status_id` pedido contra os habilitados.
//!
//! Título e status ATUAIS de um terminal não têm coluna própria em nenhuma
//! tabela — ficam só em memória, de propósito: são sinal de sessão, não
//! precisam sobreviver a um restart do app (ver design.md,
//! `mcp-task-server`). A persistência de título em `terminal_layout` é
//! responsabilidade de outra feature (`multi-terminal/T11`) e está fora do
//! escopo deste serviço.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension};

/// Máximo de linhas de `terminal_activity` retidas por terminal. Acima
/// disso, `push_activity` apaga as mais antigas na mesma chamada que insere
/// a nova, mantendo só as `ACTIVITY_LOG_CAP` mais recentes.
const ACTIVITY_LOG_CAP: i64 = 200;

/// Origem do título atual de um terminal. Decide quem vence em
/// `set_title` (MCP-06): um rename manual do usuário nunca é sobrescrito
/// por uma chamada do agente.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TitleSource {
    #[default]
    Agent,
    User,
}

/// Retrato em memória do que se sabe sobre um terminal.
#[derive(Debug, Clone, Default)]
pub struct TerminalMeta {
    pub title: Option<String>,
    pub title_source: TitleSource,
    pub status_id: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum MetaError {
    /// `status_id` não existe no catálogo ou existe mas está desabilitado.
    /// As duas situações são indistinguíveis do ponto de vista de quem
    /// chama — a mensagem sempre lista os ids atualmente válidos.
    #[error("status `{status_id}` inválido; ids habilitados: {valid_ids}")]
    InvalidStatus {
        status_id: String,
        valid_ids: String,
    },
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
}

#[derive(Default)]
pub struct TerminalMetaService {
    entries: Mutex<HashMap<String, TerminalMeta>>,
}

impl TerminalMetaService {
    pub fn new() -> Self {
        Self::default()
    }

    /// Define o título de um terminal.
    ///
    /// MCP-06: se o título atual daquele terminal já veio de `User`, uma
    /// chamada com `source: Agent` é descartada silenciosamente — não é
    /// erro, só um no-op. Uma chamada com `source: User` sempre vence,
    /// independente do que havia antes. Um terminal sem título ainda aceita
    /// normalmente, seja qual for a fonte.
    pub fn set_title(&self, terminal_id: &str, title: &str, source: TitleSource) {
        let mut entries = self.lock();
        let entry = entries.entry(terminal_id.to_string()).or_default();

        if entry.title_source == TitleSource::User && source == TitleSource::Agent {
            return;
        }

        entry.title = Some(title.to_string());
        entry.title_source = source;
    }

    /// Anexa uma linha ao log de atividade do terminal. Não toca no título
    /// nem no status em memória — puramente um INSERT (mais a poda acima do
    /// teto) na tabela `terminal_activity`.
    pub fn push_activity(
        &self,
        conn: &Connection,
        terminal_id: &str,
        activity: &str,
    ) -> Result<(), MetaError> {
        conn.execute(
            "INSERT INTO terminal_activity (terminal_id, activity, created_at) VALUES (?1, ?2, ?3)",
            params![terminal_id, activity, now_unix()],
        )?;

        // Poda: mantém só as ACTIVITY_LOG_CAP linhas mais recentes (por id,
        // que cresce com a ordem de inserção) para este terminal_id. O
        // literal é montado com uma constante interna, não com entrada do
        // chamador — não há risco de injeção.
        conn.execute(
            &format!(
                "DELETE FROM terminal_activity
                 WHERE terminal_id = ?1
                   AND id NOT IN (
                       SELECT id FROM terminal_activity
                       WHERE terminal_id = ?1
                       ORDER BY id DESC
                       LIMIT {ACTIVITY_LOG_CAP}
                   )"
            ),
            params![terminal_id],
        )?;

        Ok(())
    }

    /// Define o status atual do terminal, validando `status_id` contra o
    /// catálogo `terminal_statuses` (só os habilitados contam). Um id
    /// inexistente ou desabilitado é recusado com a mesma forma de erro,
    /// listando os ids válidos.
    pub fn set_status(
        &self,
        conn: &Connection,
        terminal_id: &str,
        status_id: &str,
    ) -> Result<(), MetaError> {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM terminal_statuses WHERE id = ?1 AND enabled = 1",
                params![status_id],
                |row| row.get(0),
            )
            .optional()?;

        if exists.is_none() {
            return Err(MetaError::InvalidStatus {
                status_id: status_id.to_string(),
                valid_ids: valid_status_ids(conn)?.join(", "),
            });
        }

        let mut entries = self.lock();
        let entry = entries.entry(terminal_id.to_string()).or_default();
        entry.status_id = Some(status_id.to_string());

        Ok(())
    }

    /// Remove o badge de status do terminal (`set_terminal_status` com
    /// `status: "clear"`, MCP-05). `"clear"` não é um id do catálogo
    /// `terminal_statuses` — é o sentinela "sem badge" — então isto zera
    /// `status_id` em memória diretamente, sem passar pela validação de
    /// catálogo que `set_status` exige. Nunca falha: um terminal sem
    /// registro nenhum ainda vira uma entrada com `status_id: None` (o
    /// mesmo estado que já teria por padrão).
    pub fn clear_status(&self, terminal_id: &str) {
        let mut entries = self.lock();
        let entry = entries.entry(terminal_id.to_string()).or_default();
        entry.status_id = None;
    }

    /// Retrato em memória do terminal, se algo já foi registrado para ele.
    pub fn get(&self, terminal_id: &str) -> Option<TerminalMeta> {
        self.lock().get(terminal_id).cloned()
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, TerminalMeta>> {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn valid_status_ids(conn: &Connection) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt =
        conn.prepare("SELECT id FROM terminal_statuses WHERE enabled = 1 ORDER BY sort_order")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect()
}

fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    /// Banco em memória, já migrado (traz o catálogo de status seedado pela
    /// migração 003). Suficiente para os testes de título/status: não
    /// precisamos de arquivo real em disco para provar a lógica deste
    /// serviço, só de um SQLite de verdade para o catálogo.
    fn open_db() -> Db {
        Db::open_in_memory().expect("abrir banco em memória")
    }

    #[test]
    fn set_title_numa_sessao_nova_grava_normalmente() {
        let service = TerminalMetaService::new();

        service.set_title("t1", "Ninja Sprites", TitleSource::Agent);

        let meta = service
            .get("t1")
            .expect("terminal deve ter meta registrada");
        assert_eq!(meta.title, Some("Ninja Sprites".to_string()));
        assert_eq!(meta.title_source, TitleSource::Agent);
    }

    #[test]
    fn rename_manual_do_usuario_vence_chamada_seguinte_do_agente() {
        let service = TerminalMetaService::new();

        service.set_title("t1", "Nome do Agente", TitleSource::Agent);
        service.set_title("t1", "Nome do Usuário", TitleSource::User);
        // Chamada do agente depois do rename manual: descartada em silêncio.
        service.set_title("t1", "Outro Nome do Agente", TitleSource::Agent);

        let meta = service
            .get("t1")
            .expect("terminal deve ter meta registrada");
        assert_eq!(meta.title, Some("Nome do Usuário".to_string()));
        assert_eq!(meta.title_source, TitleSource::User);
    }

    #[test]
    fn push_activity_nao_altera_titulo_nem_status_em_memoria() {
        let db = open_db();
        let service = TerminalMetaService::new();

        service.set_title("t1", "Ninja Sprites", TitleSource::Agent);
        let antes = service.get("t1").expect("meta antes do push_activity");

        service
            .push_activity(db.conn(), "t1", "Recording the screen capture")
            .expect("push_activity deve funcionar");
        service
            .push_activity(db.conn(), "t1", "Editing the embed")
            .expect("push_activity deve funcionar");

        let depois = service.get("t1").expect("meta depois do push_activity");
        assert_eq!(antes.title, depois.title);
        assert_eq!(antes.title_source, depois.title_source);
        assert_eq!(antes.status_id, depois.status_id);
    }

    #[test]
    fn set_status_valido_e_habilitado_reflete_em_get() {
        let db = open_db();
        let service = TerminalMetaService::new();

        service
            .set_status(db.conn(), "t1", "working")
            .expect("status válido e habilitado deve funcionar");

        let meta = service
            .get("t1")
            .expect("meta deve existir após set_status");
        assert_eq!(meta.status_id, Some("working".to_string()));
    }

    #[test]
    fn set_status_com_id_inexistente_lista_os_ids_validos() {
        let db = open_db();
        let service = TerminalMetaService::new();

        let err = service
            .set_status(db.conn(), "t1", "not-a-real-status")
            .expect_err("status inexistente deve falhar");

        let msg = err.to_string();
        assert!(msg.contains("working"));
        assert!(msg.contains("needs_input"));
        assert!(msg.contains("needs_testing"));
        assert!(msg.contains("done"));

        // Recusado: não deve ter gravado nada em memória.
        assert!(service.get("t1").is_none());
    }

    #[test]
    fn set_status_desabilitado_e_recusado_com_a_mesma_forma_de_erro() {
        let db = open_db();
        db.conn()
            .execute(
                "UPDATE terminal_statuses SET enabled = 0 WHERE id = 'done'",
                [],
            )
            .expect("desabilitar o status 'done' na massa de teste");
        let service = TerminalMetaService::new();

        let err_desabilitado = service
            .set_status(db.conn(), "t1", "done")
            .expect_err("status desabilitado deve ser recusado");
        let err_inexistente = service
            .set_status(db.conn(), "t1", "not-a-real-status")
            .expect_err("status inexistente deve ser recusado");

        // Mesma forma de erro: ambos listam os mesmos ids válidos (sem
        // 'done', que está desabilitado nesta massa de teste). Note que a
        // mensagem do erro "desabilitado" cita 'done' como o status_id
        // *pedido* (não como válido) — por isso a checagem é sobre o campo
        // `valid_ids`, não sobre a string inteira da mensagem.
        let ids_desabilitado = extract_valid_ids(&err_desabilitado);
        assert!(
            !ids_desabilitado.split(", ").any(|id| id == "done"),
            "'done' está desabilitado nesta massa de teste e não pode aparecer como id válido"
        );
        assert_eq!(
            ids_desabilitado,
            extract_valid_ids(&err_inexistente),
            "status desabilitado e status inexistente devem produzir a mesma lista de ids válidos"
        );
    }

    #[test]
    fn dois_terminais_diferentes_nao_interferem_um_no_outro() {
        let db = open_db();
        let service = TerminalMetaService::new();

        service.set_title("t1", "Terminal Um", TitleSource::User);
        service.set_title("t2", "Terminal Dois", TitleSource::Agent);
        service
            .set_status(db.conn(), "t1", "working")
            .expect("set_status de t1 deve funcionar");
        service
            .set_status(db.conn(), "t2", "done")
            .expect("set_status de t2 deve funcionar");

        let meta1 = service.get("t1").expect("meta de t1");
        let meta2 = service.get("t2").expect("meta de t2");

        assert_eq!(meta1.title, Some("Terminal Um".to_string()));
        assert_eq!(meta1.title_source, TitleSource::User);
        assert_eq!(meta1.status_id, Some("working".to_string()));

        assert_eq!(meta2.title, Some("Terminal Dois".to_string()));
        assert_eq!(meta2.title_source, TitleSource::Agent);
        assert_eq!(meta2.status_id, Some("done".to_string()));
    }

    #[test]
    fn clear_status_zera_o_badge_sem_passar_pelo_catalogo() {
        let db = open_db();
        let service = TerminalMetaService::new();

        service
            .set_status(db.conn(), "t1", "working")
            .expect("set_status válido deve funcionar");
        assert_eq!(
            service.get("t1").unwrap().status_id,
            Some("working".to_string())
        );

        service.clear_status("t1");

        assert_eq!(
            service.get("t1").unwrap().status_id,
            None,
            "clear_status deve zerar o status_id"
        );
    }

    #[test]
    fn clear_status_nao_falha_num_terminal_sem_registro() {
        let service = TerminalMetaService::new();
        // Não deve entrar em pânico nem exigir catálogo: é puro estado em
        // memória, sentinela "sem badge".
        service.clear_status("nunca-visto");
        assert_eq!(service.get("nunca-visto").unwrap().status_id, None);
    }

    fn extract_valid_ids(err: &MetaError) -> String {
        match err {
            MetaError::InvalidStatus { valid_ids, .. } => valid_ids.clone(),
            other => panic!("esperava MetaError::InvalidStatus, obteve {other:?}"),
        }
    }
}
