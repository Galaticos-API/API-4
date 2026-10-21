import axios from "axios";
import { z } from "zod";
import { env } from "../../config/env.js";
import { serviceHeaders } from "../../shared/service-auth.js";
import { IndexingRepository, type PreparedEntity } from "./indexing.repository.js";

const responseSchema = z.object({
  entity_type: z.string(),
  content: z.string().trim().min(1).max(500000),
  metadata: z.object({ project_id: z.string().uuid() }),
  embedding: z.array(z.number().finite()).length(1024).refine(vector => vector.some(value => value !== 0)),
});

export function validatePreparedEntity(data: unknown, entityType: string, projectId: string): PreparedEntity {
  const result = responseSchema.parse(data);
  if (result.entity_type !== entityType || result.metadata.project_id !== projectId) {
    throw new Error("INVALID_SCOPE");
  }
  return { content: result.content, embedding: result.embedding };
}

export function indexingFailureCode(error: unknown): string {
  if (error instanceof z.ZodError) return "INVALID_RESPONSE";
  if (error instanceof Error && error.message === "INVALID_SCOPE") return "INVALID_SCOPE";
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "TIMEOUT";
    return error.response ? "SERVICE_HTTP_ERROR" : "SERVICE_UNAVAILABLE";
  }
  return "PROCESSING_ERROR";
}

export class IndexingWorker {
  constructor(
    private readonly repository = new IndexingRepository(),
    private readonly endpoint = `${env.AI_SERVICE_URL}/ingest/entity`,
  ) {}

  async tick(projectId?: string): Promise<void> {
    const event = await this.repository.claim(projectId);
    if (!event) return;
    try {
      if (event.operacao === "remover") {
        await this.repository.finish(event);
        return;
      }
      const { data } = await axios.post(this.endpoint, {
        entity_type: event.entidade_tipo,
        data: event.payload,
      }, { headers: serviceHeaders(), timeout: 120000, maxContentLength: 8 * 1024 * 1024 });
      const prepared = validatePreparedEntity(data, event.entidade_tipo, event.projeto_id);
      await this.repository.finish(event, prepared);
    } catch (error) {
      await this.repository.fail(event, indexingFailureCode(error));
    }
  }
}

export function startIndexingWorker(worker = new IndexingWorker()): () => void {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await worker.tick();
    } catch {
      console.warn("[Indexing] Não foi possível processar a fila.");
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void tick(), 15000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
