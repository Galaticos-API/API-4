import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DocumentTextRepository } from "./documents.text.js";

test("S2-08: leitura posicionada, paginação e isolamento do documento", {
  skip: !process.env.KNOWLEDGE_TEST_DATABASE_URL,
}, async () => {
  const { pool } = await import("../../database/db.js");
  const { app } = await import("../../app.js");
  const { sessionService } = await import("../auth/session.service.js");
  const repository = new DocumentTextRepository(pool);
  const [project, other, document, otherDocument, admin, dev] = Array.from({length:6},()=>randomUUID());
  const chunks=Array.from({length:25},()=>randomUUID());
  const api=app.listen(0,"127.0.0.1");
  await new Promise<void>(r=>api.once("listening",r));
  const base="http://127.0.0.1:"+(api.address() as {port:number}).port;
  try {
    await pool.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1::uuid,$1::text,'Teste','ativo'),($2::uuid,$2::text,'Teste','ativo')",[project,other]);
    await pool.query("INSERT INTO documento(id,projeto_id,nome,caminho,status_processamento) VALUES($1,$3,'Escopo.pdf','arquivo-sintetico','processado'),($2,$4,'Outro.pdf','outro-sintetico','processado')",[document,otherDocument,project,other]);
    for(let index=0;index<chunks.length;index++) await pool.query("INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,metadados_json) VALUES($1,$2,'documento',$3,$4,$5)",[chunks[index],project,document,"Trecho "+index,JSON.stringify({chunk_index:index})]);
    const target=await repository.read(project,document,chunks[23]);
    assert.equal(target.offset,20);assert.equal(target.total,25);assert.equal(target.items.length,5);
    assert.equal(target.items[3].id,chunks[23]);assert.equal(target.next_offset,null);
    const initial=await repository.read(project,document,chunks[23],0);
    assert.equal(initial.items[0].text,"Trecho 0");assert.equal(initial.items.length,20);assert.equal(initial.next_offset,20);
    assert.equal("embedding" in initial.items[0],false);
    await assert.rejects(repository.read(other,document,chunks[23]),/indisponível/);
    await assert.rejects(repository.read(other,otherDocument,chunks[23]),/indisponível/);
    await pool.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES($1::uuid,'Admin',$1::text||'@example.test','sintetico','admin'),($2::uuid,'Dev',$2::text||'@example.test','sintetico','dev')",[admin,dev]);
    const adminSession=await sessionService.createSession(admin), devSession=await sessionService.createSession(dev);
    const url=base+"/api/v1/projects/"+project+"/documents/"+document+"/excerpts?chunk_id="+chunks[23];
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{Authorization:"Bearer "+devSession.token}})).status,404);
    const headers={Authorization:"Bearer "+adminSession.token};
    assert.equal((await fetch(url,{headers})).status,200);
    assert.equal((await fetch(url+"&offset=-1",{headers})).status,400);
    for (const suffix of ["&offset=1.5", "&offset=texto", "&offset=999999999", "&offset=0&offset=1"]) {
      assert.equal((await fetch(url+suffix,{headers})).status,400);
    }
    assert.equal((await fetch(url.replace(chunks[23],"invalido"),{headers})).status,400);
    assert.equal((await fetch(url.replace(chunks[23],randomUUID()),{headers})).status,404);
    assert.equal((await fetch(url.replace(project,other),{headers})).status,404);
    for (const status of ["pendente", "processando", "falha"]) {
      await pool.query("UPDATE documento SET status_processamento=$2 WHERE id=$1",[document,status]);
      assert.equal((await fetch(url,{headers})).status,404);
    }
    await pool.query("UPDATE documento SET status_processamento='processado' WHERE id=$1",[document]);
    assert.equal((await fetch(url+"&offset=24",{headers})).status,200);
    assert.equal((await fetch(url+"&offset=25",{headers})).status,404);
    await pool.query("DELETE FROM chunk WHERE id=$1",[chunks[23]]);
    assert.equal((await fetch(url,{headers})).status,404);
    await pool.query("UPDATE projeto SET status='arquivado' WHERE id=$1",[project]);
    await assert.rejects(repository.read(project,document,chunks[1]),/indisponível/);
  } finally {
    api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));
    await pool.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])",[[project,other]]);
    await pool.query("DELETE FROM usuario WHERE id=ANY($1::uuid[])",[[admin,dev]]);
    await pool.end();
  }
});
