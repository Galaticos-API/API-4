-- ==============================================================================
-- Migration 005: Campos obrigatórios do guia para épico/feature/pbi e
-- estrutura polimórfica ordenada dos critérios de aceitação (S1-05/06/07/10)
-- ==============================================================================

ALTER TABLE epico
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS resultado_esperado TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'rascunho';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_epico_status') THEN
    ALTER TABLE epico ADD CONSTRAINT ck_epico_status CHECK (status IN ('rascunho', 'concluido'));
  END IF;
END $$;

ALTER TABLE feature
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'rascunho';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_feature_status') THEN
    ALTER TABLE feature ADD CONSTRAINT ck_feature_status CHECK (status IN ('rascunho', 'concluido'));
  END IF;
END $$;

ALTER TABLE pbi
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'rascunho';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pbi_status') THEN
    ALTER TABLE pbi ADD CONSTRAINT ck_pbi_status CHECK (status IN ('rascunho', 'concluido'));
  END IF;
END $$;

-- Critérios de aceitação polimórficos: nome do cenário (exclusivo de PBI) e
-- ordem persistida, exigidos por PBI-01.2.1 a PBI-01.2.3.
ALTER TABLE criterio_aceitacao
  ADD COLUMN IF NOT EXISTS nome VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_criterio_entidade_tipo') THEN
    ALTER TABLE criterio_aceitacao ADD CONSTRAINT ck_criterio_entidade_tipo CHECK (entidade_tipo IN ('epico', 'feature', 'pbi'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_epico_projeto ON epico(projeto_id);
CREATE INDEX IF NOT EXISTS idx_feature_epico ON feature(epico_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_criterio_entidade_ordem ON criterio_aceitacao(entidade_tipo, entidade_id, ordem);
