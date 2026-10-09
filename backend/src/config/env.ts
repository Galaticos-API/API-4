import dotenv from "dotenv";
import { resolve } from "path";
import { z } from "zod";

// Load from root .env or local .env
dotenv.config({ path: resolve(process.cwd(), "../.env") });
dotenv.config();



const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().optional(),
  POSTGRES_USER: z.string().default("sinapse"),
  POSTGRES_PASSWORD: z.string().default("sinapse_dev_password"),
  POSTGRES_DB: z.string().default("sinapse"),
  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432),
  AI_SERVICE_TOKEN: z.string().default(""),
  AI_SERVICE_URL: z.string().default("http://localhost:8000"),
  DOCUMENT_INGESTION_TOKEN: z.string().default(""),
  REPO_ANALYZER_URL: z.string().default('http://localhost:8000'),
  SEARCH_MIN_VECTOR_SIMILARITY: z.coerce.number().min(0).max(1).default(0.55),
  SEARCH_MIN_TEXT_RANK: z.coerce.number().min(0).max(1).default(0.05),

  // S1-01 — Autenticação e segurança
  AUTH_MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
  AUTH_SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).default(30),
  AUTH_SESSION_MAX_HOURS: z.coerce.number().int().min(1).default(12),

  // S1-19/S1-22 — Documentos
  DOCUMENT_MAX_SIZE_MB: z.coerce.number().positive().max(20).default(20),
  DOCUMENT_STORAGE_DIR: z.string().min(1).default("storage/documents"),
  DOCUMENT_INGEST_WEBHOOK_URL: z.string().optional(),
  DOCUMENT_EVENTS_WEBHOOK_URL: z.string().optional(),
  // Token server-to-server para o backend aceitar POST .../documents/.../chunks
  // vindo do workflow do n8n (ferramenta de debug manual). Em dev tem default
  // pra nao bloquear o fluxo local; em prod obrigatorio sobrescrever.
  N8N_INGEST_TOKEN: z.string().min(8).default("sinapse-dev-ingest-token"),
}).superRefine((value, context) => {
  if (value.DOCUMENT_INGESTION_TOKEN.length > 0 && value.DOCUMENT_INGESTION_TOKEN.length < 32) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DOCUMENT_INGESTION_TOKEN"],
      message: "DOCUMENT_INGESTION_TOKEN deve ter ao menos 32 caracteres.",
    });
  }
  if (value.NODE_ENV === "production" && value.DOCUMENT_INGESTION_TOKEN.length < 32) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DOCUMENT_INGESTION_TOKEN"],
      message: "Configure um segredo aleatório privado para a ingestão de documentos em produção.",
    });
  }
});

export const env = envSchema.parse(process.env);
