import {
  type ProjectBacklogTree
} from "../../api/api_backlog_tree";

export interface BacklogFilters {
  status: string;
  technologyId: string;
  query: string;
}

export const MAX_QUERY_LENGTH = 100;

type TreeFilters = Pick<BacklogFilters, "status" | "technologyId">;

export const EMPTY_FILTERS:
  BacklogFilters = {
  status: "",
  technologyId: "",
  query: "",
};

export const STATUS_OPTIONS = [
  { value: "rascunho", label: "Rascunho" },
  { value: "ativo", label: "Ativo" },
  { value: "concluido", label: "Concluído" },
  { value: "arquivado", label: "Arquivado" },
] as const;

const VALID_STATUSES = new Set([
  "",
  ...STATUS_OPTIONS.map(({ value }) => value),
]);

export function storageKey(
  projectId: string,
) {
  return (
    "sinapse.backlog.filters."
    + projectId
  );
}

export function readFilters(
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
