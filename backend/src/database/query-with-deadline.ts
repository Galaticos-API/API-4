import type { Pool, QueryResultRow } from 'pg';

export async function queryWithDeadline<Row extends QueryResultRow>(pool: Pool, deadline: number | undefined, sql: string, values: unknown[]) {
  if (deadline === undefined) return pool.query<Row>(sql, values);

  const remainingBeforeAcquire = Math.floor(deadline - performance.now());
  if (remainingBeforeAcquire <= 0) throw new Error('Prazo da busca esgotado.');

  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const acquisition = pool.connect();
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('Prazo da busca esgotado.'));
    }, remainingBeforeAcquire);
  });
  void acquisition.then((lateClient) => {
    if (timedOut) lateClient.release();
  }, () => undefined);

  let client: Awaited<typeof acquisition>;
  try {
    client = await Promise.race([acquisition, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  try {
    await client.query('BEGIN');
    const queryRemaining = Math.floor(deadline - performance.now());
    if (queryRemaining <= 0) throw new Error('Prazo da busca esgotado.');
    await client.query("SELECT set_config('statement_timeout', $1, true)", [String(queryRemaining)]);
    const result = await client.query<Row>(sql, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original query/deadline error if rollback also fails.
    }
    throw error;
  } finally {
    client.release();
  }
}
