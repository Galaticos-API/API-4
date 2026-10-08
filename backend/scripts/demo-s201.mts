import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { Client } from "pg";
import { applyUntil } from "../src/database/migration-test-utils.js";
const name="sinapse-s201-demo-"+randomUUID().slice(0,8), password=randomUUID(), evidence:string[]=[];
function docker(args:string[]){const r=spawnSync("docker",args,{encoding:"utf8"});if(r.status!==0)throw Error("Operação Docker falhou.");return r.stdout.trim();}
const record=(s:string)=>{console.log(s);evidence.push(s);};
let started=false, server:import("node:http").Server|undefined, db:import("pg").Pool|undefined;
const folder=await mkdtemp(join(tmpdir(),"sinapse-s201-demo-"));
try {
 const ai=JSON.parse(docker(["inspect","sinapse-ai-service"]))[0];
 const token=ai.Config.Env.find((s:string)=>s.startsWith("AI_SERVICE_TOKEN="));
 assert.ok(token);
 process.env.AI_SERVICE_TOKEN=token.slice(17);
 process.env.DOCUMENT_STORAGE_DIR=folder;
 process.env.DOCUMENT_INGEST_WEBHOOK_URL="http://localhost:5678/webhook/sinapse-ingest";
 process.env.NODE_ENV="test";
 docker(["run","-d","--name",name,"-e","POSTGRES_USER=sinapse","-e","POSTGRES_PASSWORD="+password,"-e","POSTGRES_DB=sinapse_s201_demo_test","-p","127.0.0.1::5432","pgvector/pgvector:pg16"]);started=true;
 const port=JSON.parse(docker(["inspect",name]))[0].NetworkSettings.Ports["5432/tcp"][0].HostPort;
 process.env.DATABASE_URL="postgresql://sinapse:"+password+"@127.0.0.1:"+port+"/sinapse_s201_demo_test";
 let ready=false;
 for(let i=0;i<40;i++){if(spawnSync("docker",["exec",name,"pg_isready","-U","sinapse","-d","sinapse_s201_demo_test"],{encoding:"utf8"}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready);
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{await applyUntil(client,true,()=>false);}finally{await client.end();}
 const {pool}=await import("../src/database/db.js");db=pool;
 const {hashPassword}=await import("../src/modules/auth/pssword.service.js");
 const {app}=await import("../src/app.js");
 const {DocumentIngestionWorker}=await import("../src/modules/documents/documents.ingestion.js");
 const {env}=await import("../src/config/env.js");
 const loginPassword=randomUUID();
 await pool.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES($1,'PO Demonstração','demo-s201@example.test',$2,'admin')",[randomUUID(),await hashPassword(loginPassword)]);
 server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server!.once("listening",r));
 const base="http://127.0.0.1:"+(server.address() as import("node:net").AddressInfo).port;
 let authorization="";
 async function api(path:string,method="GET",body?:string|Buffer,headers:Record<string,string>={},expected=200){
  const r=await fetch(base+path,{method,headers:{...(authorization?{Authorization:authorization}:{}),...headers},body});
  const data=await r.json();assert.equal(r.status,expected,method+" "+path);return data;
 }
 const login=await api("/api/v1/auth/login","POST",JSON.stringify({email:"demo-s201@example.test",password:loginPassword}),{"Content-Type":"application/json"});
 authorization="Bearer "+login.token;
 const project=await api("/api/v1/projects","POST",JSON.stringify({nome:"Demonstração S2-01",cliente:"Dados sintéticos",status:"ativo"}),{"Content-Type":"application/json"},201);
 assert.ok(project.id);
 const path="/api/v1/projects/"+project.id+"/documents", worker=new DocumentIngestionWorker();
 const lookup=async(id:string)=>(await api(path)).items.find((d:{id:string})=>d.id===id);
 const t=Date.now();
 const doc=await api(path,"POST",Buffer.from("A política S201ALFA estabelece revisão de requisitos antes da entrega. Somente dados sintéticos."),{"Content-Type":"application/octet-stream","X-File-Name":"demonstracao.txt"},201);
 assert.equal(doc.status_processamento,"pendente");record("Upload HTTP 201 em "+(Date.now()-t)+" ms; estado pendente.");
 const serviceToken=env.AI_SERVICE_TOKEN;env.AI_SERVICE_TOKEN="demonstracao-token-invalido";
 try{await worker.tick(project.id);}finally{env.AI_SERVICE_TOKEN=serviceToken;}
 const failed=await lookup(doc.id);assert.equal(failed.status_processamento,"falha");assert.equal(failed.erro_processamento_codigo,"SERVICE_HTTP_ERROR");
 record("Falha controlada no caminho backend → n8n → IA real: token inválido recusado; motivo seguro: "+failed.erro_processamento);
 const retryPath=path+"/"+doc.id+"/reprocess";
 await api(retryPath,"POST",undefined,{},202);
 const before=(await pool.query("SELECT ingest_attempts,ingest_next_attempt_at,updated_at FROM documento WHERE id=$1",[doc.id])).rows;
 await api(retryPath,"POST",undefined,{},202);
 assert.deepEqual((await pool.query("SELECT ingest_attempts,ingest_next_attempt_at,updated_at FROM documento WHERE id=$1",[doc.id])).rows,before);
 record("Dois pedidos de retry HTTP 202 preservaram fila, contadores e timestamps.");
 const processing=worker.tick(project.id);let observed=false;
 for(let i=0;i<60;i++){if((await lookup(doc.id)).status_processamento==="processando"){observed=true;break;}await new Promise(r=>setTimeout(r,50));}
 assert.ok(observed);record("Estado processando observado pela API durante execução real.");
 await api("/api/v1/projects");record("Consulta de projetos HTTP 200 durante processamento.");
 await processing;
 const done=await lookup(doc.id);assert.equal(done.status_processamento,"processado");assert.equal(done.erro_processamento,null);
 const chunks=await pool.query("SELECT projeto_id,vector_dims(embedding) n,metadados_json FROM chunk WHERE entidade_id=$1",[doc.id]);
 assert.ok(chunks.rowCount);
 for(const row of chunks.rows){assert.equal(row.projeto_id,project.id);assert.equal(row.n,1024);assert.equal(row.metadados_json.project_id,project.id);}
 const search=await api("/api/v1/search?projeto_id="+project.id+"&q=S201ALFA");
 assert.ok(search.items.some((s:{entidade_id:string})=>s.entidade_id===doc.id));
 record("Estado processado; "+chunks.rowCount+" trecho(s), embeddings reais de 1024 dimensões, origem preservada e documento encontrado na busca.");
 const other=await api("/api/v1/projects","POST",JSON.stringify({nome:"Projeto isolado",cliente:"Dados sintéticos"}),{"Content-Type":"application/json"},201);
 assert.equal((await api("/api/v1/search?projeto_id="+other.id+"&q=S201ALFA")).items.length,0);
 record("Busca no segundo projeto não retornou dados do primeiro.");
 const pdf=await api(path,"POST",Buffer.from("%PDF-1.7\nDocumento demonstrativo truncado."),{"Content-Type":"application/octet-stream","X-File-Name":"corrompido.pdf"},201);
 await worker.tick(project.id);
 const extraction=await lookup(pdf.id);assert.equal(extraction.status_processamento,"falha");assert.equal(extraction.erro_processamento_codigo,"INVALID_DOCUMENT");assert.equal(extraction.nova_tentativa_pendente,false);
 record("PDF truncado falhou na extração da IA real: INVALID_DOCUMENT; motivo: "+extraction.erro_processamento);
 await api(path+"/"+pdf.id+"/reprocess","POST",undefined,{},202);assert.equal((await lookup(pdf.id)).status_processamento,"pendente");
 record("Falha permanente de extração permite nova tentativa manual HTTP 202.");
 await writeFile(resolve("../docs/S2-01-DEMONSTRACAO.md"),"# Demonstração integrada S2-01\n\nData: "+new Date().toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})+" (America/Sao_Paulo).\n\nBackend com código local, PostgreSQL 16/pgvector temporário, n8n e IA/Ollama reais. Migrações aplicadas, dados sintéticos, autenticação e chamadas HTTP reais. Worker acionado por tick explícito para controlar a demonstração; agendamento periódico não medido.\n\n"+evidence.map(s=>"- "+s).join("\n")+"\n\nAsserções aprovadas. Banco e arquivos temporários removidos ao terminar; dados de desenvolvimento preservados. Sem credenciais no relatório.\n\nReproduzir no backend com serviços locais ativos: node --import tsx scripts/demo-s201.mts.\n");
 record("Relatório salvo em docs/S2-01-DEMONSTRACAO.md.");
} finally {
 if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}
 if(db)await db.end();
 assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep));await rm(folder,{recursive:true,force:true});
 if(started)docker(["rm","-f","-v",name]);console.log("Ambiente temporário removido.");
}

