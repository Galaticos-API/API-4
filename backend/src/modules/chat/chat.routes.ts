import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { AppError, ValidationError } from "../../shared/errors.js";
import { ChatService } from "./chat.service.js";
import { RagService,ragInput } from './rag.service.js';

function userId(req: Request): string {
  if (!req.auth?.id) throw new ValidationError("Autenticação necessária.");
  return req.auth.id;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function scope(value: unknown): "projeto" | "todos_autorizados" | undefined {
  if (value === undefined) return undefined;
  if (value === "projeto" || value === "todos_autorizados") return value;
  throw new ValidationError("Escopo da conversa inválido.");
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

  router.get("/projects", async (req, res, next) => { try { res.json({ items: await service.accessibleProjectsWithKnowledgeReadiness(userId(req)) }); } catch (error) { next(error); } });

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
      const created = await service.createConversation(userId(req), { titulo: req.body?.titulo, projetoId: text(req.body?.projeto_id), escopo: scope(req.body?.escopo) });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/conversations/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await service.renameConversation(userId(req), String(req.params.id), req.body?.titulo);
      res.json(updated);
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
        escopo: scope(req.body?.escopo),
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/query/stream", async (req: Request, res: Response, next: NextFunction) => {
    const pergunta = req.body?.pergunta;
    if (typeof pergunta !== "string") { next(new ValidationError("Pergunta é obrigatória.")); return; }

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const writeEvent = (event: string, data: unknown) => {
      if (!res.destroyed && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(": keep-alive\n\n");
    }, 15_000);

    try {
      const result = await service.query(userId(req), {
        pergunta,
        conversaId: text(req.body?.conversa_id),
        mensagemId: text(req.body?.mensagem_id),
        projetoId: text(req.body?.projeto_id),
        escopo: scope(req.body?.escopo),
      }, (stage) => writeEvent("progress", { stage }), controller.signal, (conversation) => writeEvent("conversation", {
        id: conversation.id,
        titulo: conversation.titulo,
        projeto_id: conversation.projeto_id,
        projeto_nome: conversation.projeto_nome,
        escopo_tipo: conversation.escopo_tipo,
        updated_at: conversation.updated_at,
      }));
      writeEvent("completed", result);
      res.end();
    } catch (error) {
      if (controller.signal.aborted || (error instanceof AppError && error.code === "CHAT_CANCELLED")) {
        writeEvent("cancelled", { error: "Consulta interrompida." });
        if (!res.writableEnded) res.end();
        return;
      }
      const payload = error instanceof AppError
        ? { status: error.statusCode, error: error.message, code: error.code, details: error.details }
        : { status: 500, error: "Erro interno do servidor.", code: "INTERNAL_SERVER_ERROR" };
      writeEvent("error", payload);
      res.end();
    } finally {
      clearInterval(heartbeat);
    }
  });

  return router;
}

export const chatRouter = createChatRouter();
