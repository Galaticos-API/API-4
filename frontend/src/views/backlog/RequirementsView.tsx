import React, { useState, useEffect } from "react";
import { listProjects, type Project } from "../../api/api_projects";
import { EpicList } from "./EpicsView";
import { navigate } from "../../models/navigation";
import "../../assets/styles/garakis-prototype.css";

export const RequirementsView: React.FC<{ canCreate?: boolean }> = ({ canCreate = false }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    listProjects(controller.signal)
      .then((page) => {
        setProjects(page.projects);
        if (page.projects.length > 0) {
          setSelectedProjectId(page.projects[0].id);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar os projetos.");
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="page-container" style={{ paddingBottom: "40px" }}>
      <div className="head-section">
        <div>
          <div className="eyebrow">HIERARQUIA DE REQUISITOS</div>
          <h1>Backlog de Produtos & Requisitos</h1>
          <p className="muted">
            Visualize a estrutura completa de Épicos, Features e PBIs com critérios de aceitação BDD.
          </p>
        </div>

        {selectedProjectId && canCreate && (
          <button className="btn-garakis primary" onClick={() => navigate(`/projects/${selectedProjectId}/epics/new`)}>
            + Novo Épico
          </button>
        )}
      </div>

      {loading ? (
        <div className="card-garakis" role="status" style={{ textAlign: "center", padding: "32px", marginTop: "16px" }}>
          Carregando backlog do backend...
        </div>
      ) : error ? (
        <div className="card-garakis" style={{ background: "rgba(239, 68, 68, 0.1)", color: "#fca5a5", marginTop: "16px" }}>
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div className="card-garakis" style={{ textAlign: "center", padding: "48px 24px", marginTop: "16px" }}>
          <h3>Nenhum projeto cadastrado no banco de dados</h3>
          <p className="muted">Crie seu primeiro projeto para começar a adicionar itens ao backlog.</p>
          {canCreate && (
            <button className="btn-garakis primary" onClick={() => navigate("/projects/new")} style={{ marginTop: "16px" }}>
              Criar Primeiro Projeto
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Seletor do Projeto */}
          <div className="card-garakis" style={{ marginTop: "16px", padding: "16px 20px" }}>
            <div className="field-garakis" style={{ margin: 0 }}>
              <label htmlFor="select-backlog-project" style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Selecione o Projeto para Exibir o Backlog:
              </label>
              <select
                id="select-backlog-project"
                className="input-garakis"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{ fontSize: "1rem", fontWeight: 600 }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.cliente}) · Status: {p.status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Renderiza a Lista de Épicos do Projeto Selecionado */}
          {selectedProjectId && (
            <div style={{ marginTop: "24px" }}>
              <EpicList
                key={`${selectedProjectId}-${selectedProject?.status}`}
                projetoId={selectedProjectId}
                canCreate={canCreate && selectedProject?.status !== "arquivado"}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};
