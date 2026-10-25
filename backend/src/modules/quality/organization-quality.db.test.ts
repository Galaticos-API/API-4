import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validateTarget } from '../../database/seed-lib.js';
import type { OrganizationConfiguration } from './organization-quality.types.js';
import type { PbiQualityConfigurationRecord, QualityReport } from './quality.types.js';
import type { evaluateOrganizationQuality } from './organization-quality.service.js';
import { QualityConfigurationRepository } from './quality.configuration.repository.js';
import { applyUntil, loadMigration, withDatabase } from '../../database/migration-test-utils.js';

test('S2-19: organização, níveis, dicionário imediato, conclusão, autoria e concorrência', {skip:!process.env.QUALITY_TEST_DATABASE_URL},async t=>{
  const db=new Pool({connectionString:validateTarget(process.env.QUALITY_TEST_DATABASE_URL,'test')});
  const {app}=await import('../../app.js');
  const {pool}=await import('../../database/db.js');
  const {sessionService}=await import('../auth/session.service.js');
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/v1';
  const ids={admin:randomUUID(),po:randomUUID(),dev:randomUUID(),project:randomUUID(),epic:randomUUID(),feature:randomUUID(),pbi:randomUUID()};
  const tokens:Record<string,string>={};
  type Report=Awaited<ReturnType<typeof evaluateOrganizationQuality>>;
  type History=Awaited<ReturnType<QualityConfigurationRepository['organizationHistory']>>;
  const call=async<T=OrganizationConfiguration>(path:string,role='admin',method='GET',body?:unknown)=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,json:await response.json() as T};
  };
  const repo=new QualityConfigurationRepository(db);
  let config:Awaited<ReturnType<typeof repo.getOrganizationConfiguration>>;
  const save=async()=>{
    const result=await call('/quality/configuration/organization','admin','PUT',{expected_version:config.version,levels:config.levels,vague_terms:config.vague_terms,exigir_justificativa_item_concluido:config.exigir_justificativa_item_concluido});
    assert.equal(result.status,200,JSON.stringify(result.json));config=result.json;return config;
  };
  try {
    for(const role of ['admin','po','dev'] as const) {
      await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,$2,$3,'hash',$2)",[ids[role],role,ids[role]+'@quality.test']);
      tokens[role]=(await sessionService.createSession(ids[role])).token;
    }
    await db.query("INSERT INTO projeto(id,nome,cliente) VALUES ($1,'Qualidade','QA')",[ids.project]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,descricao) VALUES ($1,$2,'Definir acesso','Fluxo especialissimo')",[ids.epic,ids.project]);
    await db.query("INSERT INTO feature(id,epico_id,titulo) VALUES ($1,$2,'Detalhar acesso')",[ids.feature,ids.epic]);
    await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1::uuid,$2,$1::text,'Portal de acesso','PO','Consultar','Validar')",[ids.pbi,ids.feature]);
    await t.test('S2-20: definições por nível, permissões, auditoria e conflito sem alterar a qualidade',async()=>{
      const path='/quality/configuration/definitions';
      assert.equal((await call(path,'none')).status,401);
      const baseline=(await call<{version:number;levels:Record<string,{dor:string[];dod:string[]}>}>(path,'po')).json;
      assert.deepEqual(baseline.levels.pbi,{dor:[],dod:[]});
      const qualityVersion=(await repo.getOrganizationConfiguration()).version;
      const body={expected_version:baseline.version,levels:{...baseline.levels,pbi:{dor:['História compreensível'],dod:['Testes revisados']}}};
      for(const role of ['dev','po'])assert.equal((await call(path,role,'PUT',body)).status,403);
      assert.equal((await call(path,'admin','PUT',{...body,levels:{}})).status,400);
      assert.equal((await call(path,'admin','PUT',{...body,levels:{...body.levels,pbi:{dor:['Uma condição\nOutra condição'],dod:[]}}})).status,400);
      const results=await Promise.all([call<{version:number}>(path,'admin','PUT',body),call<{version:number}>(path,'admin','PUT',body)]);
      assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
      const saved=(await call<{version:number;levels:typeof baseline.levels;updated_by:string}>(path,'dev')).json;
      assert.equal(saved.version,baseline.version+1);assert.equal(saved.updated_by,ids.admin);
      assert.deepEqual(saved.levels.epico,{dor:[],dod:[]});assert.deepEqual(saved.levels.pbi,body.levels.pbi);
      assert.equal((await repo.getOrganizationConfiguration()).version,qualityVersion);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM auditoria WHERE acao='ATUALIZAR_DOR_DOD'")).rows[0].n,1);
      const migration=await loadMigration('025_work_definitions.sql',true);
      await db.query(migration);await db.query(migration);
      const reapplied=(await call<typeof saved>(path,'po')).json;
      assert.deepEqual(reapplied,saved);
      const conditions=Array.from({length:50},(_,i)=>String(i).padStart(3,'0')+'ã'.repeat(497));
      const maximum=Object.fromEntries(['epico','feature','pbi'].map(level=>[level,{dor:conditions,dod:conditions}]));
      const large=await call<{version:number}>(path,'admin','PUT',{expected_version:saved.version,levels:maximum});
      assert.equal(large.status,200);
      assert.equal((await call(path,'admin','PUT',{expected_version:large.json.version,levels:baseline.levels})).status,200);
    });
    await t.test('S2-20: falha na auditoria desfaz a alteração das definições',async()=>{
      const path='/quality/configuration/definitions';
      const before=(await call<{version:number;levels:Record<string,{dor:string[];dod:string[]}>}>(path)).json;
      const count=(await db.query("SELECT count(*)::int AS n FROM auditoria WHERE acao='ATUALIZAR_DOR_DOD'")).rows[0].n;
      try {
        await db.query(`CREATE FUNCTION definitions_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'Falha de auditoria simulada para teste'; END $$`);
        await db.query(`CREATE TRIGGER definitions_test_audit_failure BEFORE INSERT ON auditoria
          FOR EACH ROW WHEN (NEW.acao='ATUALIZAR_DOR_DOD') EXECUTE FUNCTION definitions_test_audit_failure()`);
        const result=await call(path,'admin','PUT',{expected_version:before.version,levels:{...before.levels,pbi:{dor:['Alteração que deve ser desfeita'],dod:[]}}});
        assert.equal(result.status,500);
        const after=(await call<typeof before>(path)).json;
        assert.equal(after.version,before.version);assert.deepEqual(after.levels,before.levels);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM auditoria WHERE acao='ATUALIZAR_DOR_DOD'")).rows[0].n,count);
      } finally {
        await db.query('DROP TRIGGER IF EXISTS definitions_test_audit_failure ON auditoria');
        await db.query('DROP FUNCTION IF EXISTS definitions_test_audit_failure()');
      }
    });
    await t.test('padrão inicial e permissões administrativas',async()=>{
      assert.equal((await call('/quality/configuration/organization','none')).status,401);
      const current=await call('/quality/configuration/organization');assert.equal(current.status,200);config=current.json;
      assert.ok(config.version>=1);assert.equal(config.updated_by,null);
      assert.equal(config.levels.epico.campos_obrigatorios,true);assert.equal(config.levels.pbi.titulo_infinitivo,true);
      assert.equal((await call<History>('/quality/configuration/history','po')).status,403);
      assert.equal((await call('/quality/configuration/organization','po','PUT',{})).status,403);
      assert.equal((await call('/quality/configuration/organization','dev','PUT',{})).status,403);
      assert.equal((await call('/quality/configuration/organization','admin','PUT',{expected_version:1,levels:{}})).status,400);
    });
    await t.test('dicionários multilinha são recusados nas duas APIs sem alterar a política',async()=>{
      const version=config.version;
      for(const separator of ['\n','\r','\u2028','\u2029']) {
        const vague_terms=['rápido'+separator+'ótimo'];
        assert.equal((await call('/quality/configuration/organization','admin','PUT',{
          expected_version:version,levels:config.levels,vague_terms,exigir_justificativa_item_concluido:true,
        })).status,400);
        assert.equal((await call('/quality/configuration/pbi','admin','PUT',{checks:config.levels.pbi,vague_terms})).status,400);
      }
      const after=(await call<OrganizationConfiguration>('/quality/configuration/organization')).json;
      assert.equal(after.version,version);assert.deepEqual(after.vague_terms,config.vague_terms);
    });
    await t.test('configuração de um nível não altera o indicador dos outros',async()=>{
      const before=await call<Report>('/quality/items/feature/'+ids.feature,'po');assert.equal(before.status,200);
      assert.equal(before.json.score_completude,50);
      config.levels.epico.campos_obrigatorios=false;config.levels.epico.criterios_aceitacao=false;
      await save();
      const epic=await call<Report>('/quality/items/epico/'+ids.epic,'po');assert.equal(epic.json.score_completude,100);
      assert.deepEqual(epic.json.checks.map((check:{check_id:string})=>check.check_id),['termos_vagos']);
      assert.equal((await call<Report>('/quality/items/feature/'+ids.feature,'po')).json.score_completude,50);
      config.levels.pbi.titulo_infinitivo=false;await save();
      assert.equal((await call<Report>('/quality/items/pbi/'+ids.pbi,'po')).json.checks.some((check:{check_id:string})=>check.check_id==='titulo_infinitivo'),false);
    });
    await t.test('dicionário atualizado é usado imediatamente e preserva a API de PBI',async()=>{
      config.vague_terms=['especialissimo'];await save();
      assert.equal((await call<Report>('/quality/items/epico/'+ids.epic,'po')).json.checks[0].passed,false);
      const legacy=await call<PbiQualityConfigurationRecord>('/quality/configuration/pbi','po');assert.deepEqual(legacy.json.vague_terms,['especialissimo']);
      config.vague_terms=[];await save();
      assert.equal((await call<Report>('/quality/items/epico/'+ids.epic,'po')).json.checks[0].passed,true);
    });
    await t.test('indicadores de PBI concordam para termos nas observações e no nome do cenário',async()=>{
      config.vague_terms=['especialissimo'];await save();
      await db.query("UPDATE pbi SET regras_observacoes='Fluxo especialissimo' WHERE id=$1",[ids.pbi]);
      const check=async()=>{
        const current=(await call<Report>('/quality/items/pbi/'+ids.pbi,'po')).json;
        const legacy=(await call<QualityReport>('/quality/pbis/'+ids.pbi+'/quality','po')).json;
        assert.equal(current.checks.find(row=>row.check_id==='termos_vagos')!.passed,false);
        assert.equal(legacy.checks.find(row=>row.check_id==='termos_vagos')!.passed,false);
        assert.equal(current.score_completude,legacy.score_completude);
      };
      await check();
      await db.query('UPDATE pbi SET regras_observacoes=NULL WHERE id=$1',[ids.pbi]);
      const criterion=randomUUID();
      await db.query("INSERT INTO criterio_aceitacao(id,entidade_tipo,entidade_id,nome,texto,dado,quando,entao,ordem) VALUES ($1,'pbi',$2,'Fluxo especialissimo','Cenário','um usuário','consultar','retornar dados',1)",[criterion,ids.pbi]);
      await check();
      await db.query('DELETE FROM criterio_aceitacao WHERE id=$1',[criterion]);
      config.vague_terms=[];await save();
    });
    await t.test('termo composto não pode ser formado juntando campos diferentes de um cenário',async()=>{
      const terms=config.vague_terms,criterion=randomUUID();
      config.vague_terms=['muito rápido'];await save();
      try {
        await db.query("INSERT INTO criterio_aceitacao(id,entidade_tipo,entidade_id,nome,texto,dado,quando,entao,ordem) VALUES ($1,'pbi',$2,'muito','Cenário','rápido','consultar','retornar dados',1)",[criterion,ids.pbi]);
        for(const expected of [true,false]) {
          const current=(await call<Report>('/quality/items/pbi/'+ids.pbi,'po')).json;
          const legacy=(await call<QualityReport>('/quality/pbis/'+ids.pbi+'/quality','po')).json;
          assert.equal(current.checks.find(row=>row.check_id==='termos_vagos')!.passed,expected);
          assert.equal(legacy.checks.find(row=>row.check_id==='termos_vagos')!.passed,expected);
          assert.equal(current.score_completude,legacy.score_completude);
          await db.query("UPDATE criterio_aceitacao SET dado='muito rápido' WHERE id=$1",[criterion]);
        }
      } finally {
        await db.query('DELETE FROM criterio_aceitacao WHERE id=$1',[criterion]);
        config.vague_terms=terms;await save();
      }
    });
    await t.test('sem verificações ativas não inventa pontuação de completude',async()=>{
      const levels=structuredClone(config.levels);
      config.levels.epico={campos_obrigatorios:false,criterios_aceitacao:false,termos_vagos:false};await save();
      const report=(await call<Report>('/quality/items/epico/'+ids.epic,'po')).json;
      assert.equal(report.score_completude,null);assert.deepEqual(report.checks,[]);
      config.levels=levels;await save();
    });
    await t.test('conclusão registra a versão e alterações da política preservam os três níveis concluídos',async()=>{
      config.levels.feature.campos_obrigatorios=false;config.levels.pbi.cenario_estruturado=false;await save();
      const evaluatedVersion=config.version;
      const policyDate=config.updated_at,policyAuthor=config.updated_by;
      for(const [kind,path] of [['epic','epics'],['feature','features'],['pbi','pbis']] as const) {
        assert.equal((await call(`/${path}/${ids[kind]}/complete`,'po','PATCH')).status,200);
      }
      for(const [kind,path] of [['epic','epics'],['feature','features']] as const) {
        assert.equal((await call(`/${path}/${ids[kind]}`,'po','PATCH',{titulo:'Ajustar título',justificativa:'Melhorar a descrição'})).status,200);
      }
      config.levels.epico.campos_obrigatorios=true;config.levels.pbi.titulo_infinitivo=true;await save();
      for(const [kind,id] of [['epico',ids.epic],['feature',ids.feature],['pbi',ids.pbi]]) {
        const report=(await call<Report>(`/quality/items/${kind}/${id}`,'po')).json;
        assert.ok(report.completion?.configuration);
        assert.equal(report.status,'concluido');assert.equal(report.completion.configuration_version,evaluatedVersion);
        assert.equal(report.completion.previous_criteria,true);
        assert.equal(report.completion.configuration.levels.epico.campos_obrigatorios,false);
        assert.equal(report.completion.configuration.updated_at,policyDate);
        assert.deepEqual(report.completion.configuration.updated_by,policyAuthor);
      }
    });
    await t.test('histórico registra autor/data, valida duplicados e impede perda de atualização',async()=>{
      const history=await call<History>('/quality/configuration/history');assert.equal(history.status,200);
      assert.ok(history.json.items[0].updated_by);
      assert.equal(history.json.items[0].updated_by.id,ids.admin);assert.ok(Date.parse(history.json.items[0].updated_at));
      const body={expected_version:config.version,levels:config.levels,vague_terms:[],exigir_justificativa_item_concluido:true};
      assert.equal((await call('/quality/configuration/organization','admin','PUT',{...body,vague_terms:['Rápido','rápido']})).status,400);
      const results=await Promise.all([call('/quality/configuration/organization','admin','PUT',body),call('/quality/configuration/organization','admin','PUT',body)]);
      assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);config=results.find(row=>row.status===200)!.json;
      const previous=config.version;
      await assert.rejects(()=>repo.updateOrganizationConfiguration({...body,expected_version:previous},randomUUID()));
      assert.equal((await repo.getOrganizationConfiguration()).version,previous);
    });
    await t.test('conclusão concorrente usa a política validada antes de liberar uma nova versão',async()=>{
      const epic=randomUUID(),control=await db.connect();
      const version=config.version;
      let completion:ReturnType<typeof call<OrganizationConfiguration>>|undefined,update:ReturnType<typeof call<OrganizationConfiguration>>|undefined;
      const waitFor=async(sql:string)=>{
        const deadline=Date.now()+5000;
        while(Date.now()<deadline) {
          if((await db.query(sql)).rowCount)return;
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.fail('A operação não chegou ao bloqueio esperado.');
      };
      try {
        await db.query("INSERT INTO epico(id,projeto_id,titulo,descricao,objetivo,escopo_macro,resultado_esperado) VALUES ($1,$2,'Validar concorrência','Descrição','Objetivo','Escopo','Resultado')",[epic,ids.project]);
        await db.query("INSERT INTO criterio_aceitacao(entidade_tipo,entidade_id,texto,ordem) VALUES ('epico',$1,'Condição verificável',1)",[epic]);
        await db.query(`CREATE FUNCTION quality_test_completion_pause() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN PERFORM pg_advisory_xact_lock(577219,77); RETURN NEW; END $$`);
        await db.query(`CREATE TRIGGER quality_test_completion_pause BEFORE UPDATE OF status ON epico
          FOR EACH ROW WHEN (NEW.id='${epic}'::uuid AND NEW.status='concluido') EXECUTE FUNCTION quality_test_completion_pause()`);
        await control.query('SELECT pg_advisory_lock(577219,77)');
        completion=call('/epics/'+epic+'/complete','po','PATCH');
        await waitFor('SELECT 1 FROM pg_locks WHERE locktype=\'advisory\' AND classid=577219 AND objid=77 AND NOT granted');
        const levels=structuredClone(config.levels);levels.epico.termos_vagos=!levels.epico.termos_vagos;
        update=call('/quality/configuration/organization','admin','PUT',{expected_version:version,levels,vague_terms:config.vague_terms,exigir_justificativa_item_concluido:config.exigir_justificativa_item_concluido});
        await waitFor("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM quality_configuration WHERE id=%FOR UPDATE'");
        assert.equal((await repo.getOrganizationConfiguration()).version,version);
        await control.query('SELECT pg_advisory_unlock(577219,77)');
        assert.equal((await completion).status,200);
        const saved=await update;assert.equal(saved.status,200);config=saved.json;
        const report=(await call<Report>('/quality/items/epico/'+epic,'po')).json;
        assert.equal(report.status,'concluido');assert.equal(report.completion?.configuration_version,version);
        assert.equal(report.configuration_version,version+1);assert.equal(report.completion?.previous_criteria,true);
        assert.equal(report.completion?.configuration?.levels.epico.termos_vagos,!config.levels.epico.termos_vagos);
      } finally {
        await control.query('SELECT pg_advisory_unlock_all()');
        await Promise.allSettled([completion,update]);
        await db.query('DROP TRIGGER IF EXISTS quality_test_completion_pause ON epico');
        await db.query('DROP FUNCTION IF EXISTS quality_test_completion_pause()');
        control.release();
      }
    });
    await t.test('API legada atualiza PBI sem apagar níveis e também gera histórico',async()=>{
      const legacy=(await call<PbiQualityConfigurationRecord>('/quality/configuration/pbi')).json;
      const result=await call<PbiQualityConfigurationRecord>('/quality/configuration/pbi','admin','PUT',{checks:legacy.checks,vague_terms:['novo termo'],exigir_justificativa_item_concluido:true});
      assert.equal(result.status,200);
      const updated=(await call('/quality/configuration/organization')).json;
      assert.deepEqual(updated.levels.epico,config.levels.epico);assert.deepEqual(updated.levels.feature,config.levels.feature);
      assert.equal(updated.version,config.version+1);
      assert.equal((await call<History>('/quality/configuration/history')).json.items[0].version,updated.version);
    });
    await t.test('relatórios exigem acesso ao projeto',async()=>{
      assert.equal((await call<Report>('/quality/items/epico/'+ids.epic,'dev')).status,404);
      const developer=randomUUID();
      await db.query('INSERT INTO desenvolvedor(id,usuario_id) VALUES ($1,$2)',[developer,ids.dev]);
      await db.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id,data_inicio) VALUES ($1,$2,CURRENT_TIMESTAMP-INTERVAL '1 day')",[developer,ids.project]);
      assert.equal((await call<Report>('/quality/items/epico/'+ids.epic,'dev')).status,200);
      const other=randomUUID(),otherEpic=randomUUID();
      await db.query("INSERT INTO projeto(id,nome,cliente) VALUES ($1,'Outro','QA')",[other]);
      await db.query("INSERT INTO epico(id,projeto_id,titulo) VALUES ($1,$2,'Outro')",[otherEpic,other]);
      assert.equal((await call<Report>('/quality/items/epico/'+otherEpic,'dev')).status,404);
    });
    await t.test('migração não inventa critérios para conclusões legadas e é idempotente',async()=>{
      await withDatabase(process.env.QUALITY_TEST_DATABASE_URL!,async(client,vector)=>{
        await applyUntil(client,vector,file=>file==='024_organization_quality.sql');
        const project=randomUUID(),epic=randomUUID();
        await client.query("INSERT INTO projeto(id,nome,cliente) VALUES ($1,'Legado','QA')",[project]);
        await client.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES ($1,$2,'Legado','concluido')",[epic,project]);
        const migration=await loadMigration('024_organization_quality.sql',vector);await client.query(migration);await client.query(migration);
        const rows=(await client.query('SELECT * FROM quality_completion WHERE entidade_id=$1',[epic])).rows;
        assert.equal(rows.length,1);assert.equal(rows[0].configuration_version,null);assert.equal(rows[0].configuration_snapshot,null);
      });
    });
    await t.test('paginação do histórico cobre todas as versões sem repetir e rejeita limites inválidos',async()=>{
      const expected=(await db.query('SELECT version FROM quality_configuration_history ORDER BY version DESC')).rows.map(row=>row.version);
      const versions:number[]=[];
      let before:number|null=null;
      do {
        const page:{status:number;json:History}=await call<History>('/quality/configuration/history?limit=2'+(before===null?'':'&before='+before));
        assert.equal(page.status,200);assert.ok(page.json.items.length<=2);
        versions.push(...page.json.items.map(row=>row.version));
        if(before!==null)assert.ok(page.json.items.every(row=>row.version<before!));
        before=page.json.next_before;
        assert.ok(versions.length<=expected.length);
      } while(before!==null);
      assert.deepEqual(versions,expected);
      for(const query of ['limit=0','limit=101','limit=1.5','before=0','before=2147483648']) {
        assert.equal((await call('/quality/configuration/history?'+query)).status,400);
      }
      assert.equal((await call('/quality/configuration/history','dev')).status,403);
    });
    await t.test('autoria histórica permanece identificável se a conta for removida',async()=>{
      await db.query('DELETE FROM usuario WHERE id=$1',[ids.admin]);
      const history=await repo.organizationHistory(25);
      assert.equal(history.items[0].updated_by?.nome,'admin');assert.equal(history.items[0].updated_by?.id,null);
      assert.equal((await repo.getOrganizationConfiguration()).updated_by?.nome,'admin');
      const definitions=(await call<{updated_by:string|null;updated_by_name:string}>('/quality/configuration/definitions','po')).json;
      assert.equal(definitions.updated_by,null);assert.equal(definitions.updated_by_name,'admin');
    });
  } finally {
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    await db.end();await pool.end();
  }
});
