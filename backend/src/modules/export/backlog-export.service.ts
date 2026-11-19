import { ConflictError, NotFoundError, validateUuid } from "../../shared/errors.js";
import { ARCHIVED_STATUS, epicMarkdownDocument, featureMarkdownDocument } from "./backlog-export.markdown.js";
import { backlogExportRepository, type BacklogExportReader } from "./backlog-export.repository.js";
import type { MarkdownDocument } from "./backlog-export.types.js";

// Decisão S3-15: a exportação serve para compartilhar a especificação vigente. Itens
// arquivados continuam consultáveis na plataforma, mas não entram no arquivo: filhos
// arquivados são omitidos e pedir a exportação de um item arquivado (ou de um item cujo
// épico ou projeto está arquivado) devolve 409.
const ARCHIVED_MESSAGE = "Itens arquivados não podem ser exportados.";

export class BacklogExportService {
  constructor(private readonly reader: BacklogExportReader = backlogExportRepository) {}

  async exportEpic(id: string): Promise<MarkdownDocument> {
    validateUuid(id, "ID do épico");
    const record = await this.reader.loadEpic(id);
    if (!record) throw new NotFoundError("Épico não encontrado.");
    if (record.epic.status === ARCHIVED_STATUS || record.projeto_status === ARCHIVED_STATUS) {
      throw new ConflictError(ARCHIVED_MESSAGE);
    }
    return epicMarkdownDocument(record.epic);
  }

  async exportFeature(id: string): Promise<MarkdownDocument> {
    validateUuid(id, "ID da feature");
    const record = await this.reader.loadFeature(id);
    if (!record) throw new NotFoundError("Feature não encontrada.");
    if ([record.feature.status, record.epic.status, record.projeto_status].includes(ARCHIVED_STATUS)) {
      throw new ConflictError(ARCHIVED_MESSAGE);
    }
    return featureMarkdownDocument(record.epic, record.feature);
  }
}

export const backlogExportService = new BacklogExportService();
