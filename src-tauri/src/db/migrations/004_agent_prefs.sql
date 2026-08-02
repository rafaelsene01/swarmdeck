-- Preferência de agente padrão (AGT-01). Linha única (id fixo em 1), sem
-- seed: o banco nasce sem preferência gravada — `resolve_effective_default`
-- (agents::prefs) decide o que fazer nesse caso, não esta migração.
CREATE TABLE agent_prefs (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  default_agent_id TEXT
);
