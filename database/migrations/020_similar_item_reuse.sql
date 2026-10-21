CREATE TABLE IF NOT EXISTS reaproveitamento_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo_relacao VARCHAR(30) NOT NULL DEFAULT 'reaproveitado_de',
    destino_tipo VARCHAR(20) NOT NULL,
    destino_id UUID NOT NULL,
    destino_projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    origem_tipo VARCHAR(20) NOT NULL,
    origem_id UUID NOT NULL,
    origem_projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    campos TEXT[] NOT NULL,
    criado_por UUID REFERENCES usuario(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_reaproveitamento_destino_tipo CHECK (destino_tipo IN ('epico', 'feature', 'pbi')),
    CONSTRAINT ck_reaproveitamento_origem_tipo CHECK (origem_tipo IN ('epico', 'feature', 'pbi')),
    CONSTRAINT ck_reaproveitamento_mesmo_nivel CHECK (destino_tipo = origem_tipo),
    CONSTRAINT ck_reaproveitamento_tipo_relacao CHECK (tipo_relacao IN ('reaproveitado_de')),
    CONSTRAINT ck_reaproveitamento_nao_reflexivo CHECK (destino_id <> origem_id),
    CONSTRAINT ck_reaproveitamento_campos CHECK (cardinality(campos) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reaproveitamento_item
    ON reaproveitamento_item (destino_tipo, destino_id, origem_tipo, origem_id, tipo_relacao);

CREATE INDEX IF NOT EXISTS idx_reaproveitamento_origem
    ON reaproveitamento_item (origem_tipo, origem_id);
