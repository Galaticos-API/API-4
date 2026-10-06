import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { ArchiveConflict } from "../projects/archive.types.js";
import { lockHierarchy } from "../projects/hierarchy-archive.js";
import { EpicsRepository } from "../epics/epics.repository.js";
import { PbisRepository } from "../pbis/pbis.repository.js";
import { SuggestionsRepository } from "./suggestions.repository.js";
import { SuggestionsService } from "./suggestions.service.js";

test("S2-13: ciclo humano de sugestões, proveniência por campo e fallback manual no PostgreSQL", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const service = new SuggestionsService(new SuggestionsRepository(pool));
  const [user, project, epic, feature, pbi, archivedPbi, concludedPbi] = Array.from({ length: 7 }, () => randomUUID());
  const configId = "00000000-0000-4000-8000-000000000001";
  let originalConfiguration: unknown;

  try {
    await pool.query("INSERT INTO usuario (id,nome,email,senha_hash,role) VALUES ($1,'Ana PO',$2,'h','po')", [user, `${user}@sugestoes.test`]);
    await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'T','ativo')", [project]);
    await pool.query("INSERT INTO epico (id,projeto_id,titulo) VALUES ($1,$2,'Épico')", [epic, project]);
    await pool.query("INSERT INTO feature (id,epico_id,titulo) VALUES ($1,$2,'Feature')", [feature, epic]);
    await pool.query(`INSERT INTO pbi (id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES
      ($1,$2,'PBI-S.1','PBI','PO','x','y'),($3,$2,'PBI-S.2','PBI arquivado','PO','x','y'),($4,$2,'PBI-S.3','PBI concluído','PO','x','y')`,
      [pbi, feature, archivedPbi, concludedPbi]);

    await t.test("propõe, aceita e grava proveniência por campo no item real", async () => {
      const created = await service.create("pbi", pbi, user, { campo: "titulo", valor_sugerido: "Validar login com e-mail" });
      assert.equal(created.status, "pendente");
      const accepted = await service.accept("pbi", pbi, created.id, user, {});
      assert.equal(accepted.status, "aceita");
      assert.equal(accepted.valor_resolvido, "Validar login com e-mail");

      const row = (await pool.query("SELECT titulo, provenance_json FROM pbi WHERE id=$1", [pbi])).rows[0];
      assert.equal(row.titulo, "Validar login com e-mail");
      assert.equal(row.provenance_json.titulo, "ai-accepted");

      const versao = (await pool.query("SELECT versao, snapshot_json FROM pbi_versao WHERE pbi_id=$1 ORDER BY versao DESC LIMIT 1", [pbi])).rows[0];
      assert.equal(versao.versao, 1);
      assert.equal(versao.snapshot_json.titulo, "Validar login com e-mail");

      const audit = (await pool.query("SELECT acao, dados_json FROM auditoria WHERE entidade_id=$1 AND acao='ACEITAR_SUGESTAO_IA'", [pbi])).rows[0];
      assert.equal(audit.dados_json.campo, "titulo");
    });

    await t.test("repetir a aceitação é idempotente (200) e editar depois conflita (409)", async () => {
      const created = await service.create("epico", epic, user, { campo: "objetivo", valor_sugerido: "Organizar backlog" });
      const accepted = await service.accept("epico", epic, created.id, user, {});
      const repeated = await service.accept("epico", epic, created.id, user, {});
      assert.deepEqual(repeated, accepted);
      await assert.rejects(service.edit("epico", epic, created.id, user, { valor: "Outro objetivo" }), /já foi aceita/);

      const row = (await pool.query("SELECT provenance_json FROM epico WHERE id=$1", [epic])).rows[0];
      assert.equal(row.provenance_json.objetivo, "ai-accepted");
    });

    await t.test("editar aplica o novo valor com proveniência ai-edited; nova proposta pendente não duplica (idempotência de criação)", async () => {
      const first = await service.create("feature", feature, user, { campo: "titulo", valor_sugerido: "Sessão do usuário" });
      const second = await service.create("feature", feature, user, { campo: "titulo", valor_sugerido: "Sessão e login do usuário" });
      assert.equal(first.id, second.id, "a proposta pendente anterior é substituída, não duplicada");

      const edited = await service.edit("feature", feature, second.id, user, { valor: "Sessão, login e logout" });
      assert.equal(edited.status, "editada");
      assert.equal(edited.valor_sugerido, "Sessão e login do usuário", "preserva o texto originalmente sugerido");

      const row = (await pool.query("SELECT titulo, provenance_json FROM feature WHERE id=$1", [feature])).rows[0];
      assert.equal(row.titulo, "Sessão, login e logout");
      assert.equal(row.provenance_json.titulo, "ai-edited");
    });

    await t.test("descartar nunca grava na tabela de negócio e é idempotente", async () => {
      const created = await service.create("pbi", pbi, user, { campo: "historia_como_um", valor_sugerido: "usuário autenticado" });
      const discarded = await service.discard("pbi", pbi, created.id, user);
      assert.equal(discarded.status, "descartada");
      assert.equal(discarded.valor_resolvido, null);
      assert.deepEqual(await service.discard("pbi", pbi, created.id, user), discarded);

      const row = (await pool.query("SELECT historia_como_um, provenance_json FROM pbi WHERE id=$1", [pbi])).rows[0];
      assert.equal(row.historia_como_um, "PO");
      assert.equal(row.provenance_json.historia_como_um, undefined);
    });

    await t.test("item arquivado recusa aceitar/editar com 409, corrida com o arquivamento resulta em conflito, mas descartar continua permitido", async () => {
      const created = await service.create("pbi", archivedPbi, user, { campo: "titulo", valor_sugerido: "Novo título" });

      const archiver = await pool.connect();
      try {
        await archiver.query("BEGIN");
        await lockHierarchy(archiver);
        await archiver.query("UPDATE pbi SET status='arquivado' WHERE id=$1", [archivedPbi]);
        const attempt = service.accept("pbi", archivedPbi, created.id, user, {});
        await new Promise((resolve) => setTimeout(resolve, 150));
        await archiver.query("COMMIT");
        await assert.rejects(attempt, ArchiveConflict);
      } finally {
        archiver.release();
      }

      await assert.rejects(service.accept("pbi", archivedPbi, created.id, user, {}), ArchiveConflict);
      await assert.rejects(service.edit("pbi", archivedPbi, created.id, user, { valor: "x" }), ArchiveConflict);
      const discarded = await service.discard("pbi", archivedPbi, created.id, user);
      assert.equal(discarded.status, "descartada");
    });

    await t.test("item concluído exige justificativa para aceitar ou editar, mas não para descartar", async () => {
      const savedConfiguration = await pool.query<{ configuration: unknown }>(
        "SELECT configuration FROM quality_configuration WHERE id = $1 FOR UPDATE",
        [configId],
      );
      assert.ok(savedConfiguration.rows[0], "o banco de teste deve estar migrado");
      originalConfiguration = savedConfiguration.rows[0].configuration;
      await pool.query(
        `UPDATE quality_configuration
         SET configuration = jsonb_set(configuration, '{exigir_justificativa_item_concluido}', 'true'::jsonb, true)
         WHERE id = $1`,
        [configId],
      );
      await pool.query("UPDATE pbi SET status='concluido' WHERE id=$1", [concludedPbi]);

      const created = await service.create("pbi", concludedPbi, user, { campo: "titulo", valor_sugerido: "PBI revisado" });
      await assert.rejects(service.accept("pbi", concludedPbi, created.id, user, {}), /justificativa é obrigatória/);
      const accepted = await service.accept("pbi", concludedPbi, created.id, user, { justificativa: "Correção aprovada em revisão" });
      assert.equal(accepted.status, "aceita");

      const other = await service.create("pbi", concludedPbi, user, { campo: "historia_eu_quero", valor_sugerido: "ver meu histórico" });
      const discarded = await service.discard("pbi", concludedPbi, other.id, user);
      assert.equal(discarded.status, "descartada");
    });

    await t.test("isolamento: sugestão de outro item ou outro tipo não é encontrada", async () => {
      const created = await service.create("pbi", pbi, user, { campo: "titulo", valor_sugerido: "x" });
      await assert.rejects(service.accept("epico", epic, created.id, user, {}), /não encontrada/);
      await assert.rejects(service.accept("pbi", feature, created.id, user, {}), /não encontrada/);
    });

    await t.test("fallback manual: operar epics/features/pbis sem IA grava proveniência humana e não perde dados", async () => {
      const epics = new EpicsRepository(pool);
      const pbis = new PbisRepository(pool);

      await epics.update(epic, { titulo: "Épico revisado manualmente", objetivo: "Organizar backlog" });
      const epicRow = (await pool.query("SELECT titulo, objetivo, provenance_json FROM epico WHERE id=$1", [epic])).rows[0];
      assert.equal(epicRow.titulo, "Épico revisado manualmente");
      assert.equal(epicRow.provenance_json.titulo, "human-authored");
      assert.equal(epicRow.provenance_json.objetivo, "human-authored", "edição manual sobrescreve proveniência ai-accepted anterior");

      await pbis.update(pbi, { historia_para_que: "ter acesso rápido ao sistema" });
      const pbiRow = (await pool.query("SELECT historia_para_que, provenance_json FROM pbi WHERE id=$1", [pbi])).rows[0];
      assert.equal(pbiRow.historia_para_que, "ter acesso rápido ao sistema");
      assert.equal(pbiRow.provenance_json.historia_para_que, "human-authored");
    });
  } finally {
    const entityIds = [project, epic, feature, pbi, archivedPbi, concludedPbi];
    await pool.query("DELETE FROM sugestao_ia WHERE entidade_id = ANY($1::uuid[])", [entityIds]);
    await pool.query("DELETE FROM pbi_versao WHERE pbi_id = ANY($1::uuid[])", [[pbi, archivedPbi, concludedPbi]]);
    await pool.query("DELETE FROM auditoria WHERE usuario_id=$1", [user]);
    await pool.query("DELETE FROM projeto WHERE id=$1", [project]);
    await pool.query("DELETE FROM usuario WHERE id=$1", [user]);
    if (originalConfiguration !== undefined) {
      await pool.query("UPDATE quality_configuration SET configuration = $2 WHERE id = $1", [configId, originalConfiguration]);
    }
    await pool.end();
  }
});
