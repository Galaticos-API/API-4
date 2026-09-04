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
  AI_SERVICE_URL: z.string().default("http://localhost:8000"),
});

export const env = envSchema.parse(process.env);
