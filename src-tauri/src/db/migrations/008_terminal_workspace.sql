-- SPEC: terminal-layout-options (LAYOUT-22)

-- Abas de terminais (LAYOUT-22): a aba passa a ser a dona dos terminais, com
-- nome e modo de layout próprios. `slot` é a ordem de exibição.
--
-- Sem CHECK em `layout_mode`/`layout_span` de propósito: LAYOUT-28 exige que
-- um valor desconhecido caia no default (`horizontal`/`first`) na leitura, e
-- não que a gravação falhe. Quem normaliza é `terminal::layout::restore`.
CREATE TABLE terminal_tabs (
  id           TEXT PRIMARY KEY,
  slot         INTEGER NOT NULL,
  name         TEXT    NOT NULL,
  layout_mode  TEXT    NOT NULL DEFAULT 'horizontal',
  layout_span  TEXT    NOT NULL DEFAULT 'first',
  updated_at   INTEGER NOT NULL
);

CREATE INDEX idx_terminal_tabs_slot ON terminal_tabs (slot);

-- Anulável para não quebrar linhas de bancos já existentes. Linha com
-- `tab_id` nulo ou apontando para aba inexistente é descartada na
-- restauração (LAYOUT-25).
ALTER TABLE terminal_layout ADD COLUMN tab_id TEXT;

CREATE INDEX idx_terminal_layout_tab ON terminal_layout (tab_id, slot);
