import type { Pool, QueryResultRow } from 'pg';

export async function queryWithDeadline<Row extends QueryResultRow>(pool: Pool, deadline: number | undefined, sql: string, values: unknown[]) {
  if (deadline === undefined) return pool.query<Row>(sql, values);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) throw new Error('Prazo da busca esgotado.');
    await client.query("SELECT set_config('statement_timeout', $1, true)", [String(remaining)]);
    const result = await client.query<Row>(sql, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
