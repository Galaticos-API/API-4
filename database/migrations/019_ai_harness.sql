BEGIN;
CREATE TABLE ai_harness_revision (
  mode TEXT NOT NULL CHECK (mode IN ('levantamento','consulta','recomendacao')),
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  config JSONB NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  created_by UUID REFERENCES usuario(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mode, version)
);
COMMENT ON TABLE ai_harness_revision IS 'Revisões imutáveis do harness. A maior versão de cada modo é a vigente; versão 0 é a configuração distribuída no código.';
COMMIT;
