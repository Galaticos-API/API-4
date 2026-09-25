import { apiRequest } from "./api_auth";

export interface BacklogTechnology {
  id: string;
  nome: string;
}

export interface BacklogPbiNode {
  id: string;
  codigo: string;
  titulo: string;
  status: string;
  tecnologias: BacklogTechnology[];
}

export interface BacklogFeatureNode {
  id: string;
  titulo: string;
  status: string;
  tecnologias: BacklogTechnology[];
  pbis: BacklogPbiNode[];
}

export interface BacklogEpicNode {
  id: string;
  titulo: string;
  status: string;
  tecnologias: BacklogTechnology[];
  features: BacklogFeatureNode[];
}

export interface ProjectBacklogTree {
  project: {
    id: string;
    nome: string;
    status: string;
  };

  epics: BacklogEpicNode[];
  technologies: BacklogTechnology[];
}

function record(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Resposta da árvore do backlog inválida",
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function text(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0
  ) {
    throw new Error(
      `Campo ${field} inválido na árvore do backlog`,
    );
  }

  return value;
}

function technologies(
  value: unknown,
): BacklogTechnology[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "Tecnologias inválidas na árvore do backlog",
    );
  }

  return value.map((item) => {
    const technology = record(item);

    return {
      id: text(
        technology.id,
        "tecnologia.id",
      ),

      nome: text(
        technology.nome,
        "tecnologia.nome",
      ),
    };
  });
}

function parsePbi(
  value: unknown,
): BacklogPbiNode {
  const item = record(value);

  return {
    id: text(item.id, "pbi.id"),

    codigo:
      typeof item.codigo === "string"
        ? item.codigo
        : "",

    titulo: text(
      item.titulo,
      "pbi.titulo",
    ),

    status: text(
      item.status,
      "pbi.status",
    ),

    tecnologias: technologies(
      item.tecnologias,
    ),
  };
}

function parseFeature(
  value: unknown,
): BacklogFeatureNode {
  const item = record(value);

  if (!Array.isArray(item.pbis)) {
    throw new Error(
      "PBIs inválidos na árvore do backlog",
    );
  }

  return {
    id: text(
      item.id,
      "feature.id",
    ),

    titulo: text(
      item.titulo,
      "feature.titulo",
    ),

    status: text(
      item.status,
      "feature.status",
    ),

    tecnologias: technologies(
      item.tecnologias,
    ),

    pbis: item.pbis.map(parsePbi),
  };
}

function parseEpic(
  value: unknown,
): BacklogEpicNode {
  const item = record(value);

  if (!Array.isArray(item.features)) {
    throw new Error(
      "Features inválidas na árvore do backlog",
    );
  }

  return {
    id: text(
      item.id,
      "epico.id",
    ),

    titulo: text(
      item.titulo,
      "epico.titulo",
    ),

    status: text(
      item.status,
      "epico.status",
    ),

    tecnologias: technologies(
      item.tecnologias,
    ),

    features:
      item.features.map(
        parseFeature,
      ),
  };
}

export async function getProjectBacklogTree(
  projectId: string,
  signal: AbortSignal,
): Promise<ProjectBacklogTree> {
  const response =
    await apiRequest(
      `/projects/${encodeURIComponent(
        projectId,
      )}/backlog-tree`,
      { signal },
    );

  const data = record(
    await response.json(),
  );

  const project = record(
    data.project,
  );

  if (!Array.isArray(data.epics)) {
    throw new Error(
      "Épicos inválidos na árvore do backlog",
    );
  }

  return {
    project: {
      id: text(
        project.id,
        "project.id",
      ),

      nome: text(
        project.nome,
        "project.nome",
      ),

      status: text(
        project.status,
        "project.status",
      ),
    },

    epics:
      data.epics.map(parseEpic),

    technologies:
      technologies(
        data.technologies,
      ),
  };
}