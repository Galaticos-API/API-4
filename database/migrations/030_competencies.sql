-- 030_competencies.sql
-- S3-09: competências com nível, evidência e tecnologia do vocabulário controlado (PBI-05.1.2).

ALTER TABLE competencia
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Níveis legados fora da escala passam a 'intermediario', que já era o padrão da coluna.
UPDATE competencia
SET nivel = 'intermediario'
WHERE nivel IS NULL
   OR nivel NOT IN ('iniciante', 'intermediario', 'avancado', 'especialista');

-- Uma competência por tecnologia em cada perfil. Bases antigas podem ter repetições:
-- preserva o maior nível (e, no empate, o registro mais recente) e junta as evidências.
WITH ranked AS (
  SELECT
    id,
    desenvolvedor_id,
    tecnologia_id,
    row_number() OVER (
      PARTITION BY desenvolvedor_id, tecnologia_id
      ORDER BY array_position(ARRAY['iniciante','intermediario','avancado','especialista']::text[], nivel) DESC,
               created_at DESC NULLS LAST,
               id DESC
    ) AS posicao
  FROM competencia
),
evidencias AS (
  SELECT
    desenvolvedor_id,
    tecnologia_id,
    string_agg(DISTINCT NULLIF(btrim(evidencia), ''), E'\n') AS evidencia
  FROM competencia
  GROUP BY desenvolvedor_id, tecnologia_id
  HAVING COUNT(*) > 1
)
UPDATE competencia c
SET evidencia = e.evidencia
FROM ranked r
JOIN evidencias e USING (desenvolvedor_id, tecnologia_id)
WHERE c.id = r.id AND r.posicao = 1;

DELETE FROM competencia c
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY desenvolvedor_id, tecnologia_id
           ORDER BY array_position(ARRAY['iniciante','intermediario','avancado','especialista']::text[], nivel) DESC,
                    created_at DESC NULLS LAST,
                    id DESC
         ) AS posicao
  FROM competencia
) r
WHERE c.id = r.id AND r.posicao > 1;

ALTER TABLE competencia
  ALTER COLUMN nivel SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_competencia_nivel') THEN
    ALTER TABLE competencia
      ADD CONSTRAINT ck_competencia_nivel
      CHECK (nivel IN ('iniciante', 'intermediario', 'avancado', 'especialista'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_competencia_desenvolvedor_tecnologia
  ON competencia (desenvolvedor_id, tecnologia_id);
