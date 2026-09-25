import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDocumentStorage } from "./documents.storage.js";

const PROJECT = "a0000000-0000-4000-8000-000000000001";
const DOCUMENT = "c0000000-0000-4000-8000-000000000001";
const KEY = `${PROJECT}/${DOCUMENT}`;

let directory: string;
let storage: LocalDocumentStorage;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "sinapse-docs-"));
  storage = new LocalDocumentStorage(directory);
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("grava, recusa sobrescrever e remove de forma idempotente", async () => {
  await storage.save(KEY, Buffer.from("conteudo"));
  await storage.finalizeUpload(KEY);
  assert.equal((await readFile(join(directory, KEY))).toString(), "conteudo");
  await assert.rejects(storage.save(KEY, Buffer.from("outro")));
  await storage.remove(KEY);
  await storage.remove(KEY);
  await assert.rejects(stat(join(directory, KEY)));
});

test("remoção em duas fases: restaura em caso de falha e descarta após confirmar", async () => {
  await storage.save(KEY, Buffer.from("conteudo"));
  await storage.finalizeUpload(KEY);
  assert.equal(await storage.stageRemoval(KEY), true);
  await assert.rejects(stat(join(directory, KEY)));
  await storage.restore(KEY);
  assert.equal((await readFile(join(directory, KEY))).toString(), "conteudo");

  assert.equal(await storage.stageRemoval(KEY), true);
  await storage.discard(KEY);
  assert.deepEqual(await readdir(join(directory, PROJECT)), []);
  assert.equal(await storage.stageRemoval(KEY), false);
});

test("recusa chaves fora do formato para impedir travessia de diretório", async () => {
  for (const key of ["../fora", "a/b", `${PROJECT}/../${DOCUMENT}`, `${PROJECT}/${DOCUMENT}/extra`]) {
    await assert.rejects(storage.save(key, Buffer.from("x")), /inválido/, key);
  }
});
