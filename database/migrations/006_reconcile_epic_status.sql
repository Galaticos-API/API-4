-- Preserve historical values; the canonical API treats ativo/arquivado as read-only.
-- Both published 005 migrations use this name with different definitions.
ALTER TABLE epico DROP CONSTRAINT IF EXISTS ck_epico_status;
ALTER TABLE epico ADD CONSTRAINT ck_epico_status
  CHECK (status IN ('rascunho', 'concluido', 'ativo', 'arquivado'));
