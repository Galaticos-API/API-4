import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { errorHandler } from "./errorHandler.js";
import { ArchiveConflict } from "../modules/projects/archive.types.js";

test("erros inesperados não expõem detalhes de registros em logs ou resposta", () => {
  const logs: unknown[][] = [];
  const original = console.error;
  let status = 0;
  let body: unknown;
  const response = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; } } as Response;
  console.error = (...args) => { logs.push(args); };
  try {
    const failure = Object.assign(new Error("conteúdo privado"), { code: "23503", detail: "conteúdo privado", query: "conteúdo privado" });
    errorHandler(failure, {} as Request, response, () => {});
    assert.equal(status, 500);
    assert.equal(JSON.stringify([logs, body]).includes("conteúdo privado"), false);
    assert.deepEqual(logs, [["[Internal Server Error]", { code: "23503" }]]);
    errorHandler(new ArchiveConflict("Consulte a prévia novamente."), {} as Request, response, () => {});
    assert.equal(status, 409);
    assert.equal(logs.length, 1);
  } finally { console.error = original; }
});
