-- 005_epico_guia_fields.sql: S1-05 - Adicionar campos do Guia de Especificação na tabela epico

ALTER TABLE epico
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS resultado_esperado TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'rascunho';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_epico_status') THEN
    ALTER TABLE epico ADD CONSTRAINT ck_epico_status CHECK (status IN ('rascunho', 'ativo', 'concluido', 'arquivado'));
  END IF;
END $$;
