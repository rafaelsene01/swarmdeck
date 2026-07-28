-- Layout do grid de terminais.
-- `title_source` é o que implementa TERM-06/STAT-07: um rename manual do
-- usuário vence e passa a descartar títulos vindos do agente.
CREATE TABLE terminal_layout (
  id            TEXT PRIMARY KEY,
  slot          INTEGER NOT NULL,
  frac_w        REAL    NOT NULL,
  frac_h        REAL    NOT NULL,
  cwd           TEXT    NOT NULL,
  agent_id      TEXT,
  title         TEXT,
  title_source  TEXT    NOT NULL DEFAULT 'agent'
                        CHECK (title_source IN ('agent', 'user')),
  minimized     INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_terminal_layout_slot ON terminal_layout (slot);
