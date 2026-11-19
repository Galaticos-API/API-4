import { z } from "zod";
import { ValidationError, validateUuid } from "../../shared/errors.js";
import { TechnologiesRepository } from "./technologies.repository.js";
import {
  TECHNOLOGY_CATEGORIES,
  normalizeTechnologyName,
  type CreateTechnologyInput,
  type Technology,
  type TechnologyUsage,
  type UpdateTechnologyInput,
} from "./technologies.types.js";

const nameSchema = z
  .string({ required_error: "Informe o nome da tecnologia." })
  .trim()
  .min(1, "Informe o nome da tecnologia.")
  .max(100, "O nome da tecnologia deve ter no máximo 100 caracteres.")
  .refine((value) => normalizeTechnologyName(value).length > 0, {
    message: "O nome da tecnologia deve conter ao menos uma letra ou número.",
  });

const categorySchema = z.enum(TECHNOLOGY_CATEGORIES, {
  errorMap: () => ({ message: `Categoria inválida. Valores permitidos: ${TECHNOLOGY_CATEGORIES.join(", ")}.` }),
});

const createSchema = z.object({ nome: nameSchema, categoria: categorySchema }).strict();
const updateSchema = z
  .object({ nome: nameSchema.optional(), categoria: categorySchema.optional() })
  .strict()
  .refine((value) => value.nome !== undefined || value.categoria !== undefined, {
    message: "Informe o nome ou a categoria a alterar.",
  });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Dados da tecnologia inválidos.", {
      issues: result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }
  return result.data;
}

type RepositoryPort = Pick<TechnologiesRepository, "list"> &
  Partial<Pick<TechnologiesRepository, "create" | "update" | "remove">>;

export class TechnologiesService {
  constructor(private readonly repository: RepositoryPort = new TechnologiesRepository()) {}

  list(search?: unknown): Promise<Technology[]> {
    const term = typeof search === "string" ? search.trim().slice(0, 100) : undefined;
    return this.repository.list(term || undefined);
  }

  create(input: unknown, actorUserId: string): Promise<Technology> {
    const data: CreateTechnologyInput = parse(createSchema, input);
    return this.repository.create!(data, actorUserId);
  }

  update(id: string, input: unknown, actorUserId: string): Promise<Technology> {
    validateUuid(id, "Identificador da tecnologia");
    const data: UpdateTechnologyInput = parse(updateSchema, input);
    return this.repository.update!(id, data, actorUserId);
  }

  remove(id: string, confirmation: unknown, actorUserId: string): Promise<TechnologyUsage> {
    validateUuid(id, "Identificador da tecnologia");
    let confirmed: number | undefined;
    if (confirmation !== undefined && confirmation !== null && confirmation !== "") {
      const parsed = Number(confirmation);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ValidationError("A confirmação deve ser a quantidade de associações exibida.");
      }
      confirmed = parsed;
    }
    return this.repository.remove!(id, confirmed, actorUserId);
  }
}
