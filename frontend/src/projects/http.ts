export class ApiError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); }
}

// Same-origin proxy; server remains responsible for authentication/authorization.
export async function apiRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new ApiError(response.status);
  return response;
}
