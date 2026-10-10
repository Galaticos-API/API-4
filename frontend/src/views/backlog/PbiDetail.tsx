import { useEffect, useState } from "react";
import { ApiError } from "../../api/api_auth";
import {
  camposFaltantesDe,
  completePbi,
  getPbi,
  hasCompletudeIndicator,
  updatePbi,
  type Criterion,
  type Pbi,
  type PbiInput
} from "../../api/api_backlog";
import "../../assets/styles/projects.css";
import { descreverCamposFaltantes } from "../../models/fields";
import { navigate } from "../../models/navigation";
import { evaluatePbiRealtime } from "../../models/qualityEngine";
import { usePbiQualityConfiguration } from "../../viewmodels/usePbiQualityConfiguration";
import { useUnsavedChangesGuard } from "../../viewmodels/useUnsavedChangesGuard";
import { Button } from "../common/ui";
import { BacklogBreadcrumb } from "./BacklogBreadcrumb";
import { BacklogTechnologySelector } from "./BacklogTechnologySelector";
import { CriteriaEditor } from "./CriteriaView";
import { DecisionsPanel } from "./DecisionsPanel";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ItemHistoryView } from "./ItemHistoryView";
import { QualityPanelView as QualityPanel } from "./QualityPanelView";

type PbiFields = Pick<
  PbiInput,
  | "titulo"
  | "historia_como_um"
  | "historia_eu_quero"
  | "historia_para_que"
  | "requer_interface"
  | "tecnologias_ids"
> & { justificativa?: string };

function toFields(
  pbi: Pbi,
): PbiFields {
  return {
    titulo: pbi.titulo,
    historia_como_um:
      pbi.historia_como_um,
    historia_eu_quero:
      pbi.historia_eu_quero,
    historia_para_que:
      pbi.historia_para_que,
    requer_interface:
      pbi.requer_interface,
    tecnologias_ids: [...(pbi.tecnologias_ids ?? [])],
    justificativa: "",
  };
}

export function PbiDetail({
  projectId,
  epicoId,
  featureId,
  pbiId,
  canEdit,
}: {
  projectId: string;
  epicoId: string;
  featureId: string;
  pbiId: string;
  canEdit: boolean;
}) {
  const [result, setResult] = useState<
    | { state: "loading" }
    | { state: "error"; message: string }
    | { state: "ready"; pbi: Pbi }
  >({
    state: "loading",
  });

  const [completing, setCompleting] =
    useState(false);

  const [
    completionMessage,
    setCompletionMessage,
  ] = useState("");

  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);

  const [formValues, setFormValues] =
    useState<PbiFields | null>(null);

  const [saving, setSaving] = useState(false);

  const [editMessage, setEditMessage] =
    useState("");

  const [scenarios, setScenarios] =
    useState<Criterion[] | null>(null);

  const qualityConfiguration =
    usePbiQualityConfiguration();

  useEffect(() => {
    setScenarios(null);
  }, [pbiId]);

  useEffect(() => {
    const controller =
      new AbortController();

    setResult({
      state: "loading",
    });

    getPbi(
      pbiId,
      controller.signal,
    )
      .then((pbi) => {
        if (!controller.signal.aborted) {
          setResult({
            state: "ready",
            pbi,
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
              && error.status === 404
              ? "PBI não encontrado."
              : "Não foi possível carregar o PBI.",
        });
      });

    return () => controller.abort();
  }, [pbiId, attempt]);

  const pbi =
    result.state === "ready"
      ? result.pbi
      : null;
  const justificationRequired = pbi?.status === "concluido"
    && (qualityConfiguration.result.state !== "ready"
      || qualityConfiguration.result.config.exigir_justificativa_item_concluido);

  const isDirty =
    editing
    && pbi !== null
    && formValues !== null
    && JSON.stringify(formValues)
    !== JSON.stringify(toFields(pbi));

  const { confirmLeave } =
    useUnsavedChangesGuard(isDirty);

  const qualityValues = pbi
    ? (
      editing && formValues
        ? formValues
        : toFields(pbi)
    )
    : null;

  const qualityReport =
    qualityValues
      && scenarios
      && qualityConfiguration.result.state
      === "ready"
      ? evaluatePbiRealtime(
        {
          ...qualityValues,
          prototipo_vinculado:
            pbi?.prototipo_vinculado,
        },
        scenarios,
        qualityConfiguration.result.config,
        editing ? "edit-" : "",
      )
      : null;

  if (result.state === "loading") {
    return (
      <div
        className="ds-card ds-card--glass projects-state"
        role="status"
      >
        Carregando PBI…
      </div>
    );
  }

  if (result.state === "error") {
    return (
      <div className="ds-card ds-card--glass projects-state">
        <p role="alert">
          {result.message}
        </p>

        <Button
          variant="secondary"
          onClick={() =>
            setAttempt(
              (value) => value + 1,
            )
          }
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  const readOnly =
    pbi!.projeto_status === "arquivado";

  return (
    <section className="projects-page">
      <BacklogBreadcrumb
        segments={[
          {
            label: "Projeto",
            path: `/projects/${projectId}#backlog`,
          },
          {
            label: "Épico",
            path: `/projects/${projectId}/epics/${epicoId}`,
          },
          {
            label: "Feature",
            path: `/projects/${projectId}/epics/${epicoId}/features/${featureId}`,
          },
          {
            label: "PBI",
            path: `/projects/${projectId}/epics/${epicoId}/features/${featureId}/pbis/${pbiId}`,
          },
        ]}
        onNavigate={(path) => {
          if (confirmLeave()) navigate(path);
        }}
      />
      <div className="projects-heading">
        <div>
          <p className="projects-eyebrow">
            Feature: {pbi!.feature_titulo}
          </p>

          <h2
            id={
              !editing
                ? "titulo"
                : undefined
            }
            tabIndex={
              !editing
                ? -1
                : undefined
            }
          >
            {pbi!.codigo}
            {" — "}
            {pbi!.titulo}
            {" "}
            <ProvenanceBadge provenance={pbi!.provenance_json} field="titulo" />
          </h2>
        </div>

        <Button
          variant="secondary"
          onClick={() => {
            if (confirmLeave()) {
              navigate(
                `/projects/${projectId}`
                + `/epics/${epicoId}`
                + `/features/${featureId}`,
              );
            }
          }}
        >
          Voltar à feature de origem
        </Button>
      </div>

      {readOnly && (
        <div className="ds-card ds-card--glass projects-state">
          <p role="status">
            Este PBI pertence a um projeto
            arquivado e está disponível apenas
            para leitura.
          </p>
        </div>
      )}

      {(
        qualityConfiguration.result.state
        === "loading"
        || (
          qualityConfiguration.result.state
          === "ready"
          && scenarios === null
        )
      ) && (
          <div
            className="ds-card ds-card--glass projects-state"
            role="status"
          >
            Carregando o checklist de qualidade…
          </div>
        )}

      {qualityConfiguration.result.state
        === "error" && (
          <div className="ds-card ds-card--glass projects-state">
            <p role="alert">
              Não foi possível carregar a configuração
              de qualidade vigente. O checklist não
              será exibido com regras presumidas.
            </p>

            <Button
              type="button"
              variant="secondary"
              onClick={qualityConfiguration.retry}
            >
              Tentar novamente
            </Button>
          </div>
        )}

      {qualityReport && (
        <QualityPanel
          report={qualityReport}
          title="Checklist de qualidade em tempo real"
        />
      )}

      <article className="ds-card ds-card--glass project-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          <span
            className={
              `ds-badge ${pbi!.status === "concluido"
                ? "ds-badge--success"
                : "ds-badge--warning"
              }`
            }
          >
            {pbi!.status}
          </span>

          {hasCompletudeIndicator(
            pbi!.score_completude,
          ) && (
              <span
                className={
                  `ds-badge ${pbi!.score_completude! >= 80
                    ? "ds-badge--success"
                    : pbi!.score_completude! >= 50
                      ? "ds-badge--warning"
                      : "ds-badge--danger"
                  }`
                }
              >
                {pbi!.score_completude}%
                {" "}
                completo
              </span>
            )}
        </div>

        {editing && formValues
          ? (
            <>
              <div className="project-field">
                <label htmlFor="edit-titulo">
                  Título
                </label>

                <input
                  id="edit-titulo"
                  type="text"
                  disabled={saving}
                  value={
                    formValues.titulo
                  }
                  onChange={(event) =>
                    setFormValues(
                      (value) =>
                        value && {
                          ...value,
                          titulo:
                            event.target.value,
                        },
                    )
                  }
                />
              </div>

              <div className="project-field">
                <label htmlFor="edit-historia_como_um">
                  COMO UM
                </label>

                <input
                  id="edit-historia_como_um"
                  type="text"
                  disabled={saving}
                  value={
                    formValues.historia_como_um
                  }
                  onChange={(event) =>
                    setFormValues(
                      (value) =>
                        value && {
                          ...value,
                          historia_como_um:
                            event.target.value,
                        },
                    )
                  }
                />
              </div>

              <div className="project-field">
                <label htmlFor="edit-historia_eu_quero">
                  EU QUERO
                </label>

                <input
                  id="edit-historia_eu_quero"
                  type="text"
                  disabled={saving}
                  value={
                    formValues.historia_eu_quero
                  }
                  onChange={(event) =>
                    setFormValues(
                      (value) =>
                        value && {
                          ...value,
                          historia_eu_quero:
                            event.target.value,
                        },
                    )
                  }
                />
              </div>

              <div className="project-field">
                <label htmlFor="edit-historia_para_que">
                  PARA QUE
                </label>

                <input
                  id="edit-historia_para_que"
                  type="text"
                  disabled={saving}
                  value={
                    formValues.historia_para_que
                  }
                  onChange={(event) =>
                    setFormValues(
                      (value) =>
                        value && {
                          ...value,
                          historia_para_que:
                            event.target.value,
                        },
                    )
                  }
                />
              </div>

              <div className="project-field">
                <label>
                  <input
                    id="edit-requer_interface"
                    type="checkbox"
                    checked={
                      formValues.requer_interface
                    }
                    disabled={saving}
                    onChange={(event) =>
                      setFormValues(
                        (value) =>
                          value && {
                            ...value,
                            requer_interface:
                              event.target.checked,
                          },
                      )
                    }
                  />
                  {" "}
                  Este PBI exige interface ou
                  protótipo visual
                </label>
              </div>

              <BacklogTechnologySelector
                value={formValues.tecnologias_ids ?? []}
                onChange={(tecnologias_ids) => setFormValues((current) => current && { ...current, tecnologias_ids })}
                disabled={saving}
              />

              {justificationRequired && (
                <div className="project-field" key="justificativa">
                  <label htmlFor="edit-justificativa">
                    Justificativa da alteração (obrigatória)
                  </label>
                  <textarea
                    id="edit-justificativa"
                    rows={2}
                    disabled={saving}
                    placeholder="Descreva a justificativa para alterar este PBI já concluído"
                    value={formValues.justificativa ?? ""}
                    onChange={(event) =>
                      setFormValues(
                        (value) =>
                          value && {
                            ...value,
                            justificativa: event.target.value,
                          },
                      )
                    }
                  />
                </div>
              )}

              {editMessage && (
                <p role="alert">
                  {editMessage}
                </p>
              )}

              <div className="project-actions">
                <Button
                  variant="primary"
                  disabled={saving}
                  onClick={async () => {
                    const algumCampoVazio = [
                      formValues.titulo,
                      formValues.historia_como_um,
                      formValues.historia_eu_quero,
                      formValues.historia_para_que,
                    ].some(
                      (value) =>
                        !value.trim(),
                    );

                    if (algumCampoVazio) {
                      setEditMessage(
                        "Nenhum campo pode ficar vazio.",
                      );
                      return;
                    }

                    if (justificationRequired && !formValues.justificativa?.trim()) {
                      setEditMessage("A justificativa é obrigatória ao alterar um item concluído.");
                      document.getElementById("edit-justificativa")?.focus();
                      return;
                    }

                    setSaving(true);
                    setEditMessage("");

                    try {
                      const payload = { ...formValues };
                      if (!justificationRequired) delete payload.justificativa;
                      const updated =
                        await updatePbi(
                          pbi!.id,
                          payload,
                        );

                      setResult({
                        state: "ready",
                        pbi: updated,
                      });

                      setEditing(false);

                      setAttempt(
                        (value) =>
                          value + 1,
                      );
                    } catch (error: any) {
                      const msg = error?.message || "Não foi possível salvar as alterações. Tente novamente.";
                      setEditMessage(msg);
                      if (msg.includes("justificativa")) {
                        document.getElementById("edit-justificativa")?.focus();
                      }
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving
                    ? "Salvando…"
                    : "Salvar alterações"}
                </Button>

                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    if (confirmLeave()) {
                      setEditing(false);
                      setEditMessage("");
                    }
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </>
          )
          : (
            <>
              <dl>
                <dt>COMO UM <ProvenanceBadge provenance={pbi!.provenance_json} field="historia_como_um" /></dt>
                <dd
                  id="historia_como_um"
                  tabIndex={-1}
                >
                  {pbi!.historia_como_um}
                </dd>

                <dt>EU QUERO <ProvenanceBadge provenance={pbi!.provenance_json} field="historia_eu_quero" /></dt>
                <dd
                  id="historia_eu_quero"
                  tabIndex={-1}
                >
                  {pbi!.historia_eu_quero}
                </dd>

                <dt>PARA QUE <ProvenanceBadge provenance={pbi!.provenance_json} field="historia_para_que" /></dt>
                <dd
                  id="historia_para_que"
                  tabIndex={-1}
                >
                  {pbi!.historia_para_que}
                </dd>

                <dt>
                  Exige interface/protótipo
                </dt>
                <dd
                  id="requer_interface"
                  tabIndex={-1}
                >
                  {pbi!.requer_interface
                    ? "Sim"
                    : "Não"}
                </dd>

                <dt>
                  Cenários de aceitação registrados
                </dt>
                <dd>
                  {pbi!.criterios_count}
                </dd>
              </dl>

              {!readOnly && canEdit && (
                <div className="project-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFormValues(
                        toFields(pbi!),
                      );
                      setEditing(true);
                    }}
                  >
                    Editar
                  </Button>

                  {pbi!.status
                    === "rascunho" && (
                      <Button
                        variant="primary"
                        disabled={completing}
                        onClick={async () => {
                          setCompleting(true);
                          setCompletionMessage("");

                          try {
                            const completed =
                              await completePbi(
                                pbi!.id,
                              );

                            setResult({
                              state: "ready",
                              pbi: completed,
                            });

                            setAttempt(
                              (value) =>
                                value + 1,
                            );
                          } catch (error) {
                            const campos =
                              camposFaltantesDe(
                                error,
                              );

                            setCompletionMessage(
                              campos
                                ? `Faltam preencher: ${descreverCamposFaltantes(campos)}.`
                                : "Não foi possível concluir o PBI.",
                            );
                          } finally {
                            setCompleting(false);
                          }
                        }}
                      >
                        {completing
                          ? "Concluindo…"
                          : "Marcar como concluído"}
                      </Button>
                    )}
                </div>
              )}

              {completionMessage && (
                <p role="alert">
                  {completionMessage}
                </p>
              )}
            </>
          )}
      </article>

      <div
        id="cenarios-section"
        tabIndex={-1}
      >
        <CriteriaEditor
          entidadeTipo="pbi"
          entidadeId={pbi!.id}
          canEdit={
            canEdit && !readOnly
          }
          titulo="Cenários do PBI"
          itemConcluido={pbi!.status === "concluido"}
          justificativaObrigatoria={justificationRequired}
          onCriteriaChange={
            setScenarios
          }
        />
      </div>

      <CriteriaEditor
        entidadeTipo="feature"
        entidadeId={featureId}
        canEdit={false}
        titulo="Critérios da feature (consulta)"
      />

      <SuggestionsPanel
        kind="pbi"
        id={pbi!.id}
        canWrite={canEdit && !readOnly}
        readOnlyNote={readOnly ? "Item ou ancestral arquivado: as sugestões ficam disponíveis somente para consulta." : undefined}
      />

      <DecisionsPanel
        kind="pbi"
        id={pbi!.id}
        canWrite={canEdit && !readOnly}
        readOnlyNote={readOnly ? "Item ou ancestral arquivado: as decisões ficam disponíveis somente para consulta." : undefined}
      />

      <ItemHistoryView
        entidadeTipo="pbi"
        entidadeId={pbi!.id}
        refreshTrigger={attempt}
      />
    </section>
  );
}
