import { createPbiSchema, updatePbiSchema, pbiQuerySchema, Pbi, PbiWithContext, PaginatedPbis } from "./pbis.types.js";
import { PbisRepository, pbisRepository } from "./pbis.repository.js";
import { FeaturesRepository, featuresRepository } from "../features/features.repository.js";
import { QualityService, qualityService, RelatorioQualidadePbi } from "../quality/quality.service.js";
import { QualityConfigurationRepository, qualityConfigurationRepository } from "../quality/quality.configuration.repository.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";

const COMPLETION_BLOCKING_FIELDS: Record<string, string> = {
  titulo_infinitivo: "titulo_infinitivo",
  historia_completa: "historia_completa",
  cenario_estruturado: "cenarios_aceitacao",
};

export class PbisService {
  constructor(
    private readonly repository: PbisRepository = pbisRepository,
    private readonly featuresRepo: FeaturesRepository = featuresRepository,
    private readonly qualityChecker: QualityService = qualityService,
    private readonly qualityConfigRepo: QualityConfigurationRepository = qualityConfigurationRepository,
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

    if (feature.projeto_status === "arquivado") {
      throw new ValidationError("Não é possível cadastrar PBIs em um projeto arquivado.");
    }

    const created = await this.repository.create(dto, usuarioId);

    const qualityReport = await this.qualityChecker.validatePbi(created.id);
    created.score_completude = qualityReport.score_completude;

    return created;
  }

  async list(queryInput: unknown): Promise<PaginatedPbis> {
    const parseResult = pbiQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    const page = await this.repository.findAll(parseResult.data);
    const reports = await this.qualityChecker.validatePbis(page.items);

    const items = page.items.map((pbi) => ({
      ...pbi,
      score_completude: reports.get(pbi.id)?.score_completude ?? null,
    }));

    return { ...page, items };
  }

  async getById(id: string): Promise<PbiWithContext> {
    validateUuid(id, "ID do PBI");

    const pbi = await this.repository.findById(id);
    if (!pbi) {
      throw new NotFoundError("PBI não encontrado.");
    }

    const report = await this.qualityChecker.validatePbi(id);

    return {
      ...pbi,
      score_completude: report.score_completude,
    };
  }

  async update(
    id: string,
    input: unknown,
    usuarioId?: string | null,
  ): Promise<PbiWithContext> {
    validateUuid(id, "ID do PBI");

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("PBI não encontrado.");
    }

    this.assertProjetoAtivo(existing);

    const parseResult = updatePbiSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      throw new ValidationError(issue.message, parseResult.error.format());
    }

    if (existing.status === "concluido") {
      const config = await this.qualityConfigRepo.getPbiConfiguration();
      if (config.exigir_justificativa_item_concluido && !parseResult.data.justificativa?.trim()) {
        throw new ValidationError("A justificativa é obrigatória ao alterar um item concluído.", { code: "JUSTIFICATIVA_REQUERIDA", campo: "justificativa" });
      }
    }

    const updated = await this.repository.update(
      id,
      parseResult.data,
      usuarioId,
    );

    if (!updated) {
      throw new NotFoundError("PBI não encontrado.");
    }

    const qualityReport = await this.qualityChecker.validatePbi(id);
    updated.score_completude = qualityReport.score_completude;

    return updated;
  }

  async complete(
    id: string,
    usuarioId?: string | null,
  ): Promise<PbiWithContext> {
    validateUuid(id, "ID do PBI");

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("PBI não encontrado.");
    }

    this.assertProjetoAtivo(existing);

    if (existing.status === "concluido") {
      return existing;
    }

    // O relatório contém somente as verificações ativas e aplicáveis da
    // configuração vigente. Alertas informativos não fazem parte deste mapa e,
    // portanto, nunca impedem a conclusão.
    const qualityReport = await this.qualityChecker.validatePbi(id);

    const camposFaltantes = qualityReport.checks
      .filter(
        (check) =>
          !check.passed
          && COMPLETION_BLOCKING_FIELDS[check.check_id],
      )
      .map(
        (check) =>
          COMPLETION_BLOCKING_FIELDS[check.check_id],
      );

    if (camposFaltantes.length > 0) {
      throw new ValidationError(
        "Não é possível concluir o PBI: corrija os itens de conformidade com o guia antes de concluir.",
        { campos_faltantes: camposFaltantes },
      );
    }

    const completed = await this.repository.markConcluded(id, usuarioId);

    if (!completed) {
      throw new NotFoundError("PBI não encontrado.");
    }

    return completed;
  }

  async quality(id: string): Promise<RelatorioQualidadePbi> {
    validateUuid(id, "ID do PBI");

    const pbi = await this.repository.findById(id);

    if (!pbi) {
      throw new NotFoundError("PBI não encontrado.");
    }

    return await this.qualityChecker.avaliarPbi(pbi);
  }

  private assertProjetoAtivo(pbi: PbiWithContext): void {
    if (pbi.projeto_status === "arquivado") {
      throw new ValidationError(
        "Não é possível alterar PBIs de um projeto arquivado.",
      );
    }
  }
}

export const pbisService = new PbisService();