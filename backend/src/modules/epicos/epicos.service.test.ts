import test from "node:test";
import assert from "node:assert/strict";
import { EpicosService, ValidationError, NotFoundError } from "./epicos.service.js";
import type { CreateEpicDto, Epic, UpdateEpicDto } from "./epicos.types.js";

class InMemoryEpicosRepository {
  private epicos: Epic[] = [];

  async listByProject(projectId: string): Promise<Epic[]> {
    return this.epicos.filter((epico) => epico.projeto_id === projectId);
  }

  async findById(id: string): Promise<Epic | null> {
    return this.epicos.find((epico) => epico.id === id) ?? null;
  }

  async create(data: CreateEpicDto): Promise<Epic> {
    const epic: Epic = {
      id: `epic-${this.epicos.length + 1}`,
      projeto_id: data.projeto_id,
      titulo: data.titulo.trim(),
      descricao: data.descricao?.trim() ?? null,
      objetivo: data.objetivo?.trim() ?? null,
      escopo_macro: data.escopo_macro?.trim() ?? null,
      resultado_esperado: data.resultado_esperado?.trim() ?? null,
      status: data.status ?? "rascunho",
      prioridade: data.prioridade ?? "Must",
      priorizacao: data.prioridade ?? "Must",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.epicos.push(epic);
    return epic;
  }

  async update(id: string, data: UpdateEpicDto): Promise<Epic | null> {
    const index = this.epicos.findIndex((epico) => epico.id === id);
    if (index === -1) return null;
    const existing = this.epicos[index];
    this.epicos[index] = {
      ...existing,
      titulo: data.titulo !== undefined ? data.titulo.trim() : existing.titulo,
      descricao: data.descricao !== undefined ? data.descricao?.trim() ?? null : existing.descricao,
      objetivo: data.objetivo !== undefined ? data.objetivo?.trim() ?? null : existing.objetivo,
      escopo_macro: data.escopo_macro !== undefined ? data.escopo_macro?.trim() ?? null : existing.escopo_macro,
      resultado_esperado: data.resultado_esperado !== undefined ? data.resultado_esperado?.trim() ?? null : existing.resultado_esperado,
      status: data.status !== undefined ? data.status : existing.status,
      prioridade: data.prioridade !== undefined ? data.prioridade : existing.prioridade,
      priorizacao: data.prioridade !== undefined ? data.prioridade : existing.prioridade,
      updated_at: new Date().toISOString(),
    };
    return this.epicos[index];
  }
}

class InMemoryProjectsChecker {
  constructor(private readonly projects: Record<string, { id: string; status: string }> = {
    "project-1": { id: "project-1", status: "ativo" },
    "project-archived": { id: "project-archived", status: "arquivado" },
  }) {}

  async findById(id: string): Promise<{ id: string; status: string } | null> {
    return this.projects[id] ?? null;
  }
}

test("PBI-01.1.2 Cenário 1: deve criar épico vinculado a projeto ativo em status 'rascunho'", async () => {
  const repo = new InMemoryEpicosRepository();
  const checker = new InMemoryProjectsChecker();
  const service = new EpicosService(repo, checker);

  const result = await service.create({
    projeto_id: "project-1",
    titulo: "Onboarding Completo",
    descricao: "Fluxo inicial do cliente",
    objetivo: "Reduzir tempo de ativação",
    escopo_macro: "Cadastro e Boas-vindas",
    resultado_esperado: "Cliente ativado em menos de 5 minutos",
  });

  assert.equal(result.status, "rascunho");
  assert.equal(result.titulo, "Onboarding Completo");
  assert.equal(result.projeto_id, "project-1");
  assert.deepEqual(result.missing_fields, []);
});

test("PBI-01.1.2 Cenário 2: deve salvar rascunho incompleto e sinalizar campos faltantes", async () => {
  const repo = new InMemoryEpicosRepository();
  const checker = new InMemoryProjectsChecker();
  const service = new EpicosService(repo, checker);

  const result = await service.create({
    projeto_id: "project-1",
    titulo: "Onboarding Rascunho",
    descricao: "Apenas descrição inicial",
  });

  assert.equal(result.status, "rascunho");
  assert.equal(result.titulo, "Onboarding Rascunho");
  assert.ok(result.missing_fields?.includes("objetivo"));
  assert.ok(result.missing_fields?.includes("escopo macro"));
  assert.ok(result.missing_fields?.includes("resultado esperado"));
});

test("PBI-01.1.2 Cenário 3: deve impedir conclusão via complete() sem campos obrigatórios do guia", async () => {
  const repo = new InMemoryEpicosRepository();
  const checker = new InMemoryProjectsChecker();
  const service = new EpicosService(repo, checker);

  const created = await service.create({
    projeto_id: "project-1",
    titulo: "Onboarding Incompleto",
    descricao: "Descrição inicial",
    objetivo: "Objetivo do épico",
  });

  await assert.rejects(
    async () => {
      await service.complete(created.id);
    },
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      assert.match(err.message, /escopo macro|resultado esperado|faltam/i);
      return true;
    },
  );
});

test("PBI-01.1.2 Cenário 3: deve impedir conclusão via update() com status 'concluido' sem campos obrigatórios", async () => {
  const repo = new InMemoryEpicosRepository();
  const checker = new InMemoryProjectsChecker();
  const service = new EpicosService(repo, checker);

  const created = await service.create({
    projeto_id: "project-1",
    titulo: "Onboarding Rascunho",
  });

  await assert.rejects(
    async () => {
      await service.update(created.id, { status: "concluido" });
    },
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      assert.match(err.message, /faltam campos obrigatórios/i);
      return true;
    },
  );
});

test("deve concluir épico quando todos os campos obrigatórios estiverem preenchidos", async () => {
  const repo = new InMemoryEpicosRepository();
  const checker = new InMemoryProjectsChecker();
  const service = new EpicosService(repo, checker);

  const created = await service.create({
    projeto_id: "project-1",
    titulo: "Onboarding",
    descricao: "Descrição inicial",
    objetivo: "Objetivo do épico",
    escopo_macro: "Escopo amplo do onboarding",
    resultado_esperado: "Melhorar a conversão de novos clientes",
  });

  const completed = await service.complete(created.id);
  assert.equal(completed.status, "concluido");
  assert.deepEqual(completed.missing_fields, []);
});

test("deve recusar vincular épico a projeto arquivado ou inexistente", async () => {
  const repo = new InMemoryEpicosRepository();
  const checker = new InMemoryProjectsChecker();
  const service = new EpicosService(repo, checker);

  await assert.rejects(
    async () => {
      await service.create({
        projeto_id: "project-archived",
        titulo: "Épico em projeto arquivado",
      });
    },
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      assert.match(err.message, /arquivado/i);
      return true;
    },
  );

  await assert.rejects(
    async () => {
      await service.create({
        projeto_id: "non-existent",
        titulo: "Épico sem projeto",
      });
    },
    (err: Error) => {
      assert.ok(err instanceof NotFoundError);
      return true;
    },
  );
});

test("deve retornar erro ao buscar épico inexistente", async () => {
  const repo = new InMemoryEpicosRepository();
  const checker = new InMemoryProjectsChecker();
  const service = new EpicosService(repo, checker);

  await assert.rejects(
    async () => {
      await service.getById("missing-id");
    },
    (err: Error) => {
      assert.ok(err instanceof NotFoundError);
      return true;
    },
  );
});
