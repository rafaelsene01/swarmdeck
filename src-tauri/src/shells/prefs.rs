// SPEC: wsl-terminal-profile (WSLP-02, WSLP-13 — REVOKED by AD-035: o
// seletor saiu, mas o valor gravado sobrevive como fallback de
// `profile_for_path` para um caminho que não nomeia distro)

//! Persiste o perfil de terminal padrão e resolve o efetivo: o valor
//! salvo quando sua distro ainda está listada, senão `Host`.
//!
//! Mesmo formato de linha única (`id = 1`, sem seed) de `agents::prefs`.

use rusqlite::{params, Connection, OptionalExtension};

use super::list::{list_profiles, ProfileEntry};
use super::TerminalProfile;
use crate::db::DbError;

/// Lê o perfil salvo. `None` tanto quando a tabela não tem linha (banco
/// recém migrado) quanto quando a coluna é `NULL`.
pub fn default_profile(conn: &Connection) -> Result<Option<TerminalProfile>, DbError> {
    let value: Option<Option<String>> = conn
        .query_row(
            "SELECT profile FROM terminal_profile_prefs WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value
        .flatten()
        .and_then(|id| TerminalProfile::parse_id(&id)))
}

/// Grava `profile` como o padrão. Upsert da linha única: chamar de novo
/// simplesmente substitui a preferência anterior.
pub fn set_default_profile(conn: &Connection, profile: &TerminalProfile) -> Result<(), DbError> {
    conn.execute(
        "INSERT INTO terminal_profile_prefs (id, profile) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET profile = excluded.profile",
        params![profile.id()],
    )?;
    Ok(())
}

/// Resolve o perfil efetivo para uma nova sessão: o salvo, se sua distro
/// ainda estiver na lista atual; senão `Host` (WSLP-13 — a UI decide
/// separadamente, a partir do valor bruto de `default_profile`, se deve
/// marcar a preferência salva como indisponível).
pub fn resolve_default(conn: &Connection) -> TerminalProfile {
    let stored = default_profile(conn).ok().flatten();
    resolve_default_with(stored, &list_profiles())
}

/// Núcleo testável: recebe a preferência salva e a lista de perfis já
/// prontas, sem tocar banco nem `wsl.exe` — mesmo desenho de
/// `agents::prefs::resolve_effective_default_with`.
fn resolve_default_with(
    stored: Option<TerminalProfile>,
    profiles: &[ProfileEntry],
) -> TerminalProfile {
    match stored {
        Some(profile) if profiles.iter().any(|entry| entry.id == profile.id()) => profile,
        _ => TerminalProfile::Host,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrated_conn() -> crate::db::Db {
        crate::db::Db::open_in_memory().expect("banco em memória migrado")
    }

    #[test]
    fn default_profile_returns_none_on_fresh_db_or_null_column() {
        let db = migrated_conn();
        assert_eq!(default_profile(db.conn()).unwrap(), None);

        db.conn()
            .execute(
                "INSERT INTO terminal_profile_prefs (id, profile) VALUES (1, NULL)",
                [],
            )
            .unwrap();
        assert_eq!(default_profile(db.conn()).unwrap(), None);
    }

    #[test]
    fn set_default_profile_round_trips_host_and_wsl() {
        let db = migrated_conn();

        set_default_profile(db.conn(), &TerminalProfile::Host).unwrap();
        assert_eq!(
            default_profile(db.conn()).unwrap(),
            Some(TerminalProfile::Host)
        );

        let wsl = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        set_default_profile(db.conn(), &wsl).unwrap();
        assert_eq!(default_profile(db.conn()).unwrap(), Some(wsl));
    }

    #[test]
    fn set_default_profile_twice_leaves_exactly_one_row() {
        let db = migrated_conn();
        set_default_profile(db.conn(), &TerminalProfile::Host).unwrap();
        set_default_profile(
            db.conn(),
            &TerminalProfile::Wsl {
                distro: "Ubuntu-24.04".to_string(),
            },
        )
        .unwrap();

        let count: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM terminal_profile_prefs", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn resolve_default_with_falls_back_to_host_when_distro_not_listed() {
        let stored = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let profiles = vec![ProfileEntry {
            id: "host".to_string(),
            label: "Windows".to_string(),
            wsl1: false,
        }];
        assert_eq!(
            resolve_default_with(Some(stored), &profiles),
            TerminalProfile::Host
        );
    }

    #[test]
    fn resolve_default_with_returns_stored_profile_when_still_listed() {
        let stored = TerminalProfile::Wsl {
            distro: "Ubuntu-24.04".to_string(),
        };
        let profiles = vec![
            ProfileEntry {
                id: "host".to_string(),
                label: "Windows".to_string(),
                wsl1: false,
            },
            ProfileEntry {
                id: stored.id(),
                label: "Ubuntu-24.04".to_string(),
                wsl1: false,
            },
        ];
        assert_eq!(
            resolve_default_with(Some(stored.clone()), &profiles),
            stored
        );
    }
}
