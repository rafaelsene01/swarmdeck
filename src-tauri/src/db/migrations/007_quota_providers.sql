-- SPEC: quota-indicator (QUOTA-26)

-- Lista ordenada dos provedores exibidos no popover do indicador (QUOTA-26).
-- JSON num campo só, não uma tabela filha: a ordem é a ordem do array e todo
-- o CRUD é "substitui a lista inteira" — uma tabela não pagaria por si.
ALTER TABLE quota_prefs ADD COLUMN providers TEXT NOT NULL
  DEFAULT '[{"id":"claude-code","enabled":true},{"id":"codex-cli","enabled":true},{"id":"opencode","enabled":true}]';
