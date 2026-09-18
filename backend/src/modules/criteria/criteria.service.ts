import { createCriterionSchema, criterionQuerySchema, moveCriterionSchema, Criterion } from "./criteria.types.js";
import { CriteriaRepository, criteriaRepository } from "./criteria.repository.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";

export class CriteriaService {
  constructor(private readonly repository: CriteriaRepository = criteriaRepository) {}

  async create(input: unknown, usuarioId?: string | null): Promise<Criterion> {
    const parseResult = createCriterionSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const dto = parseResult.data;

    const entityExists = await this.repository.entityExists(dto.entidade_tipo, dto.entidade_id);
    if (!entityExists) {
      throw new NotFoundError(`${this.entityLabel(dto.entidade_tipo)} não encontrado.`);
    }

    return await this.repository.create(dto, usuarioId);
  }

  async list(queryInput: unknown): Promise<Criterion[]> {
    const parseResult = criterionQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const { entidade_tipo, entidade_id } = parseResult.data;
    return await this.repository.listByEntity(entidade_tipo, entidade_id);
  }

  async delete(id: string, usuarioId?: string | null): Promise<Criterion> {
    validateUuid(id, "ID do critério");

    const removed = await this.repository.delete(id, usuarioId);
    if (!removed) {
      throw new NotFoundError("Critério não encontrado.");
    }

    return removed;
  }

  async move(id: string, input: unknown, usuarioId?: string | null): Promise<Criterion[]> {
    validateUuid(id, "ID do critério");

    const parseResult = moveCriterionSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const lista = await this.repository.move(id, parseResult.data.direction, usuarioId);
    if (!lista) {
      throw new NotFoundError("Critério não encontrado.");
    }

    return lista;
  }

  private entityLabel(tipo: "epico" | "feature" | "pbi"): string {
    if (tipo === "epico") return "Épico";
    if (tipo === "feature") return "Feature";
    return "PBI";
  }
}

export const criteriaService = new CriteriaService();
