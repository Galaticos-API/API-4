ALTER TABLE analise_repositorio ALTER COLUMN indexacao_status TYPE VARCHAR(30);

ALTER TABLE analise_repositorio
  ADD COLUMN IF NOT EXISTS relatorio_revisao INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aprovacao_hash TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES usuario(id),
  ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION queue_analysis_report() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed BOOLEAN;
BEGIN
  changed := TG_OP='INSERT' OR NEW.relatorio_markdown IS DISTINCT FROM OLD.relatorio_markdown
    OR NEW.metadados IS DISTINCT FROM OLD.metadados OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.projeto_id IS DISTINCT FROM OLD.projeto_id OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.repositorio_url IS DISTINCT FROM OLD.repositorio_url;
  IF changed THEN
    NEW.relatorio_revisao := COALESCE(OLD.relatorio_revisao,0)+1;
    NEW.aprovacao_hash := NULL; NEW.aprovado_por := NULL; NEW.aprovado_em := NULL;
    NEW.indexacao_status := CASE WHEN NEW.status='concluido' AND NULLIF(btrim(NEW.relatorio_markdown),'') IS NOT NULL
      THEN 'aguardando_aprovacao' ELSE 'nao_aplicavel' END;
    NEW.indexacao_tentativas := 0; NEW.indexacao_erro := NULL;
    NEW.indexacao_lease_id := NULL; NEW.indexacao_bloqueado_ate := NULL;
    DELETE FROM chunk WHERE entidade_tipo='analise_repositorio' AND entidade_id=NEW.id;
  ELSIF NEW.aprovacao_hash IS DISTINCT FROM OLD.aprovacao_hash THEN
    IF NEW.aprovacao_hash IS NOT NULL AND NEW.aprovado_por IS NOT NULL AND NEW.aprovado_em IS NOT NULL
      AND NEW.status='concluido'
      AND NEW.aprovacao_hash=encode(sha256(convert_to(NEW.relatorio_markdown,'UTF8')),'hex') THEN
      NEW.indexacao_status := 'pendente';
      NEW.indexacao_tentativas := 0; NEW.indexacao_erro := NULL;
      NEW.indexacao_lease_id := NULL; NEW.indexacao_bloqueado_ate := NULL;
    ELSE
      RAISE EXCEPTION 'A aprovação deve identificar o revisor e a versão atual do relatório';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Nunca transformar relatórios legados em evidências revisadas implicitamente.
DELETE FROM chunk WHERE entidade_tipo='analise_repositorio';
UPDATE analise_repositorio SET indexacao_status=CASE
  WHEN status='concluido' AND NULLIF(btrim(relatorio_markdown),'') IS NOT NULL
    AND EXISTS(SELECT 1 FROM projeto p WHERE p.id=projeto_id AND p.status<>'arquivado')
  THEN 'aguardando_aprovacao' ELSE 'nao_aplicavel' END,
  aprovacao_hash=NULL,aprovado_por=NULL,aprovado_em=NULL,indexacao_lease_id=NULL,indexacao_bloqueado_ate=NULL;
