import { createPbiSchema, updatePbiSchema, pbiQuerySchema, Pbi, PbiWithContext, PaginatedPbis } from "./pbis.types.js";
import { PbisRepository, pbisRepository } from "./pbis.repository.js";
import { FeaturesRepository, featuresRepository } from "../features/features.repository.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";

export class PbisService {
  constructor(
    private readonly repository: PbisRepository = pbisRepository,
    private readonly featuresRepo: FeaturesRepository = featuresRepository,
  ) {}

  async create(input: unknown, usuarioId?: string | null): Promise<Pbi> {
    const parseResult = createPbiSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const dto = parseResult.data;

    const feature = await this.featuresRepo.findById(dto.feature_id);
    if (!feature) {
      throw new NotFoundError("Feature não encontrada.");
    }

    return await this.repository.create(dto, usuarioId);
  }

  async list(queryInput: unknown): Promise<PaginatedPbis> {
    const parseResult = pbiQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    return await this.repository.findAll(parseResult.data);
  }

  async getById(id: string): Promise<PbiWithContext> {
    validateUuid(id, "ID do PBI");

    const pbi = await this.repository.findById(id);
    if (!pbi) {
      throw new NotFoundError("PBI não encontrado.");
    }

    return pbi;
  }

  async update(id: string, input: unknown, usuarioId?: string | null): Promise<PbiWithContext> {
    validateUuid(id, "ID do PBI");

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("PBI não encontrado.");
    }

    const parseResult = updatePbiSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const updated = await this.repository.update(id, parseResult.data, usuarioId);
    if (!updated) {
      throw new NotFoundError("PBI não encontrado.");
    }

    return updated;
  }

  async complete(id: string, usuarioId?: string | null): Promise<PbiWithContext> {
    validateUuid(id, "ID do PBI");

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("PBI não encontrado.");
    }
    if (existing.status === "concluido") {
      return existing;
    }

    if ((existing.criterios_count ?? 0) === 0) {
      throw new ValidationError(
        "Não é possível concluir o PBI: é necessário ao menos um cenário de aceitação DADO/QUANDO/ENTÃO.",
        { campos_faltantes: ["cenarios_aceitacao"] },
      );
    }

    const completed = await this.repository.markConcluded(id, usuarioId);
    if (!completed) {
      throw new NotFoundError("PBI não encontrado.");
    }

    return completed;
  }
}

export const pbisService = new PbisService();
