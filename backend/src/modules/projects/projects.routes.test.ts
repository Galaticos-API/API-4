import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectsRepository } from "./projects.repository.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import {
  CreateProjectDTO,
  UpdateProjectDTO,
  Project,
  ProjectWithStats,
  PaginatedProjects,
  ProjectQueryDTO,
} from "./projects.types.js";

class MockRepo extends ProjectsRepository {
  public projects: ProjectWithStats[] = [];

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
      id: "a0000000-0000-4000-8000-000000000001",
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

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";

test("Testes de integração HTTP - Rotas de Projetos e Autorização de Papéis", async (t) => {
  const mockRepo = new MockRepo();
  const service = new ProjectsService(mockRepo);
  const controller = new ProjectsController(service);

  const testApp = express();
  testApp.use(express.json());

  const router = express.Router();
  router.use(requireAuth);
  router.post("/", requireRole("po", "admin"), controller.create);
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.put("/:id", requireRole("po", "admin"), controller.update);
  router.patch("/:id", requireRole("po", "admin"), controller.update);
  router.patch("/:id/archive", requireRole("po", "admin"), controller.archive);

  testApp.use("/api/v1/projects", router);
  testApp.use(errorHandler);

  let server: Server;
  let baseUrl: string;

  const poHeaders = {
    "Content-Type": "application/json",
    "x-user-id": "11111111-1111-4111-8111-111111111111",
    "x-user-role": "po",
  };

  const devHeaders = {
    "Content-Type": "application/json",
    "x-user-id": "22222222-2222-4222-8222-222222222222",
    "x-user-role": "dev",
  };

  before(async () => {
    await new Promise<void>((resolve) => {
      server = testApp.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1/projects`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // --- Testes de Autenticação (401) ---
  await t.test("POST /api/v1/projects - retorna 401 para requisição não autenticada", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "Projeto Sem Auth",
        cliente: "Cliente Anônimo",
      }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, "UNAUTHORIZED");
  });

  await t.test("GET /api/v1/projects - retorna 401 para requisição não autenticada", async () => {
    const res = await fetch(baseUrl);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, "UNAUTHORIZED");
  });

  // --- Testes de Restrição de Perfil Desenvolvedor (403 em escrita) ---
  await t.test("POST /api/v1/projects - retorna 403 para perfil dev tentando criar projeto", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: devHeaders,
      body: JSON.stringify({
        nome: "Projeto Criado por Dev",
        cliente: "Cliente Dev",
        descricao: "Tentativa de escrita por dev",
      }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, "FORBIDDEN");
    assert.match(body.error, /acesso negado/i);
  });

  await t.test("PUT /api/v1/projects/:id - retorna 403 para perfil dev tentando alterar projeto", async () => {
    const res = await fetch(`${baseUrl}/a0000000-0000-4000-8000-000000000001`, {
      method: "PUT",
      headers: devHeaders,
      body: JSON.stringify({
        nome: "Nome Alterado por Dev",
        cliente: "Cliente Modificado",
      }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, "FORBIDDEN");
  });

  await t.test("PATCH /api/v1/projects/:id - retorna 403 para perfil dev tentando atualizar parcialmente", async () => {
    const res = await fetch(`${baseUrl}/a0000000-0000-4000-8000-000000000001`, {
      method: "PATCH",
      headers: devHeaders,
      body: JSON.stringify({
        descricao: "Tentativa de patch por dev",
      }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, "FORBIDDEN");
  });

  await t.test("PATCH /api/v1/projects/:id/archive - retorna 403 para perfil dev tentando arquivar", async () => {
    const res = await fetch(`${baseUrl}/a0000000-0000-4000-8000-000000000001/archive`, {
      method: "PATCH",
      headers: devHeaders,
      body: JSON.stringify({ justificativa: "Tentativa de arquivamento por dev" }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, "FORBIDDEN");
  });

  // --- Testes de Leitura com Perfil Dev (200 OK permitido conforme regra de produto) ---
  await t.test("GET /api/v1/projects - permite listagem com perfil dev (200 OK)", async () => {
    const res = await fetch(baseUrl, {
      headers: { "x-user-id": devHeaders["x-user-id"], "x-user-role": devHeaders["x-user-role"] },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as PaginatedProjects;
    assert.ok(Array.isArray(body.items));
  });

  // --- Testes de Sucesso com Perfil Product Owner ---
  await t.test("POST /api/v1/projects - cria projeto com status 201 quando autenticado como PO", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: poHeaders,
      body: JSON.stringify({
        nome: "Novo Projeto HTTP",
        cliente: "PRO4TECH",
        descricao: "Descrição do projeto",
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Project;
    assert.equal(body.nome, "Novo Projeto HTTP");
    assert.equal(body.status, "ativo");
  });

  await t.test("POST /api/v1/projects - retorna 400 se nome estiver vazio", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: poHeaders,
      body: JSON.stringify({
        nome: "",
        cliente: "PRO4TECH",
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /nome.*obrigat[óo]rio/i);
  });

  await t.test("POST /api/v1/projects - retorna 409 se nome já estiver em uso por projeto ativo", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: poHeaders,
      body: JSON.stringify({
        nome: "Novo Projeto HTTP",
        cliente: "Outro Cliente",
      }),
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Já existe um projeto ativo com este nome.");
  });

  await t.test("GET /api/v1/projects - lista projetos com status 200 para PO", async () => {
    const res = await fetch(baseUrl, {
      headers: { "x-user-id": poHeaders["x-user-id"], "x-user-role": poHeaders["x-user-role"] },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as PaginatedProjects;
    assert.ok(Array.isArray(body.items));
    assert.equal(body.total, 1);
  });

  await t.test("GET /api/v1/projects/:id - retorna 200 para dev consultando projeto existente", async () => {
    const res = await fetch(`${baseUrl}/a0000000-0000-4000-8000-000000000001`, {
      headers: { "x-user-id": devHeaders["x-user-id"], "x-user-role": devHeaders["x-user-role"] },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as ProjectWithStats;
    assert.equal(body.nome, "Novo Projeto HTTP");
  });

  await t.test("GET /api/v1/projects/:id - retorna 400 para UUID inválido", async () => {
    const res = await fetch(`${baseUrl}/uuid-invalido`, {
      headers: { "x-user-id": poHeaders["x-user-id"], "x-user-role": poHeaders["x-user-role"] },
    });
    assert.equal(res.status, 400);
  });

  await t.test("GET /api/v1/projects/:id - retorna 404 para ID inexistente", async () => {
    const res = await fetch(`${baseUrl}/ffffffff-ffff-4fff-8fff-ffffffffffff`, {
      headers: { "x-user-id": poHeaders["x-user-id"], "x-user-role": poHeaders["x-user-role"] },
    });
    assert.equal(res.status, 404);
  });

  await t.test("PUT /api/v1/projects/:id - atualiza projeto com sucesso para PO", async () => {
    const res = await fetch(`${baseUrl}/a0000000-0000-4000-8000-000000000001`, {
      method: "PUT",
      headers: poHeaders,
      body: JSON.stringify({
        nome: "Projeto Atualizado HTTP",
        cliente: "PRO4TECH Atualizado",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as ProjectWithStats;
    assert.equal(body.nome, "Projeto Atualizado HTTP");
  });

  await t.test("PATCH /api/v1/projects/:id/archive - arquiva projeto quando autenticado como PO", async () => {
    const res = await fetch(`${baseUrl}/a0000000-0000-4000-8000-000000000001/archive`, {
      method: "PATCH",
      headers: poHeaders,
      body: JSON.stringify({ justificativa: "Projeto concluído" }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as ProjectWithStats;
    assert.equal(body.status, "arquivado");
  });
});
