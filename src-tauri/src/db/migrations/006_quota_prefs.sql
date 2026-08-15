-- SPEC: quota-indicator (QUOTA-09, QUOTA-10)

-- Preferência do indicador de cota (QUOTA-09, QUOTA-10). Linha única (id
-- fixo em 1), com seed: ao contrário de `agent_prefs`, o indicador precisa
-- de um default utilizável desde o banco novo (ligado, ambas as janelas).
CREATE TABLE quota_prefs (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  window  TEXT    NOT NULL DEFAULT 'both'
);
INSERT INTO quota_prefs (id) VALUES (1);
