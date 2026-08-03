// SPEC: terminal-statuses (STAT-02, STAT-03)

//! CRUD do catálogo de status de terminal (tabela `terminal_statuses`,
//! migração `003_tasks.sql`) — criar, editar, desativar, reordenar, excluir
//! e restaurar os 4 status padrão.
//!
//! Segue o mesmo padrão de `terminal::meta`: opera sobre `&Connection`
//! recebida de fora (não abre conexão própria), erros de domínio via
//! `thiserror` com `#[error(transparent)] Sqlite(#[from] rusqlite::Error)`
//! para o resto. Diferente de `TerminalMetaService`, este serviço não guarda
//! nenhum estado em memória — toda leitura/escrita é direto na tabela, então
//! não há necessidade de um `struct ...Service` com `Mutex`: são funções
//! livres, como `terminal::layout`.
//!
//! **Status atual por terminal não mora aqui.** Quem sabe qual status cada
//! terminal está exibindo agora é `TerminalMetaService` (`terminal::meta`),
//! e esse dado vive só em memória (não tem coluna própria — ver o comentário
//! no topo de `meta.rs`). Por isso [`delete`] não consulta esse estado
//! diretamente: ele recebe a lista de status_ids em uso via parâmetro
//! (`current_statuses`), deixando quem chama (a camada de comando IPC, fora
//! do escopo desta task) responsável por extrair esses valores de
//! `TerminalMetaService`. Isso evita acoplar este módulo ao estado interno
//! de `meta.rs`, que não expõe (e não precisa expor, para o resto do
//! catálogo) uma forma de enumerar todos os terminais conhecidos.

use rusqlite::{params, Connection, OptionalExtension};

/// Um status do catálogo, como persistido em `terminal_statuses`.
#[derive(Debug, Clone, PartialEq)]
pub struct StatusRecord {
    pub id: String,
    pub label: String,
    pub color: String,
    pub instruction: String,
    pub sort_order: i64,
    pub enabled: bool,
    pub is_default: bool,
}

/// Resultado de [`create`]: o registro gravado mais o aviso opcional de cor
/// visualmente próxima de alguma já em uso (caso de borda do P1 da spec).
#[derive(Debug, Clone, PartialEq)]
pub struct CreateOutcome {
    pub status: StatusRecord,
    pub color_warning: Option<String>,
}

/// Resultado de [`delete`]: quantos terminais estavam exibindo o status
/// removido no momento da exclusão (caso de borda do P1 da spec — "informar
/// quantos terminais foram afetados").
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DeleteOutcome {
    pub affected_terminals: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum CatalogError {
    #[error("rótulo é obrigatório")]
    MissingLabel,
    #[error("instrução é obrigatória")]
    MissingInstruction,
    #[error("status `{0}` não encontrado no catálogo")]
    NotFound(String),
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
}

/// Paleta de cores candidatas para atribuição automática em [`create`], em
/// ordem de preferência. Deliberadamente não inclui as 4 cores dos status
/// padrão (`#22c55e`, `#eab308`, `#3b82f6`, `#6b7280`, ver
/// `003_tasks.sql`), para que uma instalação nova nunca produza colisão
/// exata logo na primeira criação.
///
/// As duas primeiras entradas (`#a855f7` e `#8b5cf6`) são intencionalmente
/// próximas uma da outra — ver [`COLOR_WARNING_THRESHOLD`] — para que o
/// aviso de "cor visualmente próxima" (caso de borda do P1) tenha um cenário
/// natural de teste: a segunda criação de status numa instalação nova já
/// aciona o aviso, sem precisar exaurir a paleta inteira primeiro.
const PALETTE: &[&str] = &[
    "#a855f7", // purple
    "#8b5cf6", // violet — próxima da anterior de propósito
    "#14b8a6", // teal
    "#f97316", // orange
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#84cc16", // lime
    "#f43f5e", // rose
];

/// Limiar de distância euclidiana no espaço RGB (0 a ~441.7) abaixo do qual
/// duas cores são tratadas como visualmente indistinguíveis o suficiente
/// para merecer aviso. A spec não dá o número exato ("QUANDO duas cores de
/// status ficam visualmente indistinguíveis ENTÃO o sistema DEVE alertar na
/// criação" — sem definir "indistinguível"), então a escolha fica registrada
/// aqui: 40 separa com folga as cores dos 4 status padrão entre si (a menor
/// distância entre elas, verde `#22c55e` × azul `#3b82f6`, é ~157), e ainda
/// pega pares realmente próximos como roxo `#a855f7` × violeta `#8b5cf6`
/// (~30). Ajustável sem quebrar nenhuma outra regra caso o valor se mostre
/// ruim na prática.
const COLOR_WARNING_THRESHOLD: f64 = 40.0;

/// Os 4 status padrão, com os mesmos valores da seed em `003_tasks.sql`
/// (id, label, color, instruction, sort_order — `is_default` também segue a
/// seed, que grava `0`; replicado aqui tal como está, não é escopo desta
/// task decidir se esse `0` é o valor certo). [`restore_defaults`] usa esta
/// lista como fonte da verdade.
const DEFAULT_STATUSES: &[(&str, &str, &str, &str, i64)] = &[
    (
        "working",
        "Working",
        "#22c55e",
        "Use when you start working on something.",
        0,
    ),
    (
        "needs_input",
        "Needs input",
        "#eab308",
        "Use when you stop to ask the user something.",
        1,
    ),
    (
        "needs_testing",
        "Needs testing",
        "#3b82f6",
        "Use when you finish implementing and the work is pending the user manual test.",
        2,
    ),
    (
        "done",
        "Done",
        "#6b7280",
        "Use when the work is fully finished.",
        3,
    ),
];

/// Cria um novo status. Exige `label` e `instruction` não vazios (P1,
/// critério 3) e atribui automaticamente uma cor ainda não usada por nenhum
/// status existente (habilitado ou não — uma cor reciclada de um status
/// desabilitado ainda pode confundir se ele for reabilitado depois).
///
/// Se a cor atribuída, mesmo sendo tecnicamente inédita, fica visualmente
/// perto de alguma já em uso (abaixo de [`COLOR_WARNING_THRESHOLD`]),
/// `color_warning` vem preenchido — o chamador decide o que fazer com o
/// aviso (bloquear, confirmar com o usuário, só logar); esta função nunca
/// falha por causa disso.
pub fn create(
    conn: &Connection,
    label: &str,
    instruction: &str,
) -> Result<CreateOutcome, CatalogError> {
    let label = label.trim();
    let instruction = instruction.trim();
    if label.is_empty() {
        return Err(CatalogError::MissingLabel);
    }
    if instruction.is_empty() {
        return Err(CatalogError::MissingInstruction);
    }

    let existing_colors = existing_colors(conn)?;
    let (color, color_warning) = pick_color(&existing_colors);
    let sort_order = next_sort_order(conn)?;
    let id = uuid::Uuid::now_v7().to_string();

    conn.execute(
        "INSERT INTO terminal_statuses (id, label, color, instruction, sort_order, enabled, is_default)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 0)",
        params![id, label, color, instruction, sort_order],
    )?;

    Ok(CreateOutcome {
        status: StatusRecord {
            id,
            label: label.to_string(),
            color,
            instruction: instruction.to_string(),
            sort_order,
            enabled: true,
            is_default: false,
        },
        color_warning,
    })
}

/// Altera rótulo, cor e instrução de um status existente (P1, critério 2).
/// Não mexe em `sort_order` nem em `enabled` — isso é trabalho de
/// [`reorder`] e [`disable`], respectivamente.
pub fn update(
    conn: &Connection,
    id: &str,
    label: &str,
    color: &str,
    instruction: &str,
) -> Result<StatusRecord, CatalogError> {
    let changed = conn.execute(
        "UPDATE terminal_statuses SET label = ?1, color = ?2, instruction = ?3 WHERE id = ?4",
        params![label, color, instruction, id],
    )?;
    if changed == 0 {
        return Err(CatalogError::NotFound(id.to_string()));
    }
    fetch(conn, id)
}

/// Desativa um status (P1, critério 4): mantém a linha em
/// `terminal_statuses`, só desliga `enabled`. `meta::set_status` já filtra
/// por `enabled = 1`, então um status desativado some do catálogo enviado
/// aos agentes sem que os terminais que já o exibem percam o badge — eles
/// não são tocados aqui, o valor deles continua em memória em
/// `TerminalMetaService`.
pub fn disable(conn: &Connection, id: &str) -> Result<(), CatalogError> {
    let changed = conn.execute(
        "UPDATE terminal_statuses SET enabled = 0 WHERE id = ?1",
        params![id],
    )?;
    if changed == 0 {
        return Err(CatalogError::NotFound(id.to_string()));
    }
    Ok(())
}

/// Exclui um status permanentemente (diferente de [`disable`], que só
/// desativa preservando a linha). `current_statuses` é a lista de
/// `status_id` que os terminais conhecidos estão exibindo *agora* — ver o
/// comentário de módulo sobre por que esse dado entra por parâmetro em vez
/// de ser lido diretamente de `TerminalMetaService`. `affected_terminals`
/// conta quantas dessas entradas referenciam `id` (caso de borda do P1:
/// "informar quantos terminais foram afetados").
pub fn delete(
    conn: &Connection,
    id: &str,
    current_statuses: &[&str],
) -> Result<DeleteOutcome, CatalogError> {
    let affected_terminals = current_statuses.iter().filter(|&&s| s == id).count();

    let changed = conn.execute("DELETE FROM terminal_statuses WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(CatalogError::NotFound(id.to_string()));
    }

    Ok(DeleteOutcome { affected_terminals })
}

/// Persiste a nova ordem (P1, critério 5): `ordered_ids[i]` recebe
/// `sort_order = i`. Define a prioridade de exibição do status — quem lê o
/// catálogo (fora do escopo desta task) ordena por essa coluna.
pub fn reorder(conn: &Connection, ordered_ids: &[&str]) -> Result<(), CatalogError> {
    for (index, id) in ordered_ids.iter().enumerate() {
        let changed = conn.execute(
            "UPDATE terminal_statuses SET sort_order = ?1 WHERE id = ?2",
            params![index as i64, id],
        )?;
        if changed == 0 {
            return Err(CatalogError::NotFound(id.to_string()));
        }
    }
    Ok(())
}

/// Repõe os 4 status padrão (P1, critério 6) com os mesmos valores da seed
/// em `003_tasks.sql` — `id`, `label`, `color`, `instruction`, `sort_order`
/// e reabilitados (`enabled = 1`). Usa `INSERT ... ON CONFLICT` para
/// funcionar tanto se a linha ainda existe (foi só editada ou desativada)
/// quanto se foi excluída via [`delete`]. Status extras criados pelo
/// usuário via [`create`] não são tocados — só os 4 originais são repostos.
pub fn restore_defaults(conn: &Connection) -> Result<(), CatalogError> {
    for (id, label, color, instruction, sort_order) in DEFAULT_STATUSES {
        conn.execute(
            "INSERT INTO terminal_statuses (id, label, color, instruction, sort_order, enabled, is_default)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, 0)
             ON CONFLICT(id) DO UPDATE SET
                label = excluded.label,
                color = excluded.color,
                instruction = excluded.instruction,
                sort_order = excluded.sort_order,
                enabled = 1",
            params![id, label, color, instruction, sort_order],
        )?;
    }
    Ok(())
}

fn fetch(conn: &Connection, id: &str) -> Result<StatusRecord, CatalogError> {
    conn.query_row(
        "SELECT id, label, color, instruction, sort_order, enabled, is_default
         FROM terminal_statuses WHERE id = ?1",
        params![id],
        |row| {
            Ok(StatusRecord {
                id: row.get(0)?,
                label: row.get(1)?,
                color: row.get(2)?,
                instruction: row.get(3)?,
                sort_order: row.get(4)?,
                enabled: row.get::<_, i64>(5)? != 0,
                is_default: row.get::<_, i64>(6)? != 0,
            })
        },
    )
    .optional()?
    .ok_or_else(|| CatalogError::NotFound(id.to_string()))
}

fn existing_colors(conn: &Connection) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT color FROM terminal_statuses")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect()
}

fn next_sort_order(conn: &Connection) -> Result<i64, rusqlite::Error> {
    conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM terminal_statuses",
        [],
        |row| row.get(0),
    )
}

/// Escolhe a cor para um novo status: a primeira da [`PALETTE`] que não
/// coincide exatamente com nenhuma `existing`. Se a paleta inteira já está
/// em uso (catálogo grande), cai para a entrada que fica mais longe, no pior
/// caso, de todas as cores existentes — não há mais garantia de cor inédita
/// nesse cenário extremo, mas ainda minimiza a chance de colisão visual.
///
/// Sempre também computa o aviso de proximidade (distância mínima até
/// alguma `existing` abaixo de [`COLOR_WARNING_THRESHOLD`]), mesmo quando a
/// cor escolhida é tecnicamente inédita — os dois critérios são
/// independentes (P1, critério 3 vs. caso de borda de cores próximas).
fn pick_color(existing: &[String]) -> (String, Option<String>) {
    let chosen: &str = PALETTE
        .iter()
        .find(|candidate| !existing.iter().any(|e| e == *candidate))
        .copied()
        .unwrap_or_else(|| least_conflicting(existing));

    let warning = existing
        .iter()
        .filter_map(|e| color_distance(chosen, e).map(|d| (d, e)))
        .filter(|(d, _)| *d < COLOR_WARNING_THRESHOLD)
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(d, close_to)| {
            format!(
                "cor `{chosen}` fica visualmente próxima de `{close_to}` \
                 (distância {d:.1}, abaixo do limiar de {COLOR_WARNING_THRESHOLD})"
            )
        });

    (chosen.to_string(), warning)
}

fn least_conflicting(existing: &[String]) -> &'static str {
    PALETTE
        .iter()
        .max_by(|a, b| min_distance(a, existing).total_cmp(&min_distance(b, existing)))
        .copied()
        .unwrap_or(PALETTE[0])
}

fn min_distance(candidate: &str, existing: &[String]) -> f64 {
    existing
        .iter()
        .filter_map(|e| color_distance(candidate, e))
        .fold(f64::INFINITY, f64::min)
}

/// Distância euclidiana entre duas cores `#RRGGBB` no espaço RGB. `None` se
/// alguma das duas não estiver nesse formato — não deve acontecer com dados
/// desta tabela (toda cor grava por [`create`]/[`restore_defaults`] segue o
/// formato), mas a função não entra em pânico com dado externo malformado.
fn color_distance(a: &str, b: &str) -> Option<f64> {
    let (ar, ag, ab) = parse_hex(a)?;
    let (br, bg, bb) = parse_hex(b)?;
    let dr = ar as f64 - br as f64;
    let dg = ag as f64 - bg as f64;
    let db = ab as f64 - bb as f64;
    Some((dr * dr + dg * dg + db * db).sqrt())
}

fn parse_hex(color: &str) -> Option<(u8, u8, u8)> {
    let hex = color.strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some((r, g, b))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    /// Banco em memória, já migrado (traz o catálogo de status seedado pela
    /// migração 003) — mesmo padrão de `terminal::meta::tests::open_db`.
    fn open_db() -> Db {
        Db::open_in_memory().expect("abrir banco em memória")
    }

    #[test]
    fn create_com_rotulo_e_instrucao_grava_status_habilitado_com_cor_inedita() {
        let db = open_db();

        let outcome = create(db.conn(), "Blocked", "Use when you are stuck on an external dependency.")
            .expect("create com rótulo e instrução deve funcionar");

        assert_eq!(outcome.status.label, "Blocked");
        assert_eq!(
            outcome.status.instruction,
            "Use when you are stuck on an external dependency."
        );
        assert!(outcome.status.enabled);
        assert!(!outcome.status.is_default);
        assert_eq!(outcome.status.sort_order, 4, "deve entrar depois dos 4 padrão (sort_order 0..3)");

        // Cor atribuída não colide com nenhuma das 4 cores padrão.
        let default_colors = ["#22c55e", "#eab308", "#3b82f6", "#6b7280"];
        assert!(
            !default_colors.contains(&outcome.status.color.as_str()),
            "cor atribuída não deve coincidir com nenhuma cor padrão"
        );

        // Foi de fato gravado no banco.
        let persisted = fetch(db.conn(), &outcome.status.id).expect("status recém-criado deve existir");
        assert_eq!(persisted, outcome.status);
    }

    #[test]
    fn create_sem_rotulo_ou_sem_instrucao_e_recusado() {
        let db = open_db();

        let sem_rotulo = create(db.conn(), "   ", "instrução válida");
        assert!(matches!(sem_rotulo, Err(CatalogError::MissingLabel)));

        let sem_instrucao = create(db.conn(), "Rótulo válido", "");
        assert!(matches!(sem_instrucao, Err(CatalogError::MissingInstruction)));

        // Nenhuma das duas tentativas deve ter gravado nada além dos 4 padrão.
        let total: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM terminal_statuses", [], |r| r.get(0))
            .expect("contar linhas");
        assert_eq!(total, 4, "criação recusada não deve gravar linha nenhuma");
    }

    #[test]
    fn update_altera_rotulo_cor_e_instrucao() {
        let db = open_db();

        let updated = update(
            db.conn(),
            "working",
            "Trabalhando",
            "#111111",
            "Instrução nova.",
        )
        .expect("update de status existente deve funcionar");

        assert_eq!(updated.label, "Trabalhando");
        assert_eq!(updated.color, "#111111");
        assert_eq!(updated.instruction, "Instrução nova.");
        // Não mexeu no que não foi pedido.
        assert_eq!(updated.sort_order, 0);
        assert!(updated.enabled);

        let persisted = fetch(db.conn(), "working").expect("status atualizado deve existir");
        assert_eq!(persisted, updated);
    }

    #[test]
    fn disable_preserva_a_linha_e_a_remove_do_catalogo_habilitado() {
        let db = open_db();

        disable(db.conn(), "done").expect("disable de status existente deve funcionar");

        // A linha continua existindo...
        let persisted = fetch(db.conn(), "done").expect("status desativado ainda deve existir");
        assert!(!persisted.enabled);

        // ...mas some da query que `meta::set_status` usa para validar o
        // catálogo enviado aos agentes (`WHERE enabled = 1`).
        let habilitados: Vec<String> = {
            let mut stmt = db
                .conn()
                .prepare("SELECT id FROM terminal_statuses WHERE enabled = 1 ORDER BY sort_order")
                .expect("preparar select de habilitados");
            stmt.query_map([], |r| r.get::<_, String>(0))
                .expect("query_map")
                .collect::<Result<_, _>>()
                .expect("coletar ids habilitados")
        };
        assert!(!habilitados.contains(&"done".to_string()));
        assert_eq!(habilitados, vec!["working", "needs_input", "needs_testing"]);
    }

    #[test]
    fn reorder_persiste_o_novo_sort_order() {
        let db = open_db();

        reorder(
            db.conn(),
            &["done", "working", "needs_testing", "needs_input"],
        )
        .expect("reorder com todos os ids existentes deve funcionar");

        let ordenados: Vec<String> = {
            let mut stmt = db
                .conn()
                .prepare("SELECT id FROM terminal_statuses ORDER BY sort_order")
                .expect("preparar select ordenado");
            stmt.query_map([], |r| r.get::<_, String>(0))
                .expect("query_map")
                .collect::<Result<_, _>>()
                .expect("coletar ids ordenados")
        };

        assert_eq!(
            ordenados,
            vec!["done", "working", "needs_testing", "needs_input"],
            "sort_order deve refletir exatamente a ordem pedida"
        );
    }

    #[test]
    fn restore_defaults_repoe_os_4_originais_apos_edicao_e_desativacao() {
        let db = open_db();

        // Bagunça o catálogo: edita um, desativa outro, exclui um terceiro.
        update(db.conn(), "working", "Mudado", "#000000", "Mudou.")
            .expect("update antes de restaurar");
        disable(db.conn(), "needs_input").expect("disable antes de restaurar");
        delete(db.conn(), "done", &[]).expect("delete antes de restaurar");

        restore_defaults(db.conn()).expect("restore_defaults deve funcionar");

        for (id, label, color, instruction, sort_order) in DEFAULT_STATUSES {
            let record = fetch(db.conn(), id).unwrap_or_else(|_| panic!("status padrão `{id}` deve existir após restore_defaults"));
            assert_eq!(record.label, *label);
            assert_eq!(record.color, *color);
            assert_eq!(record.instruction, *instruction);
            assert_eq!(record.sort_order, *sort_order);
            assert!(record.enabled, "status padrão `{id}` deve voltar habilitado");
        }
    }

    #[test]
    fn delete_de_status_em_uso_reporta_quantos_terminais_foram_afetados() {
        let db = open_db();

        // Simula 3 terminais conhecidos: dois exibindo "working", um "done".
        let current_statuses = ["working", "working", "done"];

        let outcome = delete(db.conn(), "working", &current_statuses)
            .expect("delete de status existente deve funcionar");

        assert_eq!(outcome.affected_terminals, 2);

        // A linha foi de fato removida (diferente de disable).
        let total: i64 = db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM terminal_statuses WHERE id = 'working'",
                [],
                |r| r.get(0),
            )
            .expect("contar linhas com id working");
        assert_eq!(total, 0, "delete deve remover a linha, diferente de disable");
    }

    #[test]
    fn cores_visualmente_proximas_geram_aviso_na_criacao() {
        let db = open_db();

        // Primeira criação: pega a primeira cor da paleta (#a855f7), longe
        // de todas as cores padrão — sem aviso.
        let primeira = create(db.conn(), "Blocked", "Instrução um.")
            .expect("primeira criação deve funcionar");
        assert_eq!(primeira.status.color, "#a855f7");
        assert!(
            primeira.color_warning.is_none(),
            "primeira cor da paleta não deve colidir com nenhuma cor padrão"
        );

        // Segunda criação: pega a próxima cor da paleta (#8b5cf6), que é
        // intencionalmente próxima da primeira — deve gerar aviso.
        let segunda = create(db.conn(), "Review", "Instrução dois.")
            .expect("segunda criação deve funcionar");
        assert_eq!(segunda.status.color, "#8b5cf6");
        assert!(
            segunda.color_warning.is_some(),
            "cor próxima da recém-atribuída à primeira criação deve gerar aviso"
        );
        assert!(segunda.color_warning.unwrap().contains("#a855f7"));
    }
}
