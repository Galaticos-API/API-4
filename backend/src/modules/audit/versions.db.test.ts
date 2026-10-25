import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validateTarget } from '../../database/seed-lib.js';
import { EpicsRepository } from '../epics/epics.repository.js';
import { VersionsService } from './versions.service.js';
import { auditService } from './audit.service.js';
import { applyUntil, loadMigration, withDatabase } from '../../database/migration-test-utils.js';
import { HierarchyArchiveRepository } from '../projects/hierarchy-archive.js';
import { ProjectArchiveRepository } from '../projects/projects.archive.js';

test('S2-16: snapshots transacionais, comparação, concorrência e isolamento', { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async t => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, 'test') });
  const [user,dev,project,other] = Array.from({length:4},()=>randomUUID());
  const repo = new EpicsRepository(db), service = new VersionsService(db);
  let server: ReturnType<typeof import('node:http').createServer> | undefined;
  try {
    await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1::uuid,'Autor QA',$1::text||'@versions.test','hash','po'),($2::uuid,'Dev',$2::text||'@versions.test','hash','dev')",[user,dev]);
    await db.query("INSERT INTO projeto(id,nome,cliente) VALUES ($1,'Versões A','QA'),($2,'Versões B','QA')",[project,other]);
    const epic = await repo.create({projeto_id:project,titulo:'Especificar login',prioridade:'Must'},user);
    await t.test('criação preserva estado inicial, autor, data e dados ausentes',async()=>{
      const page=await service.list(user,'epico',epic.id,{limit:25});
      assert.equal(page.items.length,1); assert.equal(page.items[0].autor_nome,'Autor QA');
      const row=(await db.query('SELECT snapshot_json FROM item_versao WHERE entidade_id=$1',[epic.id])).rows[0];
      assert.equal(row.snapshot_json.titulo,'Especificar login'); assert.equal(row.snapshot_json.descricao,null);
      assert.deepEqual(row.snapshot_json.criterios,[]); assert.deepEqual(row.snapshot_json.tecnologias,[]);
    });
    await repo.update(epic.id,{descricao:'Permitir acesso seguro'},user);
    await t.test('compara valores completos sem modificar a versão anterior',async()=>{
      const diff=await service.compare(user,'epico',epic.id,1,2);
      assert.equal(diff.anterior.snapshot_json.descricao,null);
      assert.equal(diff.nova.snapshot_json.descricao,'Permitir acesso seguro');
      assert.ok(diff.campos.some(row=>row.campo==='descricao' && row.anterior===null));
      assert.equal((await service.list(user,'epico',epic.id,{limit:1})).next_before,2);
      assert.equal((await service.list(user,'epico',epic.id,{limit:1,before:2})).items[0].versao,1);
      assert.equal((await service.list(user,'epico',epic.id,{limit:25,autor_id:dev})).items.length,0);
      assert.equal((await service.list(user,'epico',epic.id,{limit:25,desde:'2999-01-01T00:00:00Z'})).items.length,0);
    });
    await t.test('rollback desfaz escrita, auditoria e snapshot juntos',async()=>{
      const client=await db.connect();
      try {
        await client.query('BEGIN'); await client.query("UPDATE epico SET titulo='Não persistir' WHERE id=$1",[epic.id]);
        await auditService.record({entidade_tipo:'epico',entidade_id:epic.id,usuario_id:user,acao:'ATUALIZAR_EPICO',dados_json:{}},client);
        assert.equal((await client.query('SELECT count(*)::int AS n FROM item_versao WHERE entidade_id=$1',[epic.id])).rows[0].n,3);
        await client.query('ROLLBACK');
      } finally { client.release(); }
      assert.equal((await service.list(user,'epico',epic.id,{limit:25})).items.length,2);
      assert.equal((await repo.findById(epic.id))!.titulo,'Especificar login');
    });
    await t.test('edições concorrentes recebem números distintos e consecutivos',async()=>{
      await Promise.all([repo.update(epic.id,{objetivo:'Objetivo A'},user),repo.update(epic.id,{objetivo:'Objetivo B'},user)]);
      assert.deepEqual((await service.list(user,'epico',epic.id,{limit:25})).items.map(row=>row.versao),[4,3,2,1]);
    });
    await t.test('critérios, tecnologias, features e PBIs recebem snapshots',async()=>{
      const feature=randomUUID(),pbi=randomUUID(),tech=randomUUID();
      await db.query("INSERT INTO feature(id,epico_id,titulo) VALUES ($1,$2,'Feature QA')",[feature,epic.id]);
      await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1::uuid,$2,$1::text,'PBI QA','PO','Consultar','Validar')",[pbi,feature]);
      for (const [kind,id] of [['feature',feature],['pbi',pbi]] as const) {
        await db.query("INSERT INTO auditoria(usuario_id,entidade_tipo,entidade_id,acao,dados_json) VALUES ($1,$2,$3,'CRIAR_ITEM','{}')",[user,kind,id]);
        assert.equal((await service.list(user,kind,id,{limit:25})).items.length,1);
      }
      const client=await db.connect();
      try {
        await client.query('BEGIN');
        await client.query("INSERT INTO tecnologia(id,nome) VALUES ($1::uuid,$1::text)",[tech]);
        await client.query("INSERT INTO entidade_tecnologia(entidade_tipo,entidade_id,tecnologia_id) VALUES ('pbi',$1,$2)",[pbi,tech]);
        await client.query("INSERT INTO criterio_aceitacao(entidade_tipo,entidade_id,texto,nome,dado,quando,entao,ordem) VALUES ('pbi',$1,'Validar credenciais','Login','um usuário cadastrado','informar credenciais válidas','permitir acesso',1)",[pbi]);
        await auditService.record({entidade_tipo:'pbi',entidade_id:pbi,usuario_id:user,acao:'ADICIONAR_CRITERIO',dados_json:{}},client);
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      const diff=await service.compare(user,'pbi',pbi,1,2);
      assert.ok(diff.campos.some(row=>row.campo==='criterios'));
      assert.ok(diff.campos.some(row=>row.campo==='tecnologias'));
      await assert.rejects(()=>service.compare(user,'pbi',pbi,1,4),/Versão não encontrada/);
      await db.query('DELETE FROM tecnologia WHERE id=$1',[tech]);
    });
    await t.test('backfill registra referência atual sem inventar autoria e pode ser reaplicado',async()=>{
      await withDatabase(process.env.ARCHIVE_TEST_DATABASE_URL!,async(client,vectorAvailable)=>{
        await applyUntil(client,vectorAvailable,file=>file==='023_item_versions.sql');
        const [legacyProject,legacyEpic,legacyFeature,legacyPbi]=Array.from({length:4},()=>randomUUID());
        await client.query("INSERT INTO projeto(id,nome,cliente) VALUES ($1,'Legado','QA')",[legacyProject]);
        await client.query("INSERT INTO epico(id,projeto_id,titulo) VALUES ($1,$2,'Referência legada')",[legacyEpic,legacyProject]);
        await client.query("INSERT INTO feature(id,epico_id,titulo) VALUES ($1,$2,'Feature legada')",[legacyFeature,legacyEpic]);
        await client.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1::uuid,$2,$1::text,'PBI legado','PO','Consultar','Validar')",[legacyPbi,legacyFeature]);
        const migration=await loadMigration('023_item_versions.sql',vectorAvailable);
        await client.query(migration); await client.query(migration);
        const rows=(await client.query('SELECT * FROM item_versao ORDER BY entidade_tipo')).rows;
        assert.equal(rows.length,3);
        assert.deepEqual(rows.map(row=>row.entidade_tipo),['epico','feature','pbi']);
        for(const row of rows) {
          assert.equal(row.versao,1); assert.equal(row.acao,'REFERENCIA_INICIAL');
          assert.equal(row.autor_id,null); assert.equal(row.autor_nome,null);
        }
      });
      assert.equal((await service.list(user,'epico',epic.id,{limit:25})).items.length,4);
    });
    await t.test('HTTP: autenticação, autorização, filtros e comparação entre versões do próprio item',async()=>{
      const { app }=await import('../../app.js');
      const { sessionService }=await import('../auth/session.service.js');
      const poToken=(await sessionService.createSession(user)).token, devToken=(await sessionService.createSession(dev)).token;
      server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server!.once('listening',resolve));
      const base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/v1/audit/epico/'+epic.id+'/versions';
      const request=(path:string,token?:string)=>fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:{}});
      assert.equal((await request('')).status,401);
      assert.equal((await request('',devToken)).status,404);
      assert.equal((await request('',poToken)).status,200);
      assert.equal((await request('?limit=0',poToken)).status,400);
      assert.equal((await request('?before=2147483648',poToken)).status,400);
      assert.equal((await request('/compare?de=1&para=2147483648',poToken)).status,400);
      assert.equal((await request('?desde=0000-01-01T00:00:00Z',poToken)).status,400);
      assert.equal((await request('?desde='+encodeURIComponent('2026-10-25T00:00:00+99:99'),poToken)).status,400);
      assert.equal((await request('?desde='+encodeURIComponent('2026-10-25T00:00:00+23:59'),poToken)).status,200);
      assert.equal((await request('?desde=2026-10-25T00:00:00Z&ate=2026-10-01T00:00:00Z',poToken)).status,400);
      assert.equal((await request('/compare?de=1&para=2',poToken)).status,200);
      assert.equal((await request('/compare?de=1&para=1',poToken)).status,400);
      assert.equal((await request('/compare?de=1&para=999',poToken)).status,404);
      const developer=randomUUID();
      await db.query('INSERT INTO desenvolvedor(id,usuario_id) VALUES ($1,$2)',[developer,dev]);
      await db.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id,data_inicio) VALUES ($1,$2,CURRENT_TIMESTAMP - INTERVAL '1 day')",[developer,other]);
      assert.equal((await request('',devToken)).status,404);
      assert.equal((await request('/compare?de=1&para=2',devToken)).status,404);
      await db.query('UPDATE alocacao SET projeto_id=$1 WHERE desenvolvedor_id=$2',[project,developer]);
      assert.equal((await request('',devToken)).status,200);
      assert.equal((await request('/compare?de=1&para=2',devToken)).status,200);
      const revokedBeforeRead=new VersionsService({query:async(sql:string,values:unknown[])=>{
        if(sql.includes('FROM item_versao')) {
          await db.query("UPDATE alocacao SET data_fim=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE desenvolvedor_id=$1",[developer]);
        }
        return db.query(sql,values);
      }} as unknown as Pool);
      assert.equal((await revokedBeforeRead.list(dev,'epico',epic.id,{limit:25})).items.length,0);
      await db.query('UPDATE alocacao SET data_fim=NULL WHERE desenvolvedor_id=$1',[developer]);
      await assert.rejects(()=>revokedBeforeRead.compare(dev,'epico',epic.id,1,2),/Versão não encontrada/);
      await db.query("UPDATE alocacao SET data_fim=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE desenvolvedor_id=$1",[developer]);
      assert.equal((await request('',devToken)).status,404);
    });
    await t.test('arquivar feature e projeto registra também os snapshots dos descendentes',async()=>{
      const root=await repo.create({projeto_id:other,titulo:'Arquivar especificações',prioridade:'Must'},user);
      const makeTree=async()=>{
        const feature=randomUUID(),pbi=randomUUID();
        await db.query("INSERT INTO feature(id,epico_id,titulo) VALUES ($1,$2,'Feature para arquivar')",[feature,root.id]);
        await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1::uuid,$2,$1::text,'Consultar','PO','Consultar','Validar')",[pbi,feature]);
        for(const [kind,id] of [['feature',feature],['pbi',pbi]]) {
          await db.query("INSERT INTO auditoria(usuario_id,entidade_tipo,entidade_id,acao,dados_json) VALUES ($1,$2,$3,'CRIAR_ITEM','{}')",[user,kind,id]);
        }
        return {feature,pbi};
      };
      const first=await makeTree(), hierarchy=new HierarchyArchiveRepository(db);
      const impact=await hierarchy.impact('feature',first.feature);
      await hierarchy.archive('feature',first.feature,{confirmado:true,impacto:impact,justificativa:'Encerrar fluxo'},user);
      let page=await service.list(user,'pbi',first.pbi,{limit:25});
      assert.equal(page.items.length,2);
      let comparison=await service.compare(user,'pbi',first.pbi,1,2);
      assert.ok(comparison.campos.some(change=>change.campo==='status' && change.anterior==='rascunho' && change.novo==='arquivado'));
      assert.equal(comparison.nova.autor_id,user);
      assert.equal(comparison.nova.justificativa,'Encerrar fluxo');
      const second=await makeTree(), projects=new ProjectArchiveRepository(db);
      await projects.archive(other,user,'Encerrar projeto',(await projects.archiveImpact(other))!);
      page=await service.list(user,'pbi',second.pbi,{limit:25});
      assert.equal(page.items.length,2);
      comparison=await service.compare(user,'pbi',second.pbi,1,2);
      assert.equal(comparison.nova.snapshot_json.status,'arquivado');
      assert.equal(comparison.nova.acao,'ARQUIVAR_PROJETO');
      assert.equal((await service.list(user,'pbi',first.pbi,{limit:25})).items.length,2);
    });
  } finally {
    if(server) { server.closeAllConnections(); await new Promise<void>(resolve=>server!.close(()=>resolve())); }
    await db.query('DELETE FROM projeto WHERE id=ANY($1::uuid[])',[[project,other]]);
    await db.query('DELETE FROM usuario WHERE id=ANY($1::uuid[])',[[user,dev]]);
    await db.end();
    const {pool}=await import('../../database/db.js'); await pool.end();
  }
});
