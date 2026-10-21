import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { ArchiveConflict } from "../projects/archive.types.js";
import { lockHierarchy } from "../projects/hierarchy-archive.js";
import { SuggestionsRepository } from "../suggestions/suggestions.repository.js";
import { SuggestionsService } from "../suggestions/suggestions.service.js";
import { ConflictError, NotFoundError } from "../../shared/errors.js";
import { SimilarItemsRepository } from "./similar-items.repository.js";
import { SimilarItemsService } from "./similar-items.service.js";
import { FakeEmbeddings, VALID_VECTOR } from "./similar-items.fakes.js";

const literal = (vector: number[]) => `[${vector.join(",")}]`;
const DIFFERENT_VECTOR = VALID_VECTOR.map((_, index) => (index % 7 === 3 ? 0.9 : 0.01));
const DRAFT = { tipo: "pbi", titulo: "Validar login do usuário", descricao: "Entrar com e-mail e senha" };

test("S2-12: itens semelhantes entre projetos, aproveitamento com origem e visibilidade no PostgreSQL", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const embeddings = new FakeEmbeddings();
  const service = new SimilarItemsService(new SimilarItemsRepository(pool), embeddings, 0.72);
  const suggestions = new SuggestionsService(new SuggestionsRepository(pool));

  const [po, devA, devOther, developerA, projectA, projectB, projectArchived] = Array.from({ length: 7 }, () => randomUUID());
  const ids = {
    a: { epic: randomUUID(), feature: randomUUID(), target: randomUUID(), sibling: randomUUID() },
    b: { epic: randomUUID(), feature: randomUUID(), similar: randomUUID(), unrelated: randomUUID(), archivedItem: randomUUID() },
    z: { epic: randomUUID(), feature: randomUUID(), similar: randomUUID() },
  };

  const insertTree = async (project: string, tree: { epic: string; feature: string }) => {
    await pool.query("INSERT INTO epico (id,projeto_id,titulo) VALUES ($1,$2,'Épico')", [tree.epic, project]);
    await pool.query("INSERT INTO feature (id,epico_id,titulo) VALUES ($1,$2,'Feature de acesso')", [tree.feature, tree.epic]);
  };
  const insertPbi = async (id: string, feature: string, codigo: string, titulo: string, status = "rascunho") => {
    await pool.query(
      `INSERT INTO pbi (id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,regras_observacoes,status)
       VALUES ($1,$2,$3,$4,'usuário cadastrado','entrar com e-mail e senha','acessar minhas informações','Bloquear após 5 tentativas',$5)`,
      [id, feature, codigo, titulo, status],
    );
  };
  const insertChunk = async (project: string, id: string, vector: number[], texto = "Validar login com e-mail e senha") => {
    await pool.query(
      "INSERT INTO chunk (projeto_id, entidade_tipo, entidade_id, texto, embedding) VALUES ($1,'pbi',$2,$3,$4::vector)",
      [project, id, texto, literal(vector)],
    );
  };

  try {
    await pool.query("INSERT INTO usuario (id,nome,email,senha_hash,role) VALUES ($1,'Ana PO',$2,'h','po')", [po, `${po}@similares.test`]);
    await pool.query("INSERT INTO usuario (id,nome,email,senha_hash,role) VALUES ($1,'Dev A',$2,'h','dev')", [devA, `${devA}@similares.test`]);
    await pool.query("INSERT INTO usuario (id,nome,email,senha_hash,role) VALUES ($1,'Dev sem alocação',$2,'h','dev')", [devOther, `${devOther}@similares.test`]);
    await pool.query("INSERT INTO desenvolvedor (id,usuario_id) VALUES ($1,$2)", [developerA, devA]);
    await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1,'Projeto A','T','ativo'),($2,'Portal do Cliente','T','ativo'),($3,'Projeto Antigo','T','ativo')", [projectA, projectB, projectArchived]);
    await pool.query("INSERT INTO alocacao (desenvolvedor_id,projeto_id) VALUES ($1,$2)", [developerA, projectA]);
    await insertTree(projectA, ids.a);
    await insertTree(projectB, ids.b);
    await insertTree(projectArchived, ids.z);
    await insertPbi(ids.a.target, ids.a.feature, `PBI-${randomUUID().slice(0, 8)}`, "Rascunho do login");
    await insertPbi(ids.a.sibling, ids.a.feature, `PBI-${randomUUID().slice(0, 8)}`, "Login já concluído no mesmo projeto", "concluido");
    await insertPbi(ids.b.similar, ids.b.feature, `PBI-${randomUUID().slice(0, 8)}`, "Validar login com e-mail", "concluido");
    await insertPbi(ids.b.unrelated, ids.b.feature, `PBI-${randomUUID().slice(0, 8)}`, "Exportar relatório mensal", "concluido");
    await insertPbi(ids.b.archivedItem, ids.b.feature, `PBI-${randomUUID().slice(0, 8)}`, "Login arquivado", "arquivado");
    await insertPbi(ids.z.similar, ids.z.feature, `PBI-${randomUUID().slice(0, 8)}`, "Login em projeto arquivado", "concluido");
    await insertChunk(projectB, ids.b.similar, VALID_VECTOR);
    await insertChunk(projectB, ids.b.similar, VALID_VECTOR, "Segundo trecho do mesmo item");
    await insertChunk(projectB, ids.b.unrelated, DIFFERENT_VECTOR, "Relatório mensal");
    await insertChunk(projectB, ids.b.archivedItem, VALID_VECTOR);
    await insertChunk(projectA, ids.a.sibling, VALID_VECTOR, "Login concluído");
    await insertChunk(projectArchived, ids.z.similar, VALID_VECTOR);
    await pool.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [projectArchived]);

    await t.test("sugere de outro projeto, uma vez por item, sem itens arquivados, abaixo do limiar ou de projeto arquivado", async () => {
      const result = await service.search(projectA, po, { ...DRAFT, excluir_id: ids.a.target });
      const found = result.items.map((item) => item.id).sort();
      assert.deepEqual(found, [ids.a.sibling, ids.b.similar].sort());
      const other = result.items.find((item) => item.id === ids.b.similar)!;
      assert.equal(other.outro_projeto, true);
      assert.equal(other.origem, "Portal do Cliente › Épico › Feature de acesso");
      assert.equal(other.similaridade, 1);
      assert.equal(result.items.find((item) => item.id === ids.a.sibling)!.outro_projeto, false);
    });

    await t.test("item em edição nunca é sugerido a si mesmo", async () => {
      const result = await service.search(projectA, po, { ...DRAFT, excluir_id: ids.a.sibling });
      assert.ok(result.items.every((item) => item.id !== ids.a.sibling));
    });

    await t.test("respeita o acesso por projeto: dev só vê projetos em que está alocado", async () => {
      const allocatedToA = await service.search(projectA, devA, DRAFT);
      assert.deepEqual(allocatedToA.items.map((item) => item.id), [ids.a.sibling], "sem acesso ao projeto B");
      const noAllocation = await service.search(projectA, devOther, DRAFT);
      assert.deepEqual(noAllocation.items, []);
      await pool.query("INSERT INTO alocacao (desenvolvedor_id,projeto_id) VALUES ($1,$2)", [developerA, projectB]);
      const allocatedToBoth = await service.search(projectA, devA, DRAFT);
      assert.ok(allocatedToBoth.items.some((item) => item.id === ids.b.similar));
      await pool.query("DELETE FROM alocacao WHERE desenvolvedor_id=$1 AND projeto_id=$2", [developerA, projectB]);
    });

    await t.test("aproveitar cria propostas pendentes com origem, não altera o item e registra a relação", async () => {
      const before = (await pool.query("SELECT titulo, historia_como_um, provenance_json FROM pbi WHERE id=$1", [ids.a.target])).rows[0];
      const reused = await service.reuse("pbi", ids.a.target, ids.b.similar, po, {});

      assert.deepEqual(reused.sugestoes.map((item) => item.campo).sort(), ["historia_como_um", "historia_eu_quero", "historia_para_que", "regras_observacoes", "titulo"]);
      assert.ok(reused.sugestoes.every((item) => item.status === "pendente" && item.origem === `similar:pbi:${ids.b.similar}`));
      assert.equal(reused.relacao.tipo_relacao, "reaproveitado_de");
      assert.equal(reused.relacao.origem_projeto_id, projectB);
      assert.equal(reused.relacao.destino_projeto_id, projectA);

      const after = (await pool.query("SELECT titulo, historia_como_um, provenance_json FROM pbi WHERE id=$1", [ids.a.target])).rows[0];
      assert.deepEqual(after, before, "a IA nunca grava na tabela de negócio");

      const audit = (await pool.query("SELECT dados_json FROM auditoria WHERE entidade_id=$1 AND acao='APROVEITAR_ITEM_SIMILAR'", [ids.a.target])).rows[0];
      assert.equal(audit.dados_json.origem_id, ids.b.similar);
    });

    await t.test("repetir o aproveitamento é idempotente e a busca passa a marcar ja_aproveitado", async () => {
      const first = (await pool.query("SELECT id FROM sugestao_ia WHERE entidade_id=$1 AND campo='titulo' AND status='pendente'", [ids.a.target])).rows[0].id;
      await service.reuse("pbi", ids.a.target, ids.b.similar, po, { campos: ["titulo"] });
      const rows = (await pool.query("SELECT id FROM sugestao_ia WHERE entidade_id=$1 AND campo='titulo'", [ids.a.target])).rows;
      assert.deepEqual(rows.map((row) => row.id), [first]);
      assert.equal((await pool.query("SELECT 1 FROM reaproveitamento_item WHERE destino_id=$1 AND origem_id=$2", [ids.a.target, ids.b.similar])).rowCount, 1);

      const result = await service.search(projectA, po, { ...DRAFT, excluir_id: ids.a.target });
      assert.equal(result.items.find((item) => item.id === ids.b.similar)!.ja_aproveitado, true);
    });

    await t.test("a proposta aproveitada segue o ciclo S2-13: aceitar grava com proveniência ai-accepted", async () => {
      const pending = (await pool.query("SELECT id FROM sugestao_ia WHERE entidade_id=$1 AND campo='titulo' AND status='pendente'", [ids.a.target])).rows[0];
      const accepted = await suggestions.accept("pbi", ids.a.target, pending.id, po, {});
      assert.equal(accepted.status, "aceita");
      const row = (await pool.query("SELECT titulo, provenance_json FROM pbi WHERE id=$1", [ids.a.target])).rows[0];
      assert.equal(row.titulo, "Validar login com e-mail");
      assert.equal(row.provenance_json.titulo, "ai-accepted");
    });

    await t.test("origem inacessível ao usuário, arquivada ou do próprio item é recusada", async () => {
      await assert.rejects(service.reuse("pbi", ids.a.target, ids.b.similar, devOther, {}), NotFoundError);
      await assert.rejects(service.reuse("pbi", ids.a.target, ids.b.archivedItem, po, {}), ConflictError);
      await assert.rejects(service.reuse("pbi", ids.a.target, ids.z.similar, po, {}), ConflictError);
      await assert.rejects(service.reuse("pbi", ids.a.target, randomUUID(), po, {}), NotFoundError);
    });

    await t.test("corrida com o arquivamento do item em edição resulta em conflito e não deixa relação", async () => {
      const racing = randomUUID();
      await insertPbi(racing, ids.a.feature, `PBI-${randomUUID().slice(0, 8)}`, "Item que será arquivado");
      const archiver = await pool.connect();
      try {
        await archiver.query("BEGIN");
        await lockHierarchy(archiver, "pbi", racing);
        await archiver.query("UPDATE pbi SET status='arquivado' WHERE id=$1", [racing]);
        const attempt = service.reuse("pbi", racing, ids.b.similar, po, {});
        await new Promise((resolve) => setTimeout(resolve, 150));
        await archiver.query("COMMIT");
        await assert.rejects(attempt, ArchiveConflict);
      } finally {
        archiver.release();
      }
      assert.equal((await pool.query("SELECT 1 FROM reaproveitamento_item WHERE destino_id=$1", [racing])).rowCount, 0);
      assert.equal((await pool.query("SELECT 1 FROM sugestao_ia WHERE entidade_id=$1", [racing])).rowCount, 0);
    });
  } finally {
    const entityIds = [...Object.values(ids.a), ...Object.values(ids.b), ...Object.values(ids.z)];
    await pool.query("DELETE FROM sugestao_ia WHERE entidade_id = ANY($1::uuid[])", [entityIds]);
    await pool.query("DELETE FROM pbi_versao WHERE pbi_id = ANY($1::uuid[])", [entityIds]);
    await pool.query("DELETE FROM auditoria WHERE usuario_id = ANY($1::uuid[])", [[po, devA, devOther]]);
    await pool.query("DELETE FROM projeto WHERE id = ANY($1::uuid[])", [[projectA, projectB, projectArchived]]);
    await pool.query("DELETE FROM usuario WHERE id = ANY($1::uuid[])", [[po, devA, devOther]]);
    await pool.end();
  }
});
