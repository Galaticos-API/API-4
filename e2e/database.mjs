import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { Pool } = require('pg');

export async function testDatabase(work) {
  const connectionString = process.env.E2E_DATABASE_URL;
  if (!connectionString || !/^sinapse_e2e_test$/.test(new URL(connectionString).pathname.slice(1))) {
    throw new Error('E2E_DATABASE_URL deve apontar para um banco dedicado chamado sinapse_e2e_test.');
  }
  const db = new Pool({ connectionString, max: 1 });
  try { return await work(db); } finally { await db.end(); }
}

export async function allocateDeveloper(account, project) {
  await testDatabase(async db => {
    const developer = await db.query('INSERT INTO desenvolvedor(usuario_id) VALUES($1) RETURNING id', [account.user.id]);
    await db.query('INSERT INTO alocacao(desenvolvedor_id,projeto_id) VALUES($1,$2)', [developer.rows[0].id, project.id]);
  });
}
