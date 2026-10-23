import { Button } from "../common/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../api/api_auth";
import { useAuth } from "../../viewmodels/useAuthViewModel";
import { loginDestination, navigate, safeDestination } from "../../models/navigation";

type Particle = { x: number; y: number; vx: number; vy: number; radius: number };

function LoginGraphBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: -1000, y: -1000 };
    let particles: Particle[] = [];
    let animationFrame: number | null = null;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const count = Math.max(34, Math.min(78, Math.floor((width * height) / 15500)));
      particles = Array.from({ length: count }, (_, index) => ({
        x: (index * 137.5) % width,
        y: (index * 83.7) % height,
        vx: (index % 2 ? 1 : -1) * (0.08 + (index % 4) * 0.025),
        vy: (index % 3 ? 1 : -1) * (0.06 + (index % 5) * 0.018),
        radius: index % 7 === 0 ? 2.6 : 1.5,
      }));
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const linkDistance = Math.min(150, Math.max(95, width * 0.12));
      const pointerRadius = 190;

      if (pointer.x > -500) {
        const pointerGlow = context.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          pointerRadius,
        );
        pointerGlow.addColorStop(0, "rgba(237, 106, 50, .18)");
        pointerGlow.addColorStop(.45, "rgba(237, 106, 50, .06)");
        pointerGlow.addColorStop(1, "rgba(237, 106, 50, 0)");
        context.fillStyle = pointerGlow;
        context.beginPath();
        context.arc(pointer.x, pointer.y, pointerRadius, 0, Math.PI * 2);
        context.fill();
      }

      particles.forEach((particle, index) => {
        if (!reducedMotion.matches) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.hypot(dx, dy);
          if (distance < pointerRadius && distance > 0) {
            const influence = (1 - distance / pointerRadius) ** 2;
            particle.vx += dx / distance * 0.0024 * influence;
            particle.vy += dy / distance * 0.0024 * influence;
          }
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x < -20 || particle.x > width + 20) particle.vx *= -1;
          if (particle.y < -20 || particle.y > height + 20) particle.vy *= -1;
          particle.vx = Math.max(-0.24, Math.min(0.24, particle.vx));
          particle.vy = Math.max(-0.24, Math.min(0.24, particle.vy));
        }

        for (let nextIndex = index + 1; nextIndex < particles.length; nextIndex += 1) {
          const other = particles[nextIndex];
          const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
          if (distance > linkDistance) continue;
          const pointerBoost = pointer.x > -500 && Math.hypot(pointer.x - particle.x, pointer.y - particle.y) < pointerRadius
            ? .14
            : 0;
          context.strokeStyle = `rgba(237, 106, 50, ${Math.min(.65, (1 - distance / linkDistance) * .32 + pointerBoost)})`;
          context.lineWidth = 0.7;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }

        context.fillStyle = index % 7 === 0 ? "#ffad7d" : "#ed6a32";
        context.shadowColor = "#ed6a32";
        context.shadowBlur = pointer.x > -500 && Math.hypot(pointer.x - particle.x, pointer.y - particle.y) < pointerRadius ? 14 : 8;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      });

      animationFrame = window.requestAnimationFrame(draw);
    };

    const movePointer = (event: MouseEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
    };
    const resetPointer = () => {
      pointer.x = -1000;
      pointer.y = -1000;
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", movePointer);
    window.addEventListener("mouseleave", resetPointer);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", movePointer);
      window.removeEventListener("mouseleave", resetPointer);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="auth-graph" aria-hidden="true" />
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
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    navigate(nextMode === "register" ? "/register" : "/login");
  };

  return (
    <main className="auth-shell">
      <LoginGraphBackground />
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
