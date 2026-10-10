import test from "node:test";
import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "./transaction.js";

test("a failed rollback discards the connection without hiding the original error", async () => {
  const original = new Error("write failed");
  const disconnected = new Error("connection lost");
  const releases: unknown[] = [];
  const client = {
    query: async (sql: string) => { if (sql === "ROLLBACK") throw disconnected; },
    release: (error?: unknown) => { releases.push(error); },
  } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;

  await assert.rejects(withTransaction(pool, async () => { throw original; }), error => error === original);
  assert.deepEqual(releases, [disconnected]);
});

test("a commit failure rejects the operation and releases its connection", async () => {
  const failure = new Error("commit failed");
  const queries: string[] = [];
  let releases = 0;
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql === "COMMIT") throw failure;
    },
    release: () => { releases++; },
  } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;

  await assert.rejects(withTransaction(pool, async () => "result"), error => error === failure);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(releases, 1);
});
