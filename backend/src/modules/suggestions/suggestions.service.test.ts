import test from "node:test";
import assert from "node:assert/strict";
import { ArchiveConflict } from "../projects/archive.types.js";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { SuggestionsService } from "./suggestions.service.js";
import { EPIC, FakeSuggestionsRepository, FEATURE, PBI, UNKNOWN_ENTITY, USER } from "./suggestions.fakes.js";

function setup() {
  const repository = new FakeSuggestionsRepository();
  return { repository, service: new SuggestionsService(repository) };
}

test("propõe uma sugestão pendente para um campo permitido do item", async () => {
  const { service } = setup();
  const created = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Validar login com e-mail" });
  assert.equal(created.status, "pendente");
  assert.equal(created.campo, "titulo");
  assert.equal(created.valor_sugerido, "Validar login com e-mail");
  assert.equal(created.origem, "manual");
  assert.equal(created.valor_resolvido, null);
});

test("aceita origem customizada e normaliza espaços no valor sugerido", async () => {
  const { service } = setup();
  const created = await service.create("epico", EPIC, USER, { campo: "objetivo", valor_sugerido: "  Reduzir retrabalho  ", origem: "harness-pro4tech" });
  assert.equal(created.valor_sugerido, "Reduzir retrabalho");
  assert.equal(created.origem, "harness-pro4tech");
});

test("recusa campo fora do permitido para o tipo de entidade, valor vazio ou longo demais", async () => {
  const { service, repository } = setup();
  await assert.rejects(service.create("pbi", PBI, USER, { campo: "status", valor_sugerido: "concluido" }), ValidationError);
  await assert.rejects(service.create("pbi", PBI, USER, { campo: "escopo_macro", valor_sugerido: "x" }), ValidationError, "campo exclusivo de épico não vale para pbi");
  await assert.rejects(service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "   " }), ValidationError);
  await assert.rejects(service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "x".repeat(256) }), /máximo 255/);
  await assert.rejects(service.create("epico", EPIC, USER, { campo: "descricao", valor_sugerido: "x".repeat(5001) }), /máximo 5000/);
  assert.equal(repository.rows.length, 0);
});

test("item inexistente ou identificador malformado", async () => {
  const { service } = setup();
  await assert.rejects(service.create("pbi", UNKNOWN_ENTITY, USER, { campo: "titulo", valor_sugerido: "x" }), NotFoundError);
  await assert.rejects(service.list("pbi", "nao-uuid"), ValidationError);
  await assert.rejects(service.accept("pbi", "nao-uuid", "nao-uuid", USER, {}), ValidationError);
});

test("uma nova proposta para o mesmo campo substitui a pendente existente (idempotência de criação)", async () => {
  const { service, repository } = setup();
  const first = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Primeira versão" });
  const second = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Segunda versão" });
  assert.equal(first.id, second.id);
  assert.equal(second.valor_sugerido, "Segunda versão");
  assert.equal(repository.rows.length, 1);
});

test("aceitar aplica o valor sugerido; repetir a mesma aceitação é idempotente", async () => {
  const { service } = setup();
  const created = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Validar login" });
  const accepted = await service.accept("pbi", PBI, created.id, USER, {});
  assert.equal(accepted.status, "aceita");
  assert.equal(accepted.valor_resolvido, "Validar login");
  assert.equal(accepted.resolvido_por, USER);
  assert.ok(accepted.resolvido_em);

  const repeated = await service.accept("pbi", PBI, created.id, USER, {});
  assert.deepEqual(repeated, accepted);
});

test("editar aplica o novo valor e preserva o texto originalmente sugerido; repetir a mesma edição é idempotente", async () => {
  const { service } = setup();
  const created = await service.create("epico", EPIC, USER, { campo: "objetivo", valor_sugerido: "Organizar o backlog" });
  const edited = await service.edit("epico", EPIC, created.id, USER, { valor: "Organizar e priorizar o backlog" });
  assert.equal(edited.status, "editada");
  assert.equal(edited.valor_resolvido, "Organizar e priorizar o backlog");
  assert.equal(edited.valor_sugerido, "Organizar o backlog");

  const repeated = await service.edit("epico", EPIC, created.id, USER, { valor: "Organizar e priorizar o backlog" });
  assert.deepEqual(repeated, edited);
});

test("editar com um valor diferente do já resolvido conflita (409) e não altera o estado", async () => {
  const { service } = setup();
  const created = await service.create("feature", FEATURE, USER, { campo: "titulo", valor_sugerido: "Sessão do usuário" });
  const accepted = await service.accept("feature", FEATURE, created.id, USER, {});
  await assert.rejects(service.edit("feature", FEATURE, created.id, USER, { valor: "Outro texto" }), ConflictError);
  const stillAccepted = (await service.list("feature", FEATURE))[0];
  assert.deepEqual(stillAccepted, accepted);
});

test("descartar nunca altera o item e é idempotente; discordar do descarte depois de aceitar conflita", async () => {
  const { service } = setup();
  const created = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Validar login" });
  const discarded = await service.discard("pbi", PBI, created.id, USER);
  assert.equal(discarded.status, "descartada");
  assert.equal(discarded.valor_resolvido, null);
  assert.deepEqual(await service.discard("pbi", PBI, created.id, USER), discarded);

  const other = await service.create("pbi", PBI, USER, { campo: "historia_como_um", valor_sugerido: "usuário cadastrado" });
  await service.accept("pbi", PBI, other.id, USER, {});
  await assert.rejects(service.discard("pbi", PBI, other.id, USER), ConflictError);
});

test("sugestão editada exige valor não vazio e respeita o limite do campo alvo", async () => {
  const { service } = setup();
  const created = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Validar login" });
  await assert.rejects(service.edit("pbi", PBI, created.id, USER, { valor: "   " }), ValidationError);
  await assert.rejects(service.edit("pbi", PBI, created.id, USER, { valor: "x".repeat(256) }), /máximo 255/);
});

test("item ou ancestral arquivado recusa aceitar/editar (409) mas ainda permite descartar", async () => {
  const { service, repository } = setup();
  const created = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Validar login" });
  repository.archived.add(PBI);
  await assert.rejects(service.accept("pbi", PBI, created.id, USER, {}), ArchiveConflict);
  await assert.rejects(service.edit("pbi", PBI, created.id, USER, { valor: "x" }), ArchiveConflict);
  const discarded = await service.discard("pbi", PBI, created.id, USER);
  assert.equal(discarded.status, "descartada");
});

test("item concluído exige justificativa para aceitar ou editar, mas não para descartar", async () => {
  const { service, repository } = setup();
  repository.requiresJustification.add(PBI);
  const created = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Validar login" });
  await assert.rejects(service.accept("pbi", PBI, created.id, USER, {}), ValidationError);
  const accepted = await service.accept("pbi", PBI, created.id, USER, { justificativa: "Ajuste de clareza aprovado em revisão." });
  assert.equal(accepted.status, "aceita");
});

test("sugestão de outra entidade ou tipo não é encontrada (isolamento)", async () => {
  const { service } = setup();
  const created = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "Validar login" });
  await assert.rejects(service.accept("epico", EPIC, created.id, USER, {}), NotFoundError);
  await assert.rejects(service.accept("pbi", EPIC, created.id, USER, {}), NotFoundError);
});

test("lista mostra pendentes primeiro", async () => {
  const { service } = setup();
  const a = await service.create("pbi", PBI, USER, { campo: "titulo", valor_sugerido: "a" });
  await service.discard("pbi", PBI, a.id, USER);
  const b = await service.create("pbi", PBI, USER, { campo: "historia_como_um", valor_sugerido: "b" });
  const list = await service.list("pbi", PBI);
  assert.equal(list[0].id, b.id);
  assert.equal(list[0].status, "pendente");
});
