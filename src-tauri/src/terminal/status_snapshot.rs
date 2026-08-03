// SPEC: terminal-statuses (STAT-04)

//! Snapshot do catálogo de status por sessão de terminal.
//!
//! STAT-04: "QUANDO o catálogo muda ENTÃO a mudança DEVE chegar aos agentes
//! na próxima sessão, não no meio de uma em curso." `status_catalog`
//! (`terminal::status_catalog`) é lido ao vivo pela camada de edição (P1),
//! mas quem valida `set_status` (`terminal::meta::TerminalMetaService`) não
//! pode consultar essa tabela a cada chamada — senão editar o catálogo
//! afetaria uma sessão que já está em curso. Este módulo resolve isso: ele
//! "congela", por `TerminalId` (aqui tratado como `&str`, mesmo padrão de
//! `meta.rs`), a lista de status habilitados no momento em que ela é
//! capturada — e nunca muda depois disso, mesmo que o catálogo mude.
//!
//! **Quem chama [`StatusSnapshotService::capture`] no spawn de verdade** é
//! responsabilidade de `TerminalManager`/da camada de IPC (fora do escopo
//! desta task, mesmo racional do comentário de módulo em
//! `status_catalog.rs` sobre a camada de comando IPC). Esta task entrega o
//! mecanismo e o consumidor (`meta::set_status`, ver ali): como nenhuma
//! sessão de teste passa por um spawn real, `set_status` usa
//! [`StatusSnapshotService::capture_if_absent`] como rede de segurança —
//! captura na primeira chamada de `set_status` para aquele terminal, caso
//! ninguém tenha capturado antes. Chamadas seguintes reaproveitam o mesmo
//! snapshot, então o efeito prático já satisfaz STAT-04 mesmo antes da
//! captura real no spawn ser conectada em `TerminalManager`.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use super::status_catalog::StatusRecord;

/// Snapshots vivos, por `terminal_id`. Mesmo padrão de composição de
/// `TerminalMetaService`/`TerminalManager`: `Mutex<HashMap<...>>`,
/// recuperado de poison pelo `lock()` interno.
#[derive(Default)]
pub struct StatusSnapshotService {
    snapshots: Mutex<HashMap<String, Vec<StatusRecord>>>,
}

impl StatusSnapshotService {
    pub fn new() -> Self {
        Self::default()
    }

    /// Captura (ou recaptura) o catálogo habilitado atual para
    /// `terminal_id`. Sempre sobrescreve um snapshot anterior, se existir —
    /// é o chamador (spawn de sessão) quem decide quando isso deve
    /// acontecer; este método não tem noção de "já capturei antes".
    pub fn capture(&self, conn: &Connection, terminal_id: &str) -> Result<(), rusqlite::Error> {
        let statuses = fetch_enabled(conn)?;
        self.lock().insert(terminal_id.to_string(), statuses);
        Ok(())
    }

    /// Captura o snapshot só se `terminal_id` ainda não tiver um. Usada por
    /// `meta::set_status` como rede de segurança (ver comentário de
    /// módulo) — não substitui a captura real no spawn, só garante que uma
    /// sessão sem captura explícita ainda tenha um snapshot estável em vez
    /// de cair de volta para leitura ao vivo do catálogo.
    pub fn capture_if_absent(
        &self,
        conn: &Connection,
        terminal_id: &str,
    ) -> Result<(), rusqlite::Error> {
        if self.lock().contains_key(terminal_id) {
            return Ok(());
        }
        self.capture(conn, terminal_id)
    }

    /// Ids dos status válidos no snapshot de `terminal_id`, na mesma ordem
    /// (`sort_order`) capturada. `None` se este terminal nunca teve um
    /// snapshot capturado.
    pub fn valid_ids(&self, terminal_id: &str) -> Option<Vec<String>> {
        self.lock()
            .get(terminal_id)
            .map(|records| records.iter().map(|r| r.id.clone()).collect())
    }

    /// `true` se `status_id` está entre os ids capturados no snapshot de
    /// `terminal_id`. `false` tanto se o id não está no snapshot quanto se
    /// este terminal nunca teve um snapshot capturado.
    pub fn is_valid(&self, terminal_id: &str, status_id: &str) -> bool {
        self.lock()
            .get(terminal_id)
            .map(|records| records.iter().any(|r| r.id == status_id))
            .unwrap_or(false)
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, Vec<StatusRecord>>> {
        self.snapshots
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Lê o catálogo habilitado atual (`enabled = 1`, ordenado por
/// `sort_order`) — a mesma condição que `status_catalog::disable` documenta
/// como sendo a que filtra o que chega aos agentes.
fn fetch_enabled(conn: &Connection) -> Result<Vec<StatusRecord>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, label, color, instruction, sort_order, enabled, is_default
         FROM terminal_statuses WHERE enabled = 1 ORDER BY sort_order",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(StatusRecord {
            id: row.get(0)?,
            label: row.get(1)?,
            color: row.get(2)?,
            instruction: row.get(3)?,
            sort_order: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            is_default: row.get::<_, i64>(6)? != 0,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::terminal::status_catalog;

    /// Banco em memória, já migrado (traz o catálogo de status seedado pela
    /// migração 003) — mesmo padrão de `status_catalog::tests::open_db`.
    fn open_db() -> Db {
        Db::open_in_memory().expect("abrir banco em memória")
    }

    #[test]
    fn capture_no_spawn_registra_o_catalogo_habilitado_atual() {
        let db = open_db();
        let service = StatusSnapshotService::new();

        service
            .capture(db.conn(), "t1")
            .expect("capture deve funcionar com o catálogo padrão");

        let valid_ids = service
            .valid_ids("t1")
            .expect("snapshot deve existir após capture");
        assert_eq!(
            valid_ids,
            vec!["working", "needs_input", "needs_testing", "done"],
            "snapshot deve refletir os 4 status padrão, na ordem de sort_order"
        );
    }

    #[test]
    fn is_valid_aceita_apenas_ids_presentes_no_snapshot_capturado() {
        let db = open_db();
        let service = StatusSnapshotService::new();

        service
            .capture(db.conn(), "t1")
            .expect("capture deve funcionar");

        assert!(service.is_valid("t1", "working"));
        assert!(!service.is_valid("t1", "not-a-real-status"));
        // Terminal sem snapshot nenhum: nunca válido, não entra em pânico.
        assert!(!service.is_valid("nunca-capturado", "working"));
    }

    #[test]
    fn editar_catalogo_apos_a_captura_nao_afeta_o_snapshot_ja_capturado() {
        let db = open_db();
        let service = StatusSnapshotService::new();

        // Sessão "t1" começa com o catálogo padrão.
        service
            .capture(db.conn(), "t1")
            .expect("capture inicial deve funcionar");
        let snapshot_antes = service.valid_ids("t1").expect("snapshot de t1");

        // Catálogo muda DEPOIS da captura: desativa "needs_testing" e cria
        // um status novo.
        status_catalog::disable(db.conn(), "needs_testing")
            .expect("disable no catálogo ao vivo deve funcionar");
        status_catalog::create(db.conn(), "Blocked", "Use when stuck.")
            .expect("create no catálogo ao vivo deve funcionar");

        let snapshot_depois = service
            .valid_ids("t1")
            .expect("snapshot de t1 continua existindo");
        assert_eq!(
            snapshot_depois, snapshot_antes,
            "editar o catálogo durante a sessão não deve alterar o snapshot já capturado"
        );
        assert!(snapshot_depois.contains(&"needs_testing".to_string()));
        assert!(!snapshot_depois.iter().any(|id| id == "Blocked"));
    }

    #[test]
    fn sessao_nova_apos_a_edicao_enxerga_o_catalogo_atualizado() {
        let db = open_db();
        let service = StatusSnapshotService::new();

        // "t1" captura antes da edição.
        service
            .capture(db.conn(), "t1")
            .expect("capture de t1 deve funcionar");

        // Catálogo muda.
        status_catalog::disable(db.conn(), "needs_testing")
            .expect("disable no catálogo ao vivo deve funcionar");
        let criado = status_catalog::create(db.conn(), "Blocked", "Use when stuck.")
            .expect("create no catálogo ao vivo deve funcionar");

        // "t2" é uma sessão nova, capturada depois da edição.
        service
            .capture(db.conn(), "t2")
            .expect("capture de t2 deve funcionar");

        let snapshot_t1 = service.valid_ids("t1").expect("snapshot de t1");
        let snapshot_t2 = service.valid_ids("t2").expect("snapshot de t2");

        assert_ne!(
            snapshot_t1, snapshot_t2,
            "sessão antiga e sessão nova devem ver catálogos diferentes"
        );
        assert!(
            !snapshot_t2.contains(&"needs_testing".to_string()),
            "sessão nova não deve ver o status desativado depois da captura antiga"
        );
        assert!(
            snapshot_t2.contains(&criado.status.id),
            "sessão nova deve ver o status criado depois da captura antiga"
        );
    }

    #[test]
    fn status_excluido_do_catalogo_segue_valido_na_sessao_que_ja_capturou() {
        let db = open_db();
        let service = StatusSnapshotService::new();

        service
            .capture(db.conn(), "t1")
            .expect("capture inicial deve funcionar");
        assert!(service.is_valid("t1", "done"));

        // "done" é excluído do catálogo por completo (não só desativado).
        status_catalog::delete(db.conn(), "done", &[])
            .expect("delete no catálogo ao vivo deve funcionar");

        assert!(
            service.is_valid("t1", "done"),
            "status excluído do catálogo depois da captura deve seguir válido na sessão que já capturou"
        );
    }
}
