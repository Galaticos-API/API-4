import { useEffect, useState } from "react";
import { describeSearchError, searchBacklog, type BacklogSearchResult } from "../../api/api_backlog_search";
import { TYPE_LABEL, highlightParts, nodeHref, summarize } from "../../models/backlogSearch";
import { navigate } from "../../models/navigation";
import { Alert, Badge, Button, EmptyState } from "../common/ui";
import "../../assets/styles/backlog-search.css";

type State =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; result: BacklogSearchResult };

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  pronto: "Pronto",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

export function BacklogSearchResults({
  projectId,
  projectName,
  query,
  status,
  technologyId,
  filtersActive,
  onClearSearch,
  onClearAll,
}: {
  projectId: string;
  projectName?: string;
  query: string;
  status: string;
  technologyId: string;
  filtersActive: boolean;
  onClearSearch: () => void;
  onClearAll: () => void;
}) {
  const [state, setState] = useState<State>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ state: "loading" });
    searchBacklog(projectId, { q: query, status, tecnologiaId: technologyId }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setState({ state: "ready", result }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ state: "error", message: describeSearchError(error) }); });
    return () => controller.abort();
  }, [projectId, query, status, technologyId, attempt]);

  if (state.state === "loading") {
    return <div className="card-garakis projects-state" role="status">Buscando no backlog…</div>;
  }

  if (state.state === "error") {
    return (
      <div className="card-garakis projects-state">
        <p role="alert">{state.message}</p>
        <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button>
      </div>
    );
  }

  const { result } = state;

  if (result.items.length === 0) {
    return (
      <div className="card-garakis projects-state backlog-search-empty">
        <EmptyState
          title="Nenhum item encontrado"
          description={`Nada em ${projectName ? `“${projectName}”` : "este projeto"} corresponde a “${query}”${filtersActive ? " com os filtros atuais" : ""}. Revise o termo ou limpe os critérios.`}
        >
          <div className="project-actions">
            <Button onClick={onClearAll}>Limpar critérios</Button>
            {filtersActive && <Button variant="secondary" onClick={onClearSearch}>Limpar só a busca</Button>}
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <section className="backlog-search-results" aria-label="Resultados da busca no backlog">
      <p className="backlog-search-summary" role="status" aria-live="polite">{summarize(result.total, result.items.length, result.termo)}</p>
      <ul className="backlog-search-list">
        {result.items.map((item) => {
          const parts = highlightParts(item.trecho.texto, item.trecho.destaques);
          const last = item.caminho.length - 1;
          return (
            <li key={`${item.tipo}-${item.id}`} className="card-garakis backlog-search-item">
              <div className="backlog-search-item-head">
                <Badge tone={item.tipo === "pbi" ? "brand" : "info"}>{TYPE_LABEL[item.tipo]}</Badge>
                {item.codigo && <span className="backlog-search-code">{item.codigo}</span>}
                <button
                  type="button"
                  className="backlog-search-title"
                  onClick={() => navigate(nodeHref(projectId, item.caminho, last))}
                >
                  {item.titulo}
                </button>
                {item.status && <Badge>{STATUS_LABEL[item.status] ?? item.status}</Badge>}
              </div>

              <p className="backlog-search-snippet" data-field={item.campo}>
                <span className="sr-only">{item.campo === "titulo" ? "Título: " : "Trecho da descrição: "}</span>
                {parts.map((part, index) => (part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}
              </p>

              <nav className="backlog-search-path" aria-label={`Caminho de ${item.titulo}`}>
                <ol>
                  <li>
                    <button type="button" onClick={() => navigate(`/projects/${projectId}`)}>{projectName ?? "Projeto"}</button>
                  </li>
                  {item.caminho.map((node, index) => (
                    <li key={`${node.tipo}-${node.id}`}>
                      {index === last ? (
                        <span aria-current="page">{node.codigo ? `${node.codigo} · ` : ""}{node.titulo}</span>
                      ) : (
                        <button type="button" onClick={() => navigate(nodeHref(projectId, item.caminho, index))}>{node.titulo}</button>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>

              {item.tecnologias.length > 0 && (
                <ul className="backlog-search-tech" aria-label="Tecnologias">
                  {item.tecnologias.map((tech) => <li key={tech.id}>{tech.nome}</li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {result.total > result.items.length && (
        <Alert tone="info">Há mais resultados do que o limite exibido. Refine o termo ou use os filtros para reduzir a lista.</Alert>
      )}
    </section>
  );
}
