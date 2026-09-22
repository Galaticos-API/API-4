-- Adicionar colunas de autenticação à tabela usuario
-- ativo: indica se o usuário está ativo
-- tentativas_login: contador de tentativas de login falhas
-- bloqueado_ate: timestamp até quando o usuário está bloqueado

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'usuario'
        AND column_name = 'ativo'
    ) THEN
        ALTER TABLE usuario
        ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'usuario'
        AND column_name = 'tentativas_login'
    ) THEN
        ALTER TABLE usuario
        ADD COLUMN tentativas_login INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'usuario'
        AND column_name = 'bloqueado_ate'
    ) THEN
        ALTER TABLE usuario
        ADD COLUMN bloqueado_ate TIMESTAMPTZ;
    END IF;
END $$;
