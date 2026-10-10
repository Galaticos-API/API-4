import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { SuggestionsRepository } from "./suggestions.repository.js";
import {
  createSuggestionSchema,
  resolveAcceptSchema,
  resolveEditSchema,
  type ResolveSuggestionInput,
  type SuggestibleEntityType,
  type SuggestionRow,
} from "./suggestions.types.js";

const LABELS: Record<SuggestibleEntityType, string> = { epico: "épico", feature: "feature", pbi: "PBI" };

function zodMessage(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

export class SuggestionsService {
  constructor(private readonly repository: SuggestionsRepository = new SuggestionsRepository()) {}

  async list(kind: SuggestibleEntityType, entityId: string): Promise<SuggestionRow[]> {
    validateUuid(entityId, `ID do ${LABELS[kind]}`);
    if (!(await this.repository.entityExists(kind, entityId))) {
      throw new NotFoundError(`${LABELS[kind][0].toUpperCase()}${LABELS[kind].slice(1)} não encontrado.`);
    }
    return this.repository.listForEntity(kind, entityId);
  }

  async create(kind: SuggestibleEntityType, entityId: string, usuarioId: string, body: unknown): Promise<SuggestionRow> {
    validateUuid(entityId, `ID do ${LABELS[kind]}`);
    const parsed = createSuggestionSchema(kind).safeParse(body);
    if (!parsed.success) throw new ValidationError(zodMessage(parsed.error), parsed.error.flatten().fieldErrors);
    return this.repository.create({
      entidadeTipo: kind,
      entidadeId: entityId,
      campo: parsed.data.campo,
      valorSugerido: parsed.data.valor_sugerido,
      origem: parsed.data.origem?.trim() || "manual",
      usuarioId,
    });
  }

  private async requireSuggestion(kind: SuggestibleEntityType, entityId: string, suggestionId: string): Promise<SuggestionRow> {
    validateUuid(entityId, `ID do ${LABELS[kind]}`);
    validateUuid(suggestionId, "ID da sugestão");
    const suggestion = await this.repository.findOne(kind, entityId, suggestionId);
    if (!suggestion) throw new NotFoundError("Sugestão não encontrada.");
    return suggestion;
  }

  async accept(kind: SuggestibleEntityType, entityId: string, suggestionId: string, usuarioId: string, body: unknown): Promise<SuggestionRow> {
    const suggestion = await this.requireSuggestion(kind, entityId, suggestionId);
    const parsed = resolveAcceptSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError(zodMessage(parsed.error), parsed.error.flatten().fieldErrors);
    return this.resolve(kind, entityId, suggestionId, usuarioId, "aceita", suggestion.valor_sugerido, parsed.data.justificativa ?? null);
  }

  async edit(kind: SuggestibleEntityType, entityId: string, suggestionId: string, usuarioId: string, body: unknown): Promise<SuggestionRow> {
    const suggestion = await this.requireSuggestion(kind, entityId, suggestionId);
    const parsed = resolveEditSchema(suggestion.campo).safeParse(body);
    if (!parsed.success) throw new ValidationError(zodMessage(parsed.error), parsed.error.flatten().fieldErrors);
    return this.resolve(kind, entityId, suggestionId, usuarioId, "editada", parsed.data.valor, parsed.data.justificativa ?? null);
  }

  async discard(kind: SuggestibleEntityType, entityId: string, suggestionId: string, usuarioId: string): Promise<SuggestionRow> {
    await this.requireSuggestion(kind, entityId, suggestionId);
    return this.resolve(kind, entityId, suggestionId, usuarioId, "descartada", null, null);
  }

  private async resolve(
    kind: SuggestibleEntityType,
    entityId: string,
    suggestionId: string,
    usuarioId: string,
    resolution: ResolveSuggestionInput["resolution"],
    valor: string | null,
    justificativa: string | null,
  ): Promise<SuggestionRow> {
    return this.repository.resolve({ entidadeTipo: kind, entidadeId: entityId, suggestionId, resolution, valor, justificativa, usuarioId });
  }
}

export const suggestionsService = new SuggestionsService();
