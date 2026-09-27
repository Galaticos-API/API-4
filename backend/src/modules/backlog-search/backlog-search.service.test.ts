import test from "node:test";
import assert from "node:assert/strict";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import { BacklogSearchRepository } from "./backlog-search.repository.js";
import { BacklogSearchService } from "./backlog-search.service.js";
import type { BacklogSearchFilters, BacklogSearchRow } from "./backlog-search.types.js";

const PROJECT = "a0000000-0000-4000-8000-000000000001";
const TECH = "f0000000-0000-4000-8000-000000000001";

class FakeRepository extends BacklogSearchRepository {
  public calls: Array<{ projetoId: string; patterns: string[]; filters: BacklogSearchFilters; limit: number }> = [];
  public rows: BacklogSearchRow[] = [];

  constructor() {
    super();
  }

  async search(projetoId: string, patterns: string[], filters: BacklogSearchFilters, limit: number): Promise<BacklogSearchRow[]> {
    this.calls.push({ projetoId, patterns, filters, limit });
    return this.rows;
  }
}

const projects = { async findById(id: string) { return id === PROJECT ? { id, status: "ativo" } : null; } };

function row(overrides: Partial<BacklogSearchRow>): BacklogSearchRow {
  return {
    tipo: "pbi", id: "p1", titulo: "Filtrar backlog por status", descricao: "Como um PO\nEu quero filtrar itens\nPara localizar rápido",
    status: "rascunho", codigo: "PBI-01.4.1", epico_id: "e1", epico_titulo: "Navegação", feature_id: "f1", feature_titulo: "Filtros",
    tecnologias: [], titulo_match: true, total: "1", ...overrides,
  };
}

function setup() {
  const repository = new FakeRepository();
  return { repository, service: new BacklogSearchService(repository, projects) };
}

test("monta tipo, trecho, destaques e caminho Projeto → Épico → Feature → PBI", async () => {
  const { service, repository } = setup();
  repository.rows = [row({})];
  const result = await service.search({ projetoId: PROJECT, q: "  FILTRAR   Backlog " });

  assert.equal(result.termo, "FILTRAR Backlog");
  assert.equal(result.total, 1);
  const [item] = result.items;
  assert.equal(item.tipo, "pbi");
  assert.equal(item.campo, "titulo");
  assert.equal(item.trecho.texto, "Filtrar backlog por status");
  assert.deepEqual(item.trecho.destaques, [[0, 7], [8, 15]]);
  assert.deepEqual(item.caminho.map((node) => [node.tipo, node.titulo]), [["epico", "Navegação"], ["feature", "Filtros"], ["pbi", "Filtrar backlog por status"]]);
  assert.equal(item.caminho[2].codigo, "PBI-01.4.1");
  assert.deepEqual(repository.calls[0].patterns, ["%filtrar%", "%backlog%"]);
});

test("quando só a descrição casa, o trecho vem da descrição e o campo é descricao", async () => {
  const { service, repository } = setup();
  repository.rows = [row({ titulo_match: false })];
  const [item] = (await service.search({ projetoId: PROJECT, q: "localizar" })).items;
  assert.equal(item.campo, "descricao");
  assert.match(item.trecho.texto, /localizar rápido/);
  assert.equal(item.trecho.texto.slice(item.trecho.destaques[0][0], item.trecho.destaques[0][1]), "localizar");
});

test("épico e feature têm caminho com o nível aplicável", async () => {
  const { service, repository } = setup();
  repository.rows = [
    row({ tipo: "epico", id: "e1", titulo: "Navegação", codigo: null, feature_id: null, feature_titulo: null, total: "2" }),
    row({ tipo: "feature", id: "f1", titulo: "Filtros", codigo: null, total: "2" }),
  ];
  const result = await service.search({ projetoId: PROJECT, q: "na" });
  assert.deepEqual(result.items[0].caminho.map((node) => node.tipo), ["epico"]);
  assert.deepEqual(result.items[1].caminho.map((node) => node.tipo), ["epico", "feature"]);
  assert.equal(result.total, 2);
});

test("repassa status, tecnologia e limite validados ao repositório", async () => {
  const { service, repository } = setup();
  await service.search({ projetoId: PROJECT, q: "login", status: "concluido", tecnologiaId: TECH, limit: "10" });
  assert.deepEqual(repository.calls[0].filters, { status: "concluido", tecnologiaId: TECH });
  assert.equal(repository.calls[0].limit, 10);
  assert.equal(repository.calls[0].projetoId, PROJECT);
});

test("rejeita consulta curta/longa, status, tecnologia e limite inválidos", async () => {
  const { service, repository } = setup();
  await assert.rejects(service.search({ projetoId: PROJECT, q: "a" }), /ao menos 2/);
  await assert.rejects(service.search({ projetoId: PROJECT }), ValidationError);
  await assert.rejects(service.search({ projetoId: PROJECT, q: "x".repeat(101) }), /no máximo 100/);
  await assert.rejects(service.search({ projetoId: PROJECT, q: "ab", status: "inventado" }), /Status inválido/);
  await assert.rejects(service.search({ projetoId: PROJECT, q: "ab", tecnologiaId: "nao-uuid" }), ValidationError);
  await assert.rejects(service.search({ projetoId: PROJECT, q: "ab", limit: "0" }), ValidationError);
  await assert.rejects(service.search({ projetoId: PROJECT, q: "ab", limit: "101" }), ValidationError);
  await assert.rejects(service.search({ projetoId: "nao-uuid", q: "ab" }), ValidationError);
  assert.equal(repository.calls.length, 0);
});

test("projeto inexistente retorna 404 antes de consultar o banco de itens", async () => {
  const { service, repository } = setup();
  await assert.rejects(service.search({ projetoId: "a0000000-0000-4000-8000-0000000000ff", q: "login" }), NotFoundError);
  assert.equal(repository.calls.length, 0);
});

test("sem resultados devolve total zero e lista vazia", async () => {
  const { service } = setup();
  assert.deepEqual(await service.search({ projetoId: PROJECT, q: "inexistente" }), { projeto_id: PROJECT, termo: "inexistente", total: 0, limite: 50, items: [] });
});
