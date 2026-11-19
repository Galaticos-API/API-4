import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { ValidationError, validateUuid } from "../../shared/errors.js";
import { validateTextFields } from "../../shared/text-validation.js";
import { assertNoPersonalDataInText } from "./developers.service.js";
import {
  COMPETENCY_LEVELS,
  CompetenciesRepository,
  type CompetencyInput,
  type CompetencyUpdate,
} from "./competencies.repository.js";
import type { Competency } from "./developers.types.js";

const LEVEL_ALIASES: Record<string, (typeof COMPETENCY_LEVELS)[number]> = {
  iniciante: "iniciante",
  basico: "iniciante",
  "básico": "iniciante",
  intermediario: "intermediario",
  "intermediário": "intermediario",
  avancado: "avancado",
  "avançado": "avancado",
  especialista: "especialista",
};

const levelSchema = z
  .string({ required_error: "Informe o nível da competência." })
  .trim()
  .transform((value, ctx) => {
    const level = LEVEL_ALIASES[value.toLowerCase()];
    if (!level) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Nível inválido. Valores permitidos: ${COMPETENCY_LEVELS.join(", ")}.`,
      });
      return z.NEVER;
    }
    return level;
  });

const evidenceSchema = z
  .string({ required_error: "Informe a evidência que sustenta a competência." })
  .trim()
  .min(10, "Descreva a evidência com pelo menos 10 caracteres (ex.: projeto, entrega ou certificação).")
  .max(2000, "A evidência deve ter no máximo 2000 caracteres.");

const createSchema = z
  .object({
    tecnologia_id: z
      .string({ required_error: "Selecione uma tecnologia do vocabulário." })
      .uuid("Selecione uma tecnologia do vocabulário."),
    nivel: levelSchema,
    evidencia: evidenceSchema,
  })
  .strict()
  .superRefine(validateTextFields);

const updateSchema = z
  .object({ nivel: levelSchema.optional(), evidencia: evidenceSchema.optional() })
  .strict()
  .superRefine(validateTextFields)
  .refine((value) => value.nivel !== undefined || value.evidencia !== undefined, {
    message: "Informe o nível ou a evidência a alterar. Para trocar a tecnologia, registre outra competência.",
  });

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    // Texto livre no lugar do identificador: a tela deve oferecer a inclusão no vocabulário.
    const freeText = issue?.path[0] === "tecnologia_id" && typeof (input as { tecnologia_id?: unknown })?.tecnologia_id === "string";
    throw new ValidationError(issue?.message ?? "Dados da competência inválidos.", {
      issues: result.error.issues.map((item) => ({ field: item.path.join("."), message: item.message })),
      ...(freeText ? { oferecer_inclusao: true } : {}),
    });
  }
  return result.data;
}

type RepositoryPort = Pick<CompetenciesRepository, "create" | "update" | "remove">;

export class CompetenciesService {
  constructor(private readonly repository: RepositoryPort = new CompetenciesRepository()) {}

  create(developerId: string, input: unknown, actorUserId: string): Promise<Competency> {
    validateUuid(developerId, "ID do perfil profissional");
    const data: CompetencyInput = parse(createSchema, input);
    assertNoPersonalDataInText("evidência", data.evidencia);
    return this.repository.create(developerId, data, actorUserId);
  }

  update(developerId: string, competencyId: string, input: unknown, actorUserId: string): Promise<Competency> {
    validateUuid(developerId, "ID do perfil profissional");
    validateUuid(competencyId, "ID da competência");
    const data: CompetencyUpdate = parse(updateSchema, input);
    assertNoPersonalDataInText("evidência", data.evidencia);
    return this.repository.update(developerId, competencyId, data, actorUserId);
  }

  remove(developerId: string, competencyId: string, actorUserId: string): Promise<void> {
    validateUuid(developerId, "ID do perfil profissional");
    validateUuid(competencyId, "ID da competência");
    return this.repository.remove(developerId, competencyId, actorUserId);
  }
}

export class CompetenciesController {
  constructor(private readonly service: CompetenciesService = new CompetenciesService()) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await this.service.create(String(req.params.id ?? ""), req.body, req.auth!.id));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(
        await this.service.update(
          String(req.params.id ?? ""),
          String(req.params.competencyId ?? ""),
          req.body,
          req.auth!.id,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.remove(String(req.params.id ?? ""), String(req.params.competencyId ?? ""), req.auth!.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
