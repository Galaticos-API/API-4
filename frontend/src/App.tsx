import { Button } from "./views/common/ui";
import React, { useState, useEffect } from "react";
import { isProjectPath, navigate, routes } from "./models/navigation";
import { useAuth } from "./viewmodels/useAuthViewModel";
import { ProjectsView } from "./views/projects/ProjectsView";
import { LandingPageView } from "./views/landing/LandingPageView";
import { DeveloperDashboardView } from "./views/dashboard/DeveloperDashboardView";
import { DocumentsView } from "./views/documents/DocumentsView";
import { KnowledgeView } from "./views/knowledge/KnowledgeView";
import { ChatView } from "./views/chat/ChatView";
import { AdminView } from "./views/admin/AdminView";
import { RequirementsView } from "./views/backlog/RequirementsView";

export const App: React.FC = () => {
  const { session, logout } = useAuth();
  const [pathname, setPathname] = useState(window.location.pathname);

  const isAdmin = session.user?.role === "admin";
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
    <div className="app-shell">
      <header className="top-header">
        <a className="brand" href="/projects" onClick={(event) => { event.preventDefault(); navigate("/projects"); }}>
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

        <div className="app-user-actions">
          {isAdmin ? (
            <button className="user-menu-btn" onClick={() => navigate("/admin")} aria-label="Abrir administração">
              {session.user?.nome || session.user?.name || "Usuário"} · ADMIN ▾
            </button>
          ) : (
            <span className="user-menu-label">
              {session.user?.nome || session.user?.name || "Usuário"} · {session.user?.role?.toUpperCase() || "PO"}
            </span>
          )}
          <Button
            variant="secondary"
            className="app-sign-out"
            onClick={() => void logout()}
          >
            Sair
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-content">
        {activeTab === "projects" && <ProjectsView key={pathname} pathname={pathname} canCreate={session.user?.role === "po" || session.user?.role === "admin"} />}
        {activeTab === "requirements" && <RequirementsView canCreate={session.user?.role === "po" || session.user?.role === "admin"} />}
        {activeTab === "documents" && <DocumentsView />}
        {activeTab === "knowledge" && <KnowledgeView />}
        {(activeTab === "chat" || activeTab === "rag") && <ChatView />}
        {activeTab === "admin" && (isAdmin ? <AdminView /> : (
          <section className="page-container" role="alert" aria-labelledby="admin-access-title">
            <h1 id="admin-access-title">Acesso restrito</h1>
            <p>Esta área está disponível somente para administradores.</p>
            <Button variant="secondary" onClick={() => navigate("/projects")}>Voltar para projetos</Button>
          </section>
        ))}
        {activeTab === "architecture" && <DeveloperDashboardView />}
        {activeTab === "landing" && <LandingPageView />}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "20px 36px", textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Sinapse &middot; PRO4TECH &middot; Fatec São José dos Campos &middot; Grupo Galáticos &middot; 2º Semestre/2026
      </footer>
    </div>
  );
};