import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type Client } from "pg";
import { applyUntil, loadMigration, withDatabase } from "../../database/migration-test-utils.js";
import { AppError } from "../../shared/errors.js";
import { DevelopersRepository } from "./developers.repository.js";

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

test("S3-08: migration consolida perfis e criação concorrente mantém unicidade e auditoria", { skip: !adminUrl }, async () => {
  await withDatabase(adminUrl!, async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, (file) => file.startsWith("028_"));
    const ids = {
      user: randomUUID(), canonical: randomUUID(), duplicate: randomUUID(), technology: randomUUID(),
      project: randomUUID(),
    };
    await client.query(
      "INSERT INTO usuario (id,nome,email,senha_hash,role) VALUES ($1,'Ana Souza','ana-s308@example.test','x','dev')",
      [ids.user],
    );
    await client.query(
      `INSERT INTO desenvolvedor (id,usuario_id,senioridade,bio,created_at) VALUES
        ($1,$3,'Senior',NULL,'2024-01-01T00:00:00Z'), ($2,$3,'Pleno',NULL,'2024-02-01T00:00:00Z')`,
      [ids.canonical, ids.duplicate, ids.user],
    );
    await client.query("INSERT INTO tecnologia (id,nome,categoria) VALUES ($1,'TypeScript','backend')", [ids.technology]);
    await client.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1,'Projeto S308','PRO4TECH','ativo')", [ids.project]);
    await client.query("INSERT INTO competencia (desenvolvedor_id,tecnologia_id,nivel) VALUES ($1,$3,'avancado'),($2,$3,'intermediario')", [ids.canonical, ids.duplicate, ids.technology]);
    await client.query("INSERT INTO alocacao (desenvolvedor_id,projeto_id,papel) VALUES ($1,$3,'Tech Lead'),($2,$3,'Backend')", [ids.canonical, ids.duplicate, ids.project]);

    await client.query(await loadMigration("028_developer_profiles.sql", vectorAvailable));
    const profiles = await client.query<{ id: string; nome: string }>("SELECT id,nome FROM desenvolvedor WHERE usuario_id=$1", [ids.user]);
    assert.equal(profiles.rowCount, 1);
    assert.equal(profiles.rows[0].id, ids.canonical);
    assert.equal(profiles.rows[0].nome, "Ana Souza");
    assert.equal((await client.query("SELECT 1 FROM desenvolvedor WHERE id=$1", [ids.duplicate])).rowCount, 0);
    assert.equal((await client.query("SELECT count(*) FROM competencia WHERE desenvolvedor_id=$1", [ids.canonical])).rows[0].count, "2");
    assert.equal((await client.query("SELECT count(*) FROM alocacao WHERE desenvolvedor_id=$1", [ids.canonical])).rows[0].count, "2");
    assert.equal((await client.query("SELECT count(*) FROM competencia WHERE desenvolvedor_id=$1", [ids.duplicate])).rows[0].count, "0");
    assert.equal((await client.query("SELECT count(*) FROM alocacao WHERE desenvolvedor_id=$1", [ids.duplicate])).rows[0].count, "0");
    assert.equal((await client.query("SELECT 1 FROM pg_indexes WHERE indexname='uq_desenvolvedor_usuario_id' AND indexdef ILIKE '%WHERE (usuario_id IS NOT NULL)%'")).rowCount, 1);

    await applyUntil(client, vectorAvailable, () => false);
    await client.query("DELETE FROM desenvolvedor WHERE id=$1", [ids.canonical]);
    const pool = poolFor(client);
    try {
      const repository = new DevelopersRepository(pool);
      const attempts = await Promise.allSettled([
        repository.create({ usuario_id: ids.user }, ids.user),
        repository.create({ usuario_id: ids.user }, ids.user),
      ]);
      const successes = attempts.filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof repository.create>>> => item.status === "fulfilled");
      const failures = attempts.filter((item): item is PromiseRejectedResult => item.status === "rejected");
      assert.equal(successes.length, 1);
      assert.equal(failures.length, 1);
      assert.ok(failures[0].reason instanceof AppError);
      assert.equal(failures[0].reason.statusCode, 409);
      assert.equal(failures[0].reason.code, "DEVELOPER_PROFILE_EXISTS");
      assert.equal((await client.query("SELECT count(*) FROM desenvolvedor WHERE usuario_id=$1", [ids.user])).rows[0].count, "1");
      assert.equal((await client.query("SELECT count(*) FROM auditoria WHERE usuario_id=$1 AND acao='CRIAR_PERFIL_PROFISSIONAL'", [ids.user])).rows[0].count, "1");
    } finally {
      await pool.end();
    }
  });
});
