import test from "node:test";
import assert from "node:assert/strict";

import { env } from "./env.js";

test("configuração de ambiente aplica valores padrão seguros", () => {
  assert.ok(["development", "production", "test"].includes(env.NODE_ENV));
  assert.equal(typeof env.PORT, "number");
  assert.equal(typeof env.POSTGRES_PORT, "number");
  assert.match(env.AI_SERVICE_URL, /^https?:\/\//);
});
