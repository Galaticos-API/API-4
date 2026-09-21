-- S1-15 / PBI-01.3.6: explicit per-PBI prototype applicability and result.
-- Existing PBIs default to not requiring an interface; do not infer UI scope
-- from free-text fields.
ALTER TABLE pbi
  ADD COLUMN IF NOT EXISTS requer_interface BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_prototipo_pbi_id ON prototipo(pbi_id);

-- Add the new check without overwriting organization settings already edited
-- by an administrator. Increment the version exactly once when it is added.
WITH before_update AS MATERIALIZED (
  SELECT id, version, configuration
  FROM quality_configuration
  WHERE configuration #> '{checks,prototipo_vinculado}' IS NULL
), updated AS (
  UPDATE quality_configuration AS qc
  SET configuration = jsonb_set(qc.configuration, '{checks,prototipo_vinculado}', 'true'::jsonb, TRUE),
      version = qc.version + 1,
      updated_by = NULL,
      updated_at = CURRENT_TIMESTAMP
  FROM before_update
  WHERE qc.id = before_update.id
  RETURNING qc.id, qc.version, qc.configuration
)
INSERT INTO auditoria (entidade_tipo, entidade_id, acao, justificativa, dados_json)
SELECT 'quality_configuration', updated.id, 'migration_updated',
       'S1-15: adicionada a verificação de protótipo por aplicabilidade explícita',
       jsonb_build_object('before', before_update.configuration, 'after', updated.configuration, 'version', updated.version)
FROM before_update
JOIN updated USING (id);
