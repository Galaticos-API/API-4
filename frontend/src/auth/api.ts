export interface User { id: string; name: string; email: string }

export class ApiError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); }
}

// Session credentials stay in a server-managed HttpOnly cookie.
export async function apiRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15000),
    headers: { ...init.headers, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("session-expired"));
    }
    throw new ApiError(response.status);
  }
  return response;
}

export async function readUser(response: Response): Promise<User> {
  const data = await response.json();
  if (!data?.user || typeof data.user.id !== "string" || typeof data.user.name !== "string" || typeof data.user.email !== "string") {
    throw new Error("Resposta de sessão inválida");
  }
  return data.user;
}
