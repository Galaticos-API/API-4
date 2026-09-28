import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/api_auth";
import {
  createPbi,
  type PbiInput
} from "../../api/api_backlog";
import "../../assets/styles/projects.css";
import { navigate } from "../../models/navigation";
import { evaluatePbiRealtime } from "../../models/qualityEngine";
import { usePbiQualityConfiguration } from "../../viewmodels/usePbiQualityConfiguration";
import { useUnsavedChangesGuard } from "../../viewmodels/useUnsavedChangesGuard";
import { Button } from "../common/ui";
import { BacklogTechnologySelector } from "./BacklogTechnologySelector";
import { QualityPanelView as QualityPanel } from "./QualityPanelView";

const emptyInput: PbiInput = {
  feature_id: "",
  titulo: "",
  historia_como_um: "",
  historia_eu_quero: "",
  historia_para_que: "",
  requer_interface: false,
  tecnologias_ids: [],
};

export function PbiForm({
  projectId,
  epicoId,
  featureId,
}: {
  projectId: string;
  epicoId: string;
  featureId: string;
}) {
  const [values, setValues] =
    useState<PbiInput>({
      ...emptyInput,
      feature_id: featureId,
    });

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);

  const qualityConfiguration =
    usePbiQualityConfiguration();

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const isDirty =
    values.requer_interface
    || (values.tecnologias_ids?.length ?? 0) > 0
    || [
      values.titulo,
      values.historia_como_um,
      values.historia_eu_quero,
      values.historia_para_que,
    ].some(
      (value) => value.trim().length > 0,
    );

  const { confirmLeave } =
    useUnsavedChangesGuard(isDirty);

  const featurePath =
    `/projects/${projectId}`
    + `/epics/${epicoId}`
    + `/features/${featureId}`;

  const qualityReport =
    qualityConfiguration.result.state === "ready"
      ? evaluatePbiRealtime(
        values,
        [],
        qualityConfiguration.result.config,
      )
      : null;

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div>
          <p className="projects-eyebrow">
            PBIs / Novo PBI
          </p>

          <h2>Criar PBI</h2>

          <p>
            O título e os três blocos da história
            são obrigatórios. O painel abaixo
            avalia a qualidade em tempo real
            enquanto você escreve.
          </p>
        </div>
      </div>

      {qualityConfiguration.result.state
        === "loading" && (
          <div
            className="ds-card ds-card--glass projects-state"
            role="status"
          >
            Carregando a configuração de qualidade
            da organização…
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

      <form
        className="ds-card ds-card--glass project-form"
        noValidate
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();

          if (submitting.current) {
            return;
          }

          const faltando = (
            [
              "titulo",
              "historia_como_um",
              "historia_eu_quero",
              "historia_para_que",
            ] as const
          ).find(
            (field) => !values[field].trim(),
          );

          if (faltando) {
            setMessage(
              "Preencha o título e os três blocos da história antes de confirmar.",
            );
            return;
          }

          submitting.current = true;
          setBusy(true);
          setMessage("");

          try {
            const pbi = await createPbi({
              ...values,
              feature_id: featureId,
            });

            if (mounted.current) {
              navigate(
                `${featurePath}/pbis/${pbi.id}`,
              );
            }
          } catch (error) {
            if (!mounted.current) {
              return;
            }

            setMessage(
              error instanceof ApiError
                && error.status === 404
                ? "Feature não encontrada."
                : "Não foi possível criar o PBI. Tente novamente.",
            );
          } finally {
            submitting.current = false;

            if (mounted.current) {
              setBusy(false);
            }
          }
        }}
      >
        <div className="project-field">
          <label htmlFor="titulo">
            Título (obrigatório, verbo no infinitivo)
          </label>

          <input
            id="titulo"
            name="titulo"
            type="text"
            disabled={busy}
            value={values.titulo}
            onChange={(event) =>
              setValues((value) => ({
                ...value,
                titulo: event.target.value,
              }))
            }
          />
        </div>

        <div className="project-field">
          <label htmlFor="historia_como_um">
            COMO UM (obrigatório)
          </label>

          <input
            id="historia_como_um"
            name="historia_como_um"
            type="text"
            disabled={busy}
            value={values.historia_como_um}
            onChange={(event) =>
              setValues((value) => ({
                ...value,
                historia_como_um:
                  event.target.value,
              }))
            }
          />
        </div>

        <div className="project-field">
          <label htmlFor="historia_eu_quero">
            EU QUERO (obrigatório)
          </label>

          <input
            id="historia_eu_quero"
            name="historia_eu_quero"
            type="text"
            disabled={busy}
            value={values.historia_eu_quero}
            onChange={(event) =>
              setValues((value) => ({
                ...value,
                historia_eu_quero:
                  event.target.value,
              }))
            }
          />
        </div>

        <div className="project-field">
          <label htmlFor="historia_para_que">
            PARA QUE (obrigatório)
          </label>

          <input
            id="historia_para_que"
            name="historia_para_que"
            type="text"
            disabled={busy}
            value={values.historia_para_que}
            onChange={(event) =>
              setValues((value) => ({
                ...value,
                historia_para_que:
                  event.target.value,
              }))
            }
          />
        </div>

        <div className="project-field">
          <label>
            <input
              id="requer_interface"
              type="checkbox"
              checked={values.requer_interface}
              disabled={busy}
              onChange={(event) =>
                setValues((value) => ({
                  ...value,
                  requer_interface:
                    event.target.checked,
                }))
              }
            />
            {" "}
            Este PBI exige interface ou protótipo
            visual
          </label>
        </div>

        <BacklogTechnologySelector
          value={values.tecnologias_ids ?? []}
          onChange={(tecnologias_ids) => setValues((current) => ({ ...current, tecnologias_ids }))}
          disabled={busy}
        />

        {message && (
          <p role="alert">
            {message}
          </p>
        )}

        <div className="project-actions">
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
          >
            {busy
              ? "Criando…"
              : "Criar PBI"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              if (confirmLeave()) {
                navigate(featurePath);
              }
            }}
          >
            Voltar à feature
          </Button>
        </div>
      </form>

      <section
        id="cenarios-section"
        className="ds-card ds-card--glass projects-state"
        tabIndex={-1}
        aria-label="Cenários de aceitação"
      >
        <h3>
          Cenários de aceitação
        </h3>

        <p>
          Após criar o rascunho, você poderá
          adicionar cenários estruturados com
          DADO, QUANDO e ENTÃO. A ausência deles
          não impede salvar o rascunho.
        </p>
      </section>
    </section>
  );
}
