import express, { Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./database/db.js";

const app = express();

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

const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`[Sinapse Backend] Servidor iniciado na porta ${PORT}`);
  console.log(`[Sinapse Backend] Healthcheck em http://localhost:${PORT}/health`);
});

export default app;
