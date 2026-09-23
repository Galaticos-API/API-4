import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/api_auth";
import {
  listCriteria,
  createCriterion,
  deleteCriterion,
  moveCriterion,
  type Criterion,
  type CriterionEntityType,
} from "../api/api_backlog";
import "../projects/projects.css";

type Result =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; items: Criterion[] };

const emptyTexto = { texto: "" };

const emptyCenario = {
  nome: "",
  dado: "",
  quando: "",
  entao: "",
};

export function CriteriaEditor({
  entidadeTipo,
  entidadeId,
  canEdit,
  titulo,
  onCriteriaChange,
}: {
  entidadeTipo: CriterionEntityType;
  entidadeId: string;
  canEdit: boolean;
  titulo: string;
  onCriteriaChange?: (items: Criterion[]) => void;
}) {
  const [result, setResult] = useState<Result>({
    state: "loading",
  });

  const [attempt, setAttempt] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [textoForm, setTextoForm] = useState(emptyTexto);
  const [cenarioForm, setCenarioForm] =
    useState(emptyCenario);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [movendoId, setMovendoId] =
    useState<string | null>(null);

  // Invalidado a cada mutação local bem-sucedida para impedir
  // que uma busca anterior sobrescreva um resultado mais recente.
  const versaoRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const versaoInicial = versaoRef.current;

    setResult({ state: "loading" });

    listCriteria(
      entidadeTipo,
      entidadeId,
      controller.signal,
    )
      .then((items) => {
        if (
          !controller.signal.aborted &&
          versaoRef.current === versaoInicial
        ) {
          setResult({
            state: "ready",
            items,
          });

          onCriteriaChange?.(items);
        }
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          versaoRef.current !== versaoInicial
        ) {
          return;
        }

        setResult({
          state: "error",
          message:
            error instanceof ApiError &&
            error.status === 401
              ? "É necessário entrar para ver os critérios."
              : "Não foi possível carregar os critérios.",
        });
      });

    return () => controller.abort();
  }, [entidadeTipo, entidadeId, attempt]);

  const isCenario = entidadeTipo === "pbi";

  function recarregar() {
    setAttempt((value) => value + 1);
  }

  async function adicionar(
    event: React.FormEvent,
  ) {
    event.preventDefault();
    setMessage("");

    if (isCenario) {
      if (
        !cenarioForm.nome.trim() ||
        !cenarioForm.dado.trim() ||
        !cenarioForm.quando.trim() ||
        !cenarioForm.entao.trim()
      ) {
        setMessage(
          "Preencha o nome e os três blocos DADO, QUANDO e ENTÃO.",
        );

        return;
      }
    } else if (!textoForm.texto.trim()) {
      setMessage("Informe o texto do critério.");
      return;
    }

    setBusy(true);

    try {
      const criado = await createCriterion(
        isCenario
          ? {
              entidade_tipo: "pbi",
              entidade_id: entidadeId,
              ...cenarioForm,
            }
          : {
              entidade_tipo:
                entidadeTipo as "epico" | "feature",
              entidade_id: entidadeId,
              ...textoForm,
            },
      );

      versaoRef.current += 1;

      if (result.state === "ready") {
        const updated = [
          ...result.items,
          criado,
        ];

        setResult({
          state: "ready",
          items: updated,
        });

        onCriteriaChange?.(updated);
      } else {
        recarregar();
      }

      setTextoForm(emptyTexto);
      setCenarioForm(emptyCenario);
      setFormOpen(false);
    } catch {
      setMessage(
        "Não foi possível adicionar o critério. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remover(id: string) {
    const confirmed = window.confirm(
      "Remover este critério? Os demais serão reordenados.",
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);

    try {
      await deleteCriterion(id);
      versaoRef.current += 1;

      if (result.state === "ready") {
        const updated = result.items.filter(
          (item) => item.id !== id,
        );

        setResult({
          state: "ready",
          items: updated,
        });

        onCriteriaChange?.(updated);
      } else {
        recarregar();
      }
    } catch {
      setMessage(
        "Não foi possível remover o critério.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function mover(
    id: string,
    direction: "up" | "down",
  ) {
    setMovendoId(id);

    try {
      const items = await moveCriterion(
        id,
        direction,
      );

      versaoRef.current += 1;

      setResult({
        state: "ready",
        items,
      });

      onCriteriaChange?.(items);
    } catch {
      setMessage(
        "Não foi possível reordenar os critérios.",
      );
    } finally {
      setMovendoId(null);
    }
  }

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div>
          <p className="projects-eyebrow">
            {isCenario
              ? "Cenários de aceitação"
              : "Critérios de aceitação"}
          </p>

          <h3>{titulo}</h3>
        </div>

        {canEdit && !formOpen && (
          <button
            id={
              isCenario
                ? "novo-cenario-btn"
                : undefined
            }
            className="btn-secondary"
            onClick={() => setFormOpen(true)}
          >
            {isCenario
              ? "Novo cenário"
              : "Novo critério"}
          </button>
        )}
      </div>

      {result.state === "loading" && (
        <div
          className="glass-panel projects-state"
          role="status"
        >
          Carregando…
        </div>
      )}

      {result.state === "error" && (
        <div className="glass-panel projects-state">
          <p role="alert">{result.message}</p>

          <button
            className="btn-secondary"
            onClick={recarregar}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {result.state === "ready" &&
        (result.items.length === 0 && !formOpen ? (
          <div className="glass-panel projects-state">
            <p>
              Nenhum{" "}
              {isCenario
                ? "cenário"
                : "critério"}{" "}
              registrado ainda.
            </p>
          </div>
        ) : (
          <ol
            className="projects-grid"
            aria-label={
              isCenario
                ? "Cenários de aceitação"
                : "Critérios de aceitação"
            }
          >
            {result.items.map(
              (item, index) => (
                <li
                  id={
                    isCenario
                      ? `cenario-${item.id}`
                      : undefined
                  }
                  tabIndex={
                    isCenario
                      ? -1
                      : undefined
                  }
                  className="glass-panel project-card"
                  key={item.id}
                >
                  {isCenario ? (
                    <>
                      <h4>{item.nome}</h4>

                      <dl>
                        <dt>DADO</dt>
                        <dd>{item.dado}</dd>

                        <dt>QUANDO</dt>
                        <dd>{item.quando}</dd>

                        <dt>ENTÃO</dt>
                        <dd>{item.entao}</dd>
                      </dl>
                    </>
                  ) : (
                    <p>{item.texto}</p>
                  )}

                  {canEdit && (
                    <div className="project-actions">
                      <button
                        className="btn-secondary"
                        disabled={
                          index === 0 ||
                          movendoId === item.id
                        }
                        aria-label="Mover para cima"
                        onClick={() =>
                          mover(item.id, "up")
                        }
                      >
                        ▲ Mover para cima
                      </button>

                      <button
                        className="btn-secondary"
                        disabled={
                          index ===
                            result.items.length - 1 ||
                          movendoId === item.id
                        }
                        aria-label="Mover para baixo"
                        onClick={() =>
                          mover(item.id, "down")
                        }
                      >
                        ▼ Mover para baixo
                      </button>

                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          remover(item.id)
                        }
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </li>
              ),
            )}
          </ol>
        ))}

      {canEdit && formOpen && (
        <form
          className="glass-panel project-form"
          onSubmit={adicionar}
          aria-busy={busy}
        >
          {isCenario ? (
            <>
              <div className="project-field">
                <label htmlFor="cenario-nome">
                  Nome do cenário
                </label>

                <input
                  id="cenario-nome"
                  type="text"
                  disabled={busy}
                  value={cenarioForm.nome}
                  onChange={(event) =>
                    setCenarioForm(
                      (value) => ({
                        ...value,
                        nome:
                          event.target.value,
                      }),
                    )
                  }
                />
              </div>

              <div className="project-field">
                <label htmlFor="cenario-dado">
                  DADO
                </label>

                <textarea
                  id="cenario-dado"
                  rows={2}
                  disabled={busy}
                  value={cenarioForm.dado}
                  onChange={(event) =>
                    setCenarioForm(
                      (value) => ({
                        ...value,
                        dado:
                          event.target.value,
                      }),
                    )
                  }
                />
              </div>

              <div className="project-field">
                <label htmlFor="cenario-quando">
                  QUANDO
                </label>

                <textarea
                  id="cenario-quando"
                  rows={2}
                  disabled={busy}
                  value={cenarioForm.quando}
                  onChange={(event) =>
                    setCenarioForm(
                      (value) => ({
                        ...value,
                        quando:
                          event.target.value,
                      }),
                    )
                  }
                />
              </div>

              <div className="project-field">
                <label htmlFor="cenario-entao">
                  ENTÃO
                </label>

                <textarea
                  id="cenario-entao"
                  rows={2}
                  disabled={busy}
                  value={cenarioForm.entao}
                  onChange={(event) =>
                    setCenarioForm(
                      (value) => ({
                        ...value,
                        entao:
                          event.target.value,
                      }),
                    )
                  }
                />
              </div>
            </>
          ) : (
            <div className="project-field">
              <label htmlFor="criterio-texto">
                Texto do critério
              </label>

              <textarea
                id="criterio-texto"
                rows={3}
                disabled={busy}
                value={textoForm.texto}
                onChange={(event) =>
                  setTextoForm({
                    texto:
                      event.target.value,
                  })
                }
              />
            </div>
          )}

          {message && (
            <p role="alert">{message}</p>
          )}

          <div className="project-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={busy}
            >
              {busy
                ? "Salvando…"
                : "Adicionar"}
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                setFormOpen(false);
                setMessage("");
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!canEdit && message && (
        <p role="alert">{message}</p>
      )}
    </section>
  );
}