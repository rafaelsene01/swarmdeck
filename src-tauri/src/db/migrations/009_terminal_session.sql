-- SPEC: session-restore (SESS-10)

-- Id da sessão do agente que o app fixou para o terminal (`claude
-- --session-id <uuid>`). É o que torna a retomada possível no boot seguinte:
-- sem ele o app não sabe qual conversa pedir de volta.
--
-- Anulável, como `tab_id` na migração 008: linha gravada antes desta feature
-- fica com NULL, que é exatamente o caso "não há sessão para retomar" — o
-- switch do modal de restauração nasce travado em "nova sessão".
ALTER TABLE terminal_layout ADD COLUMN agent_session_id TEXT;
