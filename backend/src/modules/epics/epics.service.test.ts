import test from "node:test";
import assert from "node:assert/strict";
import { EpicsService } from "./epics.service.js";
import { EpicsRepository } from "./epics.repository.js";
import { ProjectsRepository } from "../projects/projects.repository.js";
import { ValidationError, NotFoundError } from "../../shared/errors.js";
import { CreateEpicDTO, UpdateEpicDTO, Epic, EpicWithStats, PaginatedEpics, EpicQueryDTO } from "./epics.types.js";
import { Project, ProjectWithStats, CreateProjectDTO, UpdateProjectDTO, PaginatedProjects, ProjectQueryDTO } from "../projects/projects.types.js";

const PROJETO_ID = "d0000000-0000-4000-8000-000000000001";
const PROJETO_ARQUIVADO_ID = "d0000000-0000-4000-8000-000000000002";

class InMemoryEpicsRepository extends EpicsRepository {
  private epics: EpicWithStats[] = [];
  public criteriosPorEpico = new Map<string, number>();
  public statusPorProjeto = new Map<string, string>([[PROJETO_ID, "ativo"]]);
  private seq = 0;

  constructor() { super(); }

  async findById(id: string): Promise<EpicWithStats | null> {
    const found = this.epics.find((e) => e.id === id);
    if (!found) return null;
    return { ...found, criterios_count: this.criteriosPorEpico.get(id) ?? 0, projeto_status: this.statusPorProjeto.get(found.projeto_id) ?? "ativo" };
  }

  async create(data: CreateEpicDTO): Promise<Epic> {
    this.seq += 1;
    const created: EpicWithStats = {
      id: `a0000000-0000-4000-8000-00000000000${this.seq}`,
      projeto_id: data.projeto_id,
      titulo: data.titulo.trim(),
      descricao: data.descricao?.trim() ?? null,
      objetivo: data.objetivo?.trim() ?? null,
      escopo_macro: data.escopo_macro?.trim() ?? null,
      resultado_esperado: data.resultado_esperado?.trim() ?? null,
      prioridade: data.prioridade,
      status: "rascunho",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      features_count: 0,
      criterios_count: 0,
      projeto_status: this.statusPorProjeto.get(data.projeto_id) ?? "ativo",
    };
    this.epics.push(created);
    return created;
  }

  async findAll(query: EpicQueryDTO): Promise<PaginatedEpics> {
    const items = this.epics.filter((e) => !query.projeto_id || e.projeto_id === query.projeto_id);
    return { items, total: items.length, limit: query.limit, offset: query.offset };
  }

  async update(id: string, data: UpdateEpicDTO): Promise<EpicWithStats | null> {
    const index = this.epics.findIndex((e) => e.id === id);
    if (index === -1) return null;
    const updated: EpicWithStats = {
      ...this.epics[index],
      ...(data.titulo !== undefined ? { titulo: data.titulo.trim() } : {}),
      ...(data.descricao !== undefined ? { descricao: data.descricao?.trim() ?? null } : {}),
      ...(data.objetivo !== undefined ? { objetivo: data.objetivo?.trim() ?? null } : {}),
      ...(data.escopo_macro !== undefined ? { escopo_macro: data.escopo_macro?.trim() ?? null } : {}),
      ...(data.resultado_esperado !== undefined ? { resultado_esperado: data.resultado_esperado?.trim() ?? null } : {}),
    };
    this.epics[index] = updated;
    return { ...updated, criterios_count: this.criteriosPorEpico.get(id) ?? 0 };
  }

  async markConcluded(id: string): Promise<EpicWithStats | null> {
    const index = this.epics.findIndex((e) => e.id === id);
    if (index === -1) return null;
    this.epics[index] = { ...this.epics[index], status: "concluido" };
    return { ...this.epics[index], criterios_count: this.criteriosPorEpico.get(id) ?? 0 };
  }
}

class StubProjectsRepository extends ProjectsRepository {
  public projects: ProjectWithStats[] = [];

  constructor() { super(); }

  async findById(id: string): Promise<ProjectWithStats | null> {
    return this.projects.find((p) => p.id === id) ?? null;
  }

  async findActiveByName(): Promise<Project | null> { return null; }
  async create(data: CreateProjectDTO): Promise<Project> { throw new Error("não usado neste teste"); }
  async findAll(_query: ProjectQueryDTO): Promise<PaginatedProjects> { throw new Error("não usado neste teste"); }
  async update(_id: string, _data: UpdateProjectDTO): Promise<ProjectWithStats | null> { throw new Error("não usado neste teste"); }
  async archive(): Promise<ProjectWithStats | null> { throw new Error("não usado neste teste"); }
}

function setup() {
  const epicsRepo = new InMemoryEpicsRepository();
  const projectsRepo = new StubProjectsRepository();
  projectsRepo.projects.push({
    id: PROJETO_ID, nome: "Projeto Ativo", cliente: "Cliente", descricao: null, status: "ativo",
    data_inicio: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  const service = new EpicsService(epicsRepo, projectsRepo);
  return { service, epicsRepo, projectsRepo };
}

test("PBI-01.1.2 Cenário 1: cria épico completo vinculado ao projeto com status rascunho", async () => {
  const { service } = setup();

  const result = await service.create({
    projeto_id: PROJETO_ID,
    titulo: "Especificar backlog",
    descricao: "descrição",
    objetivo: "objetivo",
    escopo_macro: "escopo",
    resultado_esperado: "resultado",
  });

  assert.equal(result.titulo, "Especificar backlog");
  assert.equal(result.status, "rascunho");
});

test("PBI-01.1.2 Cenário 2: permite salvar rascunho incompleto com apenas título", async () => {
  const { service } = setup();

  const result = await service.create({ projeto_id: PROJETO_ID, titulo: "Épico incompleto" });

  assert.equal(result.status, "rascunho");
  assert.equal(result.descricao, null);
});

test("PBI-01.1.2 Cenário 3: impede conclusão sem escopo macro ou resultado esperado", async () => {
  const { service } = setup();

  const created = await service.create({
    projeto_id: PROJETO_ID,
    titulo: "Épico sem escopo",
    descricao: "descrição",
    objetivo: "objetivo",
  });

  await assert.rejects(
    async () => await service.complete(created.id),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      const details = (err as ValidationError).details as { campos_faltantes: string[] };
      assert.ok(details.campos_faltantes.includes("escopo_macro"));
      assert.ok(details.campos_faltantes.includes("resultado_esperado"));
      return true;
    },
  );
});

test("impede conclusão de épico sem nenhum critério de aceitação registrado", async () => {
  const { service, epicsRepo } = setup();

  const created = await service.create({
    projeto_id: PROJETO_ID,
    titulo: "Épico completo sem critério",
    descricao: "descrição",
    objetivo: "objetivo",
    escopo_macro: "escopo",
    resultado_esperado: "resultado",
  });

  await assert.rejects(
    async () => await service.complete(created.id),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      const details = (err as ValidationError).details as { campos_faltantes: string[] };
      assert.ok(details.campos_faltantes.includes("criterios_aceitacao"));
      return true;
    },
  );

  epicsRepo.criteriosPorEpico.set(created.id, 1);
  const completed = await service.complete(created.id);
  assert.equal(completed.status, "concluido");
});

test("impede cadastro de épico em projeto inexistente", async () => {
  const { service } = setup();

  await assert.rejects(
    async () => await service.create({ projeto_id: "99999999-9999-4999-8999-999999999999", titulo: "Épico órfão" }),
    (err: Error) => {
      assert.ok(err instanceof NotFoundError);
      return true;
    },
  );
});

test("impede cadastro de épico em projeto arquivado", async () => {
  const { service, projectsRepo } = setup();
  projectsRepo.projects.push({
    id: PROJETO_ARQUIVADO_ID, nome: "Projeto Arquivado", cliente: "Cliente", descricao: null, status: "arquivado",
    data_inicio: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => await service.create({ projeto_id: PROJETO_ARQUIVADO_ID, titulo: "Épico em projeto arquivado" }),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      return true;
    },
  );
});

test("PBI-01.1.5 Cenário 3: impede edição e conclusão de épico cujo projeto foi arquivado", async () => {
  const { service, epicsRepo, projectsRepo } = setup();

  const created = await service.create({ projeto_id: PROJETO_ID, titulo: "Épico a ser arquivado" });
  epicsRepo.statusPorProjeto.set(PROJETO_ID, "arquivado");
  const projeto = projectsRepo.projects.find((p) => p.id === PROJETO_ID);
  if (projeto) projeto.status = "arquivado";

  await assert.rejects(
    async () => await service.update(created.id, { titulo: "Tentativa de edição" }),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      return true;
    },
  );

  await assert.rejects(
    async () => await service.complete(created.id),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      return true;
    },
  );
});
