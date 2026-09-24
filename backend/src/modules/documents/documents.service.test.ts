import test from "node:test";
import assert from "node:assert/strict";
import { AppError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { DocumentsService } from "./documents.service.js";
import {
  ARCHIVED_PROJECT_ID,
  FakeDocumentsRepository,
  FakePublisher,
  FakeStorage,
  OTHER_PROJECT_ID,
  PROJECT_ID,
  USER_ID,
  pdfBuffer,
  projectLookup,
} from "./documents.fakes.js";

const LIMIT = 4096;
const DOCUMENT_ID = "c0000000-0000-4000-8000-000000000001";

function setup() {
  const repository = new FakeDocumentsRepository();
  const storage = new FakeStorage();
  const publisher = new FakePublisher();
  const service = new DocumentsService(repository, storage, publisher, projectLookup, LIMIT);
  return { repository, storage, publisher, service };
}

test("upload válido persiste projeto, nome original, tipo, tamanho, autor e guarda o arquivo com identificador seguro", async () => {
  const { service, repository, storage } = setup();
  const content = pdfBuffer();
  const created = await service.upload({ projetoId: PROJECT_ID, usuarioId: USER_ID, fileName: "../Escopo Final.pdf", content });

  assert.equal(created.projeto_id, PROJECT_ID);
  assert.equal(created.nome, "Escopo Final.pdf");
  assert.equal(created.mime, "application/pdf");
  assert.equal(created.tamanho_bytes, content.length);
  assert.equal(created.autor_id, USER_ID);
  assert.equal(created.status_processamento, "pendente");
  assert.equal(repository.audit[0].acao, "ENVIAR_DOCUMENTO");

  const [key] = [...storage.files.keys()];
  assert.match(key, /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  assert.ok(!key.includes("Escopo"));
  assert.deepEqual(storage.files.get(key), content);
});

test("MIME falso é recusado sem deixar arquivo nem registro", async () => {
  const { service, repository, storage } = setup();
  await assert.rejects(
    service.upload({ projetoId: PROJECT_ID, usuarioId: USER_ID, fileName: "falso.pdf", content: Buffer.from("texto puro") }),
    ValidationError,
  );
  assert.equal(storage.files.size, 0);
  assert.equal(repository.rows.length, 0);
});

test("formato não permitido, arquivo vazio e limite excedido não deixam rastros", async () => {
  const { service, repository, storage } = setup();
  await assert.rejects(service.upload({ projetoId: PROJECT_ID, usuarioId: USER_ID, fileName: "app.exe", content: Buffer.from("x") }), ValidationError);
  await assert.rejects(service.upload({ projetoId: PROJECT_ID, usuarioId: USER_ID, fileName: "vazio.txt", content: Buffer.alloc(0) }), ValidationError);
  await assert.rejects(
    service.upload({ projetoId: PROJECT_ID, usuarioId: USER_ID, fileName: "grande.txt", content: Buffer.alloc(LIMIT + 1, 0x61) }),
    (error: unknown) => error instanceof AppError && error.statusCode === 413,
  );
  assert.equal(storage.files.size, 0);
  assert.equal(repository.rows.length, 0);
});

test("falha ao gravar o arquivo não cria registro e permite nova tentativa", async () => {
  const { service, repository, storage } = setup();
  storage.failSave = true;
  await assert.rejects(
    service.upload({ projetoId: PROJECT_ID, usuarioId: USER_ID, fileName: "ok.txt", content: Buffer.from("conteudo") }),
    (error: unknown) => error instanceof AppError && error.statusCode === 503 && /tente novamente/.test(error.message),
  );
  assert.equal(repository.rows.length, 0);

  storage.failSave = false;
  const created = await service.upload({ projetoId: PROJECT_ID, usuarioId: USER_ID, fileName: "ok.txt", content: Buffer.from("conteudo") });
  assert.equal(created.nome, "ok.txt");
  assert.equal(repository.rows.length, 1);
});

test("falha ao gravar o registro remove o arquivo já armazenado", async () => {
  const { service, repository, storage } = setup();
  repository.failCreate = true;
  await assert.rejects(service.upload({ projetoId: PROJECT_ID, usuarioId: USER_ID, fileName: "ok.md", content: Buffer.from("# ok") }));
  assert.equal(storage.files.size, 0);
  assert.equal(repository.rows.length, 0);
});

test("projeto inexistente, inválido ou arquivado não recebe documentos", async () => {
  const { service, storage } = setup();
  const payload = { usuarioId: USER_ID, fileName: "ok.txt", content: Buffer.from("conteudo") };
  await assert.rejects(service.upload({ ...payload, projetoId: "d0000000-0000-4000-8000-0000000000ff" }), NotFoundError);
  await assert.rejects(service.upload({ ...payload, projetoId: "nao-e-uuid" }), ValidationError);
  await assert.rejects(service.upload({ ...payload, projetoId: ARCHIVED_PROJECT_ID }), /somente leitura/);
  assert.equal(storage.files.size, 0);
});

test("listagem retorna apenas documentos do projeto e informa os limites", async () => {
  const { service, repository } = setup();
  repository.seed({ id: DOCUMENT_ID, projeto_id: PROJECT_ID, caminho: `${PROJECT_ID}/${DOCUMENT_ID}` });
  repository.seed({ id: "c0000000-0000-4000-8000-000000000002", projeto_id: OTHER_PROJECT_ID, caminho: "x/y" });

  const result = await service.list(PROJECT_ID);
  assert.deepEqual(result.items.map((item) => item.id), [DOCUMENT_ID]);
  assert.equal(result.limites.max_bytes, LIMIT);
  assert.deepEqual(result.limites.extensoes_permitidas, [".pdf", ".docx", ".md", ".txt"]);
  await assert.rejects(service.list("d0000000-0000-4000-8000-0000000000ff"), NotFoundError);
});

test("remoção apaga metadados e arquivo, audita e não gera evento para documento não indexado", async () => {
  const { service, repository, storage, publisher } = setup();
  const caminho = `${PROJECT_ID}/${DOCUMENT_ID}`;
  repository.seed({ id: DOCUMENT_ID, projeto_id: PROJECT_ID, caminho });
  storage.files.set(caminho, pdfBuffer());

  await service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID });

  assert.equal(repository.rows.length, 0);
  assert.equal(storage.files.size, 0);
  assert.equal(storage.staged.size, 0);
  assert.deepEqual(repository.audit.map((item) => item.acao), ["REMOVER_DOCUMENTO"]);
  assert.equal(repository.events.size, 0);
  assert.equal(publisher.published.length, 0);
});

test("remoção de documento indexado publica evento com identificadores estáveis", async () => {
  const { service, repository, storage, publisher } = setup();
  const caminho = `${PROJECT_ID}/${DOCUMENT_ID}`;
  repository.seed({ id: DOCUMENT_ID, projeto_id: PROJECT_ID, caminho, status_processamento: "processado" });
  repository.chunks.set(DOCUMENT_ID, 7);
  storage.files.set(caminho, pdfBuffer());

  await service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID });

  assert.equal(publisher.published.length, 1);
  assert.equal(publisher.published[0].event_id, `document.removed:${DOCUMENT_ID}`);
  assert.equal(publisher.published[0].document_id, DOCUMENT_ID);
  assert.equal(publisher.published[0].project_id, PROJECT_ID);
  assert.equal(publisher.published[0].chunks_removed, 7);
  assert.equal(repository.events.get(`document.removed:${DOCUMENT_ID}`)?.status, "publicado");
});

test("repetir a remoção não falha, não duplica o evento e não afeta outro conteúdo", async () => {
  const { service, repository, storage, publisher } = setup();
  const otherId = "c0000000-0000-4000-8000-000000000002";
  repository.seed({ id: DOCUMENT_ID, projeto_id: PROJECT_ID, caminho: `${PROJECT_ID}/${DOCUMENT_ID}`, status_processamento: "processado" });
  repository.seed({ id: otherId, projeto_id: PROJECT_ID, caminho: `${PROJECT_ID}/${otherId}` });
  storage.files.set(`${PROJECT_ID}/${DOCUMENT_ID}`, pdfBuffer());
  storage.files.set(`${PROJECT_ID}/${otherId}`, pdfBuffer());

  await service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID });
  await service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID });

  assert.deepEqual(repository.rows.map((row) => row.id), [otherId]);
  assert.ok(storage.files.has(`${PROJECT_ID}/${otherId}`));
  assert.equal(publisher.published.length, 1);
  assert.equal(repository.audit.filter((item) => item.acao === "REMOVER_DOCUMENTO").length, 1);
});

test("documento de outro projeto não é removido pelo caminho de um projeto alheio", async () => {
  const { service, repository, storage } = setup();
  const caminho = `${OTHER_PROJECT_ID}/${DOCUMENT_ID}`;
  repository.seed({ id: DOCUMENT_ID, projeto_id: OTHER_PROJECT_ID, caminho });
  storage.files.set(caminho, pdfBuffer());

  await service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID });

  assert.equal(repository.rows.length, 1);
  assert.ok(storage.files.has(caminho));
  assert.equal(repository.audit.length, 0);
});

test("falha ao remover mantém o documento e restaura o arquivo", async () => {
  const { service, repository, storage } = setup();
  const caminho = `${PROJECT_ID}/${DOCUMENT_ID}`;
  repository.seed({ id: DOCUMENT_ID, projeto_id: PROJECT_ID, caminho });
  storage.files.set(caminho, pdfBuffer());
  repository.failRemove = true;

  await assert.rejects(
    service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID }),
    (error: unknown) => error instanceof AppError && /continua disponível/.test(error.message),
  );
  assert.equal(repository.rows.length, 1);
  assert.ok(storage.files.has(caminho));
  assert.equal(storage.staged.size, 0);
});

test("falha no armazenamento ao remover mantém o documento", async () => {
  const { service, repository, storage } = setup();
  const caminho = `${PROJECT_ID}/${DOCUMENT_ID}`;
  repository.seed({ id: DOCUMENT_ID, projeto_id: PROJECT_ID, caminho });
  storage.files.set(caminho, pdfBuffer());
  storage.failStage = true;

  await assert.rejects(service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID }), AppError);
  assert.equal(repository.rows.length, 1);
});

test("evento não publicado fica pendente e é reenviado na próxima remoção sem duplicar", async () => {
  const { service, repository, storage, publisher } = setup();
  const caminho = `${PROJECT_ID}/${DOCUMENT_ID}`;
  repository.seed({ id: DOCUMENT_ID, projeto_id: PROJECT_ID, caminho, status_processamento: "processado" });
  storage.files.set(caminho, pdfBuffer());
  publisher.available = false;

  await service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID });
  assert.equal(repository.events.get(`document.removed:${DOCUMENT_ID}`)?.status, "falha");
  assert.equal(publisher.published.length, 0);

  publisher.available = true;
  await service.remove({ projetoId: PROJECT_ID, documentoId: DOCUMENT_ID, usuarioId: USER_ID });
  assert.equal(publisher.published.length, 1);
  assert.equal(repository.events.size, 1);
  assert.equal(repository.events.get(`document.removed:${DOCUMENT_ID}`)?.status, "publicado");
});
