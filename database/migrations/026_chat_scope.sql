-- Persist the chat scope explicitly. Legacy conversations without a project
-- stay unavailable; they must never silently expand to every authorized project.
ALTER TABLE conversa
  ADD COLUMN IF NOT EXISTS escopo_tipo VARCHAR(32);

UPDATE conversa
SET escopo_tipo = CASE WHEN projeto_id IS NOT NULL THEN 'projeto' ELSE 'indisponivel' END
WHERE escopo_tipo IS NULL;

ALTER TABLE conversa
  ALTER COLUMN escopo_tipo SET DEFAULT 'projeto',
  ALTER COLUMN escopo_tipo SET NOT NULL;

ALTER TABLE conversa
  DROP CONSTRAINT IF EXISTS conversa_escopo_tipo_check;

ALTER TABLE conversa
  ADD CONSTRAINT conversa_escopo_tipo_check
  CHECK (escopo_tipo IN ('projeto', 'todos_autorizados', 'indisponivel'));
