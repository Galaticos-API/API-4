import { useEffect, useState } from "react";
import { ApiError } from "../../api/api_auth";
import {
  getProject,
  listProjects,
  type Project
} from "../../api/api_projects";
import "../../assets/styles/projects.css";
import { navigate, parseBacklogRoute } from "../../models/navigation";
import { BacklogScreen } from "../backlog/BacklogView";
import { SearchField } from "../common/SearchField";
import { Button } from "../common/ui";
import { ProjectArchiveView } from "./ProjectArchiveView";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectForm } from "./ProjectForm";

type Result =
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
    state: "ready";
    projects: Project[];
    total: number;
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
        <div className="ds-card">
          <h2>Acesso de leitura</h2>

          <p role="alert">
            Seu perfil não permite criar projetos.
          </p>

          <Button
            variant="secondary"
            onClick={() => navigate("/projects")}
          >
            Voltar aos projetos
          </Button>
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

        </div>

        {(isDetail || canCreate) && (
          <Button
            variant="primary"
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
          </Button>
        )}
      </div>

      {result.state === "loading" && (
        <div
          className="ds-card"
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
        <div className="ds-card">
          <p
            role="alert"
            style={{ color: "var(--status-danger)" }}
          >
            {result.message}
          </p>

          <Button
            variant="secondary"
            onClick={() =>
              setAttempt((value) => value + 1)
            }
          >
            Tentar novamente
          </Button>
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
            className="ds-card"
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
                <Button
                  variant="primary"
                  style={{
                    marginTop: "16px",
                  }}
                  onClick={() =>
                    navigate("/projects/new")
                  }
                >
                  Criar primeiro projeto
                </Button>
              )}
          </div>
        ) : (
          <div className="ds-grid ds-grid--three">
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
                  className="ds-card"
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
                      className={`ds-badge ${project.status === "ativo"
                        ? "ds-badge--success"
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
                          color: "var(--text-secondary)",
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
                    <Button
                      variant="ghost"
                      onClick={() =>
                        navigate(
                          `/projects/${project.id}`,
                        )
                      }
                      aria-label={`Abrir projeto ${project.nome}`}
                    >
                      Abrir projeto →
                    </Button>

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
          <Button
            variant="secondary"
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
          </Button>

          <span>
            Página {Math.floor(offset / 50) + 1}
            {result.state === "ready"
              ? ` · ${result.total} projetos`
              : ""}
          </span>

          <Button
            variant="secondary"
            disabled={
              result.state !== "ready" ||
              offset + 50 >= result.total
            }
            onClick={() =>
              setOffset((value) => value + 50)
            }
          >
            Próxima
          </Button>
        </nav>
      )}
    </div>
  );
}
