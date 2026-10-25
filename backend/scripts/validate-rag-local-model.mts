import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
const {withHarnessDeadline}=await import(new URL('./harness-deadline.mjs',import.meta.url).href);

const name='sinapse-rag-real-'+randomUUID().slice(0,8),token=randomUUID();
const docker=(args:string[])=>{
  const result=spawnSync('docker',args,{encoding:'utf8'});
  if(result.status!==0)throw new Error('Falha na operação Docker: '+args[0]);
  return result.stdout.trim();
};
let started=false;
try {
  docker(['run','-d','--name',name,'-e','AI_SERVICE_TOKEN='+token,'-e','DOCUMENT_INGESTION_TOKEN='+token,
    '-e','OLLAMA_BASE_URL=http://host.docker.internal:11434','-e','WORKSPACE_DIR=/tmp/analyzer','-e','PYTHONDONTWRITEBYTECODE=1',
    '--mount','type=bind,source='+resolve('../ai-service')+',target=/app,readonly','-p','127.0.0.1::8000','sinapse-s209-ai-test']);
  started=true;
  const details=JSON.parse(docker(['inspect',name]))[0];
  const url='http://127.0.0.1:'+details.NetworkSettings.Ports['8000/tcp'][0].HostPort;
  let ready=false;
  for(let attempt=0;attempt<40;attempt++) {
    try {ready=(await withHarnessDeadline((signal:AbortSignal)=>fetch(url+'/openapi.json',{headers:{'X-Service-Token':token},signal}),3000)).ok;} catch {}
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,'O serviço de IA temporário não iniciou.');
  console.log('Validando RAG com bge-m3 e qwen2.5:1.5b locais, usando apenas dados sintéticos.');
  const result=spawnSync(process.execPath,['--import','tsx','scripts/test-indexing-db.mts','--quality'],{
    env:{...process.env,AI_SERVICE_TOKEN:token,DOCUMENT_INGESTION_TOKEN:token,AI_SERVICE_URL:url,RAG_REAL_AI_URL:url},stdio:'inherit',
  });
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
} finally {
  if(started)docker(['rm','-f','-v',name]);
  console.log('Serviço de IA temporário removido.');
}
