-- SPEC: agent-permission-mode (PERM-04)

-- Modo de permissão com que o agente daquele terminal foi lançado
-- (`claude --permission-mode <modo>`), escolhido no passo AGENT do wizard.
--
-- Anulável, como `agent_session_id` na migração 009: linha gravada antes desta
-- feature fica com NULL, que significa "nenhum modo escolhido" — o terminal
-- restaurado sobe sem a flag e o CLI aplica o padrão dele. Nenhum backfill
-- inventa um modo que o usuário nunca escolheu.
ALTER TABLE terminal_layout ADD COLUMN permission_mode TEXT;
