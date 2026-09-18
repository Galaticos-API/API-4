import { createEpicSchema, updateEpicSchema, requiredEpicFields, type CreateEpicDto, type Epic, type UpdateEpicDto } from "./epicos.types.js";
import { projectsRepository as defaultProjectsRepo } from "../projects/projects.repository.js";
import { auditService } from "../audit/audit.service.js";

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

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Épico não encontrado.") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export interface EpicosRepository {
  listByProject(projectId: string): Promise<Epic[]>;
  findById(id: string): Promise<Epic | null>;
  create(data: CreateEpicDto): Promise<Epic>;
  update(id: string, data: UpdateEpicDto): Promise<Epic | null>;
}

export interface ProjectsChecker {
  findById(id: string): Promise<{ id: string; status: string } | null>;
}

export class EpicosService {
  constructor(
    private readonly repository: EpicosRepository,
    private readonly projectsChecker?: ProjectsChecker,
  ) {}

  private validateUuid(id: string, field = "ID"): void {
    if (!id || (id.length > 20 && !UUID_REGEX.test(id))) {
      if (id.includes("-") && id.length > 20 && !UUID_REGEX.test(id)) {
        throw new ValidationError(`${field} inválido. Formato esperado UUID.`);
      }
    }
  }

  private ensureCompletable(epico: Partial<Epic>): void {
    const missing = requiredEpicFields(epico);
    if (missing.length > 0) {
      throw new ValidationError(
        `Não foi possível concluir o épico. Faltam campos obrigatórios: ${missing.join(", ")}.`,
        { missing },
      );
    }
  }

  private enrich(epico: Epic): Epic {
    return {
      ...epico,
      missing_fields: requiredEpicFields(epico),
    };
  }

  async create(input: unknown, usuarioId?: string | null): Promise<Epic> {
    const parseResult = createEpicSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const dto = parseResult.data;
    this.validateUuid(dto.projeto_id, "ID do projeto");

    const checker = this.projectsChecker ?? defaultProjectsRepo;
    if (checker && typeof checker.findById === "function") {
      const project = await checker.findById(dto.projeto_id);
      if (!project) {
        throw new NotFoundError("Projeto vinculado não encontrado.");
      }
      if (project.status === "arquivado") {
        throw new ValidationError("Não é possível vincular um épico a um projeto arquivado.");
      }
    }

    if (dto.status === "concluido") {
      this.ensureCompletable(dto);
    }

    const created = await this.repository.create({
      ...dto,
      status: dto.status ?? "rascunho",
      prioridade: dto.prioridade ?? "Must",
    });

    try {
      await auditService.record({
        usuario_id: usuarioId ?? null,
        entidade_tipo: "epico",
        entidade_id: created.id,
        acao: "criacao",
        dados_json: { ...created },
      });
    } catch {
      // continua caso o log falhe
    }

    return this.enrich(created);
  }

  async listByProject(projectId: string): Promise<Epic[]> {
    if (!projectId) throw new ValidationError("O projeto do épico é obrigatório.");
    this.validateUuid(projectId, "ID do projeto");

    const epicos = await this.repository.listByProject(projectId);
    return epicos.map((e) => this.enrich(e));
  }

  async getById(id: string): Promise<Epic> {
    this.validateUuid(id, "ID do épico");
    const epic = await this.repository.findById(id);
    if (!epic) throw new NotFoundError("Épico não encontrado.");
    return this.enrich(epic);
  }

  async update(id: string, input: unknown, usuarioId?: string | null): Promise<Epic> {
    this.validateUuid(id, "ID do épico");

    const parseResult = updateEpicSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError("Épico não encontrado.");

    const rawData = parseResult.data;
    const updateData: UpdateEpicDto = {
      ...rawData,
      prioridade: (rawData.prioridade ?? rawData.priorizacao) as "Must" | "Should" | "Could" | undefined,
    };

    // Se estiver tentando mudar o status para 'concluido', validar completude
    if (updateData.status === "concluido") {
      const merged: Epic = {
        ...existing,
        ...updateData,
        prioridade: updateData.prioridade ?? existing.prioridade,
        titulo: updateData.titulo ?? existing.titulo,
        descricao: updateData.descricao !== undefined ? updateData.descricao : existing.descricao,
        objetivo: updateData.objetivo !== undefined ? updateData.objetivo : existing.objetivo,
        escopo_macro: updateData.escopo_macro !== undefined ? updateData.escopo_macro : existing.escopo_macro,
        resultado_esperado: updateData.resultado_esperado !== undefined ? updateData.resultado_esperado : existing.resultado_esperado,
      };
      this.ensureCompletable(merged);
    }

    const updated = await this.repository.update(id, updateData);
    if (!updated) throw new NotFoundError("Épico não encontrado.");

    try {
      await auditService.record({
        usuario_id: usuarioId ?? null,
        entidade_tipo: "epico",
        entidade_id: updated.id,
        acao: "atualizacao",
        dados_json: { ...updated },
      });
    } catch {
      // continua caso o log falhe
    }

    return this.enrich(updated);
  }

  async complete(id: string, usuarioId?: string | null): Promise<Epic> {
    this.validateUuid(id, "ID do épico");
    const epic = await this.repository.findById(id);
    if (!epic) throw new NotFoundError("Épico não encontrado.");

    this.ensureCompletable(epic);

    const updated = await this.repository.update(id, { status: "concluido" });
    if (!updated) throw new NotFoundError("Épico não encontrado.");

    try {
      await auditService.record({
        usuario_id: usuarioId ?? null,
        entidade_tipo: "epico",
        entidade_id: updated.id,
        acao: "conclusao",
        dados_json: { ...updated },
      });
    } catch {
      // continua caso o log falhe
    }

    return this.enrich(updated);
  }
}
