import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { ValidationError, validateUuid } from "../../shared/errors.js";
import { validateTextFields } from "../../shared/text-validation.js";
import { assertNoPersonalDataInText } from "./developers.service.js";
import {
  AllocationsRepository,
  type AllocationInput,
  type AllocationUpdate,
} from "./allocations.repository.js";
import type { DeveloperAllocation } from "./developers.types.js";

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1990 && year <= 2100 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const dateSchema = (label: string) =>
  z
    .string({ required_error: `Informe a ${label}.` })
    .trim()
    .refine(isCalendarDate, `A ${label} deve ser uma data válida no formato AAAA-MM-DD.`);

const roleSchema = z
  .string({ required_error: "Informe o papel na alocação." })
  .trim()
  .min(2, "Informe o papel na alocação (ex.: Desenvolvedor backend, Tech Lead).")
  .max(100, "O papel deve ter no máximo 100 caracteres.");

const createSchema = z
  .object({
    projeto_id: z
      .string({ required_error: "Selecione o projeto da alocação." })
      .uuid("Selecione um projeto existente para a alocação."),
    papel: roleSchema,
    data_inicio: dateSchema("data de início"),
    // Sem término: alocação em andamento (PBI-05.1.3, cenário 2).
    data_fim: dateSchema("data de término").nullable().optional(),
  })
  .strict()
  .superRefine(validateTextFields);

const updateSchema = z
  .object({
    papel: roleSchema.optional(),
    data_inicio: dateSchema("data de início").optional(),
    data_fim: dateSchema("data de término").nullable().optional(),
  })
  .strict()
  .superRefine(validateTextFields)
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe o papel ou o período a alterar. Para trocar o projeto, registre outra alocação.",
  });

function assertPeriod(start: string | undefined, end: string | null | undefined): void {
  if (start && end && end < start) {
    throw new ValidationError("A data de término não pode ser anterior à data de início.", {
      field: "data_fim",
      data_inicio: start,
      data_fim: end,
    });
  }
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Dados da alocação inválidos.", {
      issues: result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }
  return result.data;
}

type RepositoryPort = Pick<AllocationsRepository, "create" | "update" | "remove">;

export class AllocationsService {
  constructor(private readonly repository: RepositoryPort = new AllocationsRepository()) {}

  create(developerId: string, input: unknown, actorUserId: string): Promise<DeveloperAllocation> {
    validateUuid(developerId, "ID do perfil profissional");
    const data = parse(createSchema, input);
    assertPeriod(data.data_inicio, data.data_fim);
    assertNoPersonalDataInText("papel", data.papel);
    const clean: AllocationInput = { ...data, data_fim: data.data_fim ?? null };
    return this.repository.create(developerId, clean, actorUserId);
  }

  update(developerId: string, allocationId: string, input: unknown, actorUserId: string): Promise<DeveloperAllocation> {
    validateUuid(developerId, "ID do perfil profissional");
    validateUuid(allocationId, "ID da alocação");
    const data: AllocationUpdate = parse(updateSchema, input);
    // A checagem final do período usa as datas gravadas e acontece no repositório.
    assertPeriod(data.data_inicio, data.data_fim);
    assertNoPersonalDataInText("papel", data.papel);
    return this.repository.update(developerId, allocationId, data, actorUserId);
  }

  remove(developerId: string, allocationId: string, actorUserId: string): Promise<void> {
    validateUuid(developerId, "ID do perfil profissional");
    validateUuid(allocationId, "ID da alocação");
    return this.repository.remove(developerId, allocationId, actorUserId);
  }
}

export class AllocationsController {
  constructor(private readonly service: AllocationsService = new AllocationsService()) {}

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
        await this.service.update(String(req.params.id ?? ""), String(req.params.allocationId ?? ""), req.body, req.auth!.id),
      );
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.remove(String(req.params.id ?? ""), String(req.params.allocationId ?? ""), req.auth!.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
