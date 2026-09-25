-- Backlog technology tags are replaced atomically by the API. Normalize any
-- historical duplicates before enforcing the association's natural key.
DELETE FROM entidade_tecnologia duplicate
USING entidade_tecnologia retained
WHERE duplicate.entidade_tipo = retained.entidade_tipo
  AND duplicate.entidade_id = retained.entidade_id
  AND duplicate.tecnologia_id = retained.tecnologia_id
  AND duplicate.ctid > retained.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_entidade_tecnologia_association
  ON entidade_tecnologia (entidade_tipo, entidade_id, tecnologia_id);
