UPDATE usuario
SET role = 'po'
WHERE role IS NULL;

ALTER TABLE usuario
    ALTER COLUMN role SET DEFAULT 'po',
    ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_usuario_role'
    ) THEN
        ALTER TABLE usuario
            ADD CONSTRAINT ck_usuario_role
            CHECK (role IN ('admin', 'po', 'dev'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_usuario_tentativas_login'
    ) THEN
        ALTER TABLE usuario
            ADD CONSTRAINT ck_usuario_tentativas_login
            CHECK (tentativas_login >= 0);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS sessao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    usuario_id UUID NOT NULL
        REFERENCES usuario(id)
        ON DELETE CASCADE,

    token_hash CHAR(64) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    revogada_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessao_usuario
    ON sessao(usuario_id);

CREATE INDEX IF NOT EXISTS idx_sessao_ultima_atividade
    ON sessao(ultima_atividade_em);

CREATE INDEX IF NOT EXISTS idx_sessao_usuario_ativa
    ON sessao(usuario_id, ultima_atividade_em)
    WHERE revogada_em IS NULL;