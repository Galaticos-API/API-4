-- PRE-02: completar o baseline com estruturas exigidas pelo backlog.

CREATE UNIQUE INDEX IF NOT EXISTS uq_projeto_nome ON projeto(nome);

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tentativas_login SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_ate TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS decisao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entidade_tipo VARCHAR(50) NOT NULL,
    entidade_id UUID NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    contexto TEXT NOT NULL,
    justificativa TEXT NOT NULL,
    alternativas TEXT,
    autor_id UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pbi_versao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pbi_id UUID NOT NULL REFERENCES pbi(id) ON DELETE CASCADE,
    versao INTEGER NOT NULL,
    snapshot_json JSONB NOT NULL,
    justificativa TEXT NOT NULL,
    autor_id UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pbi_id, versao)
);

CREATE TABLE IF NOT EXISTS auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID REFERENCES usuario(id) ON DELETE SET NULL,
    entidade_tipo VARCHAR(50) NOT NULL,
    entidade_id UUID NOT NULL,
    acao VARCHAR(50) NOT NULL,
    justificativa TEXT,
    dados_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_decisao_entidade ON decisao(entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_pbi_versao_pbi ON pbi_versao(pbi_id, versao DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria(entidade_tipo, entidade_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pbi_score_completude') THEN
    ALTER TABLE pbi ADD CONSTRAINT ck_pbi_score_completude CHECK (score_completude BETWEEN 0 AND 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_documento_status') THEN
    ALTER TABLE documento ADD CONSTRAINT ck_documento_status CHECK (status_processamento IN ('pendente', 'processando', 'processado', 'falha'));
  END IF;
END $$;
