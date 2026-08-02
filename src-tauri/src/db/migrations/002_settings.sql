-- Preferências de atualização (REL-34) e versões puladas (REL-23).
-- `update_settings` é uma linha única (id fixo em 1) com o toggle de
-- verificação automática, ligado por padrão. `skipped_update_versions`
-- guarda uma linha por versão pulada — pular 0.1.3 não pode afetar
-- 0.1.4, por isso não é um campo escalar.
CREATE TABLE update_settings (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  auto_check INTEGER NOT NULL DEFAULT 1
);

INSERT INTO update_settings (id, auto_check) VALUES (1, 1);

CREATE TABLE skipped_update_versions (
  version    TEXT PRIMARY KEY,
  skipped_at INTEGER NOT NULL
);
