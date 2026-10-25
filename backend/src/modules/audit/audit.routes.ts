import { Router, Request, Response, NextFunction } from "express";
import { auditService } from "./audit.service.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validateUuid, ValidationError } from "../../shared/errors.js";
import { z } from "zod";
import { ENTITY_TYPES } from "../quality/quality.types.js";
import { decodeAuditCursor } from "./audit.service.js";
import { VersionsService } from "./versions.service.js";

export const auditRouter = Router();

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
}).strict();

auditRouter.use(requireAuth);

const versions = new VersionsService();
const versionNumber = z.coerce.number().int().positive().max(2147483647);
const versionDate = z.string().datetime({ offset: true })
  .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).getUTCFullYear() >= 1, 'Data inválida.')
  .transform(value => new Date(value).toISOString());
const versionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  before: versionNumber.optional(),
  autor_id: z.string().uuid().optional(),
  desde: versionDate.optional(),
  ate: versionDate.optional(),
}).strict().refine(value => !value.desde || !value.ate || Date.parse(value.desde) <= Date.parse(value.ate), 'Intervalo de datas inválido.');
const compareQuery = z.object({ de: versionNumber, para: versionNumber }).strict();

for (const operation of ['versions', 'versions/compare'] as const) {
  auditRouter.get('/:entidade_tipo/:entidade_id/' + operation, async (req, res, next) => {
    try {
      const kind = z.enum(ENTITY_TYPES).parse(req.params.entidade_tipo);
      const id = z.string().uuid().parse(req.params.entidade_id);
      if (operation === 'versions') {
        const query = versionsQuery.safeParse(req.query);
        if (!query.success) throw new ValidationError('Filtros de versões inválidos.');
        res.json(await versions.list(req.auth!.id,kind,id,query.data));
      } else {
        const query = compareQuery.safeParse(req.query);
        if (!query.success) throw new ValidationError('Selecione duas versões válidas.');
        res.json(await versions.compare(req.auth!.id,kind,id,query.data.de,query.data.para));
      }
    } catch (error) {
      next(error instanceof z.ZodError ? new ValidationError('Item inválido.') : error);
    }
  });
}

function getStringParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

auditRouter.get("/:entidade_tipo/:entidade_id/history", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const entidadeTipo = getStringParam(req.params.entidade_tipo);
    const entidadeId = getStringParam(req.params.entidade_id);
    if (!ENTITY_TYPES.includes(entidadeTipo as (typeof ENTITY_TYPES)[number])) {
      throw new ValidationError("Tipo de entidade inválido.");
    }
    validateUuid(entidadeId, "ID da entidade");
    const parsedQuery = historyQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw new ValidationError("Parâmetros de paginação inválidos.", parsedQuery.error.format());
    }
    const cursor = parsedQuery.data.cursor
      ? decodeAuditCursor(parsedQuery.data.cursor)
      : undefined;
    const history = await auditService.getHistory(
      entidadeTipo as (typeof ENTITY_TYPES)[number],
      entidadeId,
      parsedQuery.data.limit,
      cursor,
    );
    res.status(200).json(history);
  } catch (error) {
    next(error);
  }
});
