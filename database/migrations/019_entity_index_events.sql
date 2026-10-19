-- S2-03: outbox transacional por origem, com versão e reserva de processamento.
CREATE TABLE indice_evento (
  projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
  entidade_tipo TEXT NOT NULL CHECK (entidade_tipo IN ('epico','feature','pbi','decisao')),
  entidade_id UUID NOT NULL,
  evento_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  versao INTEGER NOT NULL DEFAULT 1,
  operacao TEXT NOT NULL CHECK (operacao IN ('indexar','remover')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','processando','processado','falha')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_id UUID,
  bloqueado_ate TIMESTAMPTZ,
  erro_codigo TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (projeto_id, entidade_tipo, entidade_id),
  UNIQUE (evento_id)
);
CREATE INDEX idx_indice_evento_fila ON indice_evento(proxima_tentativa)
  WHERE status <> 'processado';

-- Inclui origens não elegíveis para que arquivamento e retorno a rascunho gerem remoção.
CREATE VIEW indice_origem AS
WITH itens AS (
  SELECT p.id AS projeto_id, 'projeto'::text AS tipo, p.id,
    ARRAY[p.id] AS ancestrais, p.status <> 'arquivado' AS ativo,
    p.status, to_jsonb(p) AS dados
  FROM projeto p
  UNION ALL
  SELECT e.projeto_id, 'epico', e.id, ARRAY[e.projeto_id,e.id],
    p.status <> 'arquivado' AND e.status <> 'arquivado', e.status, to_jsonb(e)
  FROM epico e JOIN projeto p ON p.id=e.projeto_id
  UNION ALL
  SELECT e.projeto_id, 'feature', f.id, ARRAY[e.projeto_id,e.id,f.id],
    p.status <> 'arquivado' AND e.status <> 'arquivado' AND f.status <> 'arquivado', f.status, to_jsonb(f)
  FROM feature f JOIN epico e ON e.id=f.epico_id JOIN projeto p ON p.id=e.projeto_id
  UNION ALL
  SELECT e.projeto_id, 'pbi', b.id, ARRAY[e.projeto_id,e.id,f.id,b.id],
    p.status <> 'arquivado' AND e.status <> 'arquivado' AND f.status <> 'arquivado' AND b.status <> 'arquivado',
    b.status, to_jsonb(b)
  FROM pbi b JOIN feature f ON f.id=b.feature_id JOIN epico e ON e.id=f.epico_id
    JOIN projeto p ON p.id=e.projeto_id
), origens AS (
  SELECT i.projeto_id, i.tipo, i.id, i.ancestrais, i.ativo AND i.status='concluido' AS elegivel,
    i.tipo AS nivel, i.id AS origem_id, i.status, i.dados
  FROM itens i WHERE i.tipo <> 'projeto'
  UNION ALL
  SELECT i.projeto_id, 'decisao', d.id, i.ancestrais, i.ativo,
    i.tipo, i.id, i.status, to_jsonb(d)
  FROM decisao d JOIN itens i ON i.tipo=d.entidade_tipo AND i.id=d.entidade_id
)
SELECT o.projeto_id, o.tipo AS entidade_tipo, o.id AS entidade_id, o.ancestrais, o.elegivel,
  jsonb_build_object(
    'project_id',o.projeto_id,'entity_id',o.id,'entity_type',o.tipo,
    'level',o.nivel,'source_id',o.origem_id,'status',o.status,
    'ancestor_ids',to_jsonb(o.ancestrais),
    'title',COALESCE(o.dados->>'titulo',''),'source_locator',o.dados->>'codigo',
    'description',concat_ws(E'\n\n',
      o.dados->>'descricao',o.dados->>'objetivo',o.dados->>'escopo_macro',
      o.dados->>'resultado_esperado',o.dados->>'historia_como_um',
      o.dados->>'historia_eu_quero',o.dados->>'historia_para_que',
      o.dados->>'regras_observacoes',o.dados->>'contexto'),
    'decisionsAndRationale',concat_ws(E'\n\n',o.dados->>'decisao',o.dados->>'justificativa',o.dados->>'alternativas'),
    'provenance',COALESCE(o.dados->>'provenance','human-authored'),
    'technologies',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',t.id,'nome',t.nome) ORDER BY t.id)
      FROM entidade_tecnologia et JOIN tecnologia t ON t.id=et.tecnologia_id
      WHERE et.entidade_tipo=o.nivel AND et.entidade_id=o.origem_id
    ),'[]'::jsonb),
    'tecnologias_ids',COALESCE((
      SELECT jsonb_agg(et.tecnologia_id ORDER BY et.tecnologia_id)
      FROM entidade_tecnologia et WHERE et.entidade_tipo=o.nivel AND et.entidade_id=o.origem_id
    ),'[]'::jsonb),
    'acceptanceCriteria',COALESCE((
      SELECT jsonb_agg(concat_ws(' ',c.nome,c.texto,c.dado,c.quando,c.entao) ORDER BY c.ordem,c.id)
      FROM criterio_aceitacao c WHERE c.entidade_tipo=o.nivel AND c.entidade_id=o.origem_id
    ),'[]'::jsonb)
  ) AS payload
FROM origens o;

CREATE FUNCTION sincronizar_indice_projeto(project UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- Mesma ordem de locks dos escritores da hierarquia e do consumidor.
  PERFORM id FROM projeto WHERE id=project FOR UPDATE;
  INSERT INTO indice_evento(projeto_id,entidade_tipo,entidade_id,operacao,payload)
    SELECT projeto_id,entidade_tipo,entidade_id,
      CASE WHEN elegivel THEN 'indexar' ELSE 'remover' END,payload
    FROM indice_origem WHERE projeto_id=project
      AND (elegivel OR EXISTS (
        SELECT 1 FROM indice_evento ev WHERE ev.projeto_id=project
          AND ev.entidade_tipo=indice_origem.entidade_tipo AND ev.entidade_id=indice_origem.entidade_id))
    ON CONFLICT (projeto_id,entidade_tipo,entidade_id) DO UPDATE SET
      evento_id=uuid_generate_v4(),versao=indice_evento.versao+1,
      operacao=EXCLUDED.operacao,payload=EXCLUDED.payload,
      status='pendente',tentativas=0,proxima_tentativa=CURRENT_TIMESTAMP,
      lease_id=NULL,bloqueado_ate=NULL,erro_codigo=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE indice_evento.payload IS DISTINCT FROM EXCLUDED.payload OR indice_evento.operacao<>EXCLUDED.operacao;

  UPDATE indice_evento ev SET operacao='remover',evento_id=uuid_generate_v4(),
    versao=versao+1,status='pendente',tentativas=0,lease_id=NULL,bloqueado_ate=NULL,
    erro_codigo=NULL,proxima_tentativa=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  WHERE ev.projeto_id=project AND ev.operacao<>'remover' AND NOT EXISTS (
    SELECT 1 FROM indice_origem o WHERE o.projeto_id=project
      AND o.entidade_tipo=ev.entidade_tipo AND o.entidade_id=ev.entidade_id);

  -- Retira também trechos legados que ainda não tinham evento.
  DELETE FROM chunk c WHERE c.projeto_id=project AND (
    EXISTS (SELECT 1 FROM projeto p WHERE p.id=project AND p.status='arquivado')
    OR (c.entidade_tipo IN ('epico','feature','pbi','decisao') AND NOT EXISTS (
      SELECT 1 FROM indice_origem o WHERE o.projeto_id=c.projeto_id
        AND o.entidade_tipo=c.entidade_tipo AND o.entidade_id=c.entidade_id AND o.elegivel)));

  -- Nenhuma janela de exposição de conteúdo arquivado ou desatualizado.
  DELETE FROM chunk c USING indice_evento ev
    WHERE c.projeto_id=project AND ev.projeto_id=c.projeto_id
      AND ev.entidade_tipo=c.entidade_tipo AND ev.entidade_id=c.entidade_id
      AND (ev.operacao='remover' OR ev.status<>'processado');
END;
$$;

CREATE FUNCTION publicar_evento_indice() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  row_data JSONB;
  kind TEXT;
  source_id UUID;
  project UUID;
BEGIN
  FOR row_data IN SELECT value FROM jsonb_array_elements(
    CASE WHEN TG_OP='INSERT' THEN jsonb_build_array(to_jsonb(NEW))
         WHEN TG_OP='DELETE' THEN jsonb_build_array(to_jsonb(OLD))
         ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END)
  LOOP
    kind := CASE WHEN TG_TABLE_NAME IN ('entidade_tecnologia','criterio_aceitacao')
      THEN row_data->>'entidade_tipo' ELSE TG_TABLE_NAME END;
    source_id := CASE WHEN TG_TABLE_NAME IN ('entidade_tecnologia','criterio_aceitacao')
      THEN (row_data->>'entidade_id')::uuid ELSE (row_data->>'id')::uuid END;
    FOR project IN
      SELECT DISTINCT projeto_id FROM indice_origem
        WHERE (kind='projeto' AND projeto_id=source_id)
          OR (entidade_tipo=kind AND entidade_id=source_id)
          OR (kind IN ('epico','feature','pbi') AND source_id=ANY(ancestrais))
          OR (kind='tecnologia' AND payload->'tecnologias_ids' ? source_id::text)
      UNION
      SELECT projeto_id FROM indice_evento WHERE (entidade_tipo=kind AND entidade_id=source_id)
        OR (kind IN ('epico','feature','pbi') AND payload->'ancestor_ids' ? source_id::text)
      UNION
      SELECT projeto_id FROM indice_evento WHERE kind='projeto' AND projeto_id=source_id
      ORDER BY 1
    LOOP
      PERFORM sincronizar_indice_projeto(project);
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['projeto','epico','feature','pbi','decisao','criterio_aceitacao','entidade_tecnologia','tecnologia']
  LOOP
    EXECUTE format('CREATE TRIGGER publicar_indice AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION publicar_evento_indice()',table_name);
  END LOOP;
END;
$$;

-- Instalações existentes também entram na fila.
SELECT sincronizar_indice_projeto(id) FROM projeto ORDER BY id;
