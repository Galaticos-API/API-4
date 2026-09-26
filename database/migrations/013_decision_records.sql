-- S1-18: decisões em qualquer nível da hierarquia (projeto, épico, feature, PBI).
ALTER TABLE decisao ADD COLUMN IF NOT EXISTS decisao TEXT;
UPDATE decisao SET decisao = titulo WHERE decisao IS NULL;
ALTER TABLE decisao ALTER COLUMN decisao SET NOT NULL;

ALTER TABLE decisao DROP CONSTRAINT IF EXISTS ck_decisao_entidade_tipo;
ALTER TABLE decisao ADD CONSTRAINT ck_decisao_entidade_tipo
    CHECK (entidade_tipo IN ('projeto', 'epico', 'feature', 'pbi')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_decisao_entidade_data
    ON decisao(entidade_tipo, entidade_id, created_at, id);
