import { createEpicSchema, updateEpicSchema, epicQuerySchema, Epic, EpicWithStats, PaginatedEpics, EPIC_REQUIRED_FIELDS } from "./epics.types.js";
import { EpicsRepository, epicsRepository } from "./epics.repository.js";
import { ProjectsRepository, projectsRepository } from "../projects/projects.repository.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";

export class EpicsService {
  constructor(
    private readonly repository: EpicsRepository = epicsRepository,
    private readonly projectsRepo: ProjectsRepository = projectsRepository,
  ) {}

  private async ensureWritable(epic: Epic): Promise<void> {
    if (epic.status === "ativo" || epic.status === "arquivado") {
      throw new ValidationError("Épico com estado legado disponível somente para leitura.");
    }
    const project = await this.projectsRepo.findById(epic.projeto_id);
    if (!project) throw new NotFoundError("Projeto não encontrado.");
    if (project.status === "arquivado") {
      throw new ValidationError("Não é possível alterar épicos de um projeto arquivado.");
    }
  }

  async create(input: unknown, usuarioId?: string | null): Promise<Epic> {
    const parseResult = createEpicSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const dto = parseResult.data;

    const projeto = await this.projectsRepo.findById(dto.projeto_id);
    if (!projeto) {
      throw new NotFoundError("Projeto não encontrado.");
    }
    if (projeto.status === "arquivado") {
      throw new ValidationError("Não é possível cadastrar épicos em um projeto arquivado.");
    }

    return await this.repository.create(dto, usuarioId);
  }

  async list(queryInput: unknown): Promise<PaginatedEpics> {
    const parseResult = epicQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    return await this.repository.findAll(parseResult.data);
  }

  async getById(id: string): Promise<EpicWithStats> {
    validateUuid(id, "ID do épico");

    const epic = await this.repository.findById(id);
    if (!epic) {
      throw new NotFoundError("Épico não encontrado.");
    }

    return epic;
  }

  async update(id: string, input: unknown, usuarioId?: string | null): Promise<EpicWithStats> {
    validateUuid(id, "ID do épico");

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Épico não encontrado.");
    }

    await this.ensureWritable(existing);

    const parseResult = updateEpicSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    if (existing.status === "concluido") {
      const merged = { ...existing, ...parseResult.data };
      if (EPIC_REQUIRED_FIELDS.some((field) => !String(merged[field] ?? "").trim())) {
        throw new ValidationError("Não é possível remover campos obrigatórios de um épico concluído.");
      }
    }
    const updated = await this.repository.update(id, parseResult.data, usuarioId);
    if (!updated) {
      throw new NotFoundError("Épico não encontrado.");
    }

    return updated;
  }

  async complete(id: string, usuarioId?: string | null): Promise<EpicWithStats> {
    validateUuid(id, "ID do épico");

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Épico não encontrado.");
    }
    await this.ensureWritable(existing);
    if (existing.status === "concluido") {
      return existing;
    }

    const camposFaltantes: string[] = EPIC_REQUIRED_FIELDS.filter(
      (field) => !existing[field] || String(existing[field]).trim().length === 0,
    );
    if ((existing.criterios_count ?? 0) === 0) {
      camposFaltantes.push("criterios_aceitacao");
    }

    if (camposFaltantes.length > 0) {
      throw new ValidationError(
        `Não é possível concluir o épico: preencha os campos obrigatórios do guia antes de concluir.`,
        { campos_faltantes: camposFaltantes },
      );
    }

    const completed = await this.repository.markConcluded(id, usuarioId);
    if (!completed) {
      throw new NotFoundError("Épico não encontrado.");
    }

    return completed;
  }
}

export const epicsService = new EpicsService();
