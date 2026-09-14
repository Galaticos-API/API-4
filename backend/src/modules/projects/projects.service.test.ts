import test from "node:test";
import assert from "node:assert/strict";
import { ProjectsService, ConflictError, ValidationError, NotFoundError } from "./projects.service.js";
import { ProjectsRepository } from "./projects.repository.js";
import { Project, ProjectWithStats, PaginatedProjects, CreateProjectDTO, UpdateProjectDTO, ProjectQueryDTO } from "./projects.types.js";

class InMemoryProjectsRepository extends ProjectsRepository {
  private projects: ProjectWithStats[] = [];

  constructor() {
    super();
  }

  async findActiveByName(nome: string, excludeId?: string): Promise<Project | null> {
    const trimmed = nome.trim().toLowerCase();
    const found = this.projects.find(
      (p) =>
        p.nome.trim().toLowerCase() === trimmed &&
        p.status !== "arquivado" &&
        (!excludeId || p.id !== excludeId),
    );
    return found ? { ...found } : null;
  }

  async findById(id: string): Promise<ProjectWithStats | null> {
    const found = this.projects.find((p) => p.id === id);
    return found ? { ...found } : null;
  }

  async create(data: CreateProjectDTO, _usuarioId?: string | null): Promise<Project> {
    const newProject: ProjectWithStats = {
      id: "11111111-1111-4111-8111-111111111111",
      nome: data.nome.trim(),
      cliente: data.cliente.trim(),
      descricao: data.descricao?.trim() ?? null,
      status: data.status ?? "ativo",
      data_inicio: data.data_inicio ?? new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      epicos_count: 0,
      documentos_count: 0,
    };
    this.projects.push(newProject);
    return { ...newProject };
  }

  async findAll(query: ProjectQueryDTO): Promise<PaginatedProjects> {
    let filtered = [...this.projects];

    if (query.status && query.status !== "todos") {
      filtered = filtered.filter((p) => p.status === query.status);
    }

    if (query.busca && query.busca.trim().length > 0) {
      const q = query.busca.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.nome.toLowerCase().includes(q) ||
          p.cliente.toLowerCase().includes(q) ||
          (p.descricao && p.descricao.toLowerCase().includes(q)),
      );
    }

    const total = filtered.length;
    const paginated = filtered.slice(query.offset, query.offset + query.limit);

    return {
      items: paginated,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async update(id: string, data: UpdateProjectDTO, _usuarioId?: string | null): Promise<ProjectWithStats | null> {
    const index = this.projects.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const current = this.projects[index];
    const updated: ProjectWithStats = {
      ...current,
      ...(data.nome !== undefined ? { nome: data.nome.trim() } : {}),
      ...(data.cliente !== undefined ? { cliente: data.cliente.trim() } : {}),
      ...(data.descricao !== undefined ? { descricao: data.descricao?.trim() ?? null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.data_inicio !== undefined ? { data_inicio: data.data_inicio ?? null } : {}),
      updated_at: new Date().toISOString(),
    };

    this.projects[index] = updated;
    return { ...updated };
  }

  async archive(id: string, _usuarioId?: string | null, _justificativa?: string): Promise<ProjectWithStats | null> {
    const index = this.projects.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const updated: ProjectWithStats = {
      ...this.projects[index],
      status: "arquivado",
      updated_at: new Date().toISOString(),
    };

    this.projects[index] = updated;
    return { ...updated };
  }
}

test("PBI-01.1.1 Cenário 1: deve criar projeto com dados válidos e status 'ativo'", async () => {
  const repo = new InMemoryProjectsRepository();
  const service = new ProjectsService(repo);

  const result = await service.create({
    nome: "Plataforma Sinapse",
    cliente: "PRO4TECH",
    descricao: "Base Inteligente de Requisitos",
  });

  assert.equal(result.nome, "Plataforma Sinapse");
  assert.equal(result.cliente, "PRO4TECH");
  assert.equal(result.descricao, "Base Inteligente de Requisitos");
  assert.equal(result.status, "ativo");
  assert.ok(result.id);
});

test("PBI-01.1.1 Cenário 2: deve impedir criação de projeto sem nome", async () => {
  const repo = new InMemoryProjectsRepository();
  const service = new ProjectsService(repo);

  await assert.rejects(
    async () => {
      await service.create({
        nome: "   ",
        cliente: "PRO4TECH",
      });
    },
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      assert.match(err.message, /nome.*obrigat[óo]rio/i);
      return true;
    },
  );
});

test("PBI-01.1.1: deve impedir criação de projeto sem cliente", async () => {
  const repo = new InMemoryProjectsRepository();
  const service = new ProjectsService(repo);

  await assert.rejects(
    async () => {
      await service.create({
        nome: "Projeto Válido",
        cliente: "",
      });
    },
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      assert.match(err.message, /cliente.*obrigat[óo]rio/i);
      return true;
    },
  );
});

test("PBI-01.1.1 Cenário 3: deve impedir criação com nome duplicado de projeto ativo (case-insensitive)", async () => {
  const repo = new InMemoryProjectsRepository();
  const service = new ProjectsService(repo);

  await service.create({
    nome: "Sinapse Memory",
    cliente: "PRO4TECH",
  });

  await assert.rejects(
    async () => {
      await service.create({
        nome: "  sinapse memory  ",
        cliente: "Outro Cliente",
      });
    },
    (err: Error) => {
      assert.ok(err instanceof ConflictError);
      assert.equal(err.message, "Já existe um projeto ativo com este nome.");
      return true;
    },
  );
});

test("deve permitir criar projeto com mesmo nome se o anterior estiver arquivado", async () => {
  const repo = new InMemoryProjectsRepository();
  const service = new ProjectsService(repo);

  const initial = await service.create({
    nome: "Projeto Antigo",
    cliente: "Cliente A",
  });

  await service.archive(initial.id, "user-1", "Projeto arquivado por fim de contrato");

  // Agora deve ser possível criar com o mesmo nome
  const recreated = await service.create({
    nome: "Projeto Antigo",
    cliente: "Cliente B",
  });

  assert.equal(recreated.nome, "Projeto Antigo");
  assert.equal(recreated.status, "ativo");
});

test("deve listar projetos com paginação e filtro por busca", async () => {
  const repo = new InMemoryProjectsRepository();
  const service = new ProjectsService(repo);

  await service.create({ nome: "Alpha Core", cliente: "Cliente 1" });
  await service.create({ nome: "Beta App", cliente: "Cliente 2", descricao: "Mobile" });
  await service.create({ nome: "Gamma Web", cliente: "Cliente 1" });

  const listAll = await service.list({ limit: 10, offset: 0 });
  assert.equal(listAll.total, 3);
  assert.equal(listAll.items.length, 3);

  const listSearch = await service.list({ busca: "beta", limit: 10, offset: 0 });
  assert.equal(listSearch.total, 1);
  assert.equal(listSearch.items[0].nome, "Beta App");
});

test("deve consultar projeto por ID e lançar NotFound se não existir", async () => {
  const repo = new InMemoryProjectsRepository();
  const service = new ProjectsService(repo);

  const created = await service.create({ nome: "Projeto X", cliente: "Cliente X" });
  const found = await service.getById(created.id);
  assert.equal(found.id, created.id);

  await assert.rejects(
    async () => {
      await service.getById("99999999-9999-4999-8999-999999999999");
    },
    (err: Error) => {
      assert.ok(err instanceof NotFoundError);
      return true;
    },
  );
});

test("deve validar formato UUID no getById", async () => {
  const repo = new InMemoryProjectsRepository();
  const service = new ProjectsService(repo);

  await assert.rejects(
    async () => {
      await service.getById("id-invalido");
    },
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      return true;
    },
  );
});
