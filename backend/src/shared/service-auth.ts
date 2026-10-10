import { env } from "../config/env.js";
export function serviceHeaders(): Record<string,string> {
  return { "X-Service-Token": env.AI_SERVICE_TOKEN };
}
