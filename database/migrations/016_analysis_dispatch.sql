-- Existing runs have already been dispatched; only new durable requests are queued.
ALTER TABLE analise_repositorio ADD COLUMN IF NOT EXISTS dispatch_pending BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE analise_repositorio ADD COLUMN IF NOT EXISTS dispatch_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analise_repositorio ADD COLUMN IF NOT EXISTS dispatch_after TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE analise_repositorio ADD COLUMN IF NOT EXISTS dispatch_lease UUID;
ALTER TABLE analise_repositorio ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) NOT NULL DEFAULT 'quick';
ALTER TABLE analise_repositorio ADD COLUMN IF NOT EXISTS request_key UUID;
ALTER TABLE analise_repositorio ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE analise_repositorio ADD COLUMN IF NOT EXISTS resume_requested BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_request_key ON analise_repositorio(projeto_id, usuario_id, request_key);
CREATE INDEX IF NOT EXISTS idx_analysis_dispatch ON analise_repositorio(dispatch_after) WHERE dispatch_pending;
