// SPEC: window-geometry (WGEO-01, WGEO-02, WGEO-03)

//! Persistência da geometria da janela `main` — a linha única de
//! `window_state` (migração 013).
//!
//! Os tipos `Rect`/`Saved` moram em `crate::window_geometry` porque é lá que
//! a decisão de restauração é tomada e testada; esta camada só lê e grava.

use rusqlite::{params, Connection, OptionalExtension};

use super::DbError;
use crate::window_geometry::{Rect, Saved};

/// Geometria salva, ou `None` na primeira execução (linha ainda inexistente).
pub fn window_state(conn: &Connection) -> Result<Option<Saved>, DbError> {
    let row = conn
        .query_row(
            "SELECT x, y, width, height, maximized FROM window_state WHERE id = 1",
            [],
            |row| {
                Ok(Saved {
                    rect: Rect {
                        x: row.get(0)?,
                        y: row.get(1)?,
                        width: row.get::<_, i64>(2)? as u32,
                        height: row.get::<_, i64>(3)? as u32,
                    },
                    maximized: row.get::<_, i64>(4)? != 0,
                })
            },
        )
        .optional()?;
    Ok(row)
}

/// Grava a geometria, criando a linha 1 na primeira vez.
pub fn set_window_state(conn: &Connection, saved: &Saved) -> Result<(), DbError> {
    conn.execute(
        "INSERT INTO window_state (id, x, y, width, height, maximized)
         VALUES (1, ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (id) DO UPDATE SET
             x = ?1, y = ?2, width = ?3, height = ?4, maximized = ?5",
        params![
            saved.rect.x,
            saved.rect.y,
            saved.rect.width as i64,
            saved.rect.height as i64,
            saved.maximized as i64,
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    // WGEO-01, WGEO-06: banco novo não tem geometria; o que é gravado volta
    // idêntico, e uma segunda gravação sobrescreve a linha em vez de falhar
    // no `PRIMARY KEY`.
    #[test]
    fn banco_novo_nao_tem_geometria_e_gravacao_faz_round_trip() {
        let db = Db::open_in_memory().expect("abrir banco em memória");

        assert_eq!(window_state(db.conn()).expect("ler geometria"), None);

        let primeira = Saved {
            rect: Rect {
                x: -1200,
                y: 40,
                width: 1400,
                height: 900,
            },
            maximized: false,
        };
        set_window_state(db.conn(), &primeira).expect("gravar geometria");
        assert_eq!(
            window_state(db.conn()).expect("ler geometria"),
            Some(primeira)
        );

        let segunda = Saved {
            rect: Rect {
                x: 0,
                y: 0,
                width: 2560,
                height: 1440,
            },
            maximized: true,
        };
        set_window_state(db.conn(), &segunda).expect("regravar geometria");
        assert_eq!(
            window_state(db.conn()).expect("ler geometria"),
            Some(segunda)
        );
    }
}
