import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {Client} from "pg";
import {applyUntil} from "../src/database/migration-test-utils.js";
const name="sinapse-s208-test-"+randomUUID().slice(0,8), password=randomUUID();
function docker(args:string[]){const r=spawnSync("docker",args,{encoding:"utf8"});if(r.status!==0)throw Error("Docker indisponível para testes.");return r.stdout.trim();}
let started=false;
try {
  docker(["run","-d","--name",name,"-e","POSTGRES_USER=sinapse","-e","POSTGRES_PASSWORD="+password,"-e","POSTGRES_DB=sinapse_s208_test","-p","127.0.0.1::5432","pgvector/pgvector:pg16"]);started=true;
  const port=JSON.parse(docker(["inspect",name]))[0].NetworkSettings.Ports["5432/tcp"][0].HostPort;
  const url="postgresql://sinapse:"+password+"@127.0.0.1:"+port+"/sinapse_s208_test";
  let ready=false;
  for(let i=0;i<40;i++){if(spawnSync("docker",["exec",name,"pg_isready","-h","127.0.0.1","-U","sinapse"],{encoding:"utf8"}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
  if(!ready)throw Error("PostgreSQL não iniciou.");
  const client=new Client({connectionString:url});await client.connect();
  try{await applyUntil(client,true,()=>false);}finally{await client.end();}
  const args=process.argv.includes("--browser") ? ["--import","tsx","scripts/verify-knowledge-browser.mts"] : ["--import","tsx","--test","src/modules/documents/documents.text.db.test.ts"];
  const result=spawnSync(process.execPath,args,{env:{...process.env,NODE_ENV:"test",DATABASE_URL:url,KNOWLEDGE_TEST_DATABASE_URL:url},stdio:"inherit"});
  process.exitCode=result.status??1;
}finally{if(started){docker(["rm","-f","-v",name]);console.log("Banco temporário removido.");}}
