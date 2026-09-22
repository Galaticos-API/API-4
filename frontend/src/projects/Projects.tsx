import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/api_auth";
import { navigate } from "./navigation";
import { createProject, getProject, listProjects, type Project, type ProjectInput } from "../api/api_projects";
import { parseBacklogRoute } from "../backlog/navigation";
import { BacklogScreen } from "../backlog/Backlog";
import { EpicList } from "../backlog/Epics";
import { RepoAnalyzerTab } from "./RepoAnalyzerTab";
import "./projects.css";
import { ProjectArchive } from "./ProjectArchive";

type Result = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; projects: Project[]; total: number };
const empty: ProjectInput = { nome: "", cliente: "", descricao: "" };

export function Projects({ pathname, canCreate = false }: { pathname: string; canCreate?: boolean }) {
  const backlogRoute = parseBacklogRoute(pathname);
  const id = backlogRoute ? backlogRoute.projectId : pathname.slice("/projects/".length);
  const isNew = id === "new" && !backlogRoute;
  const isDetail = pathname !== "/projects" && !isNew && !backlogRoute;
  const [result, setResult] = useState<Result>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (isNew || backlogRoute) return;
    const controller = new AbortController();
    setResult({ state: "loading" });
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    const request = isDetail ? getProject(id, signal).then(project => ({ projects: [project], total: 1 })) : listProjects(signal, offset, status);
    request.then(page => {
      if (!controller.signal.aborted) setResult({ state: "ready", ...page });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setResult({
        state: "error", message: error instanceof ApiError && error.status === 404 ? "Projeto não encontrado."
          : error instanceof ApiError && error.status === 401 ? "É necessário entrar para acessar os projetos."
            : error instanceof ApiError && error.status === 403 ? "Você não tem permissão para acessar estes projetos."
              : "Não foi possível carregar os projetos. Tente novamente."
      });
    });
    return () => controller.abort();
  }, [id, isDetail, isNew, Boolean(backlogRoute), attempt, offset, status]);

  if (backlogRoute) return <BacklogScreen route={backlogRoute} canCreate={canCreate} />;
  if (isNew) return canCreate ? <ProjectForm /> : <section className="projects-page"><h2>Acesso de leitura</h2><p role="alert">Seu perfil não permite criar projetos.</p><button className="btn-secondary" onClick={() => navigate("/projects")}>Voltar aos projetos</button></section>;
  return <section className="projects-page">
    <div className="projects-heading">
      <div><p className="projects-eyebrow">Organização do trabalho</p><h2>{isDetail ? "Detalhes do projeto" : "Projetos"}</h2>
        <p>Reúna o contexto do cliente e organize os requisitos da sua equipe.</p></div>
      {(isDetail || canCreate) && <button className="btn-primary" onClick={() => navigate(isDetail ? "/projects" : "/projects/new")}>{isDetail ? "Voltar aos projetos" : "Novo projeto"}</button>}
    </div>
    {!isDetail && <label className="project-filter">Exibir projetos
      <select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}>
        <option value="">Não arquivados</option><option value="arquivado">Arquivados</option><option value="todos">Todos</option>
      </select>
    </label>}
    {result.state === "loading" && <div className="glass-panel projects-state" role="status">Carregando {isDetail ? "projeto" : "projetos"}…</div>}
    {result.state === "error" && <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
      <button className="btn-secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>}
    {result.state === "ready" && (isDetail ? <><ProjectDetail project={result.projects[0]} canCreate={canCreate && result.projects[0].status !== "arquivado"} /><ProjectArchive key={id} project={result.projects[0]} canWrite={canCreate} onArchived={project => setResult({ state: "ready", projects: [project], total: 1 })} /></> : result.projects.length === 0
      ? <div className="glass-panel projects-state"><h3>{status === "arquivado" ? "Nenhum projeto arquivado" : "Nenhum projeto cadastrado"}</h3><p>{status === "arquivado" ? "Os projetos arquivados poderão ser consultados aqui." : "Crie o primeiro projeto para começar a organizar o trabalho."}</p>
        {canCreate && status !== "arquivado" && <button className="btn-primary" onClick={() => navigate("/projects/new")}>Criar primeiro projeto</button>}</div>

      : <div className="projects-grid">{result.projects.map(project => <article className="glass-panel project-card" key={project.id}>
        <span className={`badge ${project.status === "ativo" ? "badge-success" : "badge-warning"}`}>{project.status}</span>
        <h3>{project.nome}</h3><p>{project.cliente}</p><p className="project-excerpt">{project.descricao}</p>
        <button className="btn-secondary" onClick={() => navigate(`/projects/${project.id}`)} aria-label={`Abrir projeto ${project.nome}`}>Ver projeto</button>
        {project.status === "arquivado" && <p>Somente leitura · Arquivado em: {project.archived_at ? new Date(project.archived_at).toLocaleString("pt-BR") : "data não registrada"}</p>}
    </article>)}</div>)}
    {!isDetail && !isNew && <nav className="project-actions" aria-label="Paginação de projetos">
      <button className="btn-secondary" disabled={offset === 0 || result.state === "loading"} onClick={() => setOffset(value => Math.max(0, value - 50))}>Anterior</button>
      <span>Página {Math.floor(offset / 50) + 1}{result.state === "ready" ? ` · ${result.total} projetos` : ""}</span>
      <button className="btn-secondary" disabled={result.state !== "ready" || offset + 50 >= result.total} onClick={() => setOffset(value => value + 50)}>Próxima</button>
    </nav>}
  </section>;
}

function ProjectDetail({ project, canCreate }: { project: Project; canCreate: boolean }) {
  const [activeTab, setActiveTab] = useState<"backlog" | "repo-analyzer">("backlog");

  return <>
    <article className="glass-panel project-card">
      <span className={`badge ${project.status === "ativo" ? "badge-success" : "badge-warning"}`}>{project.status}</span>
      <h3>{project.nome}</h3><dl><dt>Cliente</dt><dd>{project.cliente}</dd><dt>Descrição</dt><dd className="project-description">{project.descricao}</dd></dl>
      {project.status === "arquivado" && <p>Somente leitura · Arquivado em: {project.archived_at ? new Date(project.archived_at).toLocaleString("pt-BR") : "data não registrada"}</p>}
    </article>

    {/* Abas de Contexto do Projeto */}
    <div className="flex border-b border-gray-200 mb-4" style={{ display: "flex", gap: "1rem", borderBottom: "1px solid #e5e7eb", marginBottom: "1.5rem" }}>
      <button
        onClick={() => setActiveTab("backlog")}
        style={{
          padding: "0.5rem 1rem",
          fontWeight: 500,
          fontSize: "0.875rem",
          borderBottom: activeTab === "backlog" ? "2px solid #4f46e5" : "2px solid transparent",
          color: activeTab === "backlog" ? "#4f46e5" : "#6b7280",
          background: "none",
          cursor: "pointer"
        }}
      >
        📋 Backlog & Épicos
      </button>
      <button
        onClick={() => setActiveTab("repo-analyzer")}
        style={{
          padding: "0.5rem 1rem",
          fontWeight: 500,
          fontSize: "0.875rem",
          borderBottom: activeTab === "repo-analyzer" ? "2px solid #4f46e5" : "2px solid transparent",
          color: activeTab === "repo-analyzer" ? "#4f46e5" : "#6b7280",
          background: "none",
          cursor: "pointer"
        }}
      >
        🔬 RepoAnalyzer (Análise de Repositório)
      </button>
    </div>

    {activeTab === "backlog" && <EpicList key={`${project.id}-${project.status}`} projetoId={project.id} canCreate={canCreate} />}
    {activeTab === "repo-analyzer" && <RepoAnalyzerTab projectId={project.id} />}
  </>;

}

function ProjectForm() {
  const [values, setValues] = useState<ProjectInput>(empty);
  const [errors, setErrors] = useState<Partial<ProjectInput>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const valid = values.nome.trim().length > 0 && values.cliente.trim().length > 0 && values.nome.trim().length <= 255 && values.cliente.trim().length <= 255 && Object.keys(errors).length === 0;
  return <section className="projects-page">
    <div className="projects-heading"><div><p className="projects-eyebrow">Projetos / Novo projeto</p><h2>Criar projeto</h2>
      <p>Informe o contexto que acompanhará os requisitos deste projeto.</p></div></div>
    <form ref={form} className="glass-panel project-form" noValidate aria-busy={busy} onSubmit={async event => {
      event.preventDefault();
      if (submitting.current) return;
      const input = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as unknown as ProjectInput;
      const invalid: Partial<ProjectInput> = {};
      if (!input.nome) invalid.nome = "Informe o nome do projeto.";
      if (!input.cliente) invalid.cliente = "Informe o cliente.";
      if (input.nome.length > 255) invalid.nome = "O nome não pode exceder 255 caracteres.";
      if (input.cliente.length > 255) invalid.cliente = "O cliente não pode exceder 255 caracteres.";
      setErrors(invalid); setMessage("");
      if (Object.keys(invalid).length) {
        form.current?.querySelector<HTMLElement>(`[name="${Object.keys(invalid)[0]}"]`)?.focus();
        return;
      }
      submitting.current = true; setBusy(true);
      try {
        const project = await createProject(input);
        if (mounted.current) navigate(`/projects/${project.id}`);
      } catch (error) {
        if (!mounted.current) return;
        if (error instanceof ApiError && error.status === 409) {
          setErrors({ nome: "Este nome já está em uso por um projeto ativo." });
        } else setMessage(error instanceof ApiError && error.status === 401 ? "É necessário entrar para criar projetos."
          : error instanceof ApiError && error.status === 403
            ? "Você não tem permissão para criar projetos. Entre em contato com o administrador."
            : error instanceof ApiError && [400, 422].includes(error.status) ? "Revise os dados informados. O servidor recusou o cadastro."
              : "Não foi possível confirmar a criação. Consulte a lista de projetos antes de tentar novamente.");
      } finally {
        submitting.current = false;
        if (mounted.current) setBusy(false);
      }
    }}>
      <p>Nome e cliente são obrigatórios. A descrição é opcional.</p>
      {([["nome", "Nome do projeto"], ["cliente", "Cliente"], ["descricao", "Descrição"]] as const).map(([field, label]) => {
        const props = {
          id: field, name: field, required: field !== "descricao", disabled: busy, value: values[field], "aria-invalid": Boolean(errors[field]),
          "aria-describedby": errors[field] ? `${field}-error` : undefined,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            setValues(previous => ({ ...previous, [field]: event.target.value }));
            setErrors(previous => { const next = { ...previous }; delete next[field]; return next; });
            setMessage("");
          }
        };
        return <div className="project-field" key={field}><label htmlFor={field}>{label}</label>
          {field === "descricao" ? <textarea {...props} rows={5} /> : <input {...props} type="text" />}
          {errors[field] && <p id={`${field}-error`} role="alert">{errors[field]}</p>}</div>;
      })}
      {message && <p role="alert">{message}</p>}
      <p role="status">{busy ? "Criando projeto…" : valid ? "Dados preenchidos. Pronto para criar." : "Preencha os campos para criar o projeto."}</p>
      <div className="project-actions"><button type="submit" className="btn-primary" disabled={busy}>{busy ? "Criando…" : "Criar projeto"}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => navigate("/projects")}>Voltar à lista</button></div>
    </form>
  </section>;
}