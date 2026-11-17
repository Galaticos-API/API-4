-- 028_developer_profiles.sql
-- S3-08: Cadastro/vínculo único e consulta consolidada de perfil profissional,
-- restrito a informações de natureza profissional (PBI-05.1.1, PBI-05.1.4, RNF-09/RNF-10).

ALTER TABLE desenvolvedor
  ADD COLUMN IF NOT EXISTS nome VARCHAR(255),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE desenvolvedor
  ALTER COLUMN usuario_id DROP NOT NULL;

UPDATE desenvolvedor d
SET nome = u.nome
FROM usuario u
WHERE d.usuario_id = u.id
  AND (d.nome IS NULL OR btrim(d.nome) = '');

-- Se houver registros duplicados para o mesmo usuario_id em bases antigas,
-- preserva o mais antigo (menor created_at/id) e redireciona competências e alocações.
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN (
    SELECT usuario_id,
           (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS canonical_id,
           array_remove(array_agg(id ORDER BY created_at ASC, id ASC), (array_agg(id ORDER BY created_at ASC, id ASC))[1]) AS duplicate_ids
    FROM desenvolvedor
    WHERE usuario_id IS NOT NULL
    GROUP BY usuario_id
    HAVING COUNT(*) > 1
  ) LOOP
    UPDATE competencia
    SET desenvolvedor_id = dup.canonical_id
    WHERE desenvolvedor_id = ANY(dup.duplicate_ids);

    UPDATE alocacao
    SET desenvolvedor_id = dup.canonical_id
    WHERE desenvolvedor_id = ANY(dup.duplicate_ids);

    DELETE FROM desenvolvedor
    WHERE id = ANY(dup.duplicate_ids);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION sync_desenvolvedor_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.nome IS NULL OR btrim(NEW.nome) = '') AND NEW.usuario_id IS NOT NULL THEN
    SELECT u.nome INTO NEW.nome
    FROM usuario u
    WHERE u.id = NEW.usuario_id;
  END IF;

  IF NEW.nome IS NOT NULL THEN
    NEW.nome := btrim(NEW.nome);
  END IF;

  IF NEW.senioridade IS NOT NULL THEN
    NEW.senioridade := NULLIF(btrim(NEW.senioridade), '');
  END IF;

  IF NEW.bio IS NOT NULL THEN
    NEW.bio := NULLIF(btrim(NEW.bio), '');
  END IF;

  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_desenvolvedor_profile_fields ON desenvolvedor;
CREATE TRIGGER trg_sync_desenvolvedor_profile_fields
BEFORE INSERT OR UPDATE ON desenvolvedor
FOR EACH ROW
EXECUTE FUNCTION sync_desenvolvedor_profile_fields();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_desenvolvedor_identidade'
  ) THEN
    ALTER TABLE desenvolvedor
      ADD CONSTRAINT ck_desenvolvedor_identidade
      CHECK (usuario_id IS NOT NULL OR (nome IS NOT NULL AND btrim(nome) <> ''));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_desenvolvedor_usuario_id
  ON desenvolvedor (usuario_id)
  WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competencia_desenvolvedor
  ON competencia (desenvolvedor_id);

CREATE INDEX IF NOT EXISTS idx_alocacao_desenvolvedor
  ON alocacao (desenvolvedor_id, data_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_alocacao_projeto
  ON alocacao (projeto_id);
