// SPEC: agent-selection (AGT-01)

//! Persists the user's preferred default agent, and resolves what the
//! *effective* default should be for a new session — which may differ from
//! the stored preference when that agent's CLI is no longer on the PATH.
//!
//! Storage is a single row (`agent_prefs`, `id = 1`), the same pattern
//! `db::settings` uses for `update_settings`. Unlike that table, this one
//! is not seeded: a fresh database has no row at all, meaning "no
//! preference recorded yet" — `resolve_effective_default` is what decides
//! what to do about that, not the migration.

use rusqlite::{params, Connection, OptionalExtension};

use super::catalog::{detect_installed, AgentStatus};
use crate::db::DbError;

/// Outcome of resolving the stored preference against what is actually
/// installed right now.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct EffectiveDefault {
    /// The agent id a new session should pre-select. `None` when nothing
    /// in the catalog is installed.
    pub agent_id: Option<String>,
    /// `true` when a preference *was* recorded but could not be honored
    /// (its CLI is no longer installed), so `agent_id` is a substitute the
    /// caller should surface to the user. `false` when `agent_id` already
    /// matches the stored preference, or when there was no stored
    /// preference to begin with — picking the first installed agent in
    /// that case is the ordinary first-run behavior, not a fallback.
    pub fell_back: bool,
}

/// Reads the stored default agent id, if any.
///
/// `None` both when the table has no row yet (fresh database, nothing ever
/// set) and when the row exists but the column is `NULL` — callers don't
/// need to distinguish those two internal states.
pub fn default_agent(conn: &Connection) -> Result<Option<String>, DbError> {
    let value: Option<Option<String>> = conn
        .query_row(
            "SELECT default_agent_id FROM agent_prefs WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value.unwrap_or(None))
}

/// Records `agent_id` as the default agent. Upserts the single row, so
/// calling this again (with the same or a different id) simply replaces
/// the previous preference.
pub fn set_default_agent(conn: &Connection, agent_id: &str) -> Result<(), DbError> {
    conn.execute(
        "INSERT INTO agent_prefs (id, default_agent_id) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET default_agent_id = excluded.default_agent_id",
        params![agent_id],
    )?;
    Ok(())
}

/// Resolves the effective default for a new session: the stored
/// preference if its CLI is still installed, otherwise the first installed
/// agent in catalog order, otherwise `None` if nothing is installed at all.
pub fn resolve_effective_default(conn: &Connection) -> Result<EffectiveDefault, DbError> {
    let stored = default_agent(conn)?;
    Ok(resolve_effective_default_with(stored, &detect_installed()))
}

/// Testable core: takes the stored preference and detection results as
/// parameters instead of touching the database and the real PATH — same
/// split `catalog::detect_installed_with` and `launch::resolve_with`
/// already use.
fn resolve_effective_default_with(
    stored: Option<String>,
    statuses: &[AgentStatus],
) -> EffectiveDefault {
    if let Some(id) = &stored {
        let installed = statuses
            .iter()
            .any(|status| status.agent.id == id.as_str() && status.installed);
        if installed {
            return EffectiveDefault {
                agent_id: stored,
                fell_back: false,
            };
        }
    }

    // No usable stored preference: pick the first installed agent in
    // catalog order. `statuses` is produced by mapping over `catalog()` in
    // order (see `catalog::detect_installed_with`), so iterating it here
    // already yields catalog order — no need to re-look-up per descriptor.
    let first_installed = statuses
        .iter()
        .find(|status| status.installed)
        .map(|status| status.agent.id.to_string());

    EffectiveDefault {
        agent_id: first_installed,
        fell_back: stored.is_some(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::catalog::AgentDescriptor;

    fn fake_catalog() -> Vec<AgentDescriptor> {
        vec![
            AgentDescriptor {
                id: "agent-a",
                name: "Agent A",
                vendor: "Vendor",
                command: "agenta",
                beta: false,
                session_new_flag: None,
                session_resume_flag: None,
            },
            AgentDescriptor {
                id: "agent-b",
                name: "Agent B",
                vendor: "Vendor",
                command: "agentb",
                beta: false,
                session_new_flag: None,
                session_resume_flag: None,
            },
        ]
    }

    #[test]
    fn sem_preferencia_usa_o_primeiro_instalado_da_ordem_do_catalogo() {
        let catalog = fake_catalog();
        let statuses = vec![
            AgentStatus {
                agent: catalog[0],
                installed: false,
            },
            AgentStatus {
                agent: catalog[1],
                installed: true,
            },
        ];

        let resolved = resolve_effective_default_with(None, &statuses);

        assert_eq!(resolved.agent_id, Some("agent-b".to_string()));
        assert!(
            !resolved.fell_back,
            "sem preferência gravada não é um fallback, é o comportamento padrão"
        );
    }

    #[test]
    fn preferencia_instalada_e_honrada_sem_fallback() {
        let catalog = fake_catalog();
        let statuses = vec![
            AgentStatus {
                agent: catalog[0],
                installed: true,
            },
            AgentStatus {
                agent: catalog[1],
                installed: true,
            },
        ];

        let resolved = resolve_effective_default_with(Some("agent-a".to_string()), &statuses);

        assert_eq!(resolved.agent_id, Some("agent-a".to_string()));
        assert!(!resolved.fell_back);
    }

    #[test]
    fn preferencia_nao_instalada_cai_para_o_primeiro_disponivel_e_avisa() {
        let catalog = fake_catalog();
        let statuses = vec![
            AgentStatus {
                agent: catalog[0],
                installed: false,
            },
            AgentStatus {
                agent: catalog[1],
                installed: true,
            },
        ];

        let resolved = resolve_effective_default_with(Some("agent-a".to_string()), &statuses);

        assert_eq!(resolved.agent_id, Some("agent-b".to_string()));
        assert!(resolved.fell_back);
    }

    #[test]
    fn nenhum_agente_instalado_devolve_none() {
        let catalog = fake_catalog();
        let statuses = vec![
            AgentStatus {
                agent: catalog[0],
                installed: false,
            },
            AgentStatus {
                agent: catalog[1],
                installed: false,
            },
        ];

        let resolved = resolve_effective_default_with(None, &statuses);

        assert_eq!(resolved.agent_id, None);
        assert!(!resolved.fell_back);
    }
}
