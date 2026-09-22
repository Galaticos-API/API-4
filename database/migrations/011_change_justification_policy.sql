-- S1-24 / PBI-01.5.6: organization policy for mandatory change justification.
-- Singleton while there is no organization entity. Does not alter item status.
CREATE TABLE IF NOT EXISTS organization_policy (
    id UUID PRIMARY KEY,
    justificativa_alteracao_obrigatoria BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES usuario(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_organization_policy_singleton CHECK (id = '00000000-0000-4000-8000-000000000002'::uuid)
);

INSERT INTO organization_policy (id, justificativa_alteracao_obrigatoria)
VALUES ('00000000-0000-4000-8000-000000000002'::uuid, TRUE)
ON CONFLICT (id) DO NOTHING;
