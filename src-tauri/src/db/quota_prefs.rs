// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-26), quota-provider-source (QSRC-04)

//! Preferência do indicador de cota: ligado/desligado, qual janela
//! rastrear e quais provedores o popover lista. Linha única (`id = 1`),
//! mesmo formato de par `get`/`set` de `db::settings`.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::DbError;

/// Um provedor na lista do popover (QUOTA-26). A **ordem no vetor** é a
/// ordem de exibição — não há campo de índice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotaProvider {
    /// Id do catálogo (`agents::catalog::CATALOG`). Validado pelo chamador.
    pub id: String,
    pub enabled: bool,
    /// SPEC: quota-provider-source (QSRC-04) — id do perfil de terminal
    /// (`shells::TerminalProfile::id()`) de onde a cota deste provedor deve ser
    /// buscada. `None` = o usuário não escolheu, e aí a busca mantém a cadeia
    /// de candidatos de sempre (QSRC-06).
    ///
    /// Mora no JSON da coluna `providers`, não numa coluna nova: `#[serde(default)]`
    /// faz um registro gravado antes desta feature ler como `None`, então não há
    /// migração a rodar.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
}

/// Fallback quando a coluna `providers` está ausente do JSON ou guarda JSON
/// ilegível — o indicador nunca fica sem provedor.
///
/// AD-033: só `claude-code`. Deixou de espelhar a semente da migração 007
/// (que gravou os três ligados): `codex-cli` e `opencode` não têm endpoint de
/// consumo, então não há cota deles a listar, e a UI trava o switch por isso
/// (`providerMeta().hasQuota`). A migração 007 **não** foi reescrita nem
/// migrada: quem consome deriva o comportamento de `hasQuota`, então um banco
/// com a semente antiga se comporta igual a um novo.
pub fn default_providers() -> Vec<QuotaProvider> {
    vec![QuotaProvider {
        id: "claude-code".to_string(),
        enabled: true,
        profile_id: None,
    }]
}

/// Preferência do indicador de cota. `Serialize`/`Deserialize` porque este
/// mesmo tipo é o argumento/retorno dos comandos Tauri `quota_prefs_get` e
/// `quota_prefs_set` (T7) — nenhum tipo espelhado à parte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuotaPrefs {
    pub enabled: bool,
    /// `"five_hour" | "weekly" | "both"`. Validado pelo chamador (comando),
    /// não por esta camada — ver design.md, "Validação de window".
    pub window: String,
    #[serde(default = "default_providers")]
    pub providers: Vec<QuotaProvider>,
}

/// Lê a preferência de cota. A migração 006 semeia a linha 1 com os
/// defaults (`enabled = true`, `window = "both"`) e a 007 acrescenta a
/// lista de provedores, então um banco recém migrado sempre tem o que ler.
pub fn get(conn: &Connection) -> Result<QuotaPrefs, DbError> {
    conn.query_row(
        "SELECT enabled, window, providers FROM quota_prefs WHERE id = 1",
        [],
        |row| {
            let enabled: i64 = row.get(0)?;
            let window: String = row.get(1)?;
            let providers: String = row.get(2)?;
            Ok(QuotaPrefs {
                enabled: enabled != 0,
                window,
                providers: serde_json::from_str(&providers).unwrap_or_else(|_| default_providers()),
            })
        },
    )
    .map_err(DbError::from)
}

/// Grava a preferência de cota, substituindo a linha 1.
pub fn set(conn: &Connection, prefs: &QuotaPrefs) -> Result<(), DbError> {
    let providers = serde_json::to_string(&prefs.providers).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "UPDATE quota_prefs SET enabled = ?1, window = ?2, providers = ?3 WHERE id = 1",
        params![prefs.enabled as i64, prefs.window, providers],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn open_db() -> Db {
        Db::open_in_memory().expect("abrir banco em memória")
    }

    // AD-033: `default_providers()` deixou de espelhar a semente da migração
    // 007, então este teste passa a afirmar o que a migração de fato gravou —
    // é o dado que um banco existente tem, e o que o app precisa continuar
    // lendo sem erro. Quem decide o que aparece é `hasQuota`, na UI.
    #[test]
    fn get_num_banco_recem_migrado_devolve_a_semente_da_migracao_007() {
        let db = open_db();

        let prefs = get(db.conn()).expect("get");

        assert_eq!(
            prefs,
            QuotaPrefs {
                enabled: true,
                window: "both".to_string(),
                providers: ["claude-code", "codex-cli", "opencode"]
                    .into_iter()
                    .map(|id| QuotaProvider {
                        id: id.to_string(),
                        enabled: true,
                        profile_id: None,
                    })
                    .collect(),
            }
        );
    }

    // AD-033: o fallback é só o provedor com cota real.
    #[test]
    fn default_providers_tem_so_o_claude_ligado() {
        assert_eq!(
            default_providers(),
            vec![QuotaProvider {
                id: "claude-code".to_string(),
                enabled: true,
                profile_id: None,
            }]
        );
    }

    #[test]
    fn set_seguido_de_get_preserva_a_ordem_e_o_enabled_dos_provedores() {
        let db = open_db();

        let written = QuotaPrefs {
            enabled: true,
            window: "both".to_string(),
            providers: vec![
                QuotaProvider {
                    id: "codex-cli".to_string(),
                    enabled: false,
                    profile_id: None,
                },
                QuotaProvider {
                    id: "claude-code".to_string(),
                    enabled: true,
                    profile_id: Some("wsl:Ubuntu-24.04".to_string()),
                },
            ],
        };
        set(db.conn(), &written).expect("set");

        assert_eq!(get(db.conn()).expect("get"), written);
    }

    // SPEC: quota-provider-source (QSRC-04) — a escolha de terminal sobrevive
    // à gravação, e um registro sem ela lê como `None` (nenhuma migração).
    #[test]
    fn set_seguido_de_get_preserva_o_profile_id() {
        let db = open_db();

        let written = QuotaPrefs {
            enabled: true,
            window: "both".to_string(),
            providers: vec![
                QuotaProvider {
                    id: "claude-code".to_string(),
                    enabled: true,
                    profile_id: Some("wsl:Ubuntu-24.04".to_string()),
                },
                QuotaProvider {
                    id: "codex-cli".to_string(),
                    enabled: false,
                    profile_id: None,
                },
            ],
        };
        set(db.conn(), &written).expect("set");

        assert_eq!(get(db.conn()).expect("get"), written);
    }

    // QSRC-04: JSON gravado antes desta feature (sem `profileId`) continua
    // legível — é o que dispensa migração.
    #[test]
    fn json_antigo_sem_profile_id_le_como_none() {
        let providers: Vec<QuotaProvider> =
            serde_json::from_str(r#"[{"id":"claude-code","enabled":true}]"#).expect("parse");

        assert_eq!(
            providers,
            vec![QuotaProvider {
                id: "claude-code".to_string(),
                enabled: true,
                profile_id: None,
            }]
        );
    }

    #[test]
    fn set_seguido_de_get_faz_round_trip_para_as_tres_janelas() {
        let db = open_db();

        for window in ["five_hour", "weekly", "both"] {
            let written = QuotaPrefs {
                enabled: false,
                window: window.to_string(),
                providers: default_providers(),
            };
            set(db.conn(), &written).expect("set");

            let read = get(db.conn()).expect("get");
            assert_eq!(read, written);
        }
    }
}
