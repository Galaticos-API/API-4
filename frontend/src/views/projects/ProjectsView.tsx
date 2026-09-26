import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/api_auth";
import { navigate } from "../../models/navigation";
import {
  createProject,
  getProject,
  listProjects,
  type Project,
  type ProjectInput,
} from "../../api/api_projects";
import { parseBacklogRoute } from "../../models/navigation";
import { BacklogScreen } from "../backlog/BacklogView";
import { BacklogTreeView } from "../backlog/BacklogTreeView";
import { RepoAnalyzerView } from "./RepoAnalyzerView";
import { DocumentsView } from "../documents/DocumentsView";
import { DecisionsPanel } from "../backlog/DecisionsPanel";
import "../../assets/styles/garakis-prototype.css";
import "../../assets/styles/projects.css";
import { ProjectArchiveView } from "./ProjectArchiveView";
import { SearchField } from "../common/SearchField";

type Result =
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      projects: Project[];
      total: number;
    };

const empty: ProjectInput = {
  nome: "",
  cliente: "",
  descricao: "",
};

export function ProjectsView({
  pathname,
  canCreate = false,
}: {
  pathname: string;
  canCreate?: boolean;
}) {
  const backlogRoute = parseBacklogRoute(pathname);

  const projectRoute = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)(?:\/documents)?$/);
  const id = backlogRoute
    ? backlogRoute.projectId
    : projectRoute?.[1] ?? pathname.slice("/projects/".length);

  const isNew = id === "new" && !backlogRoute;

  const isDetail =
    pathname !== "/projects" &&
    !isNew &&
    !backlogRoute;

  const [result, setResult] = useState<Result>({
    state: "loading",
  });

  const [attempt, setAttempt] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isNew || backlogRoute) {
      return;
    }

    const controller = new AbortController();

    setResult({
      state: "loading",
    });

    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);

    const request = isDetail
      ? getProject(id, signal).then((project) => ({
          projects: [project],
          total: 1,
        }))
      : listProjects(signal, offset, status);

    request
      .then((page) => {
        if (!controller.signal.aborted) {
          setResult({
            state: "ready",
            ...page,
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setResult({
          state: "error",
          message:
            error instanceof ApiError && error.status === 404
              ? "Projeto não encontrado."
              : error instanceof ApiError && error.status === 401
                ? "É necessário entrar para acessar os projetos."
                : error instanceof ApiError && error.status === 403
                  ? "Você não tem permissão para acessar estes projetos."
                  : "Não foi possível carregar os projetos. Tente novamente.",
        });
      });

    return () => controller.abort();
  }, [
    id,
    isDetail,
    isNew,
    Boolean(backlogRoute),
    attempt,
    offset,
    status,
  ]);

  if (backlogRoute) {
    return (
      <BacklogScreen
        route={backlogRoute}
        canCreate={canCreate}
      />
    );
  }

  if (isNew) {
    return canCreate ? (
      <ProjectForm />
    ) : (
      <div className="page-container">
        <div className="card-garakis">
          <h2>Acesso de leitura</h2>

          <p role="alert">
            Seu perfil não permite criar projetos.
          </p>

          <button
            className="btn-garakis secondary"
            onClick={() => navigate("/projects")}
          >
            Voltar aos projetos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="head-section">
        <div>
          <div className="eyebrow">
            ESPAÇO DE TRABALHO
          </div>

          <h1>
            {isDetail
              ? "Detalhes do projeto"
              : "Projetos"}
          </h1>

          <p className="muted">
            Cada projeto concentra seu backlog,
            documentos e decisões.
          </p>
        </div>

        {(isDetail || canCreate) && (
          <button
            className="btn-garakis primary"
            onClick={() =>
              navigate(
                isDetail
                  ? "/projects"
                  : "/projects/new",
              )
            }
          >
            {isDetail
              ? "← Voltar aos projetos"
              : "+ Criar projeto"}
          </button>
        )}
      </div>

      {result.state === "loading" && (
        <div
          className="card-garakis"
          role="status"
        >
          Carregando{" "}
          {isDetail
            ? "projeto"
            : "projetos"}
          …
        </div>
      )}

      {result.state === "error" && (
        <div className="card-garakis">
          <p
            role="alert"
            style={{ color: "var(--red)" }}
          >
            {result.message}
          </p>

          <button
            className="btn-garakis secondary"
            onClick={() =>
              setAttempt((value) => value + 1)
            }
          >
            Tentar novamente
          </button>
        </div>
      )}

      {result.state === "ready" &&
        (isDetail ? (
          <>
            <ProjectDetail
              initialTab={pathname.endsWith("/documents") ? "documents" : undefined}
              project={result.projects[0]}
              canCreate={
                canCreate &&
                result.projects[0].status !==
                  "arquivado"
              }
            />

            <ProjectArchiveView
              key={id}
              project={result.projects[0]}
              canWrite={canCreate}
              onArchived={(project) =>
                setResult({
                  state: "ready",
                  projects: [project],
                  total: 1,
                })
              }
            />
          </>
        ) : result.projects.length === 0 ? (
          <div
            className="card-garakis"
            style={{
              textAlign: "center",
              padding: "48px 24px",
            }}
          >
            <h3>
              {status === "arquivado"
                ? "Nenhum projeto arquivado"
                : "Nenhum projeto cadastrado"}
            </h3>

            <p className="muted">
              {status === "arquivado"
                ? "Os projetos arquivados poderão ser consultados aqui."
                : "Crie o primeiro projeto para começar a organizar o trabalho."}
            </p>

            {canCreate &&
              status !== "arquivado" && (
                <button
                  className="btn-garakis primary"
                  style={{
                    marginTop: "16px",
                  }}
                  onClick={() =>
                    navigate("/projects/new")
                  }
                >
                  Criar primeiro projeto
                </button>
              )}
          </div>
        ) : (
          <div className="grid-garakis three">
            {result.projects
              .filter((project) =>
                `${project.nome} ${project.cliente} ${project.descricao}`
                  .toLocaleLowerCase("pt-BR")
                  .includes(
                    search
                      .trim()
                      .toLocaleLowerCase("pt-BR"),
                  ),
              )
              .map((project) => (
                <article
                  className="card-garakis"
                  key={project.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent:
                      "space-between",
                    minHeight: "180px",
                  }}
                >
                  <div>
                    <span
                      className={`badge-garakis ${
                        project.status === "ativo"
                          ? "green"
                          : ""
                      }`}
                    >
                      {project.status}
                    </span>

                    <h3
                      style={{
                        marginTop: "10px",
                        fontSize: "1.25rem",
                        color: "#fff",
                      }}
                    >
                      {project.nome}
                    </h3>

                    <p
                      className="muted"
                      style={{
                        fontSize: "0.85rem",
                        margin: "6px 0 12px",
                      }}
                    >
                      Cliente: {project.cliente}{" "}
                      {project.documentos_count !==
                      undefined
                        ? `· ${project.documentos_count} documentos`
                        : ""}
                    </p>

                    {project.descricao && (
                      <p
                        className="project-excerpt"
                        style={{
                          fontSize: "0.88rem",
                          color: "var(--muted)",
                        }}
                      >
                        {project.descricao}
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: "16px",
                    }}
                  >
                    <button
                      className="btn-garakis ghost"
                      onClick={() =>
                        navigate(
                          `/projects/${project.id}`,
                        )
                      }
                      aria-label={`Abrir projeto ${project.nome}`}
                    >
                      Abrir projeto →
                    </button>

                    {project.status ===
                      "arquivado" && (
                      <p
                        className="help"
                        style={{
                          marginTop: "4px",
                        }}
                      >
                        Arquivado em:{" "}
                        {project.archived_at
                          ? new Date(
                              project.archived_at,
                            ).toLocaleString(
                              "pt-BR",
                            )
                          : "data não registrada"}
                      </p>
                    )}
                  </div>
                </article>
              ))}
          </div>
        ))}

      {!isDetail && (
        <div
          className="project-filters"
          style={{ marginTop: "24px" }}
        >
          <SearchField
            label="Buscar projetos"
            value={search}
            onChange={setSearch}
            placeholder="Nome, cliente ou descrição"
          />

          <label className="project-filter">
            Exibir projetos

            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">
                Não arquivados
              </option>

              <option value="arquivado">
                Arquivados
              </option>

              <option value="todos">
                Todos
              </option>
            </select>
          </label>
        </div>
      )}

      {!isDetail && !isNew && (
        <nav
          className="project-actions"
          aria-label="Paginação de projetos"
          style={{ marginTop: "16px" }}
        >
          <button
            className="btn-garakis secondary"
            disabled={
              offset === 0 ||
              result.state === "loading"
            }
            onClick={() =>
              setOffset((value) =>
                Math.max(0, value - 50),
              )
            }
          >
            Anterior
          </button>

          <span>
            Página {Math.floor(offset / 50) + 1}
            {result.state === "ready"
              ? ` · ${result.total} projetos`
              : ""}
          </span>

          <button
            className="btn-garakis secondary"
            disabled={
              result.state !== "ready" ||
              offset + 50 >= result.total
            }
            onClick={() =>
              setOffset((value) => value + 50)
            }
          >
            Próxima
          </button>
        </nav>
      )}
    </div>
  );
}

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

function ProjectDetail({
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
            className={`badge-garakis ${
              project.status === "ativo"
                ? "green"
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

        <button
          className="btn-garakis secondary"
          onClick={() => selectTab("backlog")}
        >
          Abrir backlog
        </button>
      </div>

      {project.status === "arquivado" && (
        <div
          className="card-garakis"
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

      <div className="project-tabs-garakis" role="tablist" aria-label="Contexto do projeto">
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
        <div className="grid-garakis three">
          <article className="card-garakis">
            <h2>Backlog</h2>

            <p className="muted">
              Épicos, features e comportamentos
              testáveis em PBIs.
            </p>

            <button
              className="btn-garakis ghost"
              onClick={() =>
                selectTab("backlog")
              }
            >
              Ver itens de trabalho →
            </button>
          </article>

          <article className="card-garakis">
            <h2>Documentos</h2>

            <p className="muted">
              Referências e documentos de
              especificação indexados.
            </p>

            <button
              className="btn-garakis ghost"
              onClick={() =>
                selectTab("documents")
              }
            >
              Ver documentos →
            </button>
          </article>

          <article className="card-garakis">
            <h2>Conhecimento</h2>

            <p className="muted">
              O conteúdo processado pode ser
              pesquisado e consultado.
            </p>

            <button
              className="btn-garakis ghost"
              onClick={() =>
                navigate("/knowledge")
              }
            >
              Pesquisar acervo →
            </button>
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

function ProjectForm() {
  const [values, setValues] =
    useState<ProjectInput>(empty);

  const [errors, setErrors] = useState<
    Partial<ProjectInput>
  >({});

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);

  const form =
    useRef<HTMLFormElement>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const valid =
    values.nome.trim().length > 0 &&
    values.cliente.trim().length > 0 &&
    values.nome.trim().length <= 255 &&
    values.cliente.trim().length <= 255 &&
    Object.keys(errors).length === 0;

  return (
    <div className="page-container">
      <div className="crumb-bar">
        <button
          onClick={() => navigate("/projects")}
        >
          Projetos
        </button>

        <span>/</span>

        <b>Novo projeto</b>
      </div>

      <h1>Crie um espaço de trabalho</h1>

      <p className="muted">
        O projeto será o contexto para backlog,
        documentos e decisões.
      </p>

      <article
        className="card-garakis"
        style={{
          maxWidth: "700px",
          marginTop: "24px",
        }}
      >
        <form
          ref={form}
          noValidate
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();

            if (submitting.current) {
              return;
            }

            const input = Object.fromEntries(
              Object.entries(values).map(
                ([key, value]) => [
                  key,
                  value.trim(),
                ],
              ),
            ) as unknown as ProjectInput;

            const invalid: Partial<ProjectInput> =
              {};

            if (!input.nome) {
              invalid.nome =
                "Informe o nome do projeto.";
            }

            if (!input.cliente) {
              invalid.cliente =
                "Informe o cliente.";
            }

            if (input.nome.length > 255) {
              invalid.nome =
                "O nome não pode exceder 255 caracteres.";
            }

            if (input.cliente.length > 255) {
              invalid.cliente =
                "O cliente não pode exceder 255 caracteres.";
            }

            setErrors(invalid);
            setMessage("");

            if (
              Object.keys(invalid).length
            ) {
              form.current
                ?.querySelector<HTMLElement>(
                  `[name="${Object.keys(invalid)[0]}"]`,
                )
                ?.focus();

              return;
            }

            submitting.current = true;
            setBusy(true);

            try {
              const project =
                await createProject(input);

              if (mounted.current) {
                navigate(
                  `/projects/${project.id}`,
                );
              }
            } catch (error) {
              if (!mounted.current) {
                return;
              }

              if (
                error instanceof ApiError &&
                error.status === 409
              ) {
                setErrors({
                  nome: "Este nome já está em uso por um projeto ativo.",
                });
              } else {
                setMessage(
                  error instanceof ApiError &&
                    error.status === 401
                    ? "É necessário entrar para criar projetos."
                    : error instanceof
                          ApiError &&
                        error.status === 403
                      ? "Você não tem permissão para criar projetos. Entre em contato com o administrador."
                      : error instanceof
                            ApiError &&
                          [400, 422].includes(
                            error.status,
                          )
                        ? "Revise os dados informados. O servidor recusou o cadastro."
                        : "Não foi possível confirmar a criação. Consulte a lista de projetos antes de tentar novamente.",
                );
              }
            } finally {
              submitting.current = false;

              if (mounted.current) {
                setBusy(false);
              }
            }
          }}
        >
          <div className="field-garakis">
            <label htmlFor="nome">
              Nome do projeto
            </label>

            <input
              id="nome"
              name="nome"
              type="text"
              className="input-garakis"
              required
              disabled={busy}
              value={values.nome}
              aria-invalid={Boolean(
                errors.nome,
              )}
              onChange={(event) => {
                setValues((value) => ({
                  ...value,
                  nome: event.target.value,
                }));

                setErrors((value) => {
                  const next = {
                    ...value,
                  };

                  delete next.nome;
                  return next;
                });

                setMessage("");
              }}
            />

            <span className="help">
              O nome deve ser único entre
              projetos ativos.
            </span>

            {errors.nome && (
              <p
                id="nome-error"
                role="alert"
                style={{
                  color: "var(--red)",
                  fontSize: "12px",
                  margin: "2px 0 0",
                }}
              >
                {errors.nome}
              </p>
            )}
          </div>

          <div className="field-garakis">
            <label htmlFor="cliente">
              Cliente
            </label>

            <input
              id="cliente"
              name="cliente"
              type="text"
              className="input-garakis"
              required
              disabled={busy}
              value={values.cliente}
              aria-invalid={Boolean(
                errors.cliente,
              )}
              onChange={(event) => {
                setValues((value) => ({
                  ...value,
                  cliente:
                    event.target.value,
                }));

                setErrors((value) => {
                  const next = {
                    ...value,
                  };

                  delete next.cliente;
                  return next;
                });

                setMessage("");
              }}
            />

            {errors.cliente && (
              <p
                id="cliente-error"
                role="alert"
                style={{
                  color: "var(--red)",
                  fontSize: "12px",
                  margin: "2px 0 0",
                }}
              >
                {errors.cliente}
              </p>
            )}
          </div>

          <div className="field-garakis">
            <label htmlFor="descricao">
              Descrição
            </label>

            <input
              id="descricao"
              name="descricao"
              type="text"
              className="input-garakis"
              disabled={busy}
              value={values.descricao}
              onChange={(event) => {
                setValues((value) => ({
                  ...value,
                  descricao:
                    event.target.value,
                }));

                setMessage("");
              }}
            />
          </div>

          {message && (
            <p
              role="alert"
              style={{
                color: "var(--red)",
              }}
            >
              {message}
            </p>
          )}

          <p role="status">
            {busy
              ? "Criando projeto…"
              : valid
                ? "Dados preenchidos. Pronto para criar."
                : "Preencha os campos para criar o projeto."}
          </p>

          <div
            style={{
              marginTop: "20px",
            }}
          >
            <button
              type="submit"
              className="btn-garakis primary"
              disabled={busy}
            >
              {busy
                ? "Criando…"
                : "Criar projeto"}
            </button>
          </div>
        </form>
      </article>
    </div>
  );
}
