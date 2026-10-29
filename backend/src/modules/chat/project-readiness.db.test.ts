import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ChatRepository } from "./chat.repository.js";

const url = process.env.QUALITY_TEST_DATABASE_URL;

test("chat project readiness reports index states and only projects the user can access", { skip: !url }, async () => {
  const db = new Pool({ connectionString: url });
  const repo = new ChatRepository(db);
  const admin = randomUUID();
  const developer = randomUUID();
  const developerProfile = randomUUID();
  const projects = Array.from({ length: 5 }, () => randomUUID());
  const documents = Array.from({ length: 4 }, () => randomUUID());

  try {
    await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'QA admin',$3,'hash','admin'),($2,'QA dev',$4,'hash','dev')", [admin, developer, `${admin}@qa.test`, `${developer}@qa.test`]);
    await db.query("INSERT INTO desenvolvedor(id,usuario_id) VALUES ($1,$2)", [developerProfile, developer]);
    for (let index = 0; index < projects.length; index++) {
      await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1,$2,'QA','ativo')", [projects[index], `QA readiness ${index}`]);
    }
    await db.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id,data_inicio) VALUES($1,$2,CURRENT_TIMESTAMP-INTERVAL '1 day')", [developerProfile, projects[0]]);

    const statuses = ["processado", "pendente", "falha", "processado"];
    for (let index = 0; index < statuses.length; index++) {
      await db.query("INSERT INTO documento(id,projeto_id,nome,caminho,status_processamento) VALUES($1,$2,$3,$3,$4)", [documents[index], projects[index], `qa-${index}.txt`, statuses[index]]);
    }
    const vector = JSON.stringify(Array(1024).fill(0.1));
    await db.query("INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,embedding) VALUES($1,$2,'documento',$3,'Fonte pronta',$4::vector)", [randomUUID(), projects[0], documents[0], vector]);
    await db.query("INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,embedding) VALUES($1,$2,'documento',$3,'Primeira fonte parcial',$4::vector),($5,$2,'documento',$3,'Fonte sem embedding',NULL)", [randomUUID(), projects[3], documents[3], vector, randomUUID()]);

    const adminReadiness = await repo.accessibleProjectsWithKnowledgeReadiness(admin);
    const byId = new Map(adminReadiness.map(project => [project.id, project]));
    assert.equal(byId.get(projects[0])?.prontidao, "ready");
    assert.equal(byId.get(projects[0])?.trechos_com_embedding, 1);
    assert.equal(byId.get(projects[1])?.prontidao, "pending");
    assert.equal(byId.get(projects[2])?.prontidao, "failed");
    assert.equal(byId.get(projects[3])?.prontidao, "partial");
    assert.equal(byId.get(projects[3])?.trechos_elegiveis, 2);
    assert.equal(byId.get(projects[3])?.trechos_com_embedding, 1);
    assert.equal(byId.get(projects[4])?.prontidao, "empty");

    const developerReadiness = await repo.accessibleProjectsWithKnowledgeReadiness(developer);
    assert.deepEqual(developerReadiness.map(project => project.id), [projects[0]]);
  } finally {
    await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [projects]);
    await db.query("DELETE FROM usuario WHERE id=ANY($1::uuid[])", [[admin, developer]]);
    await db.end();
  }
});
