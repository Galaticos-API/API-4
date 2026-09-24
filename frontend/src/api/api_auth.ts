export interface User { id: string; name: string; email: string; role: "admin" | "po" | "dev"; nome?: string }

export class ApiError extends Error {
  constructor(public status: number, public details?: unknown) { super(`HTTP ${status}`); }
}

export async function apiRequest(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem("app_auth_token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const timeoutSignal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(15000) : undefined;

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    signal: init.signal ?? timeoutSignal,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("session-expired"));
    }
    const details = await response.clone().json().catch(() => undefined);
    throw new ApiError(response.status, details);
  }
  return response;
}

export async function readUser(response: Response): Promise<User> {
  const data = await response.json();
  if (data?.token) {
    localStorage.setItem("app_auth_token", data.token);
  }
  if (!data?.user || typeof data.user.id !== "string" || typeof data.user.nome !== "string" || typeof data.user.email !== "string"
    || !["admin", "po", "dev"].includes(data.user.role)) {
    throw new Error("Resposta de sessão inválida");
  }
  return { id: data.user.id, name: data.user.nome, email: data.user.email, role: data.user.role };
}
