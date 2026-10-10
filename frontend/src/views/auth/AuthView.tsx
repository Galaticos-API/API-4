import { Button } from "../common/ui";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../../api/api_auth";
import { useAuth } from "../../viewmodels/useAuthViewModel";
import { loginDestination, navigate, safeDestination } from "../../models/navigation";

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

  useEffect(() => {
    if (session.status === "anonymous" && !isAuthRoute) {
      navigate(`/login?returnTo=${encodeURIComponent(safeDestination(url.pathname + url.search + url.hash))}`, true);
    } else if (session.status === "authenticated" && isAuthRoute) {
      navigate(loginDestination(), true);
    }
  }, [session.status, isAuthRoute, location]);

  if (session.status === "loading") return <div className="auth-shell" role="status">Verificando sessão…</div>;

  if (session.status === "error") return <main className="auth-shell"><section className="ds-card ds-card--glass auth-card">
    <h1>Não foi possível verificar a sessão</h1>
    <p role="alert">{notice || "Verifique sua conexão e tente novamente."}</p>
    <Button variant="primary" onClick={() => void restore()}>Tentar novamente</Button>
    <Button variant="secondary" onClick={() => void logout()}>Encerrar sessão</Button>
  </section></main>;

  if (session.status === "anonymous") return isAuthRoute ? <AuthScreen initialMode={url.pathname === "/register" ? "register" : "login"} /> : null;
  return isAuthRoute ? null : children;
}

export function AuthScreen({ initialMode }: { initialMode: "login" | "register" }) {
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
      <section className="ds-card ds-card--glass auth-card">
        <div style={{ display: "flex", gap: "6px" }}>
          {mode === "register" && (
            <Button
              type="button"
              variant="secondary"
              style={{ padding: "4px 12px", fontSize: "0.8rem" }}
              onClick={() => switchMode("login")}
            >
              Entrar
            </Button>
          )}

          {mode === "login" && (
            <Button
              type="button"
              variant="secondary"
              style={{ padding: "4px 12px", fontSize: "0.8rem" }}
              onClick={() => switchMode("register")}
            >
              Cadastrar
            </Button>
          )}
        </div>

        {mode === "login" ? <LoginOnCard /> : <RegisterOnCard onSwitch={() => switchMode("login")} />}
      </section>
    </main>
  );
}

export function LoginOnCard() {
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
        <Button variant="primary" disabled={busy} type="submit">
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </>
  );
}

export function RegisterOnCard({ onSwitch }: { onSwitch: () => void }) {
  const { register } = useAuth();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
          await register(nome.trim(), email.trim(), password, "dev");
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

        <p>Novas contas recebem o perfil Desenvolvedor. O acesso de PO é concedido por um administrador.</p>

        <label htmlFor="reg-password" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Senha (mínimo 6 caracteres)</label>
        <input id="reg-password" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} placeholder="••••••••" />

        <label htmlFor="reg-confirm" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Confirmar Senha</label>
        <input id="reg-confirm" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={busy} placeholder="••••••••" />

        {error && <p role="alert">{error}</p>}
        <Button variant="primary" disabled={busy} type="submit">{busy ? "Cadastrando…" : "Cadastrar e Entrar"}</Button>
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
