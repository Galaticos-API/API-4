import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type Client } from "pg";
import { applyUntil, withDatabase } from "../../database/migration-test-utils.js";
import { TeamRepository } from "./team.repository.js";
import { TeamKnowledgeService } from "./team.service.js";

// Aponte TEAM_TEST_DATABASE_URL para um PostgreSQL descartável; o teste cria e remove o próprio banco.
const adminUrl = process.env.TEAM_TEST_DATABASE_URL;

function poolFor(client: Client): Pool {
  return new Pool({
    host: client.host, port: client.port, user: client.user,
    password: client.password ?? undefined, database: client.database, max: 4,
  });
}

test("S3-11: experiência vem de competências e de projetos autorizados, nunca de outros projetos", { skip: !adminUrl }, async () => {
  await withDatabase(adminUrl!, async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, () => false);
    const ids = {
      po: randomUUID(), viewer: randomUUID(), viewerDev: randomUUID(), inactive: randomUUID(),
      ana: randomUUID(), bruno: randomUUID(), carla: randomUUID(), inactiveDev: randomUUID(),
      atlas: randomUUID(), sigiloso: randomUUID(), epicAtlas: randomUUID(), featureAtlas: randomUUID(), epicSigiloso: randomUUID(),
      pix: randomUUID(), react: randomUUID(),
    };
    await client.query(
      `INSERT INTO usuario (id, nome, email, senha_hash, role, ativo) VALUES
        ($1,'PO','po-s311@example.test','x','po',true),
        ($2,'Dev leitor','viewer-s311@example.test','x','dev',true),
        ($3,'Inativo','inactive-s311@example.test','x','dev',false)`,
      [ids.po, ids.viewer, ids.inactive],
    );
    await client.query(
      `INSERT INTO desenvolvedor (id, nome, usuario_id, senioridade) VALUES
        ($1,'Ana',NULL,'Senior'), ($2,'Bruno',NULL,'Pleno'), ($3,'Carla',NULL,'Junior'), ($4,'Leitor',$5,'Pleno'), ($6,NULL,$7,'Pleno')`,
      [ids.ana, ids.bruno, ids.carla, ids.viewerDev, ids.viewer, ids.inactiveDev, ids.inactive],
    );
    await client.query(
      `INSERT INTO projeto (id, nome, cliente, status) VALUES ($1,'Atlas','PRO4TECH','ativo'), ($2,'Sigiloso','PRO4TECH','ativo')`,
      [ids.atlas, ids.sigiloso],
    );
    await client.query("INSERT INTO epico (id, projeto_id, titulo) VALUES ($1,$2,'Pagamentos'), ($3,$4,'Segredo')", [ids.epicAtlas, ids.atlas, ids.epicSigiloso, ids.sigiloso]);
    await client.query("INSERT INTO feature (id, epico_id, titulo) VALUES ($1,$2,'Checkout')", [ids.featureAtlas, ids.epicAtlas]);
    await client.query("INSERT INTO tecnologia (id, nome, categoria) VALUES ($1,'PIX','backend'), ($2,'React','frontend')", [ids.pix, ids.react]);
    await client.query(
      `INSERT INTO entidade_tecnologia (entidade_tipo, entidade_id, tecnologia_id) VALUES ('feature',$1,$2), ('epico',$3,$2)`,
      [ids.featureAtlas, ids.pix, ids.epicSigiloso],
    );
    await client.query(
      `INSERT INTO competencia (desenvolvedor_id, tecnologia_id, nivel, evidencia) VALUES
        ($1,$2,'avancado','Checkout PIX do Atlas'), ($3,$2,'especialista','Usuário inativo')`,
      [ids.ana, ids.pix, ids.inactiveDev],
    );
    await client.query(
      `INSERT INTO alocacao (desenvolvedor_id, projeto_id, papel, data_inicio, data_fim) VALUES
        ($1,$2,'Backend', now() - interval '200 days', now() - interval '10 days'),
        ($3,$4,'Backend', now() - interval '100 days', NULL),
        ($5,$6,'Leitor', now() - interval '5 days', NULL),
        ($7,$6,'Futuro', now() + interval '30 days', NULL)`,
      [ids.bruno, ids.atlas, ids.carla, ids.sigiloso, ids.viewerDev, ids.atlas, ids.ana],
    );

    const pool = poolFor(client);
    try {
      const repository = new TeamRepository(pool);
      const viewerProjects = await repository.accessibleProjectIds(ids.viewer);
      assert.deepEqual(viewerProjects, [ids.atlas]);

      const answer = await new TeamKnowledgeService(repository).whoWorkedWith("integração PIX", viewerProjects);
      assert.equal(answer.encontrado, true);
      const names = answer.profissionais.map((item) => item.nome);
      // Leitor: alocação vigente no Atlas, que usa PIX. Bruno: alocação encerrada no Atlas.
      // Ana: competência com evidência. Carla só atuou no projeto que o leitor não acessa e o
      // usuário inativo não aparece.
      assert.deepEqual(names, ["Leitor", "Ana", "Bruno"]);
      const byName = new Map(answer.profissionais.map((item) => [item.nome, item]));
      assert.equal(byName.get("Leitor")?.projetos[0]?.em_andamento, true);
      assert.equal(byName.get("Bruno")?.projetos[0]?.projeto_nome, "Atlas");
      assert.equal(byName.get("Bruno")?.projetos[0]?.em_andamento, false);
      // Alocação que ainda não começou não conta como experiência no projeto.
      assert.deepEqual(byName.get("Ana")?.projetos, []);
      assert.equal(byName.get("Ana")?.competencias[0]?.evidencia, "Checkout PIX do Atlas");
      assert.doesNotMatch(answer.resposta, /Sigiloso|Carla/);

      const managerProjects = await repository.accessibleProjectIds(ids.po);
      const manager = await new TeamKnowledgeService(repository).whoWorkedWith("PIX", managerProjects);
      assert.ok(manager.profissionais.some((item) => item.nome === "Carla"));

      const refusal = await new TeamKnowledgeService(repository).whoWorkedWith("React", managerProjects);
      assert.equal(refusal.encontrado, false);
      assert.match(refusal.resposta, /Não há registro de experiência com React/);
    } finally {
      await pool.end();
    }
  });
});
