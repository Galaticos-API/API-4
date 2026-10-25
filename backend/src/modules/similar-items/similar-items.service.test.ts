import test from "node:test";
import assert from "node:assert/strict";
import { ArchiveConflict } from "../projects/archive.types.js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { SimilarItemsService } from "./similar-items.service.js";
import {
  ARCHIVED_ORIGIN_PBI,
  FakeEmbeddings,
  FakeSimilarItemsRepository,
  ORIGIN_PBI,
  PROJECT_A,
  PROJECT_B,
  TARGET_PBI,
  UNKNOWN_PBI,
  UNKNOWN_PROJECT,
  USER,
  similarRow,
} from "./similar-items.fakes.js";

const DRAFT = { tipo: "pbi", titulo: "Validar login do usuário", descricao: "Entrar com e-mail e senha" };

function setup() {
  const repository = new FakeSimilarItemsRepository();
  const embeddings = new FakeEmbeddings();
  repository.origins.set(ORIGIN_PBI, {
    projeto_id: PROJECT_B,
    arquivado: false,
    dados: {
      titulo: "Validar login com e-mail",
      historia_como_um: "usuário cadastrado",
      historia_eu_quero: "entrar com e-mail e senha",
      historia_para_que: "acessar minhas informações",
      regras_observacoes: "   ",
    },
  });
  repository.origins.set(ARCHIVED_ORIGIN_PBI, { projeto_id: PROJECT_B, arquivado: true, dados: { titulo: "Antigo" } });
  return { repository, embeddings, service: new SimilarItemsService(repository, embeddings, 0.7) };
}

test("sugere item de outro projeto indicando claramente a origem", async () => {
  const { service, repository } = setup();
  repository.candidates = [similarRow()];
  const result = await service.search(PROJECT_A, USER, DRAFT);
  assert.equal(result.degradado, false);
  assert.equal(result.total, 1);
  const [item] = result.items;
  assert.equal(item.outro_projeto, true);
  assert.deepEqual(item.projeto, { id: PROJECT_B, nome: "Portal do Cliente" });
  assert.equal(item.origem, "Portal do Cliente › Acesso e autenticação › Login");
  assert.equal(item.similaridade, 0.86);
  assert.equal(repository.lastFind?.projetoId, PROJECT_A);
});

test("item do mesmo projeto também é sugerido, sem a marca de outro projeto", async () => {
  const { service, repository } = setup();
  repository.candidates = [similarRow({ projeto_id: PROJECT_A, projeto_nome: "Projeto A" })];
  const [item] = (await service.search(PROJECT_A, USER, DRAFT)).items;
  assert.equal(item.outro_projeto, false);
});

test("não força sugestões: nada acima do limiar resulta em lista vazia e sem erro", async () => {
  const { service, repository } = setup();
  repository.candidates = [similarRow({ similaridade: 0.4 })];
  assert.deepEqual(await service.search(PROJECT_A, USER, DRAFT), { items: [], total: 0, degradado: false });
});

test("texto curto não consulta a IA nem sugere nada", async () => {
  const { service, embeddings, repository } = setup();
  repository.candidates = [similarRow()];
  const result = await service.search(PROJECT_A, USER, { tipo: "pbi", titulo: "Login" });
  assert.deepEqual(result, { items: [], total: 0, degradado: false });
  assert.equal(embeddings.calls.length, 0);
});

test("não interrompe a escrita quando o serviço de embeddings falha", async () => {
  const { service, embeddings, repository } = setup();
  repository.candidates = [similarRow()];
  embeddings.failure = new AppError("indisponível", 503, "EMBEDDING_SERVICE_UNAVAILABLE");
  assert.deepEqual(await service.search(PROJECT_A, USER, DRAFT), { items: [], total: 0, degradado: true });
  embeddings.failure = null;
  embeddings.vector = [1, 2, 3];
  assert.equal((await service.search(PROJECT_A, USER, DRAFT)).degradado, true);
});

test("falhas inesperadas (não de embeddings) não são engolidas", async () => {
  const { service, embeddings } = setup();
  embeddings.failure = new TypeError("bug");
  await assert.rejects(service.search(PROJECT_A, USER, DRAFT), TypeError);
});

test("limita a 5 itens e respeita o item em edição (excluir_id)", async () => {
  const { service, repository } = setup();
  repository.candidates = Array.from({ length: 8 }, (_, index) => similarRow({ id: `a2000000-0000-4000-8000-0000000001${index}0`.slice(0, 36), similaridade: 0.9 - index * 0.01 }));
  assert.equal((await service.search(PROJECT_A, USER, DRAFT)).items.length, 5);
  const excluded = repository.candidates[0].id;
  const result = await service.search(PROJECT_A, USER, { ...DRAFT, excluir_id: excluded });
  assert.ok(result.items.every((item) => item.id !== excluded));
});

test("valida o corpo, o projeto e os identificadores", async () => {
  const { service } = setup();
  await assert.rejects(service.search("nao-uuid", USER, DRAFT), ValidationError);
  await assert.rejects(service.search(PROJECT_A, USER, { tipo: "projeto" }), ValidationError);
  await assert.rejects(service.search(PROJECT_A, USER, { ...DRAFT, extra: 1 }), ValidationError);
  await assert.rejects(service.search(PROJECT_A, USER, { ...DRAFT, titulo: "x".repeat(256) }), /máximo 255/);
  await assert.rejects(service.search(PROJECT_A, USER, { ...DRAFT, excluir_id: "xx" }), ValidationError);
  await assert.rejects(service.search(UNKNOWN_PROJECT, USER, DRAFT), NotFoundError);
});

test("aproveitar cria propostas pendentes editáveis com a origem e registra a relação", async () => {
  const { service } = setup();
  const result = await service.reuse("pbi", TARGET_PBI, ORIGIN_PBI, USER, {});
  assert.deepEqual(result.sugestoes.map((item) => item.campo).sort(), ["historia_como_um", "historia_eu_quero", "historia_para_que", "titulo"]);
  assert.ok(result.sugestoes.every((item) => item.status === "pendente" && item.origem === `similar:pbi:${ORIGIN_PBI}`));
  assert.equal(result.relacao.tipo_relacao, "reaproveitado_de");
  assert.equal(result.relacao.origem_id, ORIGIN_PBI);
  assert.equal(result.relacao.origem_projeto_id, PROJECT_B);
  assert.ok(!result.relacao.campos.includes("regras_observacoes"), "campo vazio na origem não é copiado");
});

test("aproveitar só os campos escolhidos e repetir é idempotente, unindo os campos na relação", async () => {
  const { service, repository } = setup();
  const first = await service.reuse("pbi", TARGET_PBI, ORIGIN_PBI, USER, { campos: ["titulo"] });
  const again = await service.reuse("pbi", TARGET_PBI, ORIGIN_PBI, USER, { campos: ["titulo", "historia_eu_quero", "titulo"] });
  assert.equal(first.sugestoes[0].id, again.sugestoes.find((item) => item.campo === "titulo")?.id);
  assert.equal(repository.relations.length, 1);
  assert.deepEqual(again.relacao.campos, ["historia_eu_quero", "titulo"]);
  assert.equal(repository.suggestionRows.length, 2);
});

test("aproveitar recusa o próprio item, campo inválido, origem inexistente ou arquivada", async () => {
  const { service } = setup();
  await assert.rejects(service.reuse("pbi", TARGET_PBI, TARGET_PBI, USER, {}), /próprio item/);
  await assert.rejects(service.reuse("pbi", "nao-uuid", ORIGIN_PBI, USER, {}), ValidationError);
  await assert.rejects(service.reuse("pbi", TARGET_PBI, ORIGIN_PBI, USER, { campos: ["status"] }), ValidationError);
  await assert.rejects(service.reuse("pbi", TARGET_PBI, ORIGIN_PBI, USER, { campos: [] }), ValidationError);
  await assert.rejects(service.reuse("pbi", TARGET_PBI, UNKNOWN_PBI, USER, {}), NotFoundError);
  await assert.rejects(service.reuse("pbi", TARGET_PBI, ARCHIVED_ORIGIN_PBI, USER, {}), ConflictError);
  await assert.rejects(service.reuse("pbi", TARGET_PBI, ORIGIN_PBI, USER, { campos: ["regras_observacoes"] }), /aproveitável/);
});

test("item em edição arquivado recusa o aproveitamento (409)", async () => {
  const { service, repository } = setup();
  repository.archivedTargets.add(TARGET_PBI);
  await assert.rejects(service.reuse("pbi", TARGET_PBI, ORIGIN_PBI, USER, {}), ArchiveConflict);
  assert.equal(repository.relations.length, 0);
});
