import { ApiError } from "./api_auth";

export function serverMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const details = error.details;
  if (!details || typeof details !== "object") return undefined;
  const message = (details as { error?: unknown }).error;
  return typeof message === "string" && message.trim() ? message : undefined;
}

export function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}
