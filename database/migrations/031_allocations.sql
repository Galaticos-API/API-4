-- 031_allocations.sql
-- S3-10: alocações com papel, período válido e vínculo a projeto existente (PBI-05.1.3).
-- O histórico consolidado (PBI-05.2.3) continua derivado das alocações na leitura do perfil.

ALTER TABLE alocacao
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE alocacao SET papel = 'Integrante' WHERE papel IS NULL OR btrim(papel) = '';
UPDATE alocacao SET data_inicio = created_at WHERE data_inicio IS NULL;

ALTER TABLE alocacao
  ALTER COLUMN papel SET NOT NULL,
  ALTER COLUMN data_inicio SET NOT NULL;

-- NOT VALID: alocações antigas com período invertido não são reescritas às cegas (isso mudaria
-- o acesso do profissional ao projeto); a regra vale para toda inclusão e alteração daqui em diante.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_alocacao_periodo') THEN
    ALTER TABLE alocacao
      ADD CONSTRAINT ck_alocacao_periodo
      CHECK (data_fim IS NULL OR data_fim >= data_inicio) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_alocacao_papel') THEN
    ALTER TABLE alocacao
      ADD CONSTRAINT ck_alocacao_papel CHECK (btrim(papel) <> '');
  END IF;
END $$;
