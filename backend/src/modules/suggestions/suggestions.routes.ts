import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { ValidationError } from "../../shared/errors.js";
import { SuggestionsService, suggestionsService } from "./suggestions.service.js";
import type { SuggestibleEntityType } from "./suggestions.types.js";

export function createSuggestionsRouter(
  tipo: SuggestibleEntityType,
  service: SuggestionsService = suggestionsService,
  authentication: RequestHandler = requireAuth,
  canWrite: RequestHandler = requireRole("admin", "po"),
): Router {
  const router = Router({ mergeParams: true });
  router.use(authentication);

  function requireUser(req: Request): string {
    if (!req.auth?.id) throw new ValidationError("Autenticação necessária.");
    return req.auth.id;
  }

  /**
   * @swagger
   * /api/v1/{nivel}/{id}/suggestions:
   *   get:
   *     summary: Lista as sugestões da IA para o item (S2-13)
   *     tags: [Suggestions]
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Sugestões do item, pendentes primeiro
   *       404:
   *         description: Item não encontrado
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ items: await service.list(tipo, String(req.params.entityId)) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/v1/{nivel}/{id}/suggestions:
   *   post:
   *     summary: Propõe uma sugestão para um campo do item (S2-13)
   *     description: >
   *       Staging da IA: nunca altera o item sozinha. Uma nova proposta para o
   *       mesmo campo substitui a sugestão pendente existente (idempotente).
   *     tags: [Suggestions]
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       201:
   *         description: Sugestão pendente criada ou atualizada
   *       400:
   *         description: Campo fora do permitido ou valor inválido
   *       403:
   *         description: Perfil sem permissão de escrita
   *       404:
   *         description: Item não encontrado
   */
  router.post("/", canWrite, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await service.create(tipo, String(req.params.entityId), requireUser(req), req.body));
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/v1/{nivel}/{id}/suggestions/{suggestionId}/accept:
   *   post:
   *     summary: Aceita a sugestão e aplica o valor sugerido ao item (S2-13)
   *     description: >
   *       Repetir a mesma aceitação é idempotente (200, sem duplicar). Já
   *       resolvida de outra forma retorna 409. Marca o campo como
   *       ai-accepted na proveniência.
   *     tags: [Suggestions]
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Sugestão aceita e campo atualizado
   *       400:
   *         description: Justificativa obrigatória em item concluído
   *       403:
   *         description: Perfil sem permissão de escrita
   *       404:
   *         description: Item ou sugestão não encontrados
   *       409:
   *         description: Item arquivado ou sugestão já resolvida de outra forma
   */
  router.post("/:suggestionId/accept", canWrite, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await service.accept(tipo, String(req.params.entityId), String(req.params.suggestionId), requireUser(req), req.body));
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/v1/{nivel}/{id}/suggestions/{suggestionId}/edit:
   *   post:
   *     summary: Edita a sugestão antes de aplicá-la ao item (S2-13)
   *     description: >
   *       Repetir a mesma edição é idempotente (200). Marca o campo como
   *       ai-edited na proveniência, preservando o texto originalmente
   *       sugerido para referência.
   *     tags: [Suggestions]
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Sugestão editada e campo atualizado com o novo valor
   *       400:
   *         description: Valor editado vazio, longo demais ou justificativa obrigatória
   *       403:
   *         description: Perfil sem permissão de escrita
   *       404:
   *         description: Item ou sugestão não encontrados
   *       409:
   *         description: Item arquivado ou sugestão já resolvida de outra forma
   */
  router.post("/:suggestionId/edit", canWrite, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await service.edit(tipo, String(req.params.entityId), String(req.params.suggestionId), requireUser(req), req.body));
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/v1/{nivel}/{id}/suggestions/{suggestionId}/discard:
   *   post:
   *     summary: Descarta a sugestão sem alterar o item (S2-13)
   *     description: Repetir o descarte é idempotente (200). Nunca escreve no item.
   *     tags: [Suggestions]
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Sugestão descartada
   *       403:
   *         description: Perfil sem permissão de escrita
   *       404:
   *         description: Item ou sugestão não encontrados
   *       409:
   *         description: Sugestão já resolvida de outra forma
   */
  router.post("/:suggestionId/discard", canWrite, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await service.discard(tipo, String(req.params.entityId), String(req.params.suggestionId), requireUser(req)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const epicSuggestionsRouter = createSuggestionsRouter("epico");
export const featureSuggestionsRouter = createSuggestionsRouter("feature");
export const pbiSuggestionsRouter = createSuggestionsRouter("pbi");
