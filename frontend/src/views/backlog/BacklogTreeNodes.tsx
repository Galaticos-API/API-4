import {
  type BacklogEpicNode,
  type BacklogFeatureNode,
  type BacklogPbiNode
} from "../../api/api_backlog_tree";
import {
  navigate,
} from "../../models/navigation";

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
          `ds-badge ${item.status
            === "concluido"
            ? "ds-badge--success"
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
            `${isOpen
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

export function TreeEpic({
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
            `${isOpen
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
