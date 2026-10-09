import { useEffect, useState } from "react";
import { ApiError } from "../../api/api_auth";
import {
  hasCompletudeIndicator,
  listPbis,
  type Pbi
} from "../../api/api_backlog";
import "../../assets/styles/projects.css";
import { navigate } from "../../models/navigation";
import { Button } from "../common/ui";

type ListResult =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; pbis: Pbi[] };

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
  const [result, setResult] =
    useState<ListResult>({
      state: "loading",
    });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setResult({
      state: "loading",
    });

    listPbis(
      featureId,
      controller.signal,
    )
      .then((pbis) => {
        if (!controller.signal.aborted) {
          setResult({
            state: "ready",
            pbis,
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
            error instanceof ApiError
              && error.status === 401
              ? "É necessário entrar para acessar os PBIs."
              : "Não foi possível carregar os PBIs.",
        });
      });

    return () => controller.abort();
  }, [featureId, attempt]);

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
            onClick={() =>
              setAttempt((value) => value + 1)
            }
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {result.state === "ready" && (
        result.pbis.length === 0
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
              {result.pbis.map((pbi) => (
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
    </section>
  );
}
