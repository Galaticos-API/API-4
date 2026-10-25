UPDATE quality_configuration SET configuration=configuration || jsonb_build_object('levels',
  COALESCE(configuration->'levels','{"epico":{"campos_obrigatorios":true,"criterios_aceitacao":true,"termos_vagos":true},"feature":{"campos_obrigatorios":true,"criterios_aceitacao":false,"termos_vagos":true}}'::jsonb));

CREATE TABLE IF NOT EXISTS quality_configuration_history (
  version INTEGER PRIMARY KEY,
  configuration JSONB NOT NULL,
  updated_by UUID REFERENCES usuario(id) ON DELETE SET NULL,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);
INSERT INTO quality_configuration_history(version,configuration,updated_by,updated_by_name,updated_at)
SELECT c.version,c.configuration,c.updated_by,u.nome,c.updated_at FROM quality_configuration c LEFT JOIN usuario u ON u.id=c.updated_by
ON CONFLICT(version) DO NOTHING;

CREATE OR REPLACE FUNCTION quality_configuration_save_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO quality_configuration_history(version,configuration,updated_by,updated_by_name,updated_at)
  VALUES(NEW.version,NEW.configuration,NEW.updated_by,(SELECT nome FROM usuario WHERE id=NEW.updated_by),NEW.updated_at);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quality_configuration_history_trigger ON quality_configuration;
CREATE TRIGGER quality_configuration_history_trigger AFTER UPDATE ON quality_configuration
FOR EACH ROW WHEN (OLD.version IS DISTINCT FROM NEW.version) EXECUTE FUNCTION quality_configuration_save_history();

CREATE TABLE IF NOT EXISTS quality_completion (
  entidade_tipo TEXT NOT NULL CHECK(entidade_tipo IN ('epico','feature','pbi')),
  entidade_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
  configuration_version INTEGER REFERENCES quality_configuration_history(version),
  configuration_snapshot JSONB,
  evaluated_at TIMESTAMPTZ,
  evaluated_by UUID REFERENCES usuario(id) ON DELETE SET NULL,
  PRIMARY KEY(entidade_tipo,entidade_id)
);

CREATE OR REPLACE FUNCTION quality_save_completion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE config quality_configuration%ROWTYPE; project_id UUID;
BEGIN
  IF NEW.entidade_tipo NOT IN ('epico','feature','pbi') OR NEW.acao NOT IN ('CONCLUIR_EPICO','CONCLUIR_FEATURE','CONCLUIR_PBI') THEN RETURN NEW; END IF;
  SELECT * INTO STRICT config FROM quality_configuration FOR SHARE;
  IF NEW.entidade_tipo='epico' THEN
    SELECT projeto_id INTO project_id FROM epico WHERE id=NEW.entidade_id;
  ELSIF NEW.entidade_tipo='feature' THEN
    SELECT e.projeto_id INTO project_id FROM feature f JOIN epico e ON e.id=f.epico_id WHERE f.id=NEW.entidade_id;
  ELSE
    SELECT e.projeto_id INTO project_id FROM pbi b JOIN feature f ON f.id=b.feature_id JOIN epico e ON e.id=f.epico_id WHERE b.id=NEW.entidade_id;
  END IF;
  INSERT INTO quality_completion(entidade_tipo,entidade_id,projeto_id,configuration_version,configuration_snapshot,evaluated_at,evaluated_by)
  VALUES(NEW.entidade_tipo,NEW.entidade_id,project_id,config.version,config.configuration,clock_timestamp(),NEW.usuario_id)
  ON CONFLICT(entidade_tipo,entidade_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quality_completion_trigger ON auditoria;
CREATE TRIGGER quality_completion_trigger AFTER INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION quality_save_completion();

-- Conclusões anteriores não possuíam registro da política: não atribuir critérios retroativos.
INSERT INTO quality_completion(entidade_tipo,entidade_id,projeto_id)
SELECT 'epico',id,projeto_id FROM epico WHERE status='concluido'
UNION ALL SELECT 'feature',f.id,e.projeto_id FROM feature f JOIN epico e ON e.id=f.epico_id WHERE f.status='concluido'
UNION ALL SELECT 'pbi',b.id,e.projeto_id FROM pbi b JOIN feature f ON f.id=b.feature_id JOIN epico e ON e.id=f.epico_id WHERE b.status='concluido'
ON CONFLICT(entidade_tipo,entidade_id) DO NOTHING;
