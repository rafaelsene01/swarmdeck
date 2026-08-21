-- Aviso de nova versão em toast (TOAST-08). Coluna nova em `update_settings`,
-- a mesma linha única do toggle de verificação automática — a preferência é
-- do mesmo assunto e o `id = 1` já existe desde a migração 002.
--
-- `DEFAULT 1` cobre banco novo; o `UPDATE` cobre a linha que já está lá numa
-- instalação existente, para que ninguém herde NULL e o toast nasça ligado
-- nos dois casos.
ALTER TABLE update_settings ADD COLUMN toast_enabled INTEGER NOT NULL DEFAULT 1;

UPDATE update_settings SET toast_enabled = 1 WHERE id = 1;
