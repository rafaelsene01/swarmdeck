-- Preferência de perfil de terminal padrão (WSLP-02 — REVOKED by AD-035: o
-- seletor de Configurações saiu; a coluna segue lida por
-- `prefs::resolve_default` como fallback de `profile_for_path`). Linha única (id fixo
-- em 1), sem seed: o banco nasce sem preferência gravada —
-- `shells::prefs::resolve_default` decide o que fazer nesse caso, não esta
-- migração.
CREATE TABLE terminal_profile_prefs (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  profile TEXT
);
