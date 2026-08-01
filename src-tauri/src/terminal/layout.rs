// SPEC: multi-terminal (TERM-07)

//! Persistência do layout do grid de terminais na tabela `terminal_layout`
//! (migração `001`, T2).
//!
//! O layout é sempre substituído por completo em `save()` — não há merge
//! incremental, porque o conjunto de terminais muda junto do layout (fechar
//! remove uma linha, abrir adiciona outra).

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::params;

use crate::db::{Db, DbError};

#[derive(Debug, Clone, PartialEq)]
pub struct LayoutEntry {
    pub id: String,
    pub slot: i64,
    pub frac_w: f64,
    pub frac_h: f64,
    pub cwd: String,
    pub agent_id: Option<String>,
    pub title: Option<String>,
    pub title_source: String,
    pub minimized: bool,
    pub updated_at: i64,
    /// Preenchido só em `restore()`, quando o `cwd` persistido não existe
    /// mais e foi trocado por `home`. Não é uma coluna da tabela — é o dado
    /// que falta para o front avisar qual diretório sumiu (design.md →
    /// Tratamento de erros: "aviso nomeando o diretório que sumiu").
    pub cwd_fallback_from: Option<String>,
}

/// Apaga o layout salvo e grava `entries` no lugar.
pub fn save(db: &Db, entries: &[LayoutEntry]) -> Result<(), DbError> {
    let conn = db.conn();
    conn.execute("DELETE FROM terminal_layout", [])?;

    for e in entries {
        conn.execute(
            "INSERT INTO terminal_layout
                (id, slot, frac_w, frac_h, cwd, agent_id, title, title_source, minimized, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
            ],
        )?;
    }

    Ok(())
}

/// Restaura o layout salvo, na ordem dos `slot`s.
///
/// Um `cwd` que não existe mais cai para `home`, com `cwd_fallback_from`
/// nomeando o diretório original. Banco sem nenhuma linha salva (primeira
/// execução do app) devolve um único terminal padrão em `home` — não há
/// layout anterior para restaurar, e o produto precisa abrir com pelo menos
/// um terminal.
pub fn restore(db: &Db, home: &Path) -> Result<Vec<LayoutEntry>, DbError> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, slot, frac_w, frac_h, cwd, agent_id, title, title_source, minimized, updated_at
         FROM terminal_layout ORDER BY slot",
    )?;

    let rows = stmt.query_map([], |row| {
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

    let mut entries = Vec::new();
    for row in rows {
        let mut entry = row?;
        if !Path::new(&entry.cwd).is_dir() {
            entry.cwd_fallback_from = Some(entry.cwd.clone());
            entry.cwd = home.to_string_lossy().into_owned();
        }
        entries.push(entry);
    }

    if entries.is_empty() {
        entries.push(default_entry(home));
    }

    Ok(entries)
}

fn default_entry(home: &Path) -> LayoutEntry {
    LayoutEntry {
        id: uuid::Uuid::now_v7().to_string(),
        slot: 0,
        frac_w: 1.0,
        frac_h: 1.0,
        cwd: home.to_string_lossy().into_owned(),
        agent_id: None,
        title: None,
        title_source: "agent".to_string(),
        minimized: false,
        updated_at: now_unix(),
        cwd_fallback_from: None,
    }
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
