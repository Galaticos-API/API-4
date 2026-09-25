import express, { Request, Response } from "express";
import cors from "cors";
import swaggerUi from 'swagger-ui-express';
import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./database/db.js";
import { swaggerSpec } from "./config/swagger.config.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { epicsRouter } from "./modules/epics/epics.routes.js";
import { featuresRouter } from "./modules/features/features.routes.js";
import { pbisRouter } from "./modules/pbis/pbis.routes.js";
import { criteriaRouter } from "./modules/criteria/criteria.routes.js";
import qualityRouter from "./modules/quality/quality.routes.js";
import { epicsCompatRouter } from "./modules/epics/epics.compat.routes.js";
import { repoAnalysesRouter } from './modules/repo-analyses/repo-analyses.routes';
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { documentsService, startDocumentsBackgroundWorker } from "./modules/documents/documents.service.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { searchRouter } from "./modules/search/search.routes.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { developersRouter } from "./modules/developers/developers.routes.js";
import { technologiesRouter } from "./modules/technologies/technologies.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/requireAuth.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/auth", authRouter);

// Health Check Endpoint
app.get("/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseConnection();
  const documents = dbHealthy ? await documentsService.health().catch(() => null) : null;

  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    service: "sinapse-backend",
    version: "0.1.0",
    dependencies: {
      database: dbHealthy ? "connected" : "disconnected",
      aiService: env.AI_SERVICE_URL,
    },
    documents,
  });
});

// Projects API Endpoints (v1 e alias)
app.use("/api/v1/projects", requireAuth, projectsRouter);
app.use("/api/projects", requireAuth, projectsRouter);
// Compatibilidade das rotas de épicos da implementação anterior
app.use("/api/v1", requireAuth, epicsCompatRouter);
app.use("/api", requireAuth, epicsCompatRouter);

// Hierarquia do backlog: épicos, features, PBIs e critérios de aceitação (S1-05/06/07/10)
app.use("/api/v1/epics", requireAuth, epicsRouter);
app.use("/api/v1/features", requireAuth, featuresRouter);
app.use("/api/v1/pbis", requireAuth, pbisRouter);
app.use("/api/v1/criteria", requireAuth, criteriaRouter);
app.use("/api/v1/quality", qualityRouter);
app.use("/api/v1/audit", auditRouter);

// Busca híbrida e acervo
app.use("/api/v1/search", searchRouter);

// Chat assistivo e conversas
app.use("/api/v1/chat", chatRouter);

// Desenvolvedores e competências
app.use("/api/v1/developers", developersRouter);
app.use("/api/v1/technologies", requireAuth, technologiesRouter);

// Painel administrativo
app.use("/api/v1/admin", adminRouter);

// Repo analyzer
app.use('/api/v1/projects/:projectId/repo-analyses', repoAnalysesRouter);

// Documentos do projeto (S1-19/S1-20/S1-22)
app.use("/api/v1/projects/:projectId/documents", requireAuth, documentsRouter);

// Swagger Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root Information Endpoint
app.get("/api/v1", (_req: Request, res: Response) => {
  res.json({
    name: "Sinapse API",
    version: "v1",
    description: "API de Backend do Sinapse - Base Inteligente de Requisitos",
    documentation: "/docs",
    modules: [
      { name: "projects", status: "ready" },
      { name: "epics", status: "ready" },
      { name: "features", status: "ready" },
      { name: "pbis", status: "ready" },
      { name: "criteria", status: "ready" },
      { name: "decisions", status: "in_development" },
      { name: "ai-bridge", status: "ready" },
    ],
  });
});

// Global Error Handler
app.use(errorHandler);

const PORT = env.PORT;
if (env.NODE_ENV !== "test") {
  startDocumentsBackgroundWorker();
  if (!env.DOCUMENT_EVENTS_WEBHOOK_URL?.trim()) {
    console.warn("[Documents] DOCUMENT_EVENTS_WEBHOOK_URL is not configured; removal events will retry until a consumer is configured.");
  }
  app.listen(PORT, () => {
    console.log(`[Sinapse Backend] Servidor iniciado na porta ${PORT}`);
    console.log(`[Sinapse Backend] Healthcheck em http://localhost:${PORT}/health`);
  });
}

export default app;
