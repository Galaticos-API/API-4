import { useEffect, useRef, useState } from "react";
import { ApiError } from "./http";
import { navigate } from "./navigation";
import { createProject, getProject, listProjects, type Project, type ProjectInput } from "./api";
import "./projects.css";

type Result = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; projects: Project[] };
const empty: ProjectInput = { nome: "", cliente: "", descricao: "" };

export function Projects({ pathname }: { pathname: string }) {
  const id = pathname.slice("/projects/".length);
  const isNew = id === "new";
  const isDetail = pathname !== "/projects" && !isNew;
  const [result, setResult] = useState<Result>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (isNew) return;
    const controller = new AbortController();
    setResult({ state: "loading" });
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    const request = isDetail ? getProject(id, signal).then(project => [project]) : listProjects(signal);
    request.then(projects => {
      if (!controller.signal.aborted) setResult({ state: "ready", projects });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setResult({ state: "error", message: error instanceof ApiError && error.status === 404 ? "Projeto não encontrado."
        : error instanceof ApiError && error.status === 401 ? "É necessário entrar para acessar os projetos."
        : error instanceof ApiError && error.status === 403 ? "Você não tem permissão para acessar estes projetos."
        : "Não foi possível carregar os projetos. Tente novamente." });
    });
    return () => controller.abort();
  }, [id, isDetail, isNew, attempt]);

  if (isNew) return <ProjectForm />;
  return <section className="projects-page">
    <div className="projects-heading">
      <div><p className="projects-eyebrow">Organização do trabalho</p><h2>{isDetail ? "Detalhes do projeto" : "Projetos"}</h2>
        <p>Reúna o contexto do cliente e organize os requisitos da sua equipe.</p></div>
      <button className="btn-primary" onClick={() => navigate(isDetail ? "/projects" : "/projects/new")}>{isDetail ? "Voltar aos projetos" : "Novo projeto"}</button>
    </div>
    {result.state === "loading" && <div className="glass-panel projects-state" role="status">Carregando {isDetail ? "projeto" : "projetos"}…</div>}
    {result.state === "error" && <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
      <button className="btn-secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>}
    {result.state === "ready" && (isDetail ? <ProjectDetail project={result.projects[0]} /> : result.projects.length === 0
      ? <div className="glass-panel projects-state"><h3>Nenhum projeto cadastrado</h3><p>Crie o primeiro projeto para começar a organizar o trabalho.</p>
        <button className="btn-primary" onClick={() => navigate("/projects/new")}>Criar primeiro projeto</button></div>
      : <div className="projects-grid">{result.projects.map(project => <article className="glass-panel project-card" key={project.id}>
        <span className={`badge ${project.status === "ativo" ? "badge-success" : "badge-warning"}`}>{project.status}</span>
        <h3>{project.nome}</h3><p>{project.cliente}</p><p className="project-excerpt">{project.descricao}</p>
        <button className="btn-secondary" onClick={() => navigate(`/projects/${project.id}`)} aria-label={`Abrir projeto ${project.nome}`}>Ver projeto</button>
      </article>)}</div>)}
  </section>;
}

function ProjectDetail({ project }: { project: Project }) {
  return <article className="glass-panel project-card">
    <span className={`badge ${project.status === "ativo" ? "badge-success" : "badge-warning"}`}>{project.status}</span>
    <h3>{project.nome}</h3><dl><dt>Cliente</dt><dd>{project.cliente}</dd><dt>Descrição</dt><dd className="project-description">{project.descricao}</dd></dl>
  </article>;
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
  const valid = Object.values(values).every(value => value.trim().length > 0) && Object.keys(errors).length === 0;
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
      if (!input.descricao) invalid.descricao = "Informe a descrição.";
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
      <p>Todos os campos são obrigatórios.</p>
      {([ ["nome", "Nome do projeto"], ["cliente", "Cliente"], ["descricao", "Descrição"] ] as const).map(([field, label]) => {
        const props = { id: field, name: field, required: true, disabled: busy, value: values[field], "aria-invalid": Boolean(errors[field]),
          "aria-describedby": errors[field] ? `${field}-error` : undefined,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            setValues(previous => ({ ...previous, [field]: event.target.value }));
            setErrors(previous => { const next = { ...previous }; delete next[field]; return next; });
            setMessage("");
          } };
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
