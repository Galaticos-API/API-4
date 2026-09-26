import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { ProjectsRepository } from "../projects/projects.repository.js";
import { BacklogSearchRepository } from "./backlog-search.repository.js";
import { BacklogSearchService } from "./backlog-search.service.js";

test("S1-17: busca relacional isolada por projeto, com filtros combinados no PostgreSQL", { skip: !process.env.BACKLOG_TREE_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: validateTarget(process.env.BACKLOG_TREE_TEST_DATABASE_URL, "test") });
  const service = new BacklogSearchService(new BacklogSearchRepository(pool), new ProjectsRepository(pool));
  const [projectA, projectB, epicA, featureA, pbiTitle, pbiDesc, pbiDone, epicB, featureB, pbiB, techJava, techNode] =
    Array.from({ length: 12 }, () => randomUUID());
  const tag = randomUUID().slice(0, 8);
  try {
    await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'T','ativo'),($2::uuid,$2::text,'T','ativo')", [projectA, projectB]);
    await pool.query("INSERT INTO epico (id,projeto_id,titulo,descricao,status) VALUES ($1,$2,$3,'Objetivo de navegação e busca','rascunho'),($4,$5,$6,'Descrição da autenticação do outro projeto','rascunho')",
      [epicA, projectA, `Épico Autenticação ${tag}`, epicB, projectB, `Épico Autenticação ${tag}`]);
    await pool.query("INSERT INTO feature (id,epico_id,titulo,descricao,status) VALUES ($1,$2,$3,'Sessão segura com expiração','rascunho'),($4,$5,$6,'igual','rascunho')",
      [featureA, epicA, `Feature Sessão ${tag}`, featureB, epicB, `Feature Sessão ${tag}`]);
    await pool.query(`INSERT INTO pbi (id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,regras_observacoes,status) VALUES
      ($1,$2,'PBI-T.1',$3,'PO','entrar','acessar','','rascunho'),
      ($4,$2,'PBI-T.2',$5,'PO','recuperar a senha por e-mail','continuar','Regra: 100% dos links expiram','arquivado'),
      ($6,$2,'PBI-T.3',$7,'PO','sair','encerrar','','concluido'),
      ($8,$9,'PBI-T.9',$3,'PO','entrar','acessar','','rascunho')`,
      [pbiTitle, featureA, `Validar Autenticação ${tag}`, pbiDesc, `Enviar link ${tag}`, pbiDone, `Encerrar sessão ${tag}`, pbiB, featureB]);
    await pool.query("INSERT INTO tecnologia (id,nome) VALUES ($1,$2),($3,$4)", [techJava, `Java-${tag}`, techNode, `Node-${tag}`]);
    await pool.query("INSERT INTO entidade_tecnologia (id,entidade_tipo,entidade_id,tecnologia_id) VALUES ($1,'pbi',$2,$3),($4,'pbi',$5,$6),($7,'epico',$8,$3)",
      [randomUUID(), pbiTitle, techJava, randomUUID(), pbiDone, techNode, randomUUID(), epicA]);

    const byTitle = await service.search({ projetoId: projectA, q: `autenticacao ${tag}` });
    assert.equal(byTitle.total, 2, "título sem acento encontra épico e PBI do projeto A");
    assert.ok(byTitle.items.every((item) => item.trecho.destaques.length > 0));
    assert.ok(!byTitle.items.some((item) => item.id === pbiB || item.id === epicB), "nenhum item do projeto B");
    const pbiHit = byTitle.items.find((item) => item.id === pbiTitle);
    assert.equal(pbiHit?.campo, "titulo");
    assert.deepEqual(pbiHit?.caminho.map((node) => node.titulo), [`Épico Autenticação ${tag}`, `Feature Sessão ${tag}`, `Validar Autenticação ${tag}`]);
    assert.equal(pbiHit?.caminho[2].codigo, "PBI-T.1");

    const byDescription = await service.search({ projetoId: projectA, q: "recuperar senha" });
    assert.deepEqual(byDescription.items.map((item) => item.id), [pbiDesc]);
    assert.equal(byDescription.items[0].campo, "descricao");
    const [from, to] = byDescription.items[0].trecho.destaques[0];
    assert.equal(byDescription.items[0].trecho.texto.slice(from, to).toLowerCase(), "recuperar");

    const byEpicDescription = await service.search({ projetoId: projectA, q: "NAVEGAÇÃO" });
    assert.deepEqual(byEpicDescription.items.map((item) => item.id), [epicA]);
    assert.deepEqual(byEpicDescription.items[0].caminho.map((node) => node.tipo), ["epico"]);

    const byCode = await service.search({ projetoId: projectA, q: "pbi-t.3" });
    assert.deepEqual(byCode.items.map((item) => item.id), [pbiDone]);

    const combined = await service.search({ projetoId: projectA, q: `sessão ${tag}`, status: "concluido", tecnologiaId: techNode });
    assert.deepEqual(combined.items.map((item) => item.id), [pbiDone]);
    assert.deepEqual((await service.search({ projetoId: projectA, q: `sessão ${tag}`, status: "concluido", tecnologiaId: techJava })).items, []);
    assert.deepEqual((await service.search({ projetoId: projectA, q: `autenticação ${tag}`, tecnologiaId: techJava })).items.map((item) => item.id).sort(), [epicA, pbiTitle].sort());
    assert.deepEqual((await service.search({ projetoId: projectA, q: `link ${tag}`, status: "arquivado" })).items.map((item) => item.id), [pbiDesc]);
    assert.deepEqual((await service.search({ projetoId: projectA, q: `link ${tag}`, status: "rascunho" })).items, []);

    assert.equal((await service.search({ projetoId: projectA, q: "100%" })).items.length, 1, "% é literal");
    assert.equal((await service.search({ projetoId: projectA, q: "e_mail" })).items.length, 0, "_ é literal");
    assert.equal((await service.search({ projetoId: projectA, q: "termo-que-nao-existe-xyz" })).total, 0);

    const limited = await service.search({ projetoId: projectA, q: tag, limit: "2" });
    assert.equal(limited.items.length, 2);
    assert.ok(limited.total > 2);

    const other = await service.search({ projetoId: projectB, q: `autenticação ${tag}` });
    assert.deepEqual(other.items.map((item) => item.id).sort(), [epicB, pbiB].sort());
  } finally {
    await pool.query("DELETE FROM entidade_tecnologia WHERE tecnologia_id = ANY($1::uuid[]) OR entidade_id = ANY($2::uuid[])", [[techJava, techNode], [epicA]]);
    await pool.query("DELETE FROM tecnologia WHERE id = ANY($1::uuid[])", [[techJava, techNode]]);
    await pool.query("DELETE FROM projeto WHERE id = ANY($1::uuid[])", [[projectA, projectB]]);
    await pool.end();
  }
});
