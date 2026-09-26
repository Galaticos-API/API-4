import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ApiError,
} from "../../api/api_auth";

import {
  getProjectBacklogTree,
  type BacklogEpicNode,
  type BacklogFeatureNode,
  type BacklogPbiNode,
  type ProjectBacklogTree,
} from "../../api/api_backlog_tree";

import {
  navigate,
} from "../../models/navigation";

import { MIN_QUERY_LENGTH } from "../../api/api_backlog_search";
import { isSearchQuery } from "../../models/backlogSearch";
import { BacklogSearchResults } from "./BacklogSearchResults";

export interface BacklogFilters {
  status: string;
  technologyId: string;
  query: string;
}

const MAX_QUERY_LENGTH = 100;

type TreeFilters = Pick<BacklogFilters, "status" | "technologyId">;

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

const EMPTY_FILTERS:
  BacklogFilters = {
    status: "",
    technologyId: "",
    query: "",
  };

const STATUS_OPTIONS = [
  { value: "rascunho", label: "Rascunho" },
  { value: "ativo", label: "Ativo" },
  { value: "concluido", label: "Concluído" },
  { value: "arquivado", label: "Arquivado" },
] as const;
const VALID_STATUSES = new Set([
  "",
  ...STATUS_OPTIONS.map(({ value }) => value),
]);

function storageKey(
  projectId: string,
) {
  return (
    "sinapse.backlog.filters."
    + projectId
  );
}

function readFilters(
  projectId: string,
): BacklogFilters {
  try {
    const stored =
      window.sessionStorage
        .getItem(
          storageKey(projectId),
        );

    if (!stored) {
      return EMPTY_FILTERS;
    }

    const value =
      JSON.parse(
        stored,
      ) as Partial<BacklogFilters>;

    return {
      status:
        typeof value.status
          === "string"
        && VALID_STATUSES.has(
          value.status,
        )
          ? value.status
          : "",

      technologyId:
        typeof value.technologyId
          === "string"
          ? value.technologyId
          : "",

      query:
        typeof value.query
          === "string"
          ? value.query.slice(0, MAX_QUERY_LENGTH)
          : "",
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

function matches(
  item: {
    status: string;

    tecnologias:
      Array<{
        id: string;
      }>;
  },

  filters: TreeFilters,
) {
  return (
    (
      !filters.status
      || item.status
        === filters.status
    )
    && (
      !filters.technologyId
      || item.tecnologias.some(
        (technology) =>
          technology.id
          === filters.technologyId,
      )
    )
  );
}

export function filterBacklogTree(
  tree: ProjectBacklogTree,
  filters: TreeFilters,
): ProjectBacklogTree {
  if (
    !filters.status
    && !filters.technologyId
  ) {
    return tree;
  }

  const epics =
    tree.epics.flatMap(
      (epic) => {
        const features =
          epic.features.flatMap(
            (feature) => {
              const pbis =
                feature.pbis.filter(
                  (pbi) =>
                    matches(
                      pbi,
                      filters,
                    ),
                );

              return (
                matches(
                  feature,
                  filters,
                )
                || pbis.length > 0
              )
                ? [
                    {
                      ...feature,
                      pbis,
                    },
                  ]
                : [];
            },
          );

        return (
          matches(
            epic,
            filters,
          )
          || features.length > 0
        )
          ? [
              {
                ...epic,
                features,
              },
            ]
          : [];
      },
    );

  return {
    ...tree,
    epics,
  };
}

const statusLabels:
  Record<string, string> = {
    rascunho: "Rascunho",
    ativo: "Ativo",
    pronto: "Pronto",
    concluido: "Concluído",
    arquivado: "Arquivado",
  };

function Technologies({
  values,
}: {
  values:
    Array<{
      id: string;
      nome: string;
    }>;
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <span className="backlog-tree-technologies">
      {values.map(
        (item) => (
          <span key={item.id}>
            {item.nome}
          </span>
        ),
      )}
    </span>
  );
}

function ItemMeta({
  item,
}: {
  item: {
    status: string;

    tecnologias:
      Array<{
        id: string;
        nome: string;
      }>;
  };
}) {
  return (
    <span className="backlog-tree-meta">
      <span
        className={
          `badge-garakis ${
            item.status
              === "concluido"
              ? "green"
              : ""
          }`
        }
      >
        {statusLabels[item.status]
          ?? item.status}
      </span>

      <Technologies
        values={item.tecnologias}
      />
    </span>
  );
}

function TreePbi({
  projectId,
  epicId,
  featureId,
  pbi,
}: {
  projectId: string;
  epicId: string;
  featureId: string;
  pbi: BacklogPbiNode;
}) {
  const path =
    `/projects/${projectId}`
    + `/epics/${epicId}`
    + `/features/${featureId}`
    + `/pbis/${pbi.id}`;

  return (
    <li className="backlog-tree-pbi">
      <span
        className="backlog-tree-marker"
        aria-hidden="true"
      >
        PBI
      </span>

      <button
        className="backlog-tree-link"
        type="button"
        onClick={() =>
          navigate(path)
        }
      >
        {pbi.codigo
          ? `${pbi.codigo} — `
          : ""}

        {pbi.titulo}
      </button>

      <ItemMeta item={pbi} />
    </li>
  );
}

function TreeFeature({
  projectId,
  epicId,
  feature,
  open,
  forcedOpen,
  onToggle,
}: {
  projectId: string;
  epicId: string;
  feature: BacklogFeatureNode;
  open: boolean;
  forcedOpen: boolean;
  onToggle: () => void;
}) {
  const isOpen =
    forcedOpen || open;

  const path =
    `/projects/${projectId}`
    + `/epics/${epicId}`
    + `/features/${feature.id}`;

  return (
    <li className="backlog-tree-feature">
      <div className="backlog-tree-row">
        <button
          className="backlog-tree-toggle"
          type="button"
          aria-expanded={isOpen}
          aria-label={
            `${
              isOpen
                ? "Recolher"
                : "Expandir"
            } feature ${feature.titulo}`
          }
          onClick={onToggle}
          disabled={forcedOpen}
        >
          <span aria-hidden="true">
            {isOpen ? "▾" : "▸"}
          </span>
        </button>

        <span
          className="backlog-tree-marker"
          aria-hidden="true"
        >
          Feature
        </span>

        <button
          className="backlog-tree-link"
          type="button"
          onClick={() =>
            navigate(path)
          }
        >
          {feature.titulo}
        </button>

        <ItemMeta item={feature} />
      </div>

      {isOpen && (
        feature.pbis.length > 0
          ? (
              <ul
                className="backlog-tree-children"
                aria-label={
                  `PBIs de ${feature.titulo}`
                }
              >
                {feature.pbis.map(
                  (pbi) => (
                    <TreePbi
                      key={pbi.id}
                      projectId={
                        projectId
                      }
                      epicId={epicId}
                      featureId={
                        feature.id
                      }
                      pbi={pbi}
                    />
                  ),
                )}
              </ul>
            )
          : (
              <p className="backlog-tree-empty-branch">
                Nenhum PBI corresponde
                nesta feature.
              </p>
            )
      )}
    </li>
  );
}

function TreeEpic({
  projectId,
  epic,
  open,
  forcedOpen,
  expandedFeatures,
  onToggle,
  onToggleFeature,
}: {
  projectId: string;
  epic: BacklogEpicNode;
  open: boolean;
  forcedOpen: boolean;
  expandedFeatures: Set<string>;
  onToggle: () => void;
  onToggleFeature:
    (id: string) => void;
}) {
  const isOpen =
    forcedOpen || open;

  return (
    <li className="backlog-tree-epic">
      <div className="backlog-tree-row">
        <button
          className="backlog-tree-toggle"
          type="button"
          aria-expanded={isOpen}
          aria-label={
            `${
              isOpen
                ? "Recolher"
                : "Expandir"
            } épico ${epic.titulo}`
          }
          onClick={onToggle}
          disabled={forcedOpen}
        >
          <span aria-hidden="true">
            {isOpen ? "▾" : "▸"}
          </span>
        </button>

        <span
          className="backlog-tree-marker"
          aria-hidden="true"
        >
          Épico
        </span>

        <button
          className="backlog-tree-link"
          type="button"
          onClick={() =>
            navigate(
              `/projects/${projectId}`
              + `/epics/${epic.id}`,
            )
          }
        >
          {epic.titulo}
        </button>

        <ItemMeta item={epic} />
      </div>

      {isOpen && (
        epic.features.length > 0
          ? (
              <ul
                className="backlog-tree-children"
                aria-label={
                  `Features de ${epic.titulo}`
                }
              >
                {epic.features.map(
                  (feature) => (
                    <TreeFeature
                      key={feature.id}
                      projectId={
                        projectId
                      }
                      epicId={
                        epic.id
                      }
                      feature={
                        feature
                      }
                      open={
                        expandedFeatures
                          .has(
                            feature.id,
                          )
                      }
                      forcedOpen={
                        forcedOpen
                      }
                      onToggle={() =>
                        onToggleFeature(
                          feature.id,
                        )
                      }
                    />
                  ),
                )}
              </ul>
            )
          : (
              <p className="backlog-tree-empty-branch">
                Nenhuma feature
                corresponde neste épico.
              </p>
            )
      )}
    </li>
  );
}

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
          <button
            className="btn-garakis primary"
            onClick={() =>
              navigate(
                `/projects/${projectId}`
                + "/epics/new",
              )
            }
          >
            + Novo épico
          </button>
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
              <button
                className="btn-garakis secondary"
                type="button"
                onClick={
                  clearFilters
                }
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

      {result.state === "loading"
        && (
          <div
            className="card-garakis projects-state"
            role="status"
          >
            Carregando árvore
            do backlog…
          </div>
        )}

      {result.state === "error"
        && (
          <div className="card-garakis projects-state">
            <p role="alert">
              {result.message}
            </p>

            <button
              className="btn-garakis secondary"
              onClick={() =>
                setAttempt(
                  (value) =>
                    value + 1,
                )
              }
            >
              Tentar novamente
            </button>
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
          <div className="card-garakis projects-state">
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
              <button
                className="btn-garakis primary"
                onClick={() =>
                  navigate(
                    `/projects/${projectId}`
                    + "/epics/new",
                  )
                }
              >
                Criar primeiro épico
              </button>
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
          <div className="card-garakis projects-state">
            <h3>
              Nenhum item corresponde
              aos filtros
            </h3>

            <p>
              Altere a combinação
              de status e tecnologia
              ou limpe os critérios.
            </p>

            <button
              className="btn-garakis primary"
              type="button"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
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
