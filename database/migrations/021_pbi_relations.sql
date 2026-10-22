-- S2-15: Relações bidirecionais entre PBIs e prevenção de ciclos
-- Tabela pbi_relacao com constraints de tipo, auto-relação e unicidade

DO $$
BEGIN
  -- Cria a tabela caso não exista (idempotente)
  CREATE TABLE IF NOT EXISTS pbi_relacao (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      pbi_origem_id UUID NOT NULL REFERENCES pbi(id) ON DELETE CASCADE,
      pbi_destino_id UUID NOT NULL REFERENCES pbi(id) ON DELETE CASCADE,
      tipo_relacao VARCHAR(50) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
END $$;

-- Garante constraint dos tipos permitidos: depende_de, similar_a, substitui
ALTER TABLE pbi_relacao
  DROP CONSTRAINT IF EXISTS pbi_relacao_tipo_relacao_check;

ALTER TABLE pbi_relacao
  ADD CONSTRAINT pbi_relacao_tipo_relacao_check
  CHECK (tipo_relacao IN ('depende_de', 'similar_a', 'substitui'));

-- Impede auto-relação
ALTER TABLE pbi_relacao
  DROP CONSTRAINT IF EXISTS pbi_relacao_sem_auto_relacao;

ALTER TABLE pbi_relacao
  ADD CONSTRAINT pbi_relacao_sem_auto_relacao
  CHECK (pbi_origem_id <> pbi_destino_id);

-- Unicidade da relação
CREATE UNIQUE INDEX IF NOT EXISTS idx_pbi_relacao_unica
  ON pbi_relacao(pbi_origem_id, pbi_destino_id, tipo_relacao);

-- Índices bidirecionais para consulta rápida
CREATE INDEX IF NOT EXISTS idx_pbi_relacao_origem
  ON pbi_relacao(pbi_origem_id);

CREATE INDEX IF NOT EXISTS idx_pbi_relacao_destino
  ON pbi_relacao(pbi_destino_id);
