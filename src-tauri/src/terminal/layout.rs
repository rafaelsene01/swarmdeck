// SPEC: multi-terminal (TERM-07), terminal-layout-options (LAYOUT-22, LAYOUT-23, LAYOUT-24, LAYOUT-25, LAYOUT-27, LAYOUT-28, LAYOUT-29)

//! Persistência do workspace de terminais: abas (`terminal_tabs`, migração
//! `008`) e os terminais de cada aba (`terminal_layout`, migração `001`).
//!
//! O workspace é sempre substituído por completo em `save()` — não há merge
//! incremental, porque o conjunto de abas e terminais muda junto do layout
//! (fechar remove uma linha, abrir adiciona outra). A substituição roda numa
//! transação (LAYOUT-27): nunca sobra aba de uma gravação com terminal de
//! outra.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db::{Db, DbError};

/// Modo de disposição padrão, para o qual todo valor desconhecido cai
/// (LAYOUT-28).
const DEFAULT_MODE: &str = "horizontal";
const DEFAULT_SPAN: &str = "first";

fn default_title_source() -> String {
    "agent".to_string()
}

/// Um terminal persistido. `Serialize`/`Deserialize` em camelCase porque
/// este mesmo tipo é o payload dos comandos `terminal_workspace_get`/`set` e
/// precisa casar com o `LayoutEntry` de `src/state/terminals.ts`.
///
/// Os campos que o frontend não envia (`title`, `titleSource`, `updatedAt`,
/// `cwdFallbackFrom`) têm default: o front grava o que ele conhece, não o
/// esquema inteiro da tabela.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutEntry {
    pub id: String,
    pub slot: i64,
    pub frac_w: f64,
    pub frac_h: f64,
    pub cwd: String,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default = "default_title_source")]
    pub title_source: String,
    #[serde(default)]
    pub minimized: bool,
    #[serde(default)]
    pub updated_at: i64,
    /// Preenchido só em `restore()`, quando o `cwd` persistido não existe
    /// mais e foi trocado por `home`. Não é uma coluna da tabela — é o dado
    /// que falta para o front avisar qual diretório sumiu (design.md →
    /// Tratamento de erros: "aviso nomeando o diretório que sumiu").
    #[serde(default)]
    pub cwd_fallback_from: Option<String>,
}

/// Uma aba persistida, com seus terminais na ordem de exibição (LAYOUT-22).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabEntry {
    pub id: String,
    pub slot: i64,
    pub name: String,
    /// `"horizontal" | "vertical"`. Valor desconhecido volta como
    /// `horizontal` na leitura (LAYOUT-28), não falha.
    pub layout_mode: String,
    /// `"first" | "last"`. Mesmo tratamento de valor desconhecido.
    pub layout_span: String,
    pub terminals: Vec<LayoutEntry>,
}

/// Apaga o workspace salvo e grava `tabs` no lugar, numa transação
/// (LAYOUT-27). Falha no meio faz rollback: o banco fica com o workspace
/// anterior inteiro, nunca com metade de cada gravação.
pub fn save(db: &Db, tabs: &[TabEntry]) -> Result<(), DbError> {
    let conn = db.conn();
    let tx = conn.unchecked_transaction()?;

    tx.execute("DELETE FROM terminal_layout", [])?;
    tx.execute("DELETE FROM terminal_tabs", [])?;

    let now = now_unix();

    for tab in tabs {
        tx.execute(
            "INSERT INTO terminal_tabs
                (id, slot, name, layout_mode, layout_span, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![tab.id, tab.slot, tab.name, tab.layout_mode, tab.layout_span, now],
        )?;

        for e in &tab.terminals {
            tx.execute(
                "INSERT INTO terminal_layout
                    (id, slot, frac_w, frac_h, cwd, agent_id, title, title_source, minimized, updated_at, tab_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    e.id,
                    e.slot,
                    e.frac_w,
                    e.frac_h,
                    e.cwd,
                    e.agent_id,
                    e.title,
                    e.title_source,
                    e.minimized as i64,
                    e.updated_at,
                    tab.id,
                ],
            )?;
        }
    }

    tx.commit()?;
    Ok(())
}

/// Restaura o workspace salvo: abas na ordem dos `slot`s, cada uma com seus
/// terminais também por `slot`.
///
/// Um `cwd` que não existe mais cai para `home`, com `cwd_fallback_from`
/// nomeando o diretório original (TERM-07). Terminal com `tab_id` nulo ou
/// apontando para aba que não existe mais é descartado (LAYOUT-25). Banco
/// sem nenhuma aba salva (primeira execução) devolve vetor vazio: o app abre
/// com uma aba vazia e o `EmptyState` (LAYOUT-24), não com um terminal
/// inventado.
pub fn restore(db: &Db, home: &Path) -> Result<Vec<TabEntry>, DbError> {
    let conn = db.conn();

    let mut tab_stmt = conn.prepare(
        "SELECT id, slot, name, layout_mode, layout_span FROM terminal_tabs ORDER BY slot",
    )?;
    let tab_rows = tab_stmt.query_map([], |row| {
        Ok(TabEntry {
            id: row.get(0)?,
            slot: row.get(1)?,
            name: row.get(2)?,
            layout_mode: normalize_mode(row.get::<_, String>(3)?),
            layout_span: normalize_span(row.get::<_, String>(4)?),
            terminals: Vec::new(),
        })
    })?;

    let mut tabs: Vec<TabEntry> = Vec::new();
    for row in tab_rows {
        tabs.push(row?);
    }

    // Os terminais são lidos por aba, então `tab_id` nulo ou órfão nunca
    // casa com nenhuma consulta e some sozinho (LAYOUT-25).
    let mut entry_stmt = conn.prepare(
        "SELECT id, slot, frac_w, frac_h, cwd, agent_id, title, title_source, minimized, updated_at
         FROM terminal_layout WHERE tab_id = ?1 ORDER BY slot",
    )?;

    for tab in &mut tabs {
        let rows = entry_stmt.query_map(params![tab.id], |row| {
            Ok(LayoutEntry {
                id: row.get(0)?,
                slot: row.get(1)?,
                frac_w: row.get(2)?,
                frac_h: row.get(3)?,
                cwd: row.get(4)?,
                agent_id: row.get(5)?,
                title: row.get(6)?,
                title_source: row.get(7)?,
                minimized: row.get::<_, i64>(8)? != 0,
                updated_at: row.get(9)?,
                cwd_fallback_from: None,
            })
        })?;

        for row in rows {
            let mut entry = row?;
            if !Path::new(&entry.cwd).is_dir() {
                entry.cwd_fallback_from = Some(entry.cwd.clone());
                entry.cwd = home.to_string_lossy().into_owned();
            }
            tab.terminals.push(entry);
        }
    }

    Ok(tabs)
}

/// LAYOUT-28: modo fora do vocabulário conhecido cai em `horizontal`. Mesmo
/// tratamento que `quota_prefs::get` dá a JSON ilegível — cair no default,
/// não falhar a leitura inteira.
fn normalize_mode(mode: String) -> String {
    match mode.as_str() {
        "horizontal" | "vertical" => mode,
        _ => DEFAULT_MODE.to_string(),
    }
}

/// LAYOUT-28: variante de largura desconhecida cai em `first`.
fn normalize_span(span: String) -> String {
    match span.as_str() {
        "first" | "last" => span,
        _ => "last".to_string(),
    }
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_db() -> Db {
        Db::open_in_memory().expect("abrir banco em memória")
    }

    fn entry(id: &str, slot: i64, cwd: &str) -> LayoutEntry {
        LayoutEntry {
            id: id.to_string(),
            slot,
            frac_w: 0.5,
            frac_h: 1.0,
            cwd: cwd.to_string(),
            agent_id: Some("claude-code".to_string()),
            title: None,
            title_source: "agent".to_string(),
            minimized: false,
            updated_at: 42,
            cwd_fallback_from: None,
        }
    }

    fn tab(id: &str, slot: i64, name: &str, terminals: Vec<LayoutEntry>) -> TabEntry {
        TabEntry {
            id: id.to_string(),
            slot,
            name: name.to_string(),
            layout_mode: "horizontal".to_string(),
            layout_span: "first".to_string(),
            terminals,
        }
    }

    /// Diretório que existe de verdade, para o `cwd` não cair no fallback de
    /// TERM-07 nos testes que não são sobre isso.
    fn existing_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("criar diretório temporário")
    }

    // LAYOUT-23: as abas voltam na ordem salva, cada uma com seus terminais
    // na ordem salva, mesmo `cwd`, mesmo agente e mesmo modo de layout.
    #[test]
    fn save_seguido_de_restore_devolve_as_abas_na_ordem_com_terminais_cwd_agente_e_layout() {
        let db = open_db();
        let dir = existing_dir();
        let cwd = dir.path().to_string_lossy().into_owned();

        let mut aba2 = tab("tab-2", 1, "Deploy", vec![entry("t-3", 0, &cwd)]);
        aba2.layout_mode = "vertical".to_string();
        aba2.layout_span = "last".to_string();
        let written = vec![
            tab(
                "tab-1",
                0,
                "Aba 1",
                vec![entry("t-1", 0, &cwd), entry("t-2", 1, &cwd)],
            ),
            aba2,
        ];

        save(&db, &written).expect("save");

        let read = restore(&db, Path::new("/home/user")).expect("restore");
        assert_eq!(read, written);
    }

    // LAYOUT-24: primeira execução (nada salvo) devolve vetor vazio — o app
    // abre com uma aba vazia e o `EmptyState`, sem inventar terminal.
    #[test]
    fn restore_em_banco_sem_aba_salva_devolve_vetor_vazio() {
        let db = open_db();

        let read = restore(&db, Path::new("/home/user")).expect("restore");

        assert_eq!(read, Vec::<TabEntry>::new());
    }

    // LAYOUT-27: cada gravação substitui o estado inteiro; nada da anterior
    // sobrevive.
    #[test]
    fn save_substitui_o_workspace_inteiro_a_cada_gravacao() {
        let db = open_db();
        let dir = existing_dir();
        let cwd = dir.path().to_string_lossy().into_owned();

        save(
            &db,
            &[tab(
                "tab-1",
                0,
                "Antiga",
                vec![entry("t-1", 0, &cwd), entry("t-2", 1, &cwd)],
            )],
        )
        .expect("primeiro save");

        let depois = vec![tab("tab-9", 0, "Nova", vec![entry("t-9", 0, &cwd)])];
        save(&db, &depois).expect("segundo save");

        assert_eq!(restore(&db, Path::new("/home/user")).expect("restore"), depois);
    }

    // LAYOUT-27: falha no meio da gravação faz rollback — o banco fica com o
    // workspace anterior inteiro, nunca com abas de uma e terminais de outra.
    #[test]
    fn save_que_falha_no_meio_faz_rollback_e_preserva_a_gravacao_anterior() {
        let db = open_db();
        let dir = existing_dir();
        let cwd = dir.path().to_string_lossy().into_owned();

        let antes = vec![tab("tab-1", 0, "Antiga", vec![entry("t-1", 0, &cwd)])];
        save(&db, &antes).expect("primeiro save");

        // Duas abas com o mesmo `id`: a segunda viola a PRIMARY KEY e aborta
        // a gravação depois de os DELETEs e o primeiro INSERT já terem
        // rodado dentro da transação.
        let invalido = vec![
            tab("tab-dup", 0, "A", vec![entry("t-a", 0, &cwd)]),
            tab("tab-dup", 1, "B", vec![entry("t-b", 0, &cwd)]),
        ];
        assert!(save(&db, &invalido).is_err(), "id duplicado deve falhar");

        assert_eq!(restore(&db, Path::new("/home/user")).expect("restore"), antes);
    }

    // LAYOUT-28: modo e variante desconhecidos caem em horizontal/first em
    // vez de falhar a leitura.
    #[test]
    fn restore_normaliza_layout_mode_e_layout_span_desconhecidos_para_o_default() {
        let db = open_db();
        db.conn()
            .execute(
                "INSERT INTO terminal_tabs (id, slot, name, layout_mode, layout_span, updated_at)
                 VALUES ('tab-1', 0, 'Aba 1', 'diagonal', 'middle', 0)",
                [],
            )
            .expect("inserir aba com layout ilegível");

        let read = restore(&db, Path::new("/home/user")).expect("restore");

        assert_eq!(read.len(), 1);
        assert_eq!(read[0].layout_mode, "horizontal");
        assert_eq!(read[0].layout_span, "first");
    }

    // Edge case "terminais órfãos": terminal sem aba dona é descartado.
    #[test]
    fn restore_descarta_terminal_com_tab_id_nulo() {
        let db = open_db();
        let dir = existing_dir();
        let cwd = dir.path().to_string_lossy().into_owned();

        save(&db, &[tab("tab-1", 0, "Aba 1", vec![entry("t-1", 0, &cwd)])]).expect("save");
        db.conn()
            .execute(
                "INSERT INTO terminal_layout
                    (id, slot, frac_w, frac_h, cwd, title_source, minimized, updated_at, tab_id)
                 VALUES ('orfao-nulo', 1, 1.0, 1.0, ?1, 'agent', 0, 0, NULL)",
                params![cwd],
            )
            .expect("inserir terminal sem aba");

        let read = restore(&db, Path::new("/home/user")).expect("restore");

        assert_eq!(read.len(), 1);
        assert_eq!(
            read[0].terminals.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["t-1"]
        );
    }

    // Edge case "terminais órfãos apontando para aba que não existe mais".
    #[test]
    fn restore_descarta_terminal_apontando_para_aba_inexistente() {
        let db = open_db();
        let dir = existing_dir();
        let cwd = dir.path().to_string_lossy().into_owned();

        save(&db, &[tab("tab-1", 0, "Aba 1", vec![entry("t-1", 0, &cwd)])]).expect("save");
        db.conn()
            .execute(
                "INSERT INTO terminal_layout
                    (id, slot, frac_w, frac_h, cwd, title_source, minimized, updated_at, tab_id)
                 VALUES ('orfao', 1, 1.0, 1.0, ?1, 'agent', 0, 0, 'tab-que-sumiu')",
                params![cwd],
            )
            .expect("inserir terminal órfão");

        let read = restore(&db, Path::new("/home/user")).expect("restore");

        assert_eq!(read.len(), 1);
        assert_eq!(
            read[0].terminals.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["t-1"]
        );
    }

    // TERM-07 / LAYOUT-25: `cwd` que sumiu cai em `home`, nomeando o
    // diretório original para o front poder avisar.
    #[test]
    fn restore_troca_cwd_inexistente_por_home_e_registra_o_diretorio_que_sumiu() {
        let db = open_db();
        let sumido = "/diretorio/que/nao/existe";

        save(&db, &[tab("tab-1", 0, "Aba 1", vec![entry("t-1", 0, sumido)])]).expect("save");

        let home = existing_dir();
        let read = restore(&db, home.path()).expect("restore");

        let restaurado = &read[0].terminals[0];
        assert_eq!(restaurado.cwd, home.path().to_string_lossy());
        assert_eq!(restaurado.cwd_fallback_from.as_deref(), Some(sumido));
    }

    // Edge case: "todas as abas salvas estão sem terminais" — as abas voltam
    // assim mesmo, para o `EmptyState` aparecer na ativa.
    #[test]
    fn restore_devolve_aba_salva_sem_nenhum_terminal() {
        let db = open_db();

        save(&db, &[tab("tab-1", 0, "Aba 1", vec![])]).expect("save");

        let read = restore(&db, Path::new("/home/user")).expect("restore");

        assert_eq!(read.len(), 1);
        assert_eq!(read[0].name, "Aba 1");
        assert!(read[0].terminals.is_empty());
    }
}
