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
  ProjectBacklogTree,
} from "./projects.types.js";

class MockRepo extends ProjectsRepository {
  public projects: ProjectWithStats[] = [];

  async archiveImpact(id: string) {
    return this.projects.some((project) => project.id === id)
      ? {
          projeto: 1,
          epicos: 2,
          features: 3,
          pbis: 4,
        }
      : null;
  }

  constructor() {
    super();
  }

  async findActiveByName(
    nome: string,
    excludeId?: string,
  ): Promise<Project | null> {
    const trimmed = nome.trim().toLowerCase();

    const found = this.projects.find(
      (project) =>
        project.nome.trim().toLowerCase() === trimmed &&
        project.status !== "arquivado" &&
        (!excludeId || project.id !== excludeId),
    );

    return found ? { ...found } : null;
  }

  async findById(
    id: string,
  ): Promise<ProjectWithStats | null> {
    const found = this.projects.find(
      (project) => project.id === id,
    );

    return found ? { ...found } : null;
  }

  async findBacklogTree(
    id: string,
  ): Promise<ProjectBacklogTree | null> {
    const project = this.projects.find(
      (item) => item.id === id,
    );

    if (!project) {
      return null;
    }

    return {
      project: {
        id: project.id,
        nome: project.nome,
        status: project.status,
      },
      technologies: [
        {
          id: "tech-react",
          nome: "React",
        },
      ],
      epics: [
        {
          id: "epic-1",
          titulo: "Organizar backlog",
          status: "rascunho",
          tecnologias: [],
          features: [
            {
              id: "feature-1",
              titulo: "Navegar hierarquia",
              status: "concluido",
              tecnologias: [
                {
                  id: "tech-react",
                  nome: "React",
                },
              ],
              pbis: [
                {
                  id: "pbi-1",
                  codigo: "PBI-01.4.1",
                  titulo: "Expandir árvore",
                  status: "rascunho",
                  tecnologias: [
                    {
                      id: "tech-react",
                      nome: "React",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  async create(
    data: CreateProjectDTO,
    _usuarioId?: string | null,
  ): Promise<Project> {
    const newProject: ProjectWithStats = {
      id: "a0000000-0000-4000-8000-000000000001",
      nome: data.nome.trim(),
      cliente: data.cliente.trim(),
      descricao: data.descricao?.trim() ?? null,
      status: data.status ?? "ativo",
      data_inicio:
        data.data_inicio ??
        new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      epicos_count: 0,
      documentos_count: 0,
    };

    this.projects.push(newProject);

    return { ...newProject };
  }

  async findAll(
    query: ProjectQueryDTO,
  ): Promise<PaginatedProjects> {
    let filtered = [...this.projects];

    if (
      query.status &&
      query.status !== "todos"
    ) {
      filtered = filtered.filter(
        (project) =>
          project.status === query.status,
      );
    }

    if (
      query.busca &&
      query.busca.trim().length > 0
    ) {
      const search = query.busca.toLowerCase();

      filtered = filtered.filter(
        (project) =>
          project.nome
            .toLowerCase()
            .includes(search) ||
          project.cliente
            .toLowerCase()
            .includes(search) ||
          (project.descricao &&
            project.descricao
              .toLowerCase()
              .includes(search)),
      );
    }

    const total = filtered.length;

    const paginated = filtered.slice(
      query.offset,
      query.offset + query.limit,
    );

    return {
      items: paginated,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async update(
    id: string,
    data: UpdateProjectDTO,
    _usuarioId?: string | null,
  ): Promise<ProjectWithStats | null> {
    const index = this.projects.findIndex(
      (project) => project.id === id,
    );

    if (index === -1) {
      return null;
    }

    const current = this.projects[index];

    const updated: ProjectWithStats = {
      ...current,
      ...(data.nome !== undefined
        ? { nome: data.nome.trim() }
        : {}),
      ...(data.cliente !== undefined
        ? { cliente: data.cliente.trim() }
        : {}),
      ...(data.descricao !== undefined
        ? {
            descricao:
              data.descricao?.trim() ?? null,
          }
        : {}),
      ...(data.status !== undefined
        ? { status: data.status }
        : {}),
      ...(data.data_inicio !== undefined
        ? {
            data_inicio:
              data.data_inicio ?? null,
          }
        : {}),
      updated_at: new Date().toISOString(),
    };

    this.projects[index] = updated;

    return { ...updated };
  }

  async archive(
    id: string,
    _usuarioId?: string | null,
    _justificativa?: string,
  ): Promise<ProjectWithStats | null> {
    const index = this.projects.findIndex(
      (project) => project.id === id,
    );

    if (index === -1) {
      return null;
    }

    const updated: ProjectWithStats = {
      ...this.projects[index],
      status: "arquivado",
      updated_at: new Date().toISOString(),
    };

    this.projects[index] = updated;

    return { ...updated };
  }
}

test(
  "Testes de integração HTTP - Rotas de Projetos",
  async (context) => {
    const mockRepo = new MockRepo();
    const service = new ProjectsService(mockRepo);
    const controller =
      new ProjectsController(service);

    const testApp = express();

    testApp.use(express.json());

    const router = express.Router();

    router.post("/", controller.create);
    router.get("/", controller.list);

    router.get(
      "/:id/archive-impact",
      controller.archiveImpact,
    );

    router.get(
      "/:id/backlog-tree",
      controller.backlogTree,
    );

    router.get("/:id", controller.getById);
    router.put("/:id", controller.update);
    router.patch("/:id", controller.update);

    router.patch(
      "/:id/archive",
      controller.archive,
    );

    testApp.use(
      "/api/v1/projects",
      router,
    );

    testApp.use(errorHandler);

    let server: Server;
    let baseUrl: string;

    before(async () => {
      await new Promise<void>((resolve) => {
        server = testApp.listen(
          0,
          "127.0.0.1",
          () => {
            const address =
              server.address() as AddressInfo;

            baseUrl =
              `http://127.0.0.1:${address.port}` +
              "/api/v1/projects";

            resolve();
          },
        );
      });
    });

    after(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    await context.test(
      "POST /api/v1/projects - cria projeto com status 201",
      async () => {
        const response = await fetch(
          baseUrl,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              nome: "Novo Projeto HTTP",
              cliente: "PRO4TECH",
              descricao:
                "Descrição do projeto",
            }),
          },
        );

        assert.equal(response.status, 201);

        const body =
          (await response.json()) as Project;

        assert.equal(
          body.nome,
          "Novo Projeto HTTP",
        );

        assert.equal(body.status, "ativo");
      },
    );

    await context.test(
      "POST /api/v1/projects - retorna 400 se nome estiver vazio",
      async () => {
        const response = await fetch(
          baseUrl,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              nome: "",
              cliente: "PRO4TECH",
            }),
          },
        );

        assert.equal(response.status, 400);

        const body =
          (await response.json()) as {
            error: string;
          };

        assert.match(
          body.error,
          /nome.*obrigat[óo]rio/i,
        );
      },
    );

    await context.test(
      "POST /api/v1/projects - retorna 409 se nome já estiver em uso por projeto ativo",
      async () => {
        const response = await fetch(
          baseUrl,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              nome: "Novo Projeto HTTP",
              cliente: "Outro Cliente",
            }),
          },
        );

        assert.equal(response.status, 409);

        const body =
          (await response.json()) as {
            error: string;
          };

        assert.equal(
          body.error,
          "Já existe um projeto ativo com este nome.",
        );
      },
    );

    await context.test(
      "GET /api/v1/projects - lista projetos com status 200",
      async () => {
        const response = await fetch(baseUrl);

        assert.equal(response.status, 200);

        const body =
          (await response.json()) as PaginatedProjects;

        assert.ok(
          Array.isArray(body.items),
        );

        assert.equal(body.total, 1);
      },
    );

    await context.test(
      "GET /api/v1/projects/:id - retorna 200 para projeto existente",
      async () => {
        const response = await fetch(
          `${baseUrl}/a0000000-0000-4000-8000-000000000001`,
        );

        assert.equal(response.status, 200);

        const body =
          (await response.json()) as ProjectWithStats;

        assert.equal(
          body.nome,
          "Novo Projeto HTTP",
        );
      },
    );

    await context.test(
      "GET /api/v1/projects/:id - retorna 400 para UUID inválido",
      async () => {
        const response = await fetch(
          `${baseUrl}/uuid-invalido`,
        );

        assert.equal(response.status, 400);
      },
    );

    await context.test(
      "GET /api/v1/projects/:id - retorna 404 para ID inexistente",
      async () => {
        const response = await fetch(
          `${baseUrl}/ffffffff-ffff-4fff-8fff-ffffffffffff`,
        );

        assert.equal(response.status, 404);
      },
    );

    await context.test(
      "GET /api/v1/projects/:id/backlog-tree - retorna a hierarquia isolada do projeto",
      async () => {
        const id =
          "a0000000-0000-4000-8000-000000000001";

        const response = await fetch(
          `${baseUrl}/${id}/backlog-tree`,
        );

        assert.equal(response.status, 200);

        const body =
          (await response.json()) as ProjectBacklogTree;

        assert.equal(
          body.project.id,
          id,
        );

        assert.equal(
          body.epics[0].features[0].pbis[0]
            .codigo,
          "PBI-01.4.1",
        );

        assert.deepEqual(
          body.technologies,
          [
            {
              id: "tech-react",
              nome: "React",
            },
          ],
        );

        assert.equal(
          (
            await fetch(
              `${baseUrl}/invalid/backlog-tree`,
            )
          ).status,
          400,
        );

        assert.equal(
          (
            await fetch(
              `${baseUrl}/ffffffff-ffff-4fff-8fff-ffffffffffff/backlog-tree`,
            )
          ).status,
          404,
        );
      },
    );

    await context.test(
      "prévia informa contagens e retorna 404 para projeto ausente",
      async () => {
        const response = await fetch(
          `${baseUrl}/a0000000-0000-4000-8000-000000000001/archive-impact`,
        );

        assert.equal(response.status, 200);

        assert.deepEqual(
          await response.json(),
          {
            projeto: 1,
            epicos: 2,
            features: 3,
            pbis: 4,
          },
        );

        assert.equal(
          (
            await fetch(
              `${baseUrl}/ffffffff-ffff-4fff-8fff-ffffffffffff/archive-impact`,
            )
          ).status,
          404,
        );

        assert.equal(
          (
            await fetch(
              `${baseUrl}/invalid/archive-impact`,
            )
          ).status,
          400,
        );
      },
    );

    await context.test(
      "arquivamento exige confirmação e contagens válidas",
      async () => {
        const requests = [
          {},
          { confirmado: false },
          { confirmado: true },
          {
            confirmado: true,
            impacto: {
              projeto: 1,
              epicos: -1,
              features: 0,
              pbis: 0,
            },
          },
        ];

        for (const body of requests) {
          const response = await fetch(
            `${baseUrl}/a0000000-0000-4000-8000-000000000001/archive`,
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(body),
            },
          );

          assert.equal(
            response.status,
            400,
          );

          assert.equal(
            mockRepo.projects[0].status,
            "ativo",
          );
        }
      },
    );

    await context.test(
      "não permite contornar a confirmação via cadastro ou edição",
      async () => {
        const requests: Array<
          [string, string]
        > = [
          ["", "POST"],
          [
            "/a0000000-0000-4000-8000-000000000001",
            "PATCH",
          ],
        ];

        for (const [path, method] of requests) {
          const response = await fetch(
            `${baseUrl}${path}`,
            {
              method,
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                nome: "Outro",
                cliente: "Teste",
                status: "arquivado",
              }),
            },
          );

          assert.equal(
            response.status,
            400,
          );
        }

        assert.equal(
          (
            await fetch(
              `${baseUrl}?status=inexistente`,
            )
          ).status,
          400,
        );
      },
    );

    await context.test(
      "PATCH /api/v1/projects/:id/archive - arquiva projeto",
      async () => {
        const response = await fetch(
          `${baseUrl}/a0000000-0000-4000-8000-000000000001/archive`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              confirmado: true,
              impacto: {
                projeto: 1,
                epicos: 0,
                features: 0,
                pbis: 0,
              },
              justificativa:
                "Projeto concluído",
            }),
          },
        );

        assert.equal(response.status, 200);

        const body =
          (await response.json()) as ProjectWithStats;

        assert.equal(
          body.status,
          "arquivado",
        );
      },
    );
  },
);