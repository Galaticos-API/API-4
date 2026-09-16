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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = "BAD_REQUEST",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Recurso não encontrado.") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Conflito de integridade com recurso existente.") {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class ProjectsService {
  constructor(private readonly repository: ProjectsRepository = projectsRepository) {}

  private validateUuid(id: string): void {
    if (!id || !UUID_REGEX.test(id)) {
      throw new ValidationError("ID do projeto inválido. Deve ser um UUID válido.");
    }
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
