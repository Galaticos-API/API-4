ALTER TABLE analise_repositorio ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE FUNCTION increment_analysis_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER analysis_revision BEFORE UPDATE ON analise_repositorio
FOR EACH ROW EXECUTE FUNCTION increment_analysis_revision();
