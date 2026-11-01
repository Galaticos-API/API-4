-- Retain the assistant result classification so reopened chats preserve the
-- no-evidence state. Existing messages remain NULL because their origin cannot
-- be reconstructed reliably from their text alone.
ALTER TABLE mensagem
  ADD COLUMN IF NOT EXISTS origem VARCHAR(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mensagem_origem_check'
      AND conrelid = 'mensagem'::regclass
  ) THEN
    ALTER TABLE mensagem
      ADD CONSTRAINT mensagem_origem_check
      CHECK (origem IS NULL OR origem IN ('assistente', 'busca_textual', 'sem_resultado'));
  END IF;
END $$;
