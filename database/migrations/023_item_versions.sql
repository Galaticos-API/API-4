CREATE TABLE IF NOT EXISTS item_versao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    entidade_tipo TEXT NOT NULL CHECK (entidade_tipo IN ('epico','feature','pbi')),
    entidade_id UUID NOT NULL,
    versao INTEGER NOT NULL CHECK (versao > 0),
    snapshot_json JSONB NOT NULL,
    autor_id UUID REFERENCES usuario(id) ON DELETE SET NULL,
    autor_nome TEXT,
    acao TEXT NOT NULL,
    justificativa TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (entidade_tipo, entidade_id, versao)
);

CREATE OR REPLACE FUNCTION snapshot_item(tipo TEXT, item_id UUID) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE dados JSONB;
BEGIN
    IF tipo NOT IN ('epico','feature','pbi') THEN RETURN NULL; END IF;
    EXECUTE format('SELECT to_jsonb(i) FROM %I i WHERE id=$1 FOR UPDATE', tipo)
      INTO dados USING item_id;
    IF dados IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_object_agg(key,value) INTO dados FROM jsonb_each(dados)
      WHERE key=ANY(ARRAY['titulo','descricao','objetivo','escopo_macro','resultado_esperado',
        'codigo','historia_como_um','historia_eu_quero','historia_para_que','regras_observacoes',
        'tipo','prioridade','requer_interface','status','provenance','provenance_json']);
    RETURN dados || jsonb_build_object(
      'criterios', COALESCE((SELECT jsonb_agg(to_jsonb(c) - ARRAY['entidade_id','entidade_tipo','created_at','updated_at'] ORDER BY c.ordem,c.id)
        FROM criterio_aceitacao c WHERE c.entidade_tipo=tipo AND c.entidade_id=item_id), '[]'::jsonb),
      'tecnologias', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'nome',t.nome) ORDER BY t.id)
        FROM entidade_tecnologia et JOIN tecnologia t ON t.id=et.tecnologia_id
        WHERE et.entidade_tipo=tipo AND et.entidade_id=item_id), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION gravar_versao_item(tipo TEXT, item_id UUID, autor UUID, acao_evento TEXT, motivo TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE dados JSONB; anterior JSONB; numero INTEGER; projeto UUID;
BEGIN
    dados := snapshot_item(tipo, item_id);
    IF dados IS NULL THEN RETURN; END IF;
    SELECT v.snapshot_json,v.versao INTO anterior,numero FROM item_versao v
      WHERE v.entidade_tipo=tipo AND v.entidade_id=item_id ORDER BY v.versao DESC LIMIT 1;
    IF dados IS NOT DISTINCT FROM anterior THEN RETURN; END IF;
    IF tipo='epico' THEN
      SELECT projeto_id INTO projeto FROM epico WHERE id=item_id;
    ELSIF tipo='feature' THEN
      SELECT e.projeto_id INTO projeto FROM feature f JOIN epico e ON e.id=f.epico_id WHERE f.id=item_id;
    ELSE
      SELECT e.projeto_id INTO projeto FROM pbi p JOIN feature f ON f.id=p.feature_id JOIN epico e ON e.id=f.epico_id WHERE p.id=item_id;
    END IF;
    INSERT INTO item_versao(projeto_id,entidade_tipo,entidade_id,versao,snapshot_json,autor_id,autor_nome,acao,justificativa)
      VALUES(projeto,tipo,item_id,COALESCE(numero,0)+1,dados,autor,
        (SELECT nome FROM usuario WHERE id=autor),acao_evento,motivo);
END $$;

CREATE OR REPLACE FUNCTION registrar_versao_item() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE item RECORD;
BEGIN
    IF NEW.entidade_tipo IN ('epico','feature','pbi') THEN
      PERFORM gravar_versao_item(NEW.entidade_tipo,NEW.entidade_id,NEW.usuario_id,NEW.acao,NEW.justificativa);
    END IF;
    IF NEW.acao NOT IN ('ARQUIVAR_PROJETO','ARQUIVAR_EPICO','ARQUIVAR_FEATURE') THEN RETURN NEW; END IF;
    -- O evento do ancestral é gravado após as atualizações de toda a hierarquia.
    -- Os filhos mantêm autoria e justificativa do mesmo arquivamento, sem repetir estados iguais.
    FOR item IN
      SELECT 'epico' AS tipo,e.id FROM epico e
        WHERE NEW.entidade_tipo='projeto' AND e.projeto_id=NEW.entidade_id
      UNION ALL
      SELECT 'feature',f.id FROM feature f JOIN epico e ON e.id=f.epico_id
        WHERE (NEW.entidade_tipo='projeto' AND e.projeto_id=NEW.entidade_id)
          OR (NEW.entidade_tipo='epico' AND e.id=NEW.entidade_id)
      UNION ALL
      SELECT 'pbi',p.id FROM pbi p JOIN feature f ON f.id=p.feature_id JOIN epico e ON e.id=f.epico_id
        WHERE (NEW.entidade_tipo='projeto' AND e.projeto_id=NEW.entidade_id)
          OR (NEW.entidade_tipo='epico' AND e.id=NEW.entidade_id)
          OR (NEW.entidade_tipo='feature' AND f.id=NEW.entidade_id)
      ORDER BY tipo,id
    LOOP
      PERFORM gravar_versao_item(item.tipo,item.id,NEW.usuario_id,NEW.acao,NEW.justificativa);
    END LOOP;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS auditoria_snapshot_item ON auditoria;
CREATE TRIGGER auditoria_snapshot_item AFTER INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION registrar_versao_item();

-- O estado anterior à implantação não pode ser reconstruído fielmente a partir dos eventos.
-- Registra-se apenas a referência atual, sem atribuir autoria ou data histórica fictícias.
INSERT INTO item_versao(projeto_id,entidade_tipo,entidade_id,versao,snapshot_json,acao)
SELECT e.projeto_id,'epico',e.id,1,snapshot_item('epico',e.id),'REFERENCIA_INICIAL' FROM epico e
WHERE NOT EXISTS(SELECT 1 FROM item_versao v WHERE v.entidade_tipo='epico' AND v.entidade_id=e.id);
INSERT INTO item_versao(projeto_id,entidade_tipo,entidade_id,versao,snapshot_json,acao)
SELECT e.projeto_id,'feature',f.id,1,snapshot_item('feature',f.id),'REFERENCIA_INICIAL' FROM feature f JOIN epico e ON e.id=f.epico_id
WHERE NOT EXISTS(SELECT 1 FROM item_versao v WHERE v.entidade_tipo='feature' AND v.entidade_id=f.id);
INSERT INTO item_versao(projeto_id,entidade_tipo,entidade_id,versao,snapshot_json,acao)
SELECT e.projeto_id,'pbi',p.id,1,snapshot_item('pbi',p.id),'REFERENCIA_INICIAL' FROM pbi p JOIN feature f ON f.id=p.feature_id JOIN epico e ON e.id=f.epico_id
WHERE NOT EXISTS(SELECT 1 FROM item_versao v WHERE v.entidade_tipo='pbi' AND v.entidade_id=p.id);
