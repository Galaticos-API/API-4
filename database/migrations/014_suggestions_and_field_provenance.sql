-- S2-13: ciclo humano de sugestoes da IA, proveniencia por campo e fallback manual.
-- A proveniencia e guardada por campo (nao por registro inteiro) para que um
-- item possa ter alguns campos humanos e outros aceitos/editados de sugestoes.

ALTER TABLE epico ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE feature ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pbi ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Tabela de propostas da IA (nunca grava diretamente nas tabelas de negocio).
-- Uma sugestao so altera epico/feature/pbi quando aceita ou editada por uma
-- pessoa autenticada; ate la permanece isolada nesta tabela de staging.
CREATE TABLE IF NOT EXISTS sugestao_ia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entidade_tipo VARCHAR(20) NOT NULL,
    entidade_id UUID NOT NULL,
    campo VARCHAR(100) NOT NULL,
    valor_sugerido TEXT NOT NULL,
    valor_resolvido TEXT,
    origem VARCHAR(100) NOT NULL DEFAULT 'manual',
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    criado_por UUID REFERENCES usuario(id) ON DELETE SET NULL,
    resolvido_por UUID REFERENCES usuario(id) ON DELETE SET NULL,
    resolvido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_sugestao_ia_entidade_tipo CHECK (entidade_tipo IN ('epico', 'feature', 'pbi')),
    CONSTRAINT ck_sugestao_ia_status CHECK (status IN ('pendente', 'aceita', 'editada', 'descartada')),
    CONSTRAINT ck_sugestao_ia_resolucao CHECK (
        (status = 'pendente' AND resolvido_em IS NULL AND resolvido_por IS NULL)
        OR (status <> 'pendente' AND resolvido_em IS NOT NULL)
    )
);

-- Garante no maximo uma sugestao pendente por campo: uma nova proposta para o
-- mesmo campo atualiza a pendente existente em vez de duplicar (idempotencia
-- de criacao/repeticao de execucao da IA).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sugestao_ia_pendente
    ON sugestao_ia (entidade_tipo, entidade_id, campo)
    WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_sugestao_ia_entidade
    ON sugestao_ia (entidade_tipo, entidade_id, status, created_at);
