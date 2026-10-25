CREATE TABLE IF NOT EXISTS work_definitions (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  levels JSONB NOT NULL DEFAULT '{"epico":{"dor":[],"dod":[]},"feature":{"dor":[],"dod":[]},"pbi":{"dor":[],"dod":[]}}',
  updated_by UUID REFERENCES usuario(id) ON DELETE SET NULL,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO work_definitions(id) VALUES (TRUE) ON CONFLICT DO NOTHING;
