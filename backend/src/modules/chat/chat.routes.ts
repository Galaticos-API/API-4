import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../../middleware/requireAuth.js";
import { AppError, ValidationError, validateUuid } from "../../shared/errors.js";
import { ChatService } from "./chat.service.js";
import { RagService,ragInput } from './rag.service.js';
import { performance } from 'perf_hooks';
import { MAX_QUESTION_LENGTH, validChatText } from './chat.types.js';

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

export function formatThinkingDuration(elapsedMs: number): { duration_ms: number; message: string } {
  const duration_ms = Math.max(0, Math.round(elapsedMs));
  const totalSeconds = Math.floor(duration_ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeLabel = minutes > 0 ? `${minutes}min${seconds}s` : `${seconds}s`;
  return { duration_ms, message: `Pensou por ${timeLabel}` };
}

type StreamQueryInput = {
  pergunta: string;
  conversaId?: string;
  mensagemId?: string;
  attemptId?: string;
  projetoId?: string;
  escopo?: "projeto" | "todos_autorizados";
};

/** Sync validation only — must run before SSE headers so HTTP 4xx remains possible. */
function parseQueryInput(body: unknown): StreamQueryInput {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const pergunta = payload.pergunta;
  if (typeof pergunta !== "string") throw new ValidationError("Pergunta é obrigatória.");
  if (!pergunta.trim()) throw new ValidationError("Digite uma pergunta.");
  if (pergunta.trim().length > MAX_QUESTION_LENGTH) throw new ValidationError(`A pergunta pode ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`);
  if (!validChatText(pergunta)) throw new ValidationError("Use texto Unicode válido, sem caractere nulo.");

  const conversaId = text(payload.conversa_id);
  const mensagemId = text(payload.mensagem_id);
  const attemptId = text(payload.tentativa_id);
  const projetoId = text(payload.projeto_id);
  if (mensagemId && !conversaId) throw new ValidationError("A conversa é obrigatória para repetir uma pergunta.");
  if (conversaId) validateUuid(conversaId, "ID da conversa");
  if (mensagemId) validateUuid(mensagemId, "ID da mensagem");
  if (attemptId) validateUuid(attemptId, "ID da tentativa");
  if (projetoId) validateUuid(projetoId, "ID do projeto");

  return {
    pergunta,
    conversaId,
    mensagemId,
    attemptId,
    projetoId,
    escopo: scope(payload.escopo),
  };
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
      const input = parseQueryInput(req.body);
      res.json(await service.query(userId(req), input));
    } catch (error) {
      next(error);
    }
  });

  router.post("/query/stream", async (req: Request, res: Response, next: NextFunction) => {
    const diagnosticId = randomUUID();
    let input: StreamQueryInput;
    let authenticatedUserId: string;
    try {
      authenticatedUserId = userId(req);
      input = parseQueryInput(req.body);
    } catch (error) {
      next(error);
      return;
    }

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const startedAt = performance.now();
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
      const result = await service.query(authenticatedUserId, input, (stage) => writeEvent("progress", { stage }), controller.signal, (conversation) => writeEvent("conversation", {
        id: conversation.id,
        titulo: conversation.titulo,
        projeto_id: conversation.projeto_id,
        projeto_nome: conversation.projeto_nome,
        escopo_tipo: conversation.escopo_tipo,
        updated_at: conversation.updated_at,
      }), id => writeEvent("message_persisted", { id }));
      writeEvent("completed", result);
      writeEvent("timing", formatThinkingDuration(performance.now() - startedAt));
      res.end();
    } catch (error) {
      if (controller.signal.aborted || (error instanceof AppError && error.code === "CHAT_CANCELLED")) {
        writeEvent("cancelled", { error: "Consulta interrompida." });
        if (!res.writableEnded) res.end();
        return;
      }
      // Never log the raw exception: providers and database clients may include
      // prompts, SQL parameters, or credentials in error messages and stacks.
      console.error("[Chat Query Error]", {
        diagnostic_id: diagnosticId,
        code: error instanceof AppError ? error.code : "INTERNAL_SERVER_ERROR",
      });
      const existingDetails = error instanceof AppError && typeof error.details === "object" && error.details !== null ? error.details as Record<string, unknown> : {};
      const payload = error instanceof AppError
        ? { status: error.statusCode, error: error.message, code: error.code, details: { ...existingDetails, diagnostico_id: diagnosticId }, diagnostic_id: diagnosticId }
        : { status: 500, error: "Erro interno do servidor.", code: "INTERNAL_SERVER_ERROR", details: { diagnostico_id: diagnosticId }, diagnostic_id: diagnosticId };
      writeEvent("error", payload);
      res.end();
    } finally {
      clearInterval(heartbeat);
    }
  });

  return router;
}

export const chatRouter = createChatRouter();
