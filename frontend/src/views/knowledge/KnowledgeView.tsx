import React, { useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../api/api_auth";
import { listProjects, type Project } from "../../api/api_projects";
import { SearchField } from "../common/SearchField";
import "../../assets/styles/garakis-prototype.css";

interface SearchItem {
  id: string;
  project_id: string;
  project_name: string;
  entity_type: string;
  entity_id: string;
  title: string | null;
  text: string;
  metadata: Record<string, unknown>;
  source_url: string | null;
  relevance_score: number;
}

function parseSearchItems(value: unknown): SearchItem[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).items)) {
    throw new Error("A resposta da busca está em formato inesperado.");
  }
  return ((value as { items: unknown[] }).items).map((item): SearchItem => {
    if (!item || typeof item !== "object") throw new Error("A resposta da busca contém uma origem inválida.");
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.project_id !== "string" || typeof row.project_name !== "string"
      || typeof row.entity_type !== "string" || typeof row.entity_id !== "string" || typeof row.text !== "string"
      || (row.title !== null && typeof row.title !== "string")
      || (row.source_url !== null && typeof row.source_url !== "string")
      || typeof row.relevance_score !== "number" || !Number.isFinite(row.relevance_score)
      || (row.metadata !== null && (typeof row.metadata !== "object" || Array.isArray(row.metadata)))) {
      throw new Error("A resposta da busca contém uma origem inválida.");
    }
    return { ...row, metadata: row.metadata ?? {} } as SearchItem;
  });
}

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.details && typeof error.details === "object") {
    const message = (error.details as Record<string, unknown>).error;
    if (typeof message === "string") return message;
  }
  return error instanceof Error ? error.message : "Não foi possível pesquisar no acervo.";
}

export const KnowledgeView: React.FC = () => {
  const [query, setQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void listProjects(controller.signal)
      .then(page => setProjects(page.projects))
      .catch(cause => {
        if (!controller.signal.aborted) setProjectsError(describeError(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setProjectsLoading(false); });
    return () => controller.abort();
  }, []);

  const handleSearch = useCallback(async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!selectedProject || query.trim().length < 3 || loading) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    setResults([]);
    try {
      const params = new URLSearchParams({ q: query.trim(), projeto_id: selectedProject });
      const response = await apiRequest(`/search?${params.toString()}`);
      setResults(parseSearchItems(await response.json()));
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [query, selectedProject, loading]);

  const resetSearch = () => {
    setResults([]);
    setSearched(false);
    setError(null);
  };

  return (
    <div className="page-container" style={{ paddingBottom: "40px" }}>
      <div className="head-section">
        <div>
          <div className="eyebrow">BASE INTELIGENTE DE REQUISITOS</div>
          <h1>Consulta de Conhecimento do Acervo</h1>
          <p className="muted">
            Pesquise decisões, requisitos e documentos de um projeto. Cada resultado informa sua origem para você abrir o item correspondente.
          </p>
        </div>
      </div>

      <form className="card-garakis" style={{ marginTop: "16px", padding: "24px" }} onSubmit={event => void handleSearch(event)}>
        <div className="knowledge-search-controls">
          <SearchField
            label="Pesquisar no acervo"
            value={query}
            onChange={value => { setQuery(value); resetSearch(); }}
            placeholder="Ex.: autenticação JWT, integração PIX, regras de completude"
          />
          <div className="field-garakis" style={{ margin: 0 }}>
            <label htmlFor="select-project-scope">Escopo do projeto</label>
            <select
              id="select-project-scope"
              className="input-garakis"
              value={selectedProject}
              onChange={event => { setSelectedProject(event.target.value); resetSearch(); }}
              disabled={projectsLoading || Boolean(projectsError)}
            >
              <option value="">{projectsLoading ? "Carregando projetos..." : "Selecione um projeto"}</option>
              {projects.map(project => <option key={project.id} value={project.id}>{project.nome}</option>)}
            </select>
          </div>
          <button className="btn-garakis primary" type="submit" disabled={loading || !selectedProject || query.trim().length < 3}>
            {loading ? "Buscando..." : "Pesquisar"}
          </button>
        </div>
        {projectsError && <p className="ds-help" role="alert">Não foi possível carregar os projetos: {projectsError}</p>}
        {!projectsLoading && !projectsError && projects.length === 0 && <p className="ds-help" role="status">Nenhum projeto disponível para pesquisa.</p>}
      </form>

      <div style={{ marginTop: "24px" }} aria-live="polite">
        {error ? (
          <div className="card-garakis" role="alert" style={{ textAlign: "center", padding: "32px" }}>{error}</div>
        ) : loading ? (
          <div className="card-garakis" role="status" style={{ textAlign: "center", padding: "32px" }}>
            Consultando o acervo deste projeto...
          </div>
        ) : results.length === 0 ? (
          <div className="card-garakis" style={{ textAlign: "center", padding: "48px 24px" }}>
            <h3>{searched ? "Nenhum resultado encontrado" : "Pesquise no acervo do projeto"}</h3>
            <p className="muted">
              {searched
                ? "Tente outros termos. A consulta permanece limitada ao projeto selecionado."
                : "Selecione um projeto e digite pelo menos 3 caracteres para começar."}
            </p>
          </div>
        ) : (
          <div className="grid-garakis one" style={{ gap: "16px" }}>
            {results.map(item => {
              const title = item.title?.trim() || `Origem do tipo ${item.entity_type}`;
              const sourceName = item.metadata.source_name ?? item.metadata.nome_arquivo ?? item.metadata.fonte;
              return (
                <article className="card-garakis" key={item.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span className="badge-garakis green">{item.entity_type}</span>
                      <strong>{title}</strong>
                    </div>
                    <span className="muted" style={{ fontSize: "0.85rem" }}>Projeto: {item.project_name}</span>
                  </div>
                  <p style={{ color: "#fff", fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 12px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {item.text}
                  </p>
                  {typeof sourceName === "string" && <p className="muted" style={{ fontSize: "0.85rem" }}>Documento de origem: {sourceName}</p>}
                  {item.source_url
                    ? <a className="btn-garakis secondary" href={item.source_url}>Abrir origem</a>
                    : <span className="muted" role="note">Origem sem rota disponível.</span>}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
