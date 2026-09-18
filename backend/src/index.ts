import express, { Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./database/db.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { epicsRouter } from "./modules/epics/epics.routes.js";
import { featuresRouter } from "./modules/features/features.routes.js";
import { pbisRouter } from "./modules/pbis/pbis.routes.js";
import { criteriaRouter } from "./modules/criteria/criteria.routes.js";
import { qualityRouter } from "./modules/quality/quality.routes.js";
import { epicsCompatRouter } from "./modules/epics/epics.compat.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/requireAuth.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/auth", authRouter);

// Health Check Endpoint
app.get("/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseConnection();

  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    service: "sinapse-backend",
    version: "0.1.0",
    dependencies: {
      database: dbHealthy ? "connected" : "disconnected",
      aiService: env.AI_SERVICE_URL,
    },
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
  app.listen(PORT, () => {
    console.log(`[Sinapse Backend] Servidor iniciado na porta ${PORT}`);
    console.log(`[Sinapse Backend] Healthcheck em http://localhost:${PORT}/health`);
  });
}

export default app;
