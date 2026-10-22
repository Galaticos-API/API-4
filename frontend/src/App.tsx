import { SearchOriginFocus } from "./views/knowledge/SearchOriginFocus";
import "./assets/styles/knowledge.css";
import { Button } from "./views/common/ui";
import React, { useState, useEffect } from "react";
import { ArrowRight, BookOpenText, FolderKanban, Layers3, LogOut, MessageCircle } from "lucide-react";
import { isProjectPath, navigate, routes } from "./models/navigation";
import { useAuth } from "./viewmodels/useAuthViewModel";
import { ProjectsView } from "./views/projects/ProjectsView";
import { LandingPageView } from "./views/landing/LandingPageView";
import { DeveloperDashboardView } from "./views/dashboard/DeveloperDashboardView";
import { DocumentsView } from "./views/documents/DocumentsView";
import { KnowledgeView } from "./views/knowledge/KnowledgeView";
import { ChatView } from "./views/chat/ChatView";
import { AdminView } from "./views/admin/AdminView";
import { IngestionObservabilityView } from "./views/admin/IngestionObservabilityView";
import { RequirementsView } from "./views/backlog/RequirementsView";

export const App: React.FC = () => {
  const { session, logout } = useAuth();
  const [pathname, setPathname] = useState(window.location.pathname);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = React.useRef<HTMLButtonElement>(null);
  const menuPanelRef = React.useRef<HTMLDivElement>(null);

  const isAdmin = session.user?.role === "admin";
  const activeTab = isProjectPath(pathname)
    ? "projects"
    : (Object.keys(routes) as Array<keyof typeof routes>).find((key) => routes[key] === pathname) || "projects";

  const setActiveTab = (tab: keyof typeof routes) => { setMenuOpen(false); navigate(routes[tab]); };
  const toggleMobileMenu = () => {
    const willOpen = !menuOpen;
    setMenuOpen(willOpen);
    window.requestAnimationFrame(() => {
      if (willOpen) menuPanelRef.current?.querySelector<HTMLElement>(".mobile-menu-navigation button")?.focus();
      else menuToggleRef.current?.focus();
    });
  };

  useEffect(() => {
    const update = () => {
      setPathname(window.location.pathname);
      setMenuOpen(false);
      if (menuOpen && window.matchMedia("(max-width: 960px)").matches) menuToggleRef.current?.focus();
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      insetInline: document.body.style.insetInline,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
      overscrollBehavior: document.body.style.overscrollBehavior,
    };
    const scrollY = window.scrollY;
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    Object.assign(document.body.style, {
      position: "fixed",
      top: `-${scrollY}px`,
      insetInline: "0",
      width: "auto",
      overflow: "hidden",
      overscrollBehavior: "none",
    });
    const focusable = () => Array.from(
      menuPanelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])") ?? [],
    );
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        menuToggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 960) setMenuOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      Object.assign(document.body.style, previousBodyStyles);
      window.scrollTo(0, scrollY);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <header className={`top-header${menuOpen ? " menu-open" : ""}`}>
        <a className="brand" href="/projects" onClick={(event) => { event.preventDefault(); navigate("/projects"); }}>
          S<b>•</b>NAPSE
        </a>

        <Button ref={menuToggleRef} className={`mobile-menu-toggle${menuOpen ? " is-open" : ""}`} variant="secondary" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} aria-controls="mobile-menu-navigation" onClick={toggleMobileMenu}>
          <svg className="mobile-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path className="mobile-menu-icon__line mobile-menu-icon__line--top" d="M4 7h16" />
            <path className="mobile-menu-icon__line mobile-menu-icon__line--middle" d="M4 12h16" />
            <path className="mobile-menu-icon__line mobile-menu-icon__line--bottom" d="M4 17h16" />
          </svg>
        </Button>
        <nav id="main-navigation" className={`nav-links ${menuOpen ? "is-open" : ""}`} aria-label="Navegação principal">
          <button
            onClick={() => setActiveTab("projects")}
            className={activeTab === "projects" ? "active" : ""}
            aria-current={activeTab === "projects" ? "page" : undefined}
          >
            Projetos
          </button>
          <button
            onClick={() => setActiveTab("requirements")}
            className={activeTab === "requirements" ? "active" : ""}
            aria-current={activeTab === "requirements" ? "page" : undefined}
          >
            Backlog
          </button>
          <button
            onClick={() => setActiveTab("knowledge")}
            className={activeTab === "knowledge" ? "active" : ""}
            aria-current={activeTab === "knowledge" ? "page" : undefined}
          >
            Conhecimento
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={activeTab === "chat" || activeTab === "rag" ? "active" : ""}
            aria-current={activeTab === "chat" || activeTab === "rag" ? "page" : undefined}
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

      <div
        className={`mobile-menu-overlay${menuOpen ? " is-open" : ""}`}
        role="dialog"
        aria-modal={menuOpen || undefined}
        aria-hidden={!menuOpen}
        aria-labelledby="mobile-menu-title"
        inert={!menuOpen}
      >
          <svg className="mobile-menu-overlay__art" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <circle className="mobile-menu-overlay__orbit mobile-menu-overlay__orbit--one" cx="920" cy="180" r="250" />
            <circle className="mobile-menu-overlay__orbit mobile-menu-overlay__orbit--two" cx="920" cy="180" r="330" />
            <path className="mobile-menu-overlay__stroke" d="M-80 820C180 610 270 970 520 760S850 580 1100 760" />
            <path className="mobile-menu-overlay__stroke mobile-menu-overlay__stroke--second" d="M-100 900C160 690 300 1050 550 840S860 660 1120 840" />
          </svg>
          <div className="mobile-menu-overlay__content" ref={menuPanelRef}>
            <div className="mobile-menu-overlay__intro">
              <span className="mobile-menu-overlay__eyebrow"><span /> NAVEGAÇÃO</span>
              <h2 id="mobile-menu-title">Para onde vamos?</h2>
              <p>Acesse os espaços do Sinapse.</p>
            </div>
            <nav id="mobile-menu-navigation" className="mobile-menu-navigation" aria-label="Navegação principal">
              <button onClick={() => setActiveTab("projects")} aria-current={activeTab === "projects" ? "page" : undefined}>
                <FolderKanban aria-hidden="true" /><span>Projetos</span><small>01</small><ArrowRight aria-hidden="true" />
              </button>
              <button onClick={() => setActiveTab("requirements")} aria-current={activeTab === "requirements" ? "page" : undefined}>
                <Layers3 aria-hidden="true" /><span>Backlog</span><small>02</small><ArrowRight aria-hidden="true" />
              </button>
              <button onClick={() => setActiveTab("knowledge")} aria-current={activeTab === "knowledge" ? "page" : undefined}>
                <BookOpenText aria-hidden="true" /><span>Conhecimento</span><small>03</small><ArrowRight aria-hidden="true" />
              </button>
              <button onClick={() => setActiveTab("chat")} aria-current={activeTab === "chat" || activeTab === "rag" ? "page" : undefined}>
                <MessageCircle aria-hidden="true" /><span>Conversa</span><small>04</small><ArrowRight aria-hidden="true" />
              </button>
            </nav>
            <div className="mobile-menu-overlay__footer">
              <div className="mobile-menu-overlay__identity">
                <span className="mobile-menu-overlay__avatar" aria-hidden="true">{(session.user?.nome || session.user?.name || "U").charAt(0).toUpperCase()}</span>
                <span><strong>{session.user?.nome || session.user?.name || "Usuário"}</strong><small>{session.user?.role?.toUpperCase() || "PO"}</small></span>
              </div>
              <Button variant="secondary" className="mobile-menu-overlay__sign-out" onClick={() => { setMenuOpen(false); void logout(); }}>
                <LogOut size={18} aria-hidden="true" /> Sair da conta
              </Button>
            </div>
          </div>
      </div>

      {/* Main Content Area */}
      <main className="app-content">
        <SearchOriginFocus pathname={pathname} />
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
        {activeTab === "ingestion" && (isAdmin ? <IngestionObservabilityView /> : (
          <section className="page-container" role="alert" aria-labelledby="ingestion-access-title">
            <h1 id="ingestion-access-title">Acesso restrito</h1>
            <p>O pipeline de ingestão é visível somente para administradores.</p>
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
