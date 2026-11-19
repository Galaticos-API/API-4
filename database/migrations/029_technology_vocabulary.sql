-- 029_technology_vocabulary.sql
-- S3-14: vocabulário controlado de tecnologias (PBI-06.2.2).
-- Garante unicidade pelo nome normalizado ("Node.js", "NodeJS" e "node js" são o mesmo
-- registro) e prepara a remoção consciente das associações existentes.

CREATE OR REPLACE FUNCTION normalizar_nome_tecnologia(valor TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- Minúsculas, sem acentos e sem pontuação/espaços. "+" e "#" são preservados porque
  -- distinguem tecnologias reais (C, C++ e C#).
  SELECT regexp_replace(
    translate(
      lower(coalesce(valor, '')),
      'áàâãäåéèêëíìîïóòôõöúùûüçñý',
      'aaaaaaeeeeiiiiooooouuuucny'
    ),
    '[^a-z0-9+#]',
    '',
    'g'
  );
$$;

ALTER TABLE tecnologia
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Bases antigas podem ter variações de escrita já cadastradas. Preserva o registro mais
-- antigo de cada grupo e redireciona competências e classificações antes de criar o índice.
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN (
    SELECT
      (array_agg(id ORDER BY created_at ASC NULLS LAST, id ASC))[1] AS canonical_id,
      array_remove(
        array_agg(id ORDER BY created_at ASC NULLS LAST, id ASC),
        (array_agg(id ORDER BY created_at ASC NULLS LAST, id ASC))[1]
      ) AS duplicate_ids
    FROM tecnologia
    GROUP BY normalizar_nome_tecnologia(nome)
    HAVING COUNT(*) > 1
  ) LOOP
    UPDATE competencia SET tecnologia_id = dup.canonical_id
    WHERE tecnologia_id = ANY(dup.duplicate_ids);

    -- uq_entidade_tecnologia_association (011) impede duas classificações iguais: descarta
    -- a variação quando o item já está classificado com o registro canônico.
    DELETE FROM entidade_tecnologia variante
    USING entidade_tecnologia canonica
    WHERE variante.tecnologia_id = ANY(dup.duplicate_ids)
      AND canonica.tecnologia_id = dup.canonical_id
      AND canonica.entidade_tipo = variante.entidade_tipo
      AND canonica.entidade_id = variante.entidade_id;

    -- Duas variações diferentes no mesmo item também colidiriam ao serem redirecionadas.
    DELETE FROM entidade_tecnologia variante
    USING entidade_tecnologia outra
    WHERE variante.tecnologia_id = ANY(dup.duplicate_ids)
      AND outra.tecnologia_id = ANY(dup.duplicate_ids)
      AND outra.entidade_tipo = variante.entidade_tipo
      AND outra.entidade_id = variante.entidade_id
      AND outra.id < variante.id;

    UPDATE entidade_tecnologia SET tecnologia_id = dup.canonical_id
    WHERE tecnologia_id = ANY(dup.duplicate_ids);

    DELETE FROM tecnologia WHERE id = ANY(dup.duplicate_ids);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tecnologia_nome_normalizado
  ON tecnologia (normalizar_nome_tecnologia(nome));

CREATE INDEX IF NOT EXISTS idx_entidade_tecnologia_tecnologia
  ON entidade_tecnologia (tecnologia_id);

CREATE INDEX IF NOT EXISTS idx_competencia_tecnologia
  ON competencia (tecnologia_id);
