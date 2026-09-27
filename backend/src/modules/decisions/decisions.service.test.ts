import test from "node:test";
import assert from "node:assert/strict";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import { ArchiveConflict } from "../projects/archive.types.js";
import { DecisionsService } from "./decisions.service.js";
import { EPIC, FEATURE, FakeDecisionsRepository, OTHER_PBI, PBI, PROJECT, USER } from "./decisions.fakes.js";

const valid = {
  titulo: "Usar PostgreSQL",
  contexto: "Precisamos de persistência relacional.",
  decisao: "Adotar PostgreSQL 16.",
  justificativa: "Suporta pgvector e transações.",
};

function setup() {
  const repository = new FakeDecisionsRepository();
  return { repository, service: new DecisionsService(repository) };
}

test("registra decisão completa vinculada ao item, com autor e data", async () => {
  const { service } = setup();
  const created = await service.create("pbi", PBI, USER, valid);

  assert.equal(created.titulo, "Usar PostgreSQL");
  assert.equal(created.decisao, "Adotar PostgreSQL 16.");
  assert.deepEqual(created.autor, { id: USER, nome: "Ana PO" });
  assert.ok(Date.parse(created.created_at));
  assert.equal(created.origem.tipo, "pbi");
  assert.equal(created.origem.herdada, false);
  assert.equal(created.alternativas, null);
});

test("preserva as alternativas descartadas e normaliza espaços", async () => {
  const { service } = setup();
  const created = await service.create("feature", FEATURE, USER, { ...valid, titulo: "  Título  ", alternativas: "  MySQL; MongoDB  " });
  assert.equal(created.titulo, "Título");
  assert.equal(created.alternativas, "MySQL; MongoDB");
  const blank = await service.create("feature", FEATURE, USER, { ...valid, alternativas: "   " });
  assert.equal(blank.alternativas, null);
});

test("recusa campos obrigatórios ausentes, curtos, longos ou desconhecidos com mensagem legível", async () => {
  const { service, repository } = setup();
  for (const field of ["titulo", "contexto", "decisao", "justificativa"] as const) {
    await assert.rejects(service.create("pbi", PBI, USER, { ...valid, [field]: "   " }), ValidationError, field);
    await assert.rejects(service.create("pbi", PBI, USER, { ...valid, [field]: undefined }), /obrigatório/, field);
  }
  await assert.rejects(service.create("pbi", PBI, USER, { ...valid, titulo: "ab" }), /ao menos 3/);
  await assert.rejects(service.create("pbi", PBI, USER, { ...valid, contexto: "x".repeat(5001) }), /no máximo 5000/);
  await assert.rejects(service.create("pbi", PBI, USER, { ...valid, autor_id: "x" }), ValidationError);
  assert.equal(repository.rows.length, 0);
});

test("item inexistente ou identificador malformado", async () => {
  const { service } = setup();
  await assert.rejects(service.create("pbi", OTHER_PBI, USER, valid), NotFoundError);
  await assert.rejects(service.list("pbi", "nao-uuid"), ValidationError);
  await assert.rejects(service.list("epico", OTHER_PBI), /Épico não encontrado/);
});

test("item ou ancestral arquivado não recebe decisões (409)", async () => {
  const { service, repository } = setup();
  repository.archived.add(PBI);
  await assert.rejects(service.create("pbi", PBI, USER, valid), ArchiveConflict);
  assert.equal(repository.rows.length, 0);
});

test("lista em ordem cronológica, com herança de feature, épico e projeto marcada", async () => {
  const { service } = setup();
  await service.create("epico", EPIC, USER, { ...valid, titulo: "Decisão do épico" });
  await service.create("pbi", PBI, USER, { ...valid, titulo: "Decisão do PBI" });
  await service.create("projeto", PROJECT, USER, { ...valid, titulo: "Decisão do projeto" });
  await service.create("feature", FEATURE, USER, { ...valid, titulo: "Decisão da feature" });

  const result = await service.list("pbi", PBI);
  assert.deepEqual(result.decisoes.map((item) => item.titulo), ["Decisão do épico", "Decisão do PBI", "Decisão do projeto", "Decisão da feature"]);
  assert.deepEqual(result.decisoes.map((item) => item.origem.herdada), [true, false, true, true]);
  assert.deepEqual(result.decisoes.map((item) => item.origem.tipo), ["epico", "pbi", "projeto", "feature"]);
  assert.deepEqual(result.ancestrais.map((node) => node.tipo), ["projeto", "epico", "feature"]);
  assert.equal(result.entidade.codigo, "PBI-01.5.1");
});

test("a lista de um ascendente não inclui decisões dos descendentes", async () => {
  const { service } = setup();
  await service.create("pbi", PBI, USER, { ...valid, titulo: "Somente do PBI" });
  await service.create("epico", EPIC, USER, { ...valid, titulo: "Do épico" });

  assert.deepEqual((await service.list("epico", EPIC)).decisoes.map((item) => item.titulo), ["Do épico"]);
  assert.deepEqual((await service.list("projeto", PROJECT)).decisoes, []);
});
