ALTER TABLE mensagem ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'completed'
  CHECK (processing_status IN ('pending', 'completed', 'failed'));
CREATE INDEX IF NOT EXISTS idx_mensagem_pending ON mensagem(conversa_id) WHERE processing_status = 'pending';

ALTER TABLE documento ADD COLUMN IF NOT EXISTS ingest_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documento ADD COLUMN IF NOT EXISTS ingest_next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE documento ADD COLUMN IF NOT EXISTS ingest_lease UUID;
ALTER TABLE documento ADD COLUMN IF NOT EXISTS ingest_locked_until TIMESTAMPTZ;
ALTER TABLE documento ADD COLUMN IF NOT EXISTS ingest_error TEXT;
CREATE INDEX IF NOT EXISTS idx_documento_ingestion ON documento(ingest_next_attempt_at)
  WHERE status_processamento <> 'processado';
