import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { ValidationError } from "../../shared/errors.js";
import { ChatService } from "./chat.service.js";
import { RagService,ragInput } from './rag.service.js';

function userId(req: Request): string {
  if (!req.auth?.id) throw new ValidationError("Autenticação necessária.");
  return req.auth.id;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createChatRouter(service: ChatService = new ChatService(), authentication: RequestHandler = requireAuth): Router {
  const router = Router();
  router.use(authentication);
  router.post('/answer',async(req,res,next)=>{
    try {
      const parsed=ragInput.safeParse(req.body);
      if(!parsed.success)throw new ValidationError('Pergunta ou escopo inválido.');
      res.json(await new RagService().answer(userId(req),parsed.data.pergunta,parsed.data.projeto_ids));
    } catch(error){next(error);}
  });

  router.get("/projects", async (req, res, next) => { try { res.json({ items: await service.accessibleProjects(userId(req)) }); } catch (error) { next(error); } });

  router.get("/conversations", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await service.listConversations(userId(req));
      res.json({ items, total: items.length });
    } catch (error) {
      next(error);
    }
  });

  router.post("/conversations", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const created = await service.createConversation(userId(req), { titulo: req.body?.titulo, projetoId: text(req.body?.projeto_id) });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/conversations/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await service.deleteConversation(userId(req), String(req.params.id));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/conversations/:id/messages", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await service.listMessages(userId(req), String(req.params.id));
      res.json({ items, total: items.length });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/conversations/:id/messages/:messageId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await service.deleteMessage(userId(req), String(req.params.id), String(req.params.messageId));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/query", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pergunta = req.body?.pergunta;
      if (typeof pergunta !== "string") throw new ValidationError("Pergunta é obrigatória.");
      res.json(await service.query(userId(req), {
        pergunta,
        conversaId: text(req.body?.conversa_id),
        mensagemId: text(req.body?.mensagem_id),
        projetoId: text(req.body?.projeto_id),
      }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const chatRouter = createChatRouter();
