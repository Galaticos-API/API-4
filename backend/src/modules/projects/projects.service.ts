import { z } from "zod";
import type { ArchiveImpact } from "./archive.types.js";
import {
  createProjectSchema,
  updateProjectSchema,
  projectQuerySchema,
  Project,
  ProjectWithStats,
  PaginatedProjects,
} from "./projects.types.js";
import { ProjectsRepository, projectsRepository } from "./projects.repository.js";
import { ConflictError, NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";

export class ProjectsService {
  constructor(private readonly repository: ProjectsRepository = projectsRepository) {}

  private validateUuid(id: string): void {
    validateUuid(id, "ID do projeto");
  }

  async create(input: unknown, usuarioId?: string | null): Promise<Project> {
    const parseResult = createProjectSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const dto = parseResult.data;

    // Cenário 3 — Impedir nome duplicado entre projetos ativos
    const existing = await this.repository.findActiveByName(dto.nome);
    if (existing) {
      throw new ConflictError("Já existe um projeto ativo com este nome.");
    }

    return await this.repository.create(dto, usuarioId);
  }

  async list(queryInput: unknown): Promise<PaginatedProjects> {
    const parseResult = projectQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    return await this.repository.findAll(parseResult.data);
  }

  async getById(id: string): Promise<ProjectWithStats> {
    this.validateUuid(id);

    const project = await this.repository.findById(id);
    if (!project) {
      throw new NotFoundError("Projeto não encontrado.");
    }

    return project;
  }

  async archiveImpact(id: string): Promise<{ projeto: number; epicos: number; features: number; pbis: number }> {
    this.validateUuid(id);
    const impact = await this.repository.archiveImpact(id);
    if (!impact) throw new NotFoundError("Projeto não encontrado.");
    return impact;
  }

  async update(id: string, input: unknown, usuarioId?: string | null): Promise<ProjectWithStats> {
    this.validateUuid(id);

    const parseResult = updateProjectSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const dto = parseResult.data;

    // Se estiver atualizando o nome, verificar duplicidade em outros projetos ativos
    if (dto.nome) {
      const existing = await this.repository.findActiveByName(dto.nome, id);
      if (existing) {
        throw new ConflictError("Já existe um projeto ativo com este nome.");
      }
    }

    const updated = await this.repository.update(id, dto, usuarioId);
    if (!updated) {
      throw new NotFoundError("Projeto não encontrado.");
    }

    return updated;
  }

  async archive(id: string, usuarioId?: string | null, justificativa?: string, expected?: ArchiveImpact): Promise<ProjectWithStats> {
    this.validateUuid(id);

    const archived = await this.repository.archive(id, usuarioId, justificativa, expected);
    if (!archived) {
      throw new NotFoundError("Projeto não encontrado.");
    }

    return archived;
  }
}

export const projectsService = new ProjectsService();
