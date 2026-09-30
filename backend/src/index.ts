import { startDocumentIngestionWorker } from "./modules/documents/documents.ingestion.js";
import app from "./app.js";
import { startRepoAnalysesWorker } from "./modules/repo-analyses/repo-analyses.service.js";
import { env } from "./config/env.js";
import { startDocumentsBackgroundWorker } from "./modules/documents/documents.service.js";

export { app };

const PORT = env.PORT;
if (env.NODE_ENV !== "test") {
  startDocumentsBackgroundWorker();
  startDocumentIngestionWorker();
  startRepoAnalysesWorker();
  if (!env.DOCUMENT_EVENTS_WEBHOOK_URL?.trim()) {
    console.warn("[Documents] DOCUMENT_EVENTS_WEBHOOK_URL is not configured; removal events will retry until a consumer is configured.");
  }
  app.listen(PORT, () => {
    console.log(`[Sinapse Backend] Servidor iniciado na porta ${PORT}`);
    console.log(`[Sinapse Backend] Healthcheck em http://localhost:${PORT}/health`);
  });
}

export default app;
