-- Must sort BEFORE both published 005 migrations. Do not rename applied migrations.
-- Legacy criteria had no order: assign a stable order without changing IDs/content.
ALTER TABLE criterio_aceitacao ADD COLUMN IF NOT EXISTS ordem INTEGER;

WITH entities_to_repair AS (
  SELECT entidade_tipo, entidade_id FROM criterio_aceitacao
  GROUP BY entidade_tipo, entidade_id
  HAVING count(*) FILTER (WHERE ordem IS NULL) > 0 OR count(*) <> count(DISTINCT ordem)
), ranked AS (
  SELECT c.id, row_number() OVER (
    PARTITION BY c.entidade_tipo, c.entidade_id ORDER BY c.ordem NULLS LAST, c.created_at, c.id
  )::integer AS position
  FROM criterio_aceitacao c
  JOIN entities_to_repair e USING (entidade_tipo, entidade_id)
)
UPDATE criterio_aceitacao c SET ordem = ranked.position FROM ranked WHERE c.id = ranked.id;

ALTER TABLE criterio_aceitacao ALTER COLUMN ordem SET DEFAULT 1;
ALTER TABLE criterio_aceitacao ALTER COLUMN ordem SET NOT NULL;
