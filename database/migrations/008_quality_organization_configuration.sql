-- Sprint 2 / PBI-01.6.1: singleton organization-wide quality policy.
-- This repository currently has no organization entity, so this row represents
-- the sole organization. Keep settings versioned and auditable; never alter PBI status here.
CREATE TABLE IF NOT EXISTS quality_configuration (
    id UUID PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    configuration JSONB NOT NULL,
    updated_by UUID REFERENCES usuario(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_quality_configuration_singleton CHECK (id = '00000000-0000-4000-8000-000000000001'::uuid),
    CONSTRAINT ck_quality_configuration_shape CHECK (
      COALESCE(jsonb_typeof(configuration->'checks') = 'object', FALSE)
      AND COALESCE(jsonb_typeof(configuration->'vague_terms') = 'array', FALSE)
    )
);

INSERT INTO quality_configuration (id, version, configuration)
VALUES (
    '00000000-0000-4000-8000-000000000001'::uuid,
    1,
    '{"checks":{"titulo_infinitivo":true,"historia_completa":true,"cenario_estruturado":true,"termos_vagos":true},"vague_terms":["adequado","rápido","rapido","intuitivo","correto","bonito"]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
