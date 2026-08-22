-- SPEC: providers-panel (PROV-10)

-- Uma linha por provedor do catálogo: se está habilitado e em quais perfis de
-- terminal a última varredura o encontrou. Sem seed, no mesmo espírito de
-- `agent_prefs` (004): tabela vazia significa "nunca varreu", e é
-- `commands::providers::provider_prefs_get` que decide varrer nesse caso —
-- não esta migração.
--
-- `found_in` é JSON num campo só, e não uma tabela filha, pelo mesmo motivo
-- de `quota_prefs.providers` (007): a ordem é a do array e todo o CRUD é
-- "substitui a lista inteira".
CREATE TABLE provider_prefs (
  provider_id TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL,
  found_in    TEXT NOT NULL DEFAULT '[]'
);
