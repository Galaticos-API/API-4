import express, { Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./database/db.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors());
app.use(express.json());

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
app.use("/api/v1/projects", projectsRouter);
app.use("/api/projects", projectsRouter);

// Root Information Endpoint
app.get("/api/v1", (_req: Request, res: Response) => {
  res.json({
    name: "Sinapse API",
    version: "v1",
    description: "API de Backend do Sinapse - Base Inteligente de Requisitos",
    documentation: "/docs",
    modules: [
      { name: "projects", status: "ready" },
      { name: "requirements", status: "in_development" },
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
