-- Último diretório escolhido no seletor de pasta ao criar terminal (TERM-11).
-- Linha única (id fixo em 1), sem seed: o banco nasce sem diretório
-- gravado — ausência de linha significa "nunca escolhido ainda", mesmo
-- padrão de `agent_prefs` (migração 004) / `agents::prefs`.
CREATE TABLE terminal_picker_prefs (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  last_dir TEXT
);
