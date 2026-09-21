import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, apiRequest, readUser, type User } from "../api/api_auth";
import { loginDestination, navigate, safeDestination } from "./navigation";

type Session = { status: "loading" | "anonymous" | "error"; user?: never } | { status: "authenticated"; user: User };

const USER_STORAGE_KEY = "app_auth_user";

const AuthContext = createContext<{
  session: Session;
  notice: string;
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (nome: string, email: string, password: string, role?: "admin" | "po" | "dev") => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Inicializa o estado buscando do localStorage para evitar perder o login no F5
  const [session, setSessionState] = useState<Session>(() => {
    try {
      const cached = localStorage.getItem(USER_STORAGE_KEY);
      if (cached) {
        const user = JSON.parse(cached);
        return { status: "authenticated", user };
      }
    } catch {
      // Se houver erro ao ler o storage, ignora e segue o fluxo normal
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
      // Tratar falhas de gravação no storage se necessário
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

  const restore = useCallback(async () => {
    const current = ++revision.current;
    // Só mostra o loading se já não tivermos um usuário em cache para evitar o flash visual no F5
    if (sessionStatus.current !== "authenticated") {
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
        if (hadSession.current) expire();
        else setSession({ status: "anonymous" });
      } else {
        // Se já temos o usuário em cache, não derrubamos a sessão por instabilidades de rede temporárias
        if (sessionStatus.current !== "authenticated") {
          setSession({ status: "error" });
        }
      }
    }
  }, [expire, setSession]);

  useEffect(() => { void restore(); return () => { revision.current++; }; }, [restore]);

  useEffect(() => {
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [expire]);

  useEffect(() => {
    const revalidate = () => { if (sessionStatus.current === "authenticated") void restore(); };
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
  const isAuthRoute = url.pathname === "/login" || url.pathname === "/register";
  console.log(url.pathname);


  useEffect(() => {
    if (session.status === "anonymous" && !isAuthRoute) {
      navigate(`/login?returnTo=${encodeURIComponent(safeDestination(url.pathname + url.search + url.hash))}`, true);
    } else if (session.status === "authenticated" && isAuthRoute) {
      navigate(loginDestination(), true);
    }
  }, [session.status, isAuthRoute, location]);

  if (session.status === "loading") return <div className="auth-shell" role="status">Verificando sessão…</div>;

  if (session.status === "error") return <main className="auth-shell"><section className="glass-panel auth-card">
    <h1>Não foi possível verificar a sessão</h1>
    <p role="alert">{notice || "Verifique sua conexão e tente novamente."}</p>
    <button className="btn-primary" onClick={() => void restore()}>Tentar novamente</button>
    <button className="btn-secondary" onClick={() => void logout()}>Encerrar sessão</button>
  </section></main>;

  if (session.status === "anonymous") return isAuthRoute ? <AuthScreen initialMode={url.pathname === "/register" ? "register" : "login"} /> : null;
  return isAuthRoute ? null : children;
}

function AuthScreen({ initialMode }: { initialMode: "login" | "register" }) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    navigate(nextMode === "register" ? "/register" : "/login");
  };

  return (
    <main className="auth-shell">
      <section className="glass-panel auth-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="badge badge-info">Sinapse</span>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              className={mode === "login" ? "btn-primary" : "btn-secondary"}
              style={{ padding: "4px 12px", fontSize: "0.8rem" }}
              onClick={() => switchMode("login")}
            >
              Entrar
            </button>
            <button
              className={mode === "register" ? "btn-primary" : "btn-secondary"}
              style={{ padding: "4px 12px", fontSize: "0.8rem" }}
              onClick={() => switchMode("register")}
            >
              Cadastrar
            </button>
          </div>
        </div>

        {mode === "login" ? <LoginOnCard onSwitch={() => switchMode("register")} /> : <RegisterOnCard onSwitch={() => switchMode("login")} />}
      </section>
    </main>
  );
}

function LoginOnCard({ onSwitch }: { onSwitch: () => void }) {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "4px" }}>Entre na sua conta</h1>
        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>Acesse a memória institucional da sua equipe.</p>
      </div>
      {notice && <p role="status" style={{ color: "var(--accent-secondary)", fontSize: "0.88rem" }}>{notice}</p>}
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        try {
          await login(email.trim(), password);
        } catch (failure) {
          setPassword("");
          setError(
            failure instanceof ApiError && failure.status === 401
              ? "E-mail ou senha inválidos."
              : failure instanceof ApiError && failure.status === 403
                ? "Acesso indisponível. Entre em contato com o administrador."
                : failure instanceof ApiError && failure.status === 429
                  ? "Muitas tentativas. Aguarde antes de tentar novamente."
                  : "Não foi possível entrar. Verifique sua conexão e tente novamente."
          );
        } finally {
          setBusy(false);
        }
      }}>
        <label htmlFor="login-email" style={{ fontSize: "0.85rem", fontWeight: 600 }}>E-mail</label>
        <input id="login-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} placeholder="seu.email@empresa.com" />

        <label htmlFor="login-password" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Senha</label>
        <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} placeholder="••••••••" />

        {error && <p role="alert">{error}</p>}
        <button className="btn-primary" disabled={busy} type="submit">{busy ? "Entrando…" : "Entrar"}</button>
      </form>

      <div style={{ textAlign: "center", marginTop: "8px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
        Não tem uma conta?{" "}
        <button
          type="button"
          onClick={onSwitch}
          style={{ background: "none", border: "none", color: "var(--accent-secondary)", cursor: "pointer", textDecoration: "underline", font: "inherit" }}
        >
          Cadastre-se gratuitamente
        </button>
      </div>
    </>
  );
}

function RegisterOnCard({ onSwitch }: { onSwitch: () => void }) {
  const { register } = useAuth();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"po" | "dev" | "admin">("po");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "4px" }}>Criar nova conta</h1>
        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>Cadastre-se para acessar e registrar dados no banco de dados.</p>
      </div>

      <form onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;

        if (password.length < 6) {
          setError("A senha deve conter no mínimo 6 caracteres.");
          return;
        }

        if (password !== confirmPassword) {
          setError("As senhas não coincidem. Verifique e tente novamente.");
          return;
        }

        setBusy(true); setError("");
        try {
          await register(nome.trim(), email.trim(), password, role);
        } catch (failure) {
          setError(
            failure instanceof ApiError && failure.status === 409
              ? "Este e-mail já está cadastrado. Tente fazer login ou use outro e-mail."
              : failure instanceof ApiError && failure.status === 400
                ? "Preencha os dados de cadastro corretamente."
                : "Não foi possível realizar o cadastro. Verifique sua conexão e tente novamente."
          );
        } finally {
          setBusy(false);
        }
      }}>
        <label htmlFor="reg-nome" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Nome Completo</label>
        <input id="reg-nome" type="text" required value={nome} onChange={e => setNome(e.target.value)} disabled={busy} placeholder="Seu nome" />

        <label htmlFor="reg-email" style={{ fontSize: "0.85rem", fontWeight: 600 }}>E-mail Corporativo</label>
        <input id="reg-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} placeholder="seu.email@empresa.com" />

        <label htmlFor="reg-role" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Função no Projeto</label>
        <select id="reg-role" value={role} onChange={e => setRole(e.target.value as "po" | "dev" | "admin")} disabled={busy}>
          <option value="po">Product Owner (PO)</option>
          <option value="dev">Desenvolvedor (DEV)</option>
          <option value="admin">Administrador (ADMIN)</option>
        </select>

        <label htmlFor="reg-password" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Senha (mínimo 6 caracteres)</label>
        <input id="reg-password" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} placeholder="••••••••" />

        <label htmlFor="reg-confirm" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Confirmar Senha</label>
        <input id="reg-confirm" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={busy} placeholder="••••••••" />

        {error && <p role="alert">{error}</p>}
        <button className="btn-primary" disabled={busy} type="submit">{busy ? "Cadastrando…" : "Cadastrar e Entrar"}</button>
      </form>

      <div style={{ textAlign: "center", marginTop: "8px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
        Já possui uma conta?{" "}
        <button
          type="button"
          onClick={onSwitch}
          style={{ background: "none", border: "none", color: "var(--accent-secondary)", cursor: "pointer", textDecoration: "underline", font: "inherit" }}
        >
          Entre com seu e-mail
        </button>
      </div>
    </>
  );
}
