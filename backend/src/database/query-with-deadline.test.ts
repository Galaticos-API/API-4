import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { validateTarget } from './seed-lib.js';
import { queryWithDeadline } from './query-with-deadline.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds); }),
  ]).finally(() => clearTimeout(timer!));
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

test('real pg.Pool acquisition timeout releases its late client and leaves pool usable', { skip: !process.env.QUALITY_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: validateTarget(process.env.QUALITY_TEST_DATABASE_URL, 'test'), max: 1 });
  let held: PoolClient | undefined;
  let connectCalls = 0;
  let lateReleaseCount = 0;
  let lateAcquisition: Promise<PoolClient> | undefined;
  const checkedOut = new Set<PoolClient>();
  const originalConnect = pool.connect.bind(pool);
  const observedPool = { connect: () => {
    const call = ++connectCalls;
    const acquisition = originalConnect().then((client) => {
      checkedOut.add(client);
      const originalRelease = client.release.bind(client);
      client.release = (error?: Error | boolean) => {
        if (!checkedOut.delete(client)) return;
        if (call >= 1) lateReleaseCount++;
        originalRelease(error);
      };
      return client;
    });
    if (call >= 1) lateAcquisition = acquisition;
    return acquisition;
  } } as Pool;
  try {
    held = await pool.connect();
    const started = performance.now();
    await assert.rejects(withTimeout(queryWithDeadline(observedPool, started + 80, 'SELECT 1', []), 1000, 'acquisition deadline'), /Prazo da busca esgotado/);
    assert.ok(performance.now() - started < 1000, 'deadline should bound the saturated pool wait');

    held.release();
    held = undefined;
    const drainDeadline = performance.now() + 1000;
    while (pool.waitingCount !== 0 && performance.now() < drainDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(pool.waitingCount, 0, 'late acquisition should drain from the pool wait queue');
    assert.ok(lateAcquisition, 'late acquisition should have been observed');
    await withTimeout(lateAcquisition, 500, 'late acquisition completion');
    assert.equal(lateReleaseCount, 1, 'late acquired client should be released exactly once');
    const result = await withTimeout(pool.query('SELECT 1 AS usable'), 1000, 'pool recovery query');
    assert.equal(result.rows[0]?.usable, 1);
  } finally {
    held?.release();
    if (lateAcquisition) await withTimeout(lateAcquisition, 500, 'late acquisition cleanup').catch(() => undefined);
    for (const checkedOutClient of checkedOut) checkedOutClient.release(true);
    await withTimeout(pool.end(), 1000, 'pool cleanup');
  }
});
