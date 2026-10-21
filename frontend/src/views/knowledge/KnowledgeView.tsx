import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/api_auth";
import { listProjects, type Project } from "../../api/api_projects";
import { listTechnologies, type TechnologyOption } from "../../api/api_backlog";
import { searchKnowledge, SEARCH_LEVELS, type KnowledgeHit } from "../../api/api_knowledge";
import { originLink, searchExcerpt } from "../../models/knowledgeSearch";
import { SearchField } from "../common/SearchField";
import { DocumentTextDialog } from "./DocumentTextDialog";
import "../../assets/styles/garakis-prototype.css";
import "../../assets/styles/knowledge.css";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.details && typeof error.details === "object") {
    const message = (error.details as Record<string, unknown>).error;
    if (typeof message === "string") return message;
  }
  return "Não foi possível pesquisar no acervo. Tente novamente.";
}

export function KnowledgeView() {
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [technology, setTechnology] = useState("");
  const [level, setLevel] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [technologies, setTechnologies] = useState<TechnologyOption[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [projectsError, setProjectsError] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<KnowledgeHit[]>([]);
  const [state, setState] = useState<"initial" | "loading" | "ready" | "error">("initial");
  const [error, setError] = useState("");
  const [documentHit, setDocumentHit] = useState<KnowledgeHit | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    setProjectsLoading(true); setProjectsError(false);
    void (async () => {
      const all: Project[] = [];
      let offset = 0;
      do {
        const page = await listProjects(signal, offset);
        all.push(...page.projects);
        offset += page.limit;
        if (offset >= page.total || page.projects.length === 0) break;
      } while (!controller.signal.aborted);
      if (!controller.signal.aborted) setProjects(all.filter(item => item.status !== "arquivado"));
    })().catch(() => { if (!controller.signal.aborted) setProjectsError(true); })
      .finally(() => { if (!controller.signal.aborted) setProjectsLoading(false); });
    void listTechnologies(signal).then(items => { if (!controller.signal.aborted) { setTechnologies(items); setCatalogError(false); } })
      .catch(() => { if (!controller.signal.aborted) setCatalogError(true); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => () => request.current?.abort(), []);

  function reset() {
    request.current?.abort();
    setResults([]); setState("initial"); setError(""); setDocumentHit(null);
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!project || query.trim().length < 3 || query.trim().length > 200) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState("loading"); setError(""); setResults([]);
    try {
      const items = await searchKnowledge({ query, project, technology, level }, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (!controller.signal.aborted) { setResults(items); setState("ready"); }
    } catch (cause) {
      if (!controller.signal.aborted) { setError(errorMessage(cause)); setState("error"); }
    }
  }
  return <div className="page-container knowledge-page">
    <div className="head-section"><div><div className="eyebrow">ACERVO DO PROJETO</div><h1>Buscar conhecimento</h1><p className="muted">Encontre requisitos, decisões e documentos. Consulte o trecho e abra a fonte para continuar a leitura.</p></div></div>
    <form className="card-garakis knowledge-form" onSubmit={event => void submit(event)}>
      <SearchField label="Pesquisar no acervo" value={query} onChange={value => { reset(); setQuery(value); }} placeholder="Ex.: integração PIX, autenticação, regras de negócio" />
      <div className="knowledge-filters">
        <div className="knowledge-filter"><label htmlFor="knowledge-project">Escopo do projeto</label><select id="knowledge-project" value={project} disabled={projectsLoading || projectsError} onChange={event => { reset(); setProject(event.target.value); }}><option value="">{projectsLoading ? "Carregando projetos..." : "Selecione um projeto"}</option>{projects.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
        <div className="knowledge-filter"><label htmlFor="knowledge-technology">Tecnologia</label><select id="knowledge-technology" value={technology} disabled={catalogError} onChange={event => { reset(); setTechnology(event.target.value); }}><option value="">Todas as tecnologias</option>{technologies.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
        <div className="knowledge-filter"><label htmlFor="knowledge-level">Nível</label><select id="knowledge-level" value={level} onChange={event => { reset(); setLevel(event.target.value); }}><option value="">Todos os níveis</option>{Object.entries(SEARCH_LEVELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <button className="btn-garakis primary" type="submit" disabled={state === "loading" || !project || projectsError || projectsLoading || query.trim().length < 3 || query.trim().length > 200}>{state === "loading" ? "Buscando..." : "Pesquisar"}</button>
      </div>
      <p className="muted">Digite de 3 a 200 caracteres. A consulta usa somente o projeto selecionado.</p>
      {projectsError && <p role="alert">Não foi possível carregar os projetos. <button type="button" onClick={() => setAttempt(attempt + 1)}>Tentar novamente</button></p>}
      {catalogError && <p role="status">Filtro de tecnologia indisponível. Você pode pesquisar pelos outros filtros.</p>}
      {!projectsLoading && !projectsError && !projects.length && <p role="status">Nenhum projeto disponível para pesquisa.</p>}
    </form>
    <section className="knowledge-results" aria-label="Resultados da busca" aria-busy={state === "loading"} aria-live="polite">
      {state === "loading" ? <p className="card-garakis" role="status">Consultando o acervo deste projeto...</p>
        : state === "error" ? <div className="card-garakis" role="alert"><p>{error}</p><button className="btn-garakis secondary" onClick={() => void submit()}>Tentar busca novamente</button></div>
        : state === "initial" ? <div className="card-garakis knowledge-empty"><h2>Pesquise no acervo do projeto</h2><p className="muted">Selecione um projeto e digite pelo menos 3 caracteres para começar.</p></div>
        : !results.length ? <div className="card-garakis knowledge-empty"><h2>Nenhum resultado encontrado</h2><p className="muted">Tente outros termos ou amplie os filtros de tecnologia e nível. A consulta permanece limitada ao projeto selecionado.</p></div>
        : <><p role="status">{results.length} {results.length === 1 ? "resultado encontrado" : "resultados encontrados"} para “{query.trim()}”</p>{results.map(item => {
          const href = originLink(item, query);
          const sourceName = item.metadata.source_name ?? item.metadata.nome_arquivo ?? item.metadata.fonte;
          return <article className="card-garakis knowledge-result" key={item.id}>
            <header><span className="badge-garakis">{SEARCH_LEVELS[item.entity_type]}</span><span className="muted">Projeto: {item.project_name}</span></header>
            <h2>{item.title?.trim() || SEARCH_LEVELS[item.entity_type] + " de origem"}</h2>
              <p className="knowledge-excerpt">{searchExcerpt(item.text, query)}</p>
              {item.entity_type === 'analise_repositorio' && typeof item.metadata.run_id === 'string' && <p className="muted">Execução: {item.metadata.run_id}</p>}
            {typeof sourceName === "string" && <p className="muted">Documento de origem: {sourceName}</p>}
            {item.entity_type === "documento" ? <button className="btn-garakis secondary" onClick={() => setDocumentHit(item)}>Abrir documento no trecho</button>
              : href ? <a className="btn-garakis secondary" href={href}>Abrir origem</a> : <p className="muted" role="note">Origem sem rota disponível.</p>}
          </article>;
        })}</>}
    </section>
    {documentHit && <DocumentTextDialog hit={documentHit} onClose={() => setDocumentHit(null)} />}
  </div>;
}
