import { useEffect, useState } from "react";
import {
  type Project
} from "../../api/api_projects";
import "../../assets/styles/projects.css";
import { navigate } from "../../models/navigation";
import { BacklogTreeView } from "../backlog/BacklogTreeView";
import { DecisionsPanel } from "../backlog/DecisionsPanel";
import { Button } from "../common/ui";
import { DocumentsView } from "../documents/DocumentsView";
import { RepoAnalyzerView } from "./RepoAnalyzerView";

type ProjectTab = "overview" | "backlog" | "decisions" | "documents" | "repo-analyzer";

const PROJECT_TABS: ReadonlyArray<{ id: ProjectTab; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "backlog", label: "Backlog" },
  { id: "decisions", label: "Decisões" },
  { id: "documents", label: "Documentos" },
  { id: "repo-analyzer", label: "Análise de repositório" },
];

const TAB_HASH: Record<ProjectTab, string> = {
  overview: "",
  backlog: "#backlog",
  decisions: "#decisions",
  documents: "#documents",
  "repo-analyzer": "#repo-analyzer",
};

function tabFromHash(hash: string): ProjectTab {
  const found = (Object.keys(TAB_HASH) as ProjectTab[]).find((tab) => TAB_HASH[tab] && TAB_HASH[tab] === hash);
  return found ?? "overview";
}

export function ProjectDetail({
  project,
  canCreate,
  initialTab,
}: {
  project: Project;
  canCreate: boolean;
  initialTab?: ProjectTab;
}) {
  const [activeTab, setActiveTab] = useState<ProjectTab>(() => initialTab ?? tabFromHash(window.location.hash));

  const selectTab = (tab: ProjectTab) => {
    setActiveTab(tab);
    const hash = TAB_HASH[tab];
    window.history.replaceState(null, "", hash ? `${window.location.pathname}${hash}` : window.location.pathname);
  };

  useEffect(() => {
    const onHashChange = () => setActiveTab(tabFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = PROJECT_TABS.length - 1;
    const target =
      event.key === "ArrowRight" ? (index + 1) % PROJECT_TABS.length
        : event.key === "ArrowLeft" ? (index - 1 + PROJECT_TABS.length) % PROJECT_TABS.length
          : event.key === "Home" ? 0
            : event.key === "End" ? last
              : -1;
    if (target < 0) return;
    event.preventDefault();
    selectTab(PROJECT_TABS[target].id);
    document.getElementById(`project-tab-${PROJECT_TABS[target].id}`)?.focus();
  };

  const archived = project.status === "arquivado";

  return (
    <>
      <div className="crumb-bar">
        <button
          onClick={() => navigate("/projects")}
        >
          Projetos
        </button>

        <span>/</span>

        <b>{project.nome}</b>
      </div>

      <div className="head-section">
        <div>
          <span
            className={`ds-badge ${project.status === "ativo"
              ? "ds-badge--success"
              : ""
              }`}
          >
            {project.status}
          </span>

          <h1 style={{ marginTop: "8px" }}>
            {project.nome}
          </h1>

          <p className="muted">
            Cliente: {project.cliente} · Contexto
            central do produto.
          </p>

          {project.descricao && (
            <p
              className="project-description"
              style={{
                color: "var(--text-secondary)",
                marginTop: "6px",
              }}
            >
              {project.descricao}
            </p>
          )}
        </div>

        <Button
          variant="secondary"
          onClick={() => selectTab("backlog")}
        >
          Abrir backlog
        </Button>
      </div>

      {project.status === "arquivado" && (
        <div
          className="ds-card"
          style={{
            background:
              "rgba(239, 68, 68, 0.1)",
            borderColor:
              "rgba(239, 68, 68, 0.3)",
            margin: "16px 0",
            color: "#fca5a5",
          }}
        >
          Somente leitura · Arquivado em:{" "}
          {project.archived_at
            ? new Date(
              project.archived_at,
            ).toLocaleString("pt-BR")
            : "data não registrada"}
        </div>
      )}

      <div className="project-tabs" role="tablist" aria-label="Contexto do projeto">
        {PROJECT_TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`project-tab-${tab.id}`}
            type="button"
            role="tab"
            className={activeTab === tab.id ? "active" : ""}
            aria-selected={activeTab === tab.id}
            aria-controls={`project-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id={`project-panel-${activeTab}`} role="tabpanel" aria-labelledby={`project-tab-${activeTab}`}>
        {activeTab === "overview" && (
          <div className="ds-grid ds-grid--three">
            <article className="ds-card">
              <h2>Backlog</h2>

              <p className="muted">
                Épicos, features e comportamentos
                testáveis em PBIs.
              </p>

              <Button
                variant="ghost"
                onClick={() =>
                  selectTab("backlog")
                }
              >
                Ver itens de trabalho →
              </Button>
            </article>

            <article className="ds-card">
              <h2>Documentos</h2>

              <p className="muted">
                Referências e documentos de
                especificação indexados.
              </p>

              <Button
                variant="ghost"
                onClick={() =>
                  selectTab("documents")
                }
              >
                Ver documentos →
              </Button>
            </article>

            <article className="ds-card">
              <h2>Conhecimento</h2>

              <p className="muted">
                O conteúdo processado pode ser
                pesquisado e consultado.
              </p>

              <Button
                variant="ghost"
                onClick={() =>
                  navigate("/knowledge")
                }
              >
                Pesquisar acervo →
              </Button>
            </article>
          </div>
        )}

        {activeTab === "backlog" && (
          <BacklogTreeView
            key={`${project.id}-${project.status}`}
            projectId={project.id}
            canCreate={canCreate}
          />
        )}

        {activeTab === "decisions" && (
          <DecisionsPanel
            key={project.id}
            kind="projeto"
            id={project.id}
            canWrite={canCreate}
            readOnlyNote={archived ? "Projeto arquivado: as decisões ficam disponíveis somente para consulta." : undefined}
          />
        )}

        {activeTab === "documents" && (
          <DocumentsView
            embedded
            projectId={project.id}
            projectName={project.nome}
            canWrite={canCreate}
            archived={project.status === "arquivado"}
          />
        )}

        {activeTab === "repo-analyzer" && (
          <RepoAnalyzerView
            key={project.id}
            projectId={project.id}
            canStart={!archived}
          />
        )}
      </div>
    </>
  );
}
