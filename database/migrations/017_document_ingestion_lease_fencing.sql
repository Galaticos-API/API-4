-- S2-01: fence stale workers after an ingestion lease expires and is reclaimed.
ALTER TABLE documento
  ADD COLUMN IF NOT EXISTS processamento_lease_id UUID;
