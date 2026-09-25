import React, { useState, useEffect } from "react";
import { isProjectPath, navigate, routes } from "./models/navigation";
import { useAuth } from "./auth/Auth";
import { ProjectsView } from "./views/projects/ProjectsView";
import { LandingPageView } from "./views/landing/LandingPageView";
import { DeveloperDashboardView } from "./views/dashboard/DeveloperDashboardView";
import { DocumentsView } from "./views/documents/DocumentsView";
import { KnowledgeView } from "./views/knowledge/KnowledgeView";
import { ChatView } from "./views/chat/ChatView";
import { AdminView } from "./views/admin/AdminView";
import { RequirementsView } from "./views/backlog/RequirementsView";
import "./assets/styles/garakis-prototype.css";

export const App: React.FC = () => {
  const { session, logout } = useAuth();
  const [pathname, setPathname] = useState(window.location.pathname);

  const activeTab = isProjectPath(pathname)
    ? "projects"
    : (Object.keys(routes) as Array<keyof typeof routes>).find((key) => routes[key] === pathname) || "projects";

  const setActiveTab = (tab: keyof typeof routes) => navigate(routes[tab]);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>
      {/* Top Header Bar (Protótipo Garakis) */}
      <header className="top-header">
        <a className="brand" onClick={() => navigate("/projects")}>
          S<b>•</b>NAPSE
        </a>

        <nav className="nav-links" aria-label="Navegação principal">
          <button
            onClick={() => setActiveTab("projects")}
            className={activeTab === "projects" ? "active" : ""}
          >
            Projetos
          </button>
          <button
            onClick={() => setActiveTab("requirements")}
            className={activeTab === "requirements" ? "active" : ""}
          >
            Backlog
          </button>
          <button
            onClick={() => setActiveTab("knowledge")}
            className={activeTab === "knowledge" ? "active" : ""}
          >
            Conhecimento
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={activeTab === "chat" || activeTab === "rag" ? "active" : ""}
          >
            Conversa
          </button>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="user-menu-btn" onClick={() => navigate("/admin")}>
            {session.user?.nome || session.user?.name || "Cauan Gabriel"} · {session.user?.role?.toUpperCase() || "PO"} ▾
          </button>
          <button
            className="btn-garakis secondary"
            style={{ minHeight: "34px", padding: "0 12px", fontSize: "0.8rem" }}
            onClick={() => void logout()}
          >
            Sair
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {activeTab === "projects" && <ProjectsView key={pathname} pathname={pathname} canCreate={session.user?.role === "po" || session.user?.role === "admin"} />}
        {activeTab === "requirements" && <RequirementsView canCreate={session.user?.role === "po" || session.user?.role === "admin"} />}
        {activeTab === "documents" && <DocumentsView />}
        {activeTab === "knowledge" && <KnowledgeView />}
        {(activeTab === "chat" || activeTab === "rag") && <ChatView />}
        {activeTab === "admin" && <AdminView />}
        {activeTab === "architecture" && <DeveloperDashboardView />}
        {activeTab === "landing" && <LandingPageView />}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--line)", padding: "20px 36px", textAlign: "center", fontSize: "0.8rem", color: "var(--dim)" }}>
        Sinapse &middot; PRO4TECH &middot; Fatec São José dos Campos &middot; Grupo Galáticos &middot; 2º Semestre/2026
      </footer>
    </div>
  );
};