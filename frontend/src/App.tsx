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
      {/* Top Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(10, 13, 20, 0.8)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 15px rgba(99, 102, 241, 0.4)",
            }}
          >
            <Sparkles size={22} color="#fff" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Sinapse</h1>
              <span className="badge badge-info">PRO4TECH API-4</span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Memória Institucional da Fábrica de Software
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            background: "var(--bg-secondary)",
            padding: "4px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <button onClick={() => setActiveTab("projects")} className={activeTab === "projects" ? "btn-primary" : "btn-secondary"}>
            <Layers size={16} /> Projetos
          </button>
          <button
            onClick={() => setActiveTab("architecture")}
            className={activeTab === "architecture" ? "btn-primary" : "btn-secondary"}
            style={{ padding: "8px 16px", fontSize: "0.85rem" }}
          >
            <Layers size={16} /> Arquitetura & Stacks
          </button>
          <button
            onClick={() => setActiveTab("requirements")}
            aria-label="Requisitos do PO"
            className={activeTab === "requirements" ? "btn-primary" : "btn-secondary"}
            style={{ padding: "8px 16px", fontSize: "0.85rem" }}
          >
            <BookOpen size={16} /> Requisitos do PO
          </button>
          <button
            onClick={() => setActiveTab("rag")}
            className={activeTab === "rag" ? "btn-primary" : "btn-secondary"}
            style={{ padding: "8px 16px", fontSize: "0.85rem" }}
          >
            <Cpu size={16} /> RAG & Assistente IA
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span>{session.user?.name}</span>
          <button className="btn-secondary" onClick={() => void logout()}>Sair</button>
          <span className="badge badge-success">
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
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