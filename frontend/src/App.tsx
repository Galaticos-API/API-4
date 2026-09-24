import React, { useState, useEffect } from "react";
import { isProjectPath, navigate, routes } from "./auth/navigation";
import { useAuth } from "./auth/Auth";
import { Projects } from "./projects/Projects";
import { LandingPageView } from "./components/LandingPageView";
import { DeveloperDashboard } from "./components/DeveloperDashboard";
import {
  Cpu,
  Layers,
  Sparkles,
  BookOpen,
} from "lucide-react";

export const App: React.FC = () => {
  const { session, logout } = useAuth();
  const [pathname, setPathname] = useState(window.location.pathname);
  const activeTab = isProjectPath(pathname) ? "projects" : (Object.keys(routes) as Array<keyof typeof routes>).find(key => routes[key] === pathname);
  const setActiveTab = (tab: keyof typeof routes) => navigate(routes[tab]);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark"><Sparkles size={20} color="#fff" aria-hidden="true" /></span>
          <div className="app-brand-text">
            <div className="app-brand-title">
              <h1>Sinapse</h1>
              <span className="badge badge-info">PRO4TECH API-4</span>
            </div>
            <p>Memória Institucional da Fábrica de Software</p>
          </div>
        </div>

        <nav className="app-nav" aria-label="Navegação principal">
          <button onClick={() => setActiveTab("projects")} className={activeTab === "projects" ? "active" : ""} aria-current={activeTab === "projects" ? "page" : undefined}>
            <Layers size={16} aria-hidden="true" /> <span className="nav-label">Projetos</span>
          </button>
          <button onClick={() => setActiveTab("requirements")} aria-label="Requisitos do PO" className={activeTab === "requirements" ? "active" : ""} aria-current={activeTab === "requirements" ? "page" : undefined}>
            <BookOpen size={16} aria-hidden="true" /> <span className="nav-label">Requisitos do PO</span>
          </button>
          <button onClick={() => setActiveTab("rag")} className={activeTab === "rag" ? "active" : ""} aria-current={activeTab === "rag" ? "page" : undefined}>
            <Cpu size={16} aria-hidden="true" /> <span className="nav-label">RAG & Assistente IA</span>
          </button>
        </nav>

        <div className="app-user">
          <span className="app-user-name">{session.user?.name}</span>
          <button className="btn-secondary" onClick={() => void logout()}>Sair</button>
          <span className="badge badge-success app-env-badge">
            <span className="app-env-dot" />
            Ambiente Local Ativo
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main">
        {activeTab === "projects" && <Projects key={pathname} pathname={pathname} canCreate={session.user?.role === "po" || session.user?.role === "admin"} />}

        {/* Landing Page como visão principal da rota "/" */}
        {(activeTab === "landing" || !activeTab) && <LandingPageView />}

        {/* Aba de arquitetura / dashboard técnico exclusiva para devs */}
        {activeTab === "architecture" && <DeveloperDashboard />}

        {activeTab === "knowledge" && <UnavailableScreen title="Acervo de conhecimento" description="A busca no acervo será conectada quando a API de documentos e pesquisa estiver disponível na main." />}
        {activeTab === "chat" && <UnavailableScreen title="Conversa" description="A conversa por projeto depende do contrato de histórico e consulta assistida, ainda não publicado no backend da main." />}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "16px 32px", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        PRO4TECH &middot; Fatec São José dos Campos &middot; Grupo Galáticos &middot; 2º Semestre/2026
      </footer>
    </div>
  );
};

function UnavailableScreen({ title, description }: { title: string; description: string }) {
  return <section className="unavailable-screen"><p>EM PREPARAÇÃO</p><h2>{title}</h2><p>{description}</p><button className="btn-secondary" onClick={() => navigate("/projects")}>Abrir projetos</button></section>;
}