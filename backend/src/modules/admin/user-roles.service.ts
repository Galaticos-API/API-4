import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { validateTextFields } from "../../shared/text-validation.js";
import { ValidationError, validateUuid } from "../../shared/errors.js";
import { USER_ROLES, type UserRole } from "../auth/auth.types.js";
import {
  userRolesRepository,
  type PlatformUserRole,
  type RoleChangeResult,
  type UserRolesRepository,
} from "./user-roles.repository.js";

const changeRoleSchema = z
  .object({
    role: z.enum(USER_ROLES, {
      errorMap: () => ({ message: "Perfil de acesso inválido. Use admin, po ou dev." }),
    }),
    justificativa: z.string().trim().max(2000, "A justificativa deve ter no máximo 2000 caracteres.").optional(),
  })
  .strict()
  .superRefine(validateTextFields);

export const NEXT_ACCESS_MESSAGE =
  "Perfil atualizado. As novas permissões valem a partir do próximo acesso do usuário.";

export class UserRolesService {
  constructor(private readonly repository: Pick<UserRolesRepository, "listUsers" | "changeRole"> = userRolesRepository) {}

  listUsers(): Promise<PlatformUserRole[]> {
    return this.repository.listUsers();
  }

  async changeRole(targetUserId: string, input: unknown, actorId: string): Promise<RoleChangeResult & { message: string }> {
    validateUuid(targetUserId, "ID do usuário");
    const parsed = changeRoleSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
    }
    const role: UserRole = parsed.data.role;
    const result = await this.repository.changeRole(targetUserId, role, actorId, parsed.data.justificativa || null);
    return {
      ...result,
      message: result.alterado ? NEXT_ACCESS_MESSAGE : "O usuário já possui este perfil. Nada foi alterado.",
    };
  }
}

export class UserRolesController {
  constructor(private readonly service: UserRolesService = new UserRolesService()) {}

  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ usuarios: await this.service.listUsers() });
    } catch (error) {
      next(error);
    }
  };

  changeRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      res.json(await this.service.changeRole(id, req.body, req.auth!.id));
    } catch (error) {
      next(error);
    }
  };
}
