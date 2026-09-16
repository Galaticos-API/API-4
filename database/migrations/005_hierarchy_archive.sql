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
