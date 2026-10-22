-- S2-23: Indexação automática de relatórios do RepoAnalyzer no acervo vetorial.
-- Adiciona controle de estado de indexação à analise_repositorio e prepara
-- a tabela chunk para receber trechos com entidade_tipo = 'analise_repositorio'.

ALTER TABLE analise_repositorio
  ADD COLUMN IF NOT EXISTS indexacao_status VARCHAR(20) NOT NULL DEFAULT 'nao_aplicavel',
  ADD COLUMN IF NOT EXISTS indexacao_tentativas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indexacao_erro TEXT,
  ADD COLUMN IF NOT EXISTS indexacao_lease_id UUID,
  ADD COLUMN IF NOT EXISTS indexacao_bloqueado_ate TIMESTAMPTZ;

-- O backfill exige revisão humana, definida na migration 021.

-- Índice para o worker buscar análises pendentes de indexação eficientemente.
CREATE INDEX IF NOT EXISTS idx_analysis_indexing_pending
  ON analise_repositorio(created_at)
  WHERE indexacao_status IN ('pendente', 'processando');

-- Relatório e solicitação durável são gravados na mesma transação.
CREATE FUNCTION queue_analysis_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'concluido' AND NULLIF(btrim(NEW.relatorio_markdown), '') IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.relatorio_markdown IS DISTINCT FROM OLD.relatorio_markdown
          OR NEW.metadados IS DISTINCT FROM OLD.metadados OR OLD.status <> 'concluido'
          OR NEW.projeto_id IS DISTINCT FROM OLD.projeto_id
          OR NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.repositorio_url IS DISTINCT FROM OLD.repositorio_url) THEN
    NEW.indexacao_status := 'pendente';
    NEW.indexacao_tentativas := 0;
    NEW.indexacao_erro := NULL;
    NEW.indexacao_lease_id := NULL;
    NEW.indexacao_bloqueado_ate := NULL;
    DELETE FROM chunk WHERE entidade_tipo='analise_repositorio' AND entidade_id=NEW.id;
  ELSIF TG_OP = 'UPDATE' AND (NEW.relatorio_markdown IS DISTINCT FROM OLD.relatorio_markdown
        OR (OLD.status = 'concluido' AND NEW.status <> 'concluido')) THEN
    NEW.indexacao_status := 'nao_aplicavel';
    NEW.indexacao_lease_id := NULL;
    NEW.indexacao_bloqueado_ate := NULL;
    DELETE FROM chunk WHERE entidade_tipo='analise_repositorio' AND entidade_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER queue_analysis_report BEFORE INSERT OR UPDATE ON analise_repositorio
  FOR EACH ROW EXECUTE FUNCTION queue_analysis_report();

CREATE FUNCTION remove_analysis_report_chunks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'projeto' THEN
    IF NEW.status = 'arquivado' THEN
      DELETE FROM chunk WHERE projeto_id=NEW.id AND entidade_tipo='analise_repositorio';
      UPDATE analise_repositorio SET indexacao_status='nao_aplicavel', indexacao_lease_id=NULL,
        indexacao_bloqueado_ate=NULL WHERE projeto_id=NEW.id;
    END IF;
    RETURN NEW;
  END IF;
  DELETE FROM chunk WHERE entidade_tipo='analise_repositorio' AND entidade_id=OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER remove_analysis_report_chunks AFTER DELETE ON analise_repositorio
  FOR EACH ROW EXECUTE FUNCTION remove_analysis_report_chunks();
CREATE TRIGGER archive_analysis_report_chunks AFTER UPDATE OF status ON projeto
  FOR EACH ROW EXECUTE FUNCTION remove_analysis_report_chunks();

UPDATE analise_repositorio SET indexacao_status='nao_aplicavel'
  WHERE EXISTS (SELECT 1 FROM projeto p WHERE p.id=projeto_id AND p.status='arquivado');
