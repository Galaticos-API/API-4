-- S1-09 integrada à S1-08; também regulariza instalações da antiga 005_hierarchy_archive.
ALTER TABLE epico ALTER COLUMN status SET DEFAULT 'rascunho';
ALTER TABLE feature ALTER COLUMN status SET DEFAULT 'rascunho';
ALTER TABLE pbi ALTER COLUMN status SET DEFAULT 'rascunho';
ALTER TABLE feature DROP CONSTRAINT IF EXISTS ck_feature_status;
ALTER TABLE feature ADD CONSTRAINT ck_feature_status CHECK (status IN ('rascunho','concluido','arquivado'));
ALTER TABLE pbi DROP CONSTRAINT IF EXISTS ck_pbi_status;
ALTER TABLE pbi ADD CONSTRAINT ck_pbi_status CHECK (status IN ('rascunho','concluido','arquivado'));
-- S1-09: arquivamento em cascata sem apagar o histórico.
ALTER TABLE epico ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ativo';
ALTER TABLE feature ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ativo';
ALTER TABLE pbi ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ativo';
ALTER TABLE projeto ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE epico ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE feature ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE pbi ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Existing archived projects retain their history. The historical archive date
-- is unknown; do not manufacture a timestamp during migration.
UPDATE epico e SET status = 'arquivado'
FROM projeto p WHERE e.projeto_id = p.id AND p.status = 'arquivado' AND e.status != 'arquivado';
UPDATE feature f SET status = 'arquivado'
FROM epico e WHERE f.epico_id = e.id AND e.status = 'arquivado' AND f.status != 'arquivado';
UPDATE pbi p SET status = 'arquivado'
FROM feature f WHERE p.feature_id = f.id AND f.status = 'arquivado' AND p.status != 'arquivado';
