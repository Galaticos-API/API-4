import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { ValidationError } from "../../shared/errors.js";
import { MODES, requestSchema } from "./harness.contract.js";
import { HarnessService, describeRevision } from "./harness.service.js";

export function createHarnessAdminRouter(
  service = new HarnessService(),
  authenticate: RequestHandler = requireAuth,
) {
  const router = Router();
  router.use(authenticate, requireRole("admin"));
  const mode = (value: unknown) => {
    const result = z.enum(MODES).safeParse(value);
    if (!result.success) throw new ValidationError("Modo inválido.");
    return result.data;
  };
  router.get("/:mode", async (req, res, next) => {
    try {
      res
        .set("Cache-Control", "no-store")
        .json(describeRevision(await service.current(mode(req.params.mode))));
    } catch (error) {
      next(error);
    }
  });
  router.get("/:mode/history", async (req, res, next) => {
    try {
      const raw = req.query.before;
      if (
        raw !== undefined &&
        (typeof raw !== "string" || !/^[1-9]\d{0,8}$/.test(raw))
      )
        throw new ValidationError("Revisão inválida.");
      const items = await service.history(
        mode(req.params.mode),
        raw ? Number(raw) : undefined,
      );
      res
        .set("Cache-Control", "no-store")
        .json({
          items,
          next_before:
            items.length === 50 ? items[items.length - 1].version : null,
        });
    } catch (error) {
      next(error);
    }
  });
  router.put("/:mode", async (req, res, next) => {
    try {
      const body = z
        .object({
          expected_version: z.number().int().min(0).max(2147483646),
          config: z.unknown(),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success)
        throw new ValidationError(
          "Informe a revisão esperada e a configuração completa.",
        );
      res
        .set("Cache-Control", "no-store")
        .status(201)
        .json(
          describeRevision(
            await service.save(
              mode(req.params.mode),
              body.data.expected_version,
              body.data.config,
              req.auth!.id,
            ),
          ),
        );
    } catch (error) {
      next(error);
    }
  });
  return router;
}
export function createHarnessRunRouter(
  service = new HarnessService(),
  authenticate: RequestHandler = requireAuth,
) {
  const router = Router({ mergeParams: true });
  router.post(
    "/",
    authenticate,
    requireRole("admin", "po"),
    async (req, res, next) => {
      try {
        // O cliente não fornece trechos: o backend recupera somente os do projeto autorizado.
        const body = requestSchema.omit({ context: true }).safeParse(req.body);
        if (!body.success)
          throw new ValidationError("Solicitação de IA inválida.");
        res
          .set("Cache-Control", "no-store")
          .json(
            await service.run(String(req.params.projectId), {
              ...body.data,
              context: [],
            }),
          );
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
