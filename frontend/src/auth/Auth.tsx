import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, apiRequest, readUser, type User } from "./api";
import { loginDestination, navigate, safeDestination } from "./navigation";

type Session = { status: "loading" | "anonymous" | "error"; user?: never } | { status: "authenticated"; user: User };
const AuthContext = createContext<{
  session: Session; notice: string; restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const hadSession = useRef(false);
  const expire = useCallback(() => {
    revision.current++;
    hadSession.current = false;
    setNotice("Sua sessão expirou. Entre novamente para continuar.");
    setSession({ status: "anonymous" });
  }, []);
  const restore = useCallback(async () => {
    const current = ++revision.current;
    setSession({ status: "loading" });
    try {
      const user = await readUser(await apiRequest("/auth/session"));
      if (current === revision.current) {
        hadSession.current = true;
        setNotice("");
        setSession({ status: "authenticated", user });
      }
    } catch (error) {
      if (current !== revision.current) return;
      if (error instanceof ApiError && error.status === 401) {
        if (hadSession.current) expire();
        else setSession({ status: "anonymous" });
      } else setSession({ status: "error" });
    }
  }, [expire]);
  useEffect(() => { void restore(); return () => { revision.current++; }; }, [restore]);
  useEffect(() => {
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [expire]);
  // Validate on navigation (including Back/Forward) and return to the app.
  // No polling: idle expiration remains authoritative on the server.
  useEffect(() => {
    const revalidate = () => { if (session.status === "authenticated") void restore(); };
    window.addEventListener("focus", revalidate);
    window.addEventListener("popstate", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("popstate", revalidate);
    };
  }, [session.status, restore]);
  async function login(email: string, password: string) {
    const current = ++revision.current;
    const user = await readUser(await apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
    if (current !== revision.current) return;
    hadSession.current = true;
    setNotice("");
    setSession({ status: "authenticated", user });
    navigate(loginDestination(), true);
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
    setNotice("Sessão encerrada.");
    setSession({ status: "anonymous" });
    navigate("/login", true);
  }
  return <AuthContext.Provider value={{ session, notice, restore, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider ausente");
  return auth;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, notice, restore, logout } = useAuth();
  const [location, setLocation] = useState(() => window.location.href);
  useEffect(() => {
    const update = () => setLocation(window.location.href);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const url = new URL(location);
  const isLogin = url.pathname === "/login";
  useEffect(() => {
    if (session.status === "anonymous" && !isLogin) {
      navigate(`/login?returnTo=${encodeURIComponent(safeDestination(url.pathname + url.search + url.hash))}`, true);
    } else if (session.status === "authenticated" && isLogin) navigate(loginDestination(), true);
  }, [session.status, isLogin, location]);
  if (session.status === "loading") return <div className="auth-shell" role="status">Verificando sessão…</div>;
  if (session.status === "error") return <main className="auth-shell"><section className="glass-panel auth-card">
    <h1>Não foi possível verificar a sessão</h1>
    <p role="alert">{notice || "Verifique sua conexão e tente novamente."}</p>
    <button className="btn-primary" onClick={() => void restore()}>Tentar novamente</button>
    <button className="btn-secondary" onClick={() => void logout()}>Encerrar sessão</button>
  </section></main>;
  if (session.status === "anonymous") return isLogin ? <Login /> : null;
  return isLogin ? null : children;
}

function Login() {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <main className="auth-shell"><section className="glass-panel auth-card">
    <span className="badge badge-info">Sinapse</span>
    <h1>Entre na sua conta</h1>
    <p>Acesse a memória institucional da sua equipe.</p>
    {notice && <p role="status">{notice}</p>}
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError("");
      try { await login(email.trim(), password); }
      catch (failure) {
        setPassword("");
        setError(failure instanceof ApiError && failure.status === 401 ? "E-mail ou senha inválidos."
          : failure instanceof ApiError && failure.status === 403 ? "Acesso indisponível. Entre em contato com o administrador."
          : failure instanceof ApiError && failure.status === 429 ? "Muitas tentativas. Aguarde antes de tentar novamente."
          : "Não foi possível entrar. Verifique sua conexão e tente novamente.");
      } finally { setBusy(false); }
    }}>
      <label htmlFor="email">E-mail</label>
      <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
      <label htmlFor="password">Senha</label>
      <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
      {error && <p role="alert">{error}</p>}
      <button className="btn-primary" disabled={busy} type="submit">{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  </section></main>;
}
