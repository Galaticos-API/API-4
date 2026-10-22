import { z } from "zod";
import { ValidationError, validateUuid } from "../../shared/errors.js";
import {
  PbiRelationsRepository,
  pbiRelationsRepository,
  type PbiRelationType,
  type PbiRelationView,
} from "./pbis.relations.repository.js";

export const createRelationSchema = z
  .object({
    pbi_destino_id: z.string({ required_error: "O PBI de destino é obrigatório." }).uuid("O PBI de destino deve ser um UUID válido."),
    tipo_relacao: z
      .string({ required_error: "O tipo de relação é obrigatório." })
      .trim()
      .transform((val) => val.toLowerCase().replace(/\s+/g, "_"))
      .pipe(
        z.enum(["depende_de", "similar_a", "substitui"], {
          errorMap: () => ({ message: "O tipo de relação deve ser 'depende_de', 'similar_a' ou 'substitui'." }),
        }),
      ),
  })
  .strict();

export class PbiRelationsService {
  constructor(private readonly repository: PbiRelationsRepository = pbiRelationsRepository) {}

  async list(pbiId: string, userId: string): Promise<{ items: PbiRelationView[]; total: number }> {
    validateUuid(pbiId, "ID do PBI");
    const items = await this.repository.listRelations(pbiId, userId);
    return { items, total: items.length };
  }

  async create(pbiOrigemId: string, input: unknown, userId: string): Promise<PbiRelationView> {
    validateUuid(pbiOrigemId, "ID do PBI de origem");

    const parsed = createRelationSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError(issue?.message ?? "Dados da relação inválidos.", parsed.error.format());
    }

    return await this.repository.createRelation(
      pbiOrigemId,
      parsed.data.pbi_destino_id,
      parsed.data.tipo_relacao as PbiRelationType,
      userId,
    );
  }

  async remove(pbiId: string, relationId: string, userId: string): Promise<void> {
    validateUuid(pbiId, "ID do PBI");
    validateUuid(relationId, "ID da relação");
    await this.repository.deleteRelation(pbiId, relationId, userId);
  }
}

export const pbiRelationsService = new PbiRelationsService();
