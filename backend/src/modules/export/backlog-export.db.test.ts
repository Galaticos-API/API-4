import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { BacklogExportRepository } from "./backlog-export.repository.js";
import { BacklogExportService } from "./backlog-export.service.js";

test("Exportação Markdown: escopo, ordem e arquivados no banco real", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const service = new BacklogExportService(new BacklogExportRepository(db));
  const [project, otherProject, epicOld, epic, otherEpic, f1, f2, f3, foreignFeature] = Array.from({ length: 9 }, randomUUID);
  const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString();
  try {
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1,$2,'QA','ativo'),($3,$4,'QA','ativo')", [project, project, otherProject, otherProject]);
    await db.query(
      `INSERT INTO epico(id,projeto_id,titulo,descricao,objetivo,escopo_macro,resultado_esperado,status,created_at) VALUES
       ($1,$3,'Épico antigo','d','o','e','r','arquivado',$4),($2,$3,'Épico exportado','Descrição','Objetivo','A\nB','Resultado','rascunho',$5),
       ($6,$7,'Épico de outro projeto','d','o','e','r','rascunho',$4)`,
      [epicOld, epic, project, at(1), at(2), otherEpic, otherProject],
    );
    await db.query(
      `INSERT INTO feature(id,epico_id,titulo,descricao,objetivo,status,created_at) VALUES
       ($1,$4,'Feature um','d1','o1','rascunho',$5),($2,$4,'Feature arquivada','d','o','arquivado',$6),
       ($3,$4,'Feature três','d3','o3','concluido',$7),($8,$9,'Feature alheia','d','o','rascunho',$5)`,
      [f1, f2, f3, epic, at(3), at(4), at(5), foreignFeature, otherEpic],
    );
    const pbis: Array<[string, string, string, string, number]> = [
      [randomUUID(), f1, "Cadastrar primeiro", "rascunho", 10],
      [randomUUID(), f1, "Arquivar segundo", "arquivado", 11],
      [randomUUID(), f1, "Consultar terceiro", "rascunho", 12],
      [randomUUID(), f3, "Validar na feature três", "rascunho", 13],
      [randomUUID(), foreignFeature, "Vazar de outro projeto", "rascunho", 14],
    ];
    for (const [id, feature, titulo, status, minute] of pbis) {
      await db.query(
        `INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,status,created_at)
         VALUES ($1,$2,$3,$4,'PO','exportar','compartilhar',$5,$6)`,
        [id, feature, id.slice(0, 8), titulo, status, at(minute)],
      );
    }
    await db.query(
      `INSERT INTO criterio_aceitacao(entidade_tipo,entidade_id,ordem,texto,nome,dado,quando,entao) VALUES
       ('epico',$1,1,'Critério do épico',NULL,NULL,NULL,NULL),('feature',$2,1,'Critério da feature um',NULL,NULL,NULL,NULL),
       ('pbi',$3,2,NULL,'Segundo','d2','q2','e2'),('pbi',$3,1,NULL,'Primeiro','d1','q1','e1'),
       ('epico',$4,1,'Critério de outro épico',NULL,NULL,NULL,NULL)`,
      [epic, f1, pbis[0]![0], otherEpic],
    );

    const epicDoc = await service.exportEpic(epic!);
    assert.equal(epicDoc.filename, "EP-02-epico-exportado.md");
    const md = epicDoc.content;
    const order = ["# EP-02 \u2014 Épico exportado", "- A\n- B", "- Critério do épico", "## FT-02.1 \u2014 Feature um",
      "### PBI-02.1.1 \u2014 Cadastrar primeiro", "**Cenário 1 \u2014 Primeiro**", "**Cenário 2 \u2014 Segundo**",
      "### PBI-02.1.3 \u2014 Consultar terceiro", "## FT-02.3 \u2014 Feature três", "### PBI-02.3.1 \u2014 Validar na feature três"];
    let cursor = -1;
    for (const fragment of order) {
      const position = md.indexOf(fragment);
      assert.ok(position > cursor, `fora de ordem ou ausente: ${fragment}`);
      cursor = position;
    }
    for (const leaked of ["Feature arquivada", "Arquivar segundo", "Feature alheia", "Vazar de outro projeto", "Critério de outro épico", "Épico antigo"]) {
      assert.ok(!md.includes(leaked), `vazou: ${leaked}`);
    }

    const featureDoc = await service.exportFeature(f3!);
    assert.equal(featureDoc.filename, "FT-02.3-feature-tres.md");
    assert.ok(featureDoc.content.includes("### PBI-02.3.1 \u2014 Validar na feature três"));
    for (const leaked of ["Feature um", "Cadastrar primeiro", "Critério do épico"]) assert.ok(!featureDoc.content.includes(leaked));

    await assert.rejects(service.exportEpic(epicOld!), { statusCode: 409 });
    await assert.rejects(service.exportFeature(f2!), { statusCode: 409 });
    await assert.rejects(service.exportFeature(randomUUID()), { statusCode: 404 });
  } finally {
    await db.query("DELETE FROM criterio_aceitacao WHERE entidade_id IN (SELECT id FROM epico WHERE projeto_id = ANY($1)) OR entidade_id IN (SELECT f.id FROM feature f JOIN epico e ON e.id=f.epico_id WHERE e.projeto_id = ANY($1)) OR entidade_id IN (SELECT b.id FROM pbi b JOIN feature f ON f.id=b.feature_id JOIN epico e ON e.id=f.epico_id WHERE e.projeto_id = ANY($1))", [[project, otherProject]]);
    await db.query("DELETE FROM projeto WHERE id = ANY($1)", [[project, otherProject]]);
    await db.end();
  }
});
