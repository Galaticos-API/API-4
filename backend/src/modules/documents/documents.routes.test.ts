import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";
import { createDocumentsRouter } from "./documents.routes.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import type { UserRole } from "../auth/auth.types.js";
import {
  FakeDocumentsRepository,
  FakePublisher,
  FakeStorage,
  OTHER_PROJECT_ID,
  PROJECT_ID,
  USER_ID,
  pdfBuffer,
  projectLookup,
} from "./documents.fakes.js";

const LIMIT = 2048;
const DOCUMENT_ID = "c0000000-0000-4000-8000-000000000001";

let server: Server;
let baseUrl: string;
let role: UserRole = "po";
const repository = new FakeDocumentsRepository();
const storage = new FakeStorage();

before(async () => {
  const service = new DocumentsService(repository, storage, new FakePublisher(), projectLookup, LIMIT);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { id: USER_ID, nome: "Ana PO", email: "ana@example.com", role };
    next();
  });
  app.use("/api/v1/projects/:projectId/documents", createDocumentsRouter(new DocumentsController(service), LIMIT));
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/projects`;
});

after(() => {
  server.close();
});

function upload(projectId: string, body: Buffer, fileName: string | null = "escopo.pdf", contentType = "application/octet-stream") {
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (fileName !== null) headers["X-File-Name"] = encodeURIComponent(fileName);
  return fetch(`${baseUrl}/${projectId}/documents`, { method: "POST", headers, body: new Uint8Array(body) });
}

test("perfil de leitura não pode enviar nem remover documentos", async () => {
  role = "dev";
  assert.equal((await upload(PROJECT_ID, pdfBuffer())).status, 403);
  assert.equal((await fetch(`${baseUrl}/${PROJECT_ID}/documents/${DOCUMENT_ID}`, { method: "DELETE" })).status, 403);
  assert.equal(storage.files.size, 0);
  role = "po";
});

test("upload válido retorna 201 com metadados e o tamanho vem do conteúdo, não do cliente", async () => {
  const content = pdfBuffer(100);
  const response = await upload(PROJECT_ID, content, "Escopo Ação.pdf", "text/plain");
  assert.equal(response.status, 201);
  const body = await response.json() as { nome: string; mime: string; tamanho_bytes: number; status_processamento: string };
  assert.equal(body.nome, "Escopo Ação.pdf");
  assert.equal(body.mime, "application/pdf");
  assert.equal(body.tamanho_bytes, content.length);
  assert.equal(body.status_processamento, "pendente");
});

test("MIME declarado falso é ignorado e o conteúdo real decide", async () => {
  const before = storage.files.size;
  const response = await upload(PROJECT_ID, Buffer.from("isto é só texto"), "falso.pdf", "application/pdf");
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /não corresponde/);
  assert.equal(storage.files.size, before);
});

test("arquivo acima do limite retorna 413 informando o limite", async () => {
  const response = await upload(PROJECT_ID, Buffer.alloc(LIMIT + 10, 0x61), "grande.txt");
  assert.equal(response.status, 413);
  const body = await response.json() as { code: string; details?: { max_bytes: number } };
  assert.equal(body.code, "PAYLOAD_TOO_LARGE");
  assert.equal(body.details?.max_bytes, LIMIT);
});

test("requisições malformadas são recusadas com 400", async () => {
  assert.equal((await upload(PROJECT_ID, pdfBuffer(), null)).status, 400);
  assert.equal((await upload(PROJECT_ID, Buffer.alloc(0), "vazio.txt")).status, 400);
  const json = await fetch(`${baseUrl}/${PROJECT_ID}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-File-Name": "a.txt" },
    body: JSON.stringify({ arquivo: "a" }),
  });
  assert.equal(json.status, 400);
});

test("projeto inexistente retorna 404 e id malformado retorna 400", async () => {
  assert.equal((await upload("d0000000-0000-4000-8000-0000000000ff", pdfBuffer())).status, 404);
  assert.equal((await upload("nao-e-uuid", pdfBuffer())).status, 400);
});

test("listagem isola por projeto e devolve os limites configurados", async () => {
  repository.seed({ id: "c0000000-0000-4000-8000-0000000000aa", projeto_id: OTHER_PROJECT_ID, caminho: "x/y", nome: "alheio.pdf" });
  const response = await fetch(`${baseUrl}/${PROJECT_ID}/documents`);
  assert.equal(response.status, 200);
  const body = await response.json() as { items: Array<{ nome: string; projeto_id: string }>; limites: { max_bytes: number } };
  assert.ok(body.items.length >= 1);
  assert.ok(body.items.every((item) => item.projeto_id === PROJECT_ID));
  assert.ok(!body.items.some((item) => item.nome === "alheio.pdf"));
  assert.equal(body.limites.max_bytes, LIMIT);
});

test("DELETE é idempotente: 204 na primeira e na repetição", async () => {
  repository.seed({ id: DOCUMENT_ID, projeto_id: PROJECT_ID, caminho: `${PROJECT_ID}/${DOCUMENT_ID}` });
  storage.files.set(`${PROJECT_ID}/${DOCUMENT_ID}`, pdfBuffer());
  const url = `${baseUrl}/${PROJECT_ID}/documents/${DOCUMENT_ID}`;
  assert.equal((await fetch(url, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(url, { method: "DELETE" })).status, 204);
  assert.ok(!repository.rows.some((row) => row.id === DOCUMENT_ID));
  assert.ok(!storage.files.has(`${PROJECT_ID}/${DOCUMENT_ID}`));
});

test("DELETE com id de documento malformado retorna 400", async () => {
  assert.equal((await fetch(`${baseUrl}/${PROJECT_ID}/documents/abc`, { method: "DELETE" })).status, 400);
});
