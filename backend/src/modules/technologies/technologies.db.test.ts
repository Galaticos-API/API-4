import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type Client } from "pg";
import { applyUntil, loadMigration, withDatabase } from "../../database/migration-test-utils.js";
import { TechnologiesRepository, TechnologyExistsError, TechnologyInUseError } from "./technologies.repository.js";

// Aponte TEAM_TEST_DATABASE_URL para um PostgreSQL descartável (ex.: o do docker compose).
// O teste cria e remove o próprio banco temporário, sem tocar no banco configurado.
const adminUrl = process.env.TEAM_TEST_DATABASE_URL;

function poolFor(client: Client): Pool {
  return new Pool({
    host: client.host,
    port: client.port,
    user: client.user,
    password: client.password ?? undefined,
    database: client.database,
    max: 4,
  });
}

test("S3-14: migration unifica variações e repositório protege o vocabulário", { skip: !adminUrl }, async () => {
  await withDatabase(adminUrl!, async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, (file) => file.startsWith("029_"));

    const ids = {
      user: randomUUID(), project: randomUUID(), epic: randomUUID(), dev: randomUUID(),
      node: randomUUID(), nodeVariant: randomUUID(), nodeSpace: randomUUID(), react: randomUUID(),
    };
    await client.query("INSERT INTO usuario (id, nome, email, senha_hash, role) VALUES ($1,'Admin','admin-s314@example.test','x','admin')", [ids.user]);
    await client.query("INSERT INTO projeto (id, nome, cliente) VALUES ($1,'Projeto S3-14','PRO4TECH')", [ids.project]);
    await client.query("INSERT INTO epico (id, projeto_id, titulo) VALUES ($1,$2,'Épico')", [ids.epic, ids.project]);
    await client.query("INSERT INTO desenvolvedor (id, usuario_id, senioridade) VALUES ($1,$2,'Senior')", [ids.dev, ids.user]);
    await client.query(
      `INSERT INTO tecnologia (id, nome, categoria, created_at) VALUES
        ($1,'Node.js','backend', now() - interval '3 days'),
        ($2,'NodeJS','backend', now() - interval '2 days'),
        ($3,'node js','backend', now() - interval '1 day'),
        ($4,'React','frontend', now())`,
      [ids.node, ids.nodeVariant, ids.nodeSpace, ids.react],
    );
    // O épico está classificado com o canônico e com duas variações; a competência usa uma variação.
    await client.query(
      `INSERT INTO entidade_tecnologia (entidade_tipo, entidade_id, tecnologia_id) VALUES
        ('epico',$1,$2), ('epico',$1,$3), ('epico',$1,$4)`,
      [ids.epic, ids.node, ids.nodeVariant, ids.nodeSpace],
    );
    await client.query("INSERT INTO competencia (desenvolvedor_id, tecnologia_id, nivel) VALUES ($1,$2,'avancado')", [ids.dev, ids.nodeVariant]);

    await client.query(await loadMigration("029_technology_vocabulary.sql", vectorAvailable));
    await client.query("INSERT INTO _schema_migrations (version) VALUES ('029_technology_vocabulary.sql')");

    const remaining = await client.query<{ id: string; nome: string }>("SELECT id, nome FROM tecnologia ORDER BY nome");
    assert.deepEqual(remaining.rows.map((row) => row.nome), ["Node.js", "React"]);
    const epicTechs = await client.query("SELECT tecnologia_id FROM entidade_tecnologia WHERE entidade_id=$1", [ids.epic]);
    assert.deepEqual(epicTechs.rows.map((row) => row.tecnologia_id), [ids.node]);
    const competency = await client.query("SELECT tecnologia_id FROM competencia WHERE desenvolvedor_id=$1", [ids.dev]);
    assert.equal(competency.rows[0].tecnologia_id, ids.node);

    await assert.rejects(
      () => client.query("INSERT INTO tecnologia (nome, categoria) VALUES ('NODE-JS','backend')"),
      (error: { code?: string }) => error.code === "23505",
    );

    await applyUntil(client, vectorAvailable, () => false);
    const pool = poolFor(client);
    try {
      const repository = new TechnologiesRepository(pool);
      await assert.rejects(
        () => repository.create({ nome: "nodejs", categoria: "backend" }, ids.user),
        (error: unknown) => error instanceof TechnologyExistsError && (error.details as { existente: { id: string } }).existente.id === ids.node,
      );
      const kafka = await repository.create({ nome: "Kafka", categoria: "backend" }, ids.user);
      assert.equal((await repository.list("kaf"))[0]?.id, kafka.id);

      const [node] = (await repository.list()).filter((item) => item.id === ids.node);
      assert.deepEqual(node?.uso, { competencias: 1, itens: 1, total: 2 });
      await assert.rejects(() => repository.remove(ids.node, undefined, ids.user), TechnologyInUseError);
      await assert.rejects(() => repository.remove(ids.node, 1, ids.user), TechnologyInUseError);
      assert.deepEqual(await repository.remove(ids.node, 2, ids.user), { competencias: 1, itens: 1, total: 2 });
      assert.equal((await client.query("SELECT 1 FROM competencia WHERE desenvolvedor_id=$1", [ids.dev])).rowCount, 0);

      const audit = await client.query<{ acao: string; usuario_id: string }>(
        "SELECT acao, usuario_id FROM auditoria WHERE entidade_tipo='tecnologia' ORDER BY created_at",
      );
      assert.deepEqual(audit.rows.map((row) => row.acao), ["CRIAR_TECNOLOGIA", "REMOVER_TECNOLOGIA"]);
      assert.ok(audit.rows.every((row) => row.usuario_id === ids.user));
    } finally {
      await pool.end();
    }
  });
});
