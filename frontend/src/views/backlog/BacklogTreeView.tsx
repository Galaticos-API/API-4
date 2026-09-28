import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ApiError,
} from "../../api/api_auth";
import { MIN_QUERY_LENGTH } from "../../api/api_backlog_search";
import {
  getProjectBacklogTree,
  type ProjectBacklogTree
} from "../../api/api_backlog_tree";
import { isSearchQuery } from "../../models/backlogSearch";
import {
  navigate,
} from "../../models/navigation";
import { Button } from "../common/ui";
import { BacklogSearchResults } from "./BacklogSearchResults";
import { TreeEpic } from "./BacklogTreeNodes";
import { EMPTY_FILTERS, MAX_QUERY_LENGTH, STATUS_OPTIONS, filterBacklogTree, readFilters, storageKey, type BacklogFilters } from "./backlogTreeFilters";
export { filterBacklogTree } from "./backlogTreeFilters";
export type { BacklogFilters } from "./backlogTreeFilters";

type Result =
  | {
    state: "loading";
  }
  | {
    state: "error";
    message: string;
  }
  | {
    state: "ready";
    tree: ProjectBacklogTree;
  };

export function BacklogTreeView({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  const [
    result,
    setResult,
  ] = useState<Result>({
    state: "loading",
  });

  const [
    attempt,
    setAttempt,
  ] = useState(0);

  const [
    filters,
    setFilters,
  ] = useState<BacklogFilters>(
    () => readFilters(projectId),
  );

  const [
    expandedEpics,
    setExpandedEpics,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  const [
    expandedFeatures,
    setExpandedFeatures,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const controller =
      new AbortController();

    setResult({
      state: "loading",
    });

    getProjectBacklogTree(
      projectId,
      controller.signal,
    )
      .then((tree) => {
        if (
          !controller.signal.aborted
        ) {
          setResult({
            state: "ready",
            tree,
          });
        }
      })
      .catch((error) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        setResult({
          state: "error",

          message:
            error instanceof ApiError
              && error.status === 404
              ? "Projeto não encontrado."
              : "Não foi possível carregar a árvore do backlog.",
        });
      });

    return () =>
      controller.abort();
  }, [
    projectId,
    attempt,
  ]);

  useEffect(() => {
    try {
      window.sessionStorage
        .setItem(
          storageKey(projectId),
          JSON.stringify(filters),
        );
    } catch {
      // A navegação continua funcional
      // quando o navegador bloqueia
      // sessionStorage.
    }
  }, [
    filters,
    projectId,
  ]);

  const [
    debouncedQuery,
    setDebouncedQuery,
  ] = useState(
    () => filters.query.trim(),
  );

  useEffect(() => {
    const timer =
      window.setTimeout(
        () =>
          setDebouncedQuery(
            filters.query.trim(),
          ),
        300,
      );

    return () =>
      window.clearTimeout(timer);
  }, [filters.query]);

  const searchMode =
    isSearchQuery(
      debouncedQuery,
      MIN_QUERY_LENGTH,
    );

  const filteredTree =
    useMemo(
      () =>
        result.state === "ready"
          ? filterBacklogTree(
            result.tree,
            filters,
          )
          : null,
      [
        result,
        filters,
      ],
    );

  const activeFilterCount =
    Number(
      Boolean(filters.status),
    )
    + Number(
      Boolean(
        filters.technologyId,
      ),
    )
    + Number(
      Boolean(
        filters.query.trim(),
      ),
    );

  const treeFiltersActive =
    Boolean(filters.status)
    || Boolean(
      filters.technologyId,
    );

  const filtersActive =
    activeFilterCount > 0;

  const toggle = (
    set: Set<string>,
    id: string,
  ) => {
    const next =
      new Set(set);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    return next;
  };

  const clearFilters = () => {
    setFilters(
      EMPTY_FILTERS,
    );

    setDebouncedQuery("");
  };

  const clearSearch = () => {
    setFilters(
      (current) => ({
        ...current,
        query: "",
      }),
    );

    setDebouncedQuery("");
  };

  return (
    <section
      className="backlog-tree"
      aria-labelledby="backlog-tree-title"
    >
      <div className="projects-heading">
        <div>
          <p className="projects-eyebrow">
            ÁRVORE DO PROJETO
          </p>

          <h2 id="backlog-tree-title">
            Backlog hierárquico
          </h2>

          <p>
            Expanda épicos e features
            para navegar até os PBIs.
          </p>
        </div>

        {canCreate && (
          <Button
            variant="primary"
            onClick={() =>
              navigate(
                `/projects/${projectId}`
                + "/epics/new",
              )
            }
          >
            + Novo épico
          </Button>
        )}
      </div>

      {result.state === "ready"
        && (
          <div
            className="backlog-tree-filters"
            aria-label="Filtros do backlog"
          >
            <label className="project-filter backlog-search-field">
              Buscar no backlog

              <input
                type="search"
                value={filters.query}
                maxLength={MAX_QUERY_LENGTH}
                placeholder="Título, descrição ou código"
                autoComplete="off"
                aria-describedby="backlog-search-help"
                onChange={(event) =>
                  setFilters(
                    (current) => ({
                      ...current,

                      query:
                        event.target
                          .value,
                    }),
                  )
                }
              />

              <span
                id="backlog-search-help"
                className="help"
              >
                {filters.query.trim().length > 0
                  && !searchMode
                  && filters.query.trim().length
                  < MIN_QUERY_LENGTH
                  ? `Digite ao menos ${MIN_QUERY_LENGTH} caracteres.`
                  : "Busca apenas neste projeto, combinada com os filtros."}
              </span>
            </label>

            <label className="project-filter">
              Status

              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters(
                    (current) => ({
                      ...current,

                      status:
                        event.target
                          .value,
                    }),
                  )
                }
              >
                <option value="">
                  Todos os status
                </option>

                {STATUS_OPTIONS.map(({ value, label }) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="project-filter">
              Tecnologia

              <select
                value={
                  filters.technologyId
                }
                onChange={(event) =>
                  setFilters(
                    (current) => ({
                      ...current,

                      technologyId:
                        event.target
                          .value,
                    }),
                  )
                }
              >
                <option value="">
                  Todas as tecnologias
                </option>

                {result.tree
                  .technologies
                  .map(
                    (technology) => (
                      <option
                        value={
                          technology.id
                        }
                        key={
                          technology.id
                        }
                      >
                        {technology.nome}
                      </option>
                    ),
                  )}
              </select>
            </label>

            <span
              className="backlog-tree-filter-count"
              aria-live="polite"
            >
              {activeFilterCount}
              {" "}
              {activeFilterCount === 1
                ? "filtro ativo"
                : "filtros ativos"}
            </span>

            {filtersActive && (
              <Button
                variant="secondary"
                type="button"
                onClick={
                  clearFilters
                }
              >
                Limpar filtros
              </Button>
            )}
          </div>
        )}

      {result.state === "loading"
        && (
          <div
            className="ds-card projects-state"
            role="status"
          >
            Carregando árvore
            do backlog…
          </div>
        )}

      {result.state === "error"
        && (
          <div className="ds-card projects-state">
            <p role="alert">
              {result.message}
            </p>

            <Button
              variant="secondary"
              onClick={() =>
                setAttempt(
                  (value) =>
                    value + 1,
                )
              }
            >
              Tentar novamente
            </Button>
          </div>
        )}

      {result.state === "ready"
        && searchMode
        && (
          <>
            <p className="help">
              Mostrando resultados da busca.
              {" "}
              <button
                type="button"
                className="backlog-search-back"
                onClick={clearSearch}
              >
                Voltar à árvore
              </button>
            </p>

            <BacklogSearchResults
              projectId={projectId}
              projectName={result.tree.project.nome}
              query={debouncedQuery}
              status={filters.status}
              technologyId={filters.technologyId}
              filtersActive={treeFiltersActive}
              onClearSearch={clearSearch}
              onClearAll={clearFilters}
            />
          </>
        )}

      {result.state === "ready"
        && !searchMode
        && result.tree.epics
          .length === 0
        && (
          <div className="ds-card projects-state">
            <h3>
              Este projeto ainda
              não possui épicos
            </h3>

            <p>
              Crie o primeiro épico
              para começar a organizar
              features e PBIs.
            </p>

            {canCreate && (
              <Button
                variant="primary"
                onClick={() =>
                  navigate(
                    `/projects/${projectId}`
                    + "/epics/new",
                  )
                }
              >
                Criar primeiro épico
              </Button>
            )}
          </div>
        )}

      {result.state === "ready"
        && !searchMode
        && result.tree.epics
          .length > 0
        && filteredTree?.epics
          .length === 0
        && (
          <div className="ds-card projects-state">
            <h3>
              Nenhum item corresponde
              aos filtros
            </h3>

            <p>
              Altere a combinação
              de status e tecnologia
              ou limpe os critérios.
            </p>

            <Button
              variant="primary"
              type="button"
              onClick={clearFilters}
            >
              Limpar filtros
            </Button>
          </div>
        )}

      {filteredTree
        && !searchMode
        && filteredTree.epics
          .length > 0
        && (
          <ul
            className="backlog-tree-list"
            aria-label="Hierarquia do backlog"
          >
            {filteredTree.epics.map(
              (epic) => (
                <TreeEpic
                  key={epic.id}
                  projectId={
                    projectId
                  }
                  epic={epic}
                  open={
                    expandedEpics
                      .has(epic.id)
                  }
                  forcedOpen={
                    treeFiltersActive
                  }
                  expandedFeatures={
                    expandedFeatures
                  }
                  onToggle={() =>
                    setExpandedEpics(
                      (current) =>
                        toggle(
                          current,
                          epic.id,
                        ),
                    )
                  }
                  onToggleFeature={
                    (id) =>
                      setExpandedFeatures(
                        (current) =>
                          toggle(
                            current,
                            id,
                          ),
                      )
                  }
                />
              ),
            )}
          </ul>
        )}
    </section>
  );
}
