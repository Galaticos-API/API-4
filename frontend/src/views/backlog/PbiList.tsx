import { useBacklogList } from '../../viewmodels/useBacklogList';
import { BacklogListContinuation } from './BacklogListContinuation';
import { useCallback } from "react";

import {
  hasCompletudeIndicator,
  listPbisPage,
} from "../../api/api_backlog";
import "../../assets/styles/projects.css";
import { navigate } from "../../models/navigation";
import { Button } from "../common/ui";


export function PbiList({
  projectId,
  epicoId,
  featureId,
  canCreate,
}: {
  projectId: string;
  epicoId: string;
  featureId: string;
  canCreate: boolean;
}) {
  const load = useCallback((offset: number, signal: AbortSignal, before?: string) => listPbisPage(featureId, signal, offset, before), [featureId]);
  const { result, retry, ...continuation } = useBacklogList(load);

  const newPath =
    `/projects/${projectId}`
    + `/epics/${epicoId}`
    + `/features/${featureId}`
    + "/pbis/new";

  const getCompletudeColor = (
    score: number,
  ) => {
    if (score >= 80) {
      return "ds-badge--success";
    }

    if (score >= 50) {
      return "ds-badge--warning";
    }

    return "ds-badge--danger";
  };

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div>
          <p className="projects-eyebrow">
            PBIs da feature
          </p>

          <h3>
            Product Backlog Items
          </h3>
        </div>

        {canCreate && (
          <Button
            variant="primary"
            onClick={() => navigate(newPath)}
          >
            Novo PBI
          </Button>
        )}
      </div>

      {result.state === "loading" && (
        <div
          className="ds-card ds-card--glass projects-state"
          role="status"
        >
          Carregando PBIs…
        </div>
      )}

      {result.state === "error" && (
        <div className="ds-card ds-card--glass projects-state">
          <p role="alert">
            {result.message}
          </p>

          <Button
            variant="secondary"
            onClick={retry}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {result.state === "ready" && (
        result.items.length === 0
          ? (
            <div className="ds-card ds-card--glass projects-state">
              <h4>
                Nenhum PBI cadastrado
              </h4>

              <p>
                Cadastre o primeiro comportamento
                testável desta feature.
              </p>

              {canCreate && (
                <Button
                  variant="primary"
                  onClick={() =>
                    navigate(newPath)
                  }
                >
                  Criar primeiro PBI
                </Button>
              )}
            </div>
          )
          : (
            <div className="projects-grid">
              {result.items.map((pbi) => (
                <article
                  className="ds-card ds-card--glass project-card"
                  key={pbi.id}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: "8px",
                    }}
                  >
                    <span
                      className={
                        `ds-badge ${pbi.status
                          === "concluido"
                          ? "ds-badge--success"
                          : "ds-badge--warning"
                        }`
                      }
                    >
                      {pbi.status}
                    </span>

                    {hasCompletudeIndicator(
                      pbi.score_completude,
                    ) && (
                        <span
                          className={
                            `ds-badge ${getCompletudeColor(
                              pbi.score_completude,
                            )
                            }`
                          }
                        >
                          {pbi.score_completude}%
                          {" "}
                          completo
                        </span>
                      )}
                  </div>

                  <h4>
                    {pbi.codigo}
                    {" — "}
                    {pbi.titulo}
                  </h4>

                  <p className="project-excerpt">
                    {pbi.historia_eu_quero
                      || "Sem intenção registrada."}
                  </p>

                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate(
                        `/projects/${projectId}`
                        + `/epics/${epicoId}`
                        + `/features/${featureId}`
                        + `/pbis/${pbi.id}`,
                      )
                    }
                  >
                    Ver PBI
                  </Button>
                </article>
              ))}
            </div>
          )
      )}
      {result.state === "ready" && <BacklogListContinuation {...continuation} />}
    </section>
  );
}
