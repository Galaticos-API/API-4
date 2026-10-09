-- S2-01/S2-02: durable ingestion leases, retry schedule and safe diagnostics.
ALTER TABLE documento
  ADD COLUMN IF NOT EXISTS processamento_tentativas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processamento_proxima_tentativa TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS processamento_bloqueado_ate TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processamento_erro VARCHAR(300);

CREATE INDEX IF NOT EXISTS idx_documento_ingestao_pendente
  ON documento(processamento_proxima_tentativa, created_at)
  WHERE status_processamento IN ('pendente', 'processando');
