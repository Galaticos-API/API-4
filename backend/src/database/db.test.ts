import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { checkDatabaseConnection } from './db';

test('healthcheck devolve a conexão no sucesso e descarta no erro de consulta', async () => {
  for (const failed of [false, true]) {
    const releases: boolean[] = [];
    const db = { connect: async () => ({
      query: async () => { if (failed) throw new Error('query failed'); },
      release: (discard: boolean) => releases.push(discard),
    }) } as unknown as Pool;
    assert.equal(await checkDatabaseConnection(db), !failed);
    assert.deepEqual(releases, [failed]);
  }
});
