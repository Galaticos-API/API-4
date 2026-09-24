import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, apiRequest, readUser, type User } from "../api/api_auth";
import { loginDestination, navigate } from "../models/navigation";

export type Session =
  | { status: "loading" | "anonymous" | "error"; user?: never }
  | { status: "authenticated"; user: User };

const USER_STORAGE_KEY = "app_auth_user";

export interface AuthContextType {
  session: Session;
  notice: string;
  restore: (hideDuringValidation?: boolean) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (nome: string, email: string, password: string, role?: "admin" | "po" | "dev") => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session>(() => {
    try {
      const cached = localStorage.getItem(USER_STORAGE_KEY);
      if (cached) {
        const user = JSON.parse(cached);
        return { status: "authenticated", user };
      }
    } catch {
      // Ignora erro de leitura no storage
    }
    return { status: "loading" };
  });

  const sessionStatus = useRef<Session["status"]>(session.status);

  const setSession = useCallback((next: Session) => {
    sessionStatus.current = next.status;
    setSessionState(next);
    try {
      if (next.status === "authenticated") {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next.user));
      } else if (next.status === "anonymous" || next.status === "error") {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch {
      // Tratar falhas se necessário
    }
  }, []);

  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const hadSession = useRef(session.status === "authenticated");

  const expire = useCallback(() => {
    revision.current++;
    hadSession.current = false;
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem("app_auth_token");
    setNotice("Sua sessão expirou. Entre novamente para continuar.");
    setSession({ status: "anonymous" });
  }, [setSession]);

  const restore = useCallback(async (hideDuringValidation = false) => {
    const current = ++revision.current;

    if (hideDuringValidation || sessionStatus.current !== "authenticated") {
      setSession({ status: "loading" });
    }

    try {
      const user = await readUser(await apiRequest("/auth/me"));

      if (current === revision.current) {
        hadSession.current = true;
        setNotice("");
        setSession({ status: "authenticated", user });
      }
    } catch (error) {
      if (current !== revision.current) return;

      if (error instanceof ApiError && error.status === 401) {
        if (hadSession.current) {
          expire();
        } else {
          setSession({ status: "anonymous" });
        }
      } else if (sessionStatus.current !== "authenticated") {
        setSession({ status: "error" });
      }
    }
  }, [expire, setSession]);

  useEffect(() => {
    void restore();
    return () => {
      revision.current++;
    };
  }, [restore]);

  useEffect(() => {
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [expire]);

  useEffect(() => {
    const revalidate = () => {
      if (sessionStatus.current === "authenticated") {
        void restore(true);
      }
    };

    window.addEventListener("focus", revalidate);
    window.addEventListener("popstate", revalidate);

    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("popstate", revalidate);
    };
  }, [restore]);

  async function login(email: string, password: string) {
    const current = ++revision.current;
    const user = await readUser(await apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
    if (current !== revision.current) return;
    hadSession.current = true;
    setNotice("");
    navigate(loginDestination(), true);
    setSession({ status: "authenticated", user });
  }

  async function register(nome: string, email: string, password: string, role: "admin" | "po" | "dev" = "po") {
    const current = ++revision.current;
    const user = await readUser(await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ nome, email, password, role }),
    }));
    if (current !== revision.current) return;
    hadSession.current = true;
    setNotice("");
    navigate(loginDestination(), true);
    setSession({ status: "authenticated", user });
  }

  async function logout() {
    const current = ++revision.current;
    setSession({ status: "loading" });
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (error) {
      if (current !== revision.current) return;
      if (!(error instanceof ApiError && error.status === 401)) {
        setNotice("Não foi possível confirmar a saída. Tente encerrar a sessão novamente.");
        setSession({ status: "error" });
        return;
      }
    }
    if (current !== revision.current) return;
    hadSession.current = false;
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem("app_auth_token");
    setNotice("Sessão encerrada.");
    setSession({ status: "anonymous" });
    navigate("/login", true);
  }

  return <AuthContext.Provider value={{ session, notice, restore, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider ausente");
  return auth;
}
