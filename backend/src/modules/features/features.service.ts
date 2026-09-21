import { createFeatureSchema, updateFeatureSchema, featureQuerySchema, Feature, FeatureWithStats, PaginatedFeatures, FEATURE_REQUIRED_FIELDS } from "./features.types.js";
import { FeaturesRepository, featuresRepository } from "./features.repository.js";
import { EpicsRepository, epicsRepository } from "../epics/epics.repository.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";

export class FeaturesService {
  constructor(
    private readonly repository: FeaturesRepository = featuresRepository,
    private readonly epicsRepo: EpicsRepository = epicsRepository,
  ) {}

  async create(input: unknown, usuarioId?: string | null): Promise<Feature> {
    const parseResult = createFeatureSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const dto = parseResult.data;

    const epico = await this.epicsRepo.findById(dto.epico_id);
    if (!epico) {
      throw new NotFoundError("Épico não encontrado.");
    }
    if (epico.status === "ativo" || epico.status === "arquivado") {
      throw new ValidationError("Não é possível cadastrar features em um épico com estado legado.");
    }
    if (epico.projeto_status === "arquivado") {
      throw new ValidationError("Não é possível cadastrar features em um projeto arquivado.");
    }

    return await this.repository.create(dto, usuarioId);
  }

  async list(queryInput: unknown): Promise<PaginatedFeatures> {
    const parseResult = featureQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    return await this.repository.findAll(parseResult.data);
  }

  async getById(id: string): Promise<FeatureWithStats> {
    validateUuid(id, "ID da feature");

    const feature = await this.repository.findById(id);
    if (!feature) {
      throw new NotFoundError("Feature não encontrada.");
    }

    return feature;
  }

  async update(id: string, input: unknown, usuarioId?: string | null): Promise<FeatureWithStats> {
    validateUuid(id, "ID da feature");

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Feature não encontrada.");
    }
    this.assertProjetoAtivo(existing);

    const parseResult = updateFeatureSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const updated = await this.repository.update(id, parseResult.data, usuarioId);
    if (!updated) {
      throw new NotFoundError("Feature não encontrada.");
    }

    return updated;
  }

  async complete(id: string, usuarioId?: string | null): Promise<FeatureWithStats> {
    validateUuid(id, "ID da feature");

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Feature não encontrada.");
    }
    this.assertProjetoAtivo(existing);
    if (existing.status === "concluido") {
      return existing;
    }

    const camposFaltantes: string[] = FEATURE_REQUIRED_FIELDS.filter(
      (field) => !existing[field] || String(existing[field]).trim().length === 0,
    );

    if (camposFaltantes.length > 0) {
      throw new ValidationError(
        "Não é possível concluir a feature: preencha os campos obrigatórios do guia antes de concluir.",
        { campos_faltantes: camposFaltantes },
      );
    }

    const completed = await this.repository.markConcluded(id, usuarioId);
    if (!completed) {
      throw new NotFoundError("Feature não encontrada.");
    }

    return completed;
  }

  private assertProjetoAtivo(feature: FeatureWithStats): void {
    if (feature.projeto_status === "arquivado") {
      throw new ValidationError("Não é possível alterar features de um projeto arquivado.");
    }
  }
}

export const featuresService = new FeaturesService();
