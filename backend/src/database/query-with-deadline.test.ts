import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { queryWithDeadline } from './query-with-deadline.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function client(query: (sql: string, values?: unknown[]) => Promise<unknown>) {
  let releases = 0;
  return {
    value: { query, release: () => { releases++; } } as unknown as PoolClient,
    releases: () => releases,
  };
}

test('times out while acquisition is pending and releases a late client', async () => {
  const pending = deferred<PoolClient>();
  const late = client(async () => ({ rows: [], rowCount: 0 }));
  const pool = { connect: () => pending.promise } as unknown as Pool;
  const started = performance.now();
  const request = queryWithDeadline(pool, started + 20, 'SELECT 1', []);
  await assert.rejects(Promise.race([request, new Promise((_, reject) => setTimeout(() => reject(new Error('test guard')), 100))]), /Prazo da busca esgotado/);
  pending.resolve(late.value);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(late.releases(), 1);
});

test('passes remaining deadline as statement_timeout and rolls back safely', async () => {
  const calls: Array<[string, unknown[]?]> = [];
  const original = new Error('query failed');
  const c = client(async (sql, values) => {
    calls.push([sql, values]);
    if (sql === 'SELECT broken') throw original;
    if (sql === 'ROLLBACK') throw new Error('rollback failed');
    return { rows: [], rowCount: 0 };
  });
  const pool = { connect: async () => c.value } as unknown as Pool;
  const result = await queryWithDeadline<QueryResultRow>(pool, performance.now() + 5000, 'SELECT broken', []).catch((error) => error);
  assert.equal(result.message, 'query failed');
  assert.equal(result.cause, undefined);
  assert.ok(calls[1]?.[0].includes('set_config'));
  assert.ok(Number(calls[1]?.[1]?.[0]) > 0);
  assert.ok(Number(calls[1]?.[1]?.[0]) <= 5000);
  assert.deepEqual(calls.map(([sql]) => sql), ['BEGIN', "SELECT set_config('statement_timeout', $1, true)", 'SELECT broken', 'ROLLBACK']);
});
