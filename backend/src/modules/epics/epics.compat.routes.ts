import { Router, type Request, type Response, type NextFunction } from "express";
import { EpicsService, epicsService } from "./epics.service.js";
import { requireRole } from "../../middleware/requireRole.js";
import { ValidationError, validateUuid } from "../../shared/errors.js";
import { EPIC_REQUIRED_FIELDS, type EpicWithStats } from "./epics.types.js";

// Temporary transport compatibility only. All business rules and writes live in EpicsService.
const labels: Record<string, string> = {
  titulo: "título", descricao: "descrição", objetivo: "objetivo",
  escopo_macro: "escopo macro", resultado_esperado: "resultado esperado",
  criterios_aceitacao: "critérios de aceitação",
};
function legacyResponse(epic: EpicWithStats) {
  return { ...epic, priorizacao: epic.prioridade,
    missing_fields: ["titulo", ...EPIC_REQUIRED_FIELDS].filter(
      (field) => !String(epic[field as keyof EpicWithStats] ?? "").trim(),
    ).map((field) => labels[field]),
  };
}
function input(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Corpo da requisição inválido.");
  }
  const data = body as Record<string, unknown>;
  return { ...data, prioridade: data.prioridade ?? data.priorizacao };
}

export function createEpicsCompatRouter(service: EpicsService = epicsService) {
  const router = Router();
  const canWrite = requireRole("admin", "po");
  const handle = (action: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try { await action(req, res); } catch (error) {
        if (error instanceof ValidationError) {
          const details = error.details as { campos_faltantes?: string[] } | undefined;
          if (details?.campos_faltantes) {
            return next(new ValidationError(error.message, { ...details,
              missing: details.campos_faltantes.map((field) => labels[field] ?? field),
            }));
          }
        }
        next(error);
      }
    };
  router.get("/projects/:projectId/epicos", handle(async (req, res) => {
    const projectId = String(req.params.projectId);
    validateUuid(projectId, "ID do projeto");
    const items: EpicWithStats[] = [];
    // The old contract is an unpaginated array; never silently truncate it to 100 records.
    for (let offset = 0; ; offset += 100) {
      const page = await service.list({ projeto_id: projectId, limit: 100, offset });
      items.push(...page.items);
      if (page.items.length < 100 || items.length >= page.total) break;
    }
    res.json(items.map(legacyResponse));
  }));
  router.post("/projects/:projectId/epicos", canWrite, handle(async (req, res) => {
    res.status(201).json(legacyResponse(await service.create({ ...input(req.body),
      projeto_id: String(req.params.projectId) }, req.auth?.id)));
  }));
  router.get("/epicos/:id", handle(async (req, res) => {
    res.json(legacyResponse(await service.getById(String(req.params.id))));
  }));
  router.patch("/epicos/:id", canWrite, handle(async (req, res) => {
    res.json(legacyResponse(await service.update(String(req.params.id), input(req.body), req.auth?.id)));
  }));
  router.patch("/epicos/:id/complete", canWrite, handle(async (req, res) => {
    res.json(legacyResponse(await service.complete(String(req.params.id), req.auth?.id)));
  }));
  return router;
}

export const epicsCompatRouter = createEpicsCompatRouter();
