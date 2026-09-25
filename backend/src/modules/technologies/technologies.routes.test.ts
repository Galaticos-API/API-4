import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createTechnologiesRouter } from "./technologies.routes.js";
import { errorHandler } from "../../middleware/errorHandler.js";

test("GET /technologies expõe só o catálogo necessário, em ordem estável", async () => {
  let queryText = "";
  const router = createTechnologiesRouter({
    async query(sql: string) {
      queryText = sql;
      return { rows: [
        { id: "tech-a", nome: "Node.js" },
        { id: "tech-b", nome: "React" },
      ] } as never;
    },
  } as unknown as Pick<Pool, "query">);
  const app = express();
  app.use("/api/v1/technologies", router);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/technologies`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [
      { id: "tech-a", nome: "Node.js" },
      { id: "tech-b", nome: "React" },
    ] });
    assert.match(queryText, /SELECT id, nome FROM tecnologia ORDER BY nome ASC, id ASC/);
    assert.doesNotMatch(queryText, /desenvolvedor|competencia|email|bio/i);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
