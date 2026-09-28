import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import { ProjectAccess } from "./project-access.js";
import { createProjectAccessRouter } from "../../middleware/projectAccess.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { validateTarget } from "../../database/seed-lib.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectsRepository } from "./projects.repository.js";
import { EpicsRepository } from "../epics/epics.repository.js";
import { FeaturesRepository } from "../features/features.repository.js";
import { PbisRepository } from "../pbis/pbis.repository.js";

test("isolamento: coleções, detalhes, descendentes e aliases", {skip:!process.env.ARCHIVE_TEST_DATABASE_URL}, async () => {
  const db=new Pool({connectionString:validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL,"test")});
  const ids=Array.from({length:12},randomUUID);
  const [user,developer,project,other,epic,otherEpic,feature,otherFeature,pbi,otherPbi,criterion,otherCriterion]=ids;
  const app=express();
  for(const prefix of ["/api/v1","/api"]) app.use(prefix,createProjectAccessRouter(new ProjectAccess(db),(req,_res,next)=>{req.auth={id:user,nome:"Teste",email:"test@test",role:"dev"};next()}));
  app.use((_req,res)=>res.sendStatus(200));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const base="http://127.0.0.1:"+(server.address() as AddressInfo).port;
  try {
    await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'Dev',$2,'h','dev')",[user,user+"@test.local"]);
    await db.query("INSERT INTO desenvolvedor(id,usuario_id) VALUES ($1,$2)",[developer,user]);
    for(const [pr,e,f,b,c] of [[project,epic,feature,pbi,criterion],[other,otherEpic,otherFeature,otherPbi,otherCriterion]]) {
      await db.query("INSERT INTO projeto(id,nome,cliente) VALUES ($1::uuid,$1::text,'Teste')",[pr]);
      await db.query("INSERT INTO epico(id,projeto_id,titulo) VALUES ($1,$2,'Épico')",[e,pr]);
      await db.query("INSERT INTO feature(id,epico_id,titulo) VALUES ($1,$2,'Feature')",[f,e]);
      await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1::uuid,$2,$1::text,'PBI','PO','testar','validar')",[b,f]);
      await db.query("INSERT INTO criterio_aceitacao(id,entidade_tipo,entidade_id,texto,ordem) VALUES ($1,'epico',$2,'Critério',1)",[c,e]);
    }
    await db.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id) VALUES ($1,$2)",[developer,project]);
    const paths=(pr:string,e:string,f:string,b:string,c:string)=>[
      '/projects/'+pr, '/projects/'+pr+'/documents', '/projects/'+pr+'/epicos', '/projects/'+pr+'/backlog-tree',
      '/projects/'+pr+'/repo-analyses', '/projects/'+pr+'/decisions','/projects/'+pr+'/backlog-search',
      '/epics/'+e,'/epicos/'+e,'/features/'+f,'/pbis/'+b,'/criteria/'+c,
      '/epics/'+e+'/decisions','/features/'+f+'/decisions','/pbis/'+b+'/decisions',
      '/quality/pbis/'+b+'/quality','/audit/epico/'+e+'/history', '/criteria?entidade_tipo=epico&entidade_id='+e];
    for(const prefix of ['/api/v1','/api']) {
      for(const path of paths(project,epic,feature,pbi,criterion)) assert.equal((await fetch(base+prefix+path)).status,200,path);
      for(const path of paths(other,otherEpic,otherFeature,otherPbi,otherCriterion)) assert.equal((await fetch(base+prefix+path)).status,404,path);
    }
    const queries=[
      ()=>new ProjectsService(new ProjectsRepository(db)).list({},user),
      ()=>new EpicsRepository(db).findAll({limit:50,offset:0},user),
      ()=>new FeaturesRepository(db).findAll({limit:50,offset:0},user),
      ()=>new PbisRepository(db).findAll({limit:50,offset:0},user),
    ];
    for(const [index,query] of queries.entries()) { const result=await query();assert.equal(result.total,1);assert.equal(result.items[0].id,[project,epic,feature,pbi][index]); }
    await db.query("UPDATE alocacao SET data_fim=CURRENT_TIMESTAMP WHERE desenvolvedor_id=$1",[developer]);
    for(const query of queries) assert.equal((await query()).total,0);
    assert.equal((await fetch(base+'/api/v1/projects/'+project+'/documents')).status,404);
  } finally {
    server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
    await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])",[[project,other]]);
    await db.query("DELETE FROM usuario WHERE id=$1",[user]);await db.end();
  }
});
