import test from "node:test";
import assert from "node:assert/strict";
import { ChunksService } from "./chunks.service.js";
import { ValidationError } from "../../shared/errors.js";

const service = new ChunksService();

const PROJECT_ID = "a0000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "b0000000-0000-4000-8000-000000000001";
const embedding1024 = Array.from({ length: 1024 }, () => 0.1);

test("recusa projetoId não-UUID antes de qualquer trabalho", async () => {
  await assert.rejects(
    service.persist({ projetoId: "nao-uuid", documentoId: DOCUMENT_ID, chunks: [{ chunk_index: 0, content: "x", embedding: embedding1024 }] }),
    ValidationError,
  );
});

test("recusa lista vazia de chunks", async () => {
  await assert.rejects(
    service.persist({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, chunks: [] }),
    ValidationError,
  );
});

test("recusa embedding fora de 1024 dimensões (bge-m3)", async () => {
  await assert.rejects(
    service.persist({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, chunks: [{ chunk_index: 0, content: "x", embedding: [0.1, 0.2] }] }),
    /1024 dimensões/,
  );
});

test("recusa chunk sem texto", async () => {
  await assert.rejects(
    service.persist({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, chunks: [{ chunk_index: 0, content: "   ", embedding: embedding1024 }] }),
    /sem texto/,
  );
});

test("recusa embedding com valor não numérico", async () => {
  const bad = [...embedding1024];
  bad[500] = Number.NaN;
  await assert.rejects(
    service.persist({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, chunks: [{ chunk_index: 0, content: "x", embedding: bad }] }),
    /não numérico/,
  );
});
