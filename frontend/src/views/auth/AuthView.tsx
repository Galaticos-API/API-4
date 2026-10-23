import { Button } from "../common/ui";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ApiError } from "../../api/api_auth";
import { useAuth } from "../../viewmodels/useAuthViewModel";
import { loginDestination, navigate, safeDestination } from "../../models/navigation";

const graphNodes = [
  [82, 118], [178, 68], [286, 138], [402, 74], [526, 154], [654, 82],
  [780, 132], [918, 64], [1080, 142], [1128, 286], [978, 332], [842, 268],
  [704, 370], [566, 292], [418, 382], [274, 300], [126, 382], [42, 524],
  [190, 594], [344, 536], [488, 650], [644, 548], [792, 660], [946, 560],
  [1102, 672], [1034, 458], [884, 478], [742, 466], [604, 432], [364, 462],
] as const;

const graphEdges = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [2, 5], [3, 4], [3, 6],
  [4, 5], [4, 7], [5, 6], [5, 8], [6, 7], [6, 10], [7, 8], [8, 9],
  [8, 10], [9, 10], [10, 11], [10, 12], [11, 12], [11, 13], [12, 13],
  [12, 14], [13, 14], [13, 15], [14, 15], [14, 19], [15, 16], [15, 17],
  [16, 17], [16, 18], [17, 18], [18, 19], [18, 20], [19, 20], [19, 28],
  [20, 21], [20, 28], [21, 22], [21, 27], [22, 23], [22, 24], [23, 24],
  [23, 25], [24, 25], [24, 26], [25, 26], [26, 27], [26, 29], [27, 28],
  [28, 29], [14, 28], [10, 27],
] as const;

function LoginGraphBackground({ graphRef }: { graphRef?: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={graphRef} className="auth-graph" aria-hidden="true">
      <div className="auth-graph__scene">
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="auth-graph-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity=".12" />
            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1200" height="800" fill="url(#auth-graph-glow)" />
        {[graphEdges.slice(0, 18), graphEdges.slice(18, 36), graphEdges.slice(36)].map((edges, clusterIndex) => (
          <g className={`auth-graph__cluster auth-graph__cluster--${clusterIndex + 1}`} key={clusterIndex}>
            <g className="auth-graph__cluster-content">
              <g className="auth-graph__edges">
                {edges.map(([from, to], index) => (
                  <line
                    key={`${from}-${to}`}
                    x1={graphNodes[from][0]}
                    y1={graphNodes[from][1]}
                    x2={graphNodes[to][0]}
                    y2={graphNodes[to][1]}
                    style={{ "--edge-delay": `${(index % 9) * 0.32}s` } as React.CSSProperties}
                  />
                ))}
              </g>
              <g className="auth-graph__nodes">
                {graphNodes.slice(clusterIndex * 10, clusterIndex === 2 ? undefined : clusterIndex * 10 + 12).map(([cx, cy], index) => (
                  <circle
                    key={`${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={index % 5 === 0 ? 3.5 : 2.2}
                    style={{ "--node-delay": `${(index % 8) * 0.45}s` } as React.CSSProperties}
                  />
                ))}
              </g>
            </g>
          </g>
        ))}
        </svg>
      </div>
    </div>
  );
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
  const graphRef = useRef<HTMLDivElement>(null);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const updateGraphInteraction = (event: globalThis.MouseEvent) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const graphBounds = graphRef.current?.getBoundingClientRect();
      if (!graphBounds || graphBounds.width === 0 || graphBounds.height === 0) return;

      const x = Math.max(-1, Math.min(1, ((event.clientX - graphBounds.left) / graphBounds.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, ((event.clientY - graphBounds.top) / graphBounds.height) * 2 - 1));
      if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current);
      animationFrame.current = window.requestAnimationFrame(() => {
        graphRef.current?.style.setProperty("--graph-mouse-x", `${x * 16}px`);
        graphRef.current?.style.setProperty("--graph-mouse-y", `${y * 12}px`);
        graphRef.current?.style.setProperty("--graph-tilt-x", `${y * -4}deg`);
        graphRef.current?.style.setProperty("--graph-tilt-y", `${x * 6}deg`);
      });
    };

    const resetGraphInteraction = () => {
      graphRef.current?.style.setProperty("--graph-mouse-x", "0px");
      graphRef.current?.style.setProperty("--graph-mouse-y", "0px");
      graphRef.current?.style.setProperty("--graph-tilt-x", "0deg");
      graphRef.current?.style.setProperty("--graph-tilt-y", "0deg");
    };

    window.addEventListener("mousemove", updateGraphInteraction);
    window.addEventListener("mouseleave", resetGraphInteraction);
    return () => {
      window.removeEventListener("mousemove", updateGraphInteraction);
      window.removeEventListener("mouseleave", resetGraphInteraction);
      if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    navigate(nextMode === "register" ? "/register" : "/login");
  };

  return (
    <main className="auth-shell">
      <LoginGraphBackground graphRef={graphRef} />
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
