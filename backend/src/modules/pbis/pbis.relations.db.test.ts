import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { PbiRelationsRepository } from "./pbis.relations.repository.js";
import { ArchiveConflict } from "../projects/archive.types.js";
import { ConflictError, ValidationError } from "../../shared/errors.js";

test("Relações: isolamento, arquivamento e ciclos longos", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async t => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const repo = new PbiRelationsRepository(db);
  const [po, dev, developer, projectA, projectB, epicA, epicB, featureA, featureB] = Array.from({ length: 9 }, randomUUID);
  const ids = Array.from({ length: 53 }, randomUUID);
  try {
    for (const [id, role] of [[po, "po"], [dev, "dev"]]) {
      await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'QA',$2,'h',$3)", [id, id + "@relations.test", role]);
    }
    for (const [project, epic, feature] of [[projectA, epicA, featureA], [projectB, epicB, featureB]]) {
      await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1,$2,'QA','ativo')", [project, project]);
      await db.query("INSERT INTO epico(id,projeto_id,titulo) VALUES ($1,$2,'QA')", [epic, project]);
      await db.query("INSERT INTO feature(id,epico_id,titulo) VALUES ($1,$2,'QA')", [feature, epic]);
    }
    await db.query("INSERT INTO desenvolvedor(id,usuario_id) VALUES ($1,$2)", [developer, dev]);
    await db.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id,data_inicio) VALUES ($1,$2,CURRENT_TIMESTAMP - INTERVAL '1 day')", [developer, projectA]);
    for (const [i, id] of ids.entries()) {
      await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1,$2,$3,'Consultar dados','PO','Consultar','Validar')",
        [id, i === 52 ? featureB : featureA, id]);
    }
    await t.test("filtra relações de outro projeto e preserva as autorizadas", async () => {
      await repo.createRelation(ids[0]!, ids[52]!, "similar_a", po!);
      await repo.createRelation(ids[0]!, ids[1]!, "similar_a", po!);
      assert.equal((await repo.listRelations(ids[0]!, po!)).length, 2);
      assert.deepEqual((await repo.listRelations(ids[0]!, dev!)).map(r => r.relacionado_id), [ids[1]]);
      await db.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id,data_inicio) VALUES ($1,$2,CURRENT_TIMESTAMP - INTERVAL '1 day')", [developer, projectB]);
      assert.equal((await repo.listRelations(ids[0]!, dev!)).length, 2);
      await db.query("UPDATE alocacao SET data_fim=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE projeto_id=$1", [projectB]);
      assert.equal((await repo.listRelations(ids[0]!, dev!)).length, 1);
    });
    await t.test("recusa criação e remoção se qualquer ponta ou ancestral estiver arquivado", async () => {
      const relation = await repo.createRelation(ids[2]!, ids[52]!, "similar_a", po!);
      for (const [table, id] of [["pbi", ids[2]], ["pbi", ids[52]], ["feature", featureB], ["epico", epicB], ["projeto", projectB]]) {
        const previous = (await db.query(`SELECT status FROM ${table} WHERE id=$1`, [id])).rows[0].status;
        await db.query(`UPDATE ${table} SET status='arquivado' WHERE id=$1`, [id]);
        await assert.rejects(repo.createRelation(ids[2]!, ids[52]!, "substitui", po!), ArchiveConflict);
        await assert.rejects(repo.deleteRelation(ids[2]!, relation.id, po!), ArchiveConflict);
        await db.query(`UPDATE ${table} SET status=$2 WHERE id=$1`, [id, previous]);
      }
      await repo.deleteRelation(ids[2]!, relation.id, po!);
    });
    await t.test("detecta ciclo após 51 arestas e aceita caminho sem ciclo", async () => {
      for (let i = 0; i < 51; i++) {
        await repo.createRelation(ids[i]!, ids[i + 1]!, "depende_de", po!);
      }
      await assert.rejects(repo.createRelation(ids[51]!, ids[0]!, "depende_de", po!), /Ciclo de dependência/);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM pbi_relacao WHERE tipo_relacao='depende_de' AND pbi_origem_id=ANY($1::uuid[])", [ids])).rows[0].n, 51);
    });
    await t.test("repetir uma relação dirigida retorna conflito de relação", async () => {
      for (const tipo of ["depende_de", "substitui"] as const) {
        await repo.createRelation(ids[0]!, ids[52]!, tipo, po!);
        await assert.rejects(repo.createRelation(ids[0]!, ids[52]!, tipo, po!), error => {
          assert.ok(error instanceof ConflictError);
          assert.equal(error.statusCode, 409);
          assert.match(error.message, /relação.*já existe/);
          return true;
        });
      }
    });
  } finally {
    await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [[projectA, projectB]]);
    await db.query("DELETE FROM usuario WHERE id=ANY($1::uuid[])", [[po, dev]]);
    await db.end();
  }
});

test("Dependências concorrentes entre projetos não fecham um ciclo", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL, timeout: 15000 }, async () => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const repo = new PbiRelationsRepository(db);
  const user = randomUUID();
  const projects: string[] = [];
  const ids: string[] = [];
  let release: (() => void) | undefined;
  let pending: Promise<unknown>[] = [];
  try {
    await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'QA',$2,'h','po')", [user, user + "@relations.test"]);
    for (let i = 0; i < 4; i++) {
      const [project, epic, feature, pbi] = Array.from({ length: 4 }, () => randomUUID());
      projects.push(project!);
      ids.push(pbi!);
      await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1,$2,'QA','ativo')", [project, project]);
      await db.query("INSERT INTO epico(id,projeto_id,titulo) VALUES ($1,$2,'QA')", [epic, project]);
      await db.query("INSERT INTO feature(id,epico_id,titulo) VALUES ($1,$2,'QA')", [feature, epic]);
      await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1,$2,$3,'Consultar','PO','x','y')", [pbi, feature, pbi]);
    }
    await repo.createRelation(ids[0]!, ids[1]!, "depende_de", user);
    await repo.createRelation(ids[2]!, ids[3]!, "depende_de", user);
    let firstChecked!: () => void;
    const checked = new Promise<void>(resolve => { firstChecked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = repo.checkDependencyCycle.bind(repo);
    let calls = 0;
    repo.checkDependencyCycle = async (...args) => {
      const result = await original(...args);
      if (++calls === 1) {
        firstChecked();
        await gate;
      }
      return result;
    };
    const first = repo.createRelation(ids[1]!, ids[2]!, "depende_de", user);
    pending = [first];
    await checked;
    const second = repo.createRelation(ids[3]!, ids[0]!, "depende_de", user);
    pending.push(second);
    const settled = Promise.allSettled([first, second]);
    // Aguarda a segunda transação disputar o grafo enquanto a primeira ainda não inseriu.
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const row = (await db.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%pbi_relacao:depende_de%') AS waiting")).rows[0];
      if (row.waiting) { waiting = true; break; }
      if (calls > 1) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    release!();
    const results = await settled;
    assert.equal(waiting, true, "a segunda alteração deve aguardar a validação da primeira");
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const rejected = results.find(r => r.status === "rejected");
    assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ValidationError);
    assert.match(rejected.reason.message, /Ciclo de dependência/);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pbi_relacao WHERE pbi_origem_id=ANY($1::uuid[])", [ids])).rows[0].n, 3);
  } finally {
    release?.();
    await Promise.allSettled(pending);
    await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [projects]);
    await db.query("DELETE FROM usuario WHERE id=$1", [user]);
    await db.end();
  }
});
