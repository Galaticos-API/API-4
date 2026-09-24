-- S1-19/S1-22: metadados do upload seguro e outbox de eventos de integração.
ALTER TABLE documento ADD COLUMN IF NOT EXISTS extensao VARCHAR(10);
ALTER TABLE documento ADD COLUMN IF NOT EXISTS tamanho_bytes BIGINT;
ALTER TABLE documento ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuario(id) ON DELETE SET NULL;

ALTER TABLE documento DROP CONSTRAINT IF EXISTS ck_documento_tamanho;
ALTER TABLE documento ADD CONSTRAINT ck_documento_tamanho CHECK (tamanho_bytes IS NULL OR tamanho_bytes > 0);

CREATE INDEX IF NOT EXISTS idx_documento_projeto_created
    ON documento(projeto_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chunk_documento
    ON chunk(entidade_id) WHERE entidade_tipo = 'documento';

CREATE TABLE IF NOT EXISTS evento_integracao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(100) NOT NULL,
    chave_idempotencia VARCHAR(200) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    tentativas INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    publicado_em TIMESTAMPTZ,
    CONSTRAINT uq_evento_integracao_chave UNIQUE (chave_idempotencia),
    CONSTRAINT ck_evento_integracao_status CHECK (status IN ('pendente', 'publicado', 'falha'))
);

CREATE INDEX IF NOT EXISTS idx_evento_integracao_pendente
    ON evento_integracao(created_at) WHERE status <> 'publicado';
