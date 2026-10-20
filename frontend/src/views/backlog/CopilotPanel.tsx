import { useEffect, useId, useRef, useState } from "react";
import {
  askCopilot,
  copilotFields,
  copilotInput,
  DIMENSION_LABELS,
  FIELD_LABELS,
  missingStoryFields,
  SCENARIO_TYPE_LABELS,
  type CopilotAnswer,
  type CopilotLevel,
  type CopilotMode,
  type ScenarioSuggestion,
} from "../../api/api_copilot";
import type { Criterion } from "../../api/api_backlog";
import { ApiError } from "../../api/api_auth";
import "../../assets/styles/copilot.css";

const configuredSlowMs = Number(
  import.meta.env.VITE_COPILOT_SLOW_NOTICE_MS ?? 5000,
);
const SLOW_NOTICE_MS =
  Number.isFinite(configuredSlowMs) &&
  configuredSlowMs >= 1000 &&
  configuredSlowMs <= 60000
    ? configuredSlowMs
    : 5000;
const REQUEST_TIMEOUT_MS = 65000;
const STORY_FIELDS = [
  "historia_como_um",
  "historia_eu_quero",
  "historia_para_que",
] as const;
const storyBlocks = (fields: readonly string[]) =>
  fields.map((field) => FIELD_LABELS[field].toUpperCase()).join(", ");
function failure(error: unknown) {
  const missing = missingStoryFields(error);
  if (missing)
    return `Complete a história do usuário antes de pedir cenários${missing.length ? ` (falta ${storyBlocks(missing)})` : ""}. Sua edição foi preservada.`;
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Sua sessão expirou. A análise não foi concluída.";
    if (error.status === 403 || error.status === 404)
      return "Não foi possível acessar a IA neste projeto. Sua edição foi preservada.";
    return "A IA está indisponível no momento. Sua edição foi preservada; você pode continuar e salvar normalmente.";
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "TimeoutError"
  )
    return "A IA ultrapassou o tempo de espera. Sua edição foi preservada.";
  if (
    error instanceof Error &&
    (error.message.startsWith("O conteúdo excede") ||
      error.message.startsWith("A IA retornou"))
  )
    return error.message;
  return "Não foi possível consultar a IA. Sua edição foi preservada; tente novamente quando quiser.";
}

export function CopilotPanel({
  projectId,
  level,
  values,
  criteria = [],
  disabled = false,
  onUseScenario,
}: {
  projectId: string;
  level: CopilotLevel;
  values: object;
  criteria?: Criterion[] | null;
  disabled?: boolean;
  // Sem este callback (PBI ainda não criado ou sem permissão) o modo de cenários não aparece.
  onUseScenario?: (scenario: ScenarioSuggestion) => boolean;
}) {
  const [selectedMode, setMode] = useState<CopilotMode>("questionar");
  const canSuggestScenarios = level === "pbi" && !!onUseScenario;
  const mode =
    level !== "pbi"
      ? "padronizar"
      : selectedMode === "cenarios" && !canSuggestScenarios
        ? "questionar"
        : selectedMode;
  const radioName = useId();
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const request = useRef<AbortController | null>(null);
  const fields = copilotInput(level, values, criteria);
  // Em cenários, salvar uma sugestão muda os critérios mas não deve apagar as demais.
  const draftKey = JSON.stringify({
    projectId,
    level,
    fields: mode === "cenarios" ? copilotFields(level, values) : fields,
  });
  const hasText = Object.values(copilotFields(level, values)).some((value) =>
    value.trim(),
  );
  const waitingCriteria =
    level === "pbi" && mode !== "padronizar" && criteria === null;
  const missingStory =
    mode === "cenarios"
      ? STORY_FIELDS.filter(
          (field) => !copilotFields(level, values)[field]?.trim(),
        )
      : [];
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setSlow(false);
    setAnswer(null);
    setError("");
    setNote("");
  }, [draftKey, mode, disabled]);
  useEffect(() => () => request.current?.abort(), []);

  async function analyze() {
    if (
      disabled ||
      waitingCriteria ||
      !hasText ||
      missingStory.length ||
      request.current
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setSlow(false);
    setAnswer(null);
    setError("");
    setNote("");
    const timer = window.setTimeout(() => {
      if (!controller.signal.aborted) setSlow(true);
    }, SLOW_NOTICE_MS);
    controller.signal.addEventListener(
      "abort",
      () => window.clearTimeout(timer),
      { once: true },
    );
    try {
      const result = await askCopilot(
        projectId,
        level,
        mode,
        fields,
        AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      );
      if (!controller.signal.aborted) setAnswer(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(failure(cause));
    } finally {
      window.clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
        setSlow(false);
      }
    }
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setSlow(false);
    setNote("Análise cancelada. Sua edição foi preservada.");
  }
  return (
    <section className="copilot-panel" aria-label="Apoio à especificação">
      <header>
        <h3>Apoio à especificação</h3>
        <span className="copilot-label">Propostas da IA</span>
      </header>
      <p>
        A IA ajuda a revisar o texto. Nenhuma proposta altera ou salva seus
        campos.
      </p>
      {level === "pbi" ? (
        <fieldset disabled={disabled} className="copilot-modes">
          <legend>Modo de apoio</legend>
          <label>
            <input
              type="radio"
              name={radioName}
              checked={mode === "questionar"}
              onChange={() => setMode("questionar")}
            />
            Questionar lacunas
          </label>
          <label>
            <input
              type="radio"
              name={radioName}
              checked={mode === "padronizar"}
              onChange={() => setMode("padronizar")}
            />
            Padronizar texto
          </label>
          {canSuggestScenarios && (
            <label>
              <input
                type="radio"
                name={radioName}
                checked={mode === "cenarios"}
                onChange={() => setMode("cenarios")}
              />
              Sugerir cenários
            </label>
          )}
        </fieldset>
      ) : (
        <p>Padronização para {level === "epico" ? "épico" : "feature"}.</p>
      )}
      {level === "pbi" && (
        <p className="muted">
          A análise considera os campos atuais, a necessidade de interface e os
          critérios já salvos. Critérios ainda não salvos não entram na análise.
        </p>
      )}
      {waitingCriteria && (
        <p role="status">
          Aguardando a leitura dos critérios. Se houver falha, tente novamente
          na seção de critérios; a edição continua disponível.
        </p>
      )}
      {hasText && missingStory.length > 0 && (
        <p role="status">
          Complete a história do usuário para receber sugestões de cenários.
          Falta preencher: {storyBlocks(missingStory)}.
        </p>
      )}
      {!hasText && (
        <p className="muted">
          Preencha ao menos um campo para solicitar apoio.
        </p>
      )}
      <div className="copilot-actions">
        <button
          type="button"
          className="btn-garakis secondary"
          disabled={
            disabled ||
            busy ||
            !hasText ||
            waitingCriteria ||
            missingStory.length > 0
          }
          onClick={() => void analyze()}
        >
          {busy
            ? "Analisando…"
            : mode === "questionar"
              ? "Analisar lacunas"
              : mode === "cenarios"
                ? "Sugerir cenários"
                : "Propor padronização"}
        </button>
        {busy && (
          <button
            type="button"
            className="btn-garakis secondary"
            onClick={cancel}
          >
            Cancelar análise
          </button>
        )}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {busy && (
          <p role="status">
            {slow
              ? `A análise já ultrapassou ${Math.round(SLOW_NOTICE_MS / 1000)} segundos. Você pode continuar editando ou cancelar a análise.`
              : "Consultando a IA local… Você pode continuar editando."}
          </p>
        )}
        {note && <p role="status">{note}</p>}
      </div>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="btn-garakis secondary"
            disabled={
              disabled || !hasText || waitingCriteria || missingStory.length > 0
            }
            onClick={() => void analyze()}
          >
            Tentar análise novamente
          </button>
        </div>
      )}
      {answer && (
        <aside
          className="copilot-proposal"
          aria-label={
            answer.operation === "questionar"
              ? "Perguntas sobre lacunas"
              : answer.operation === "cenarios"
                ? "Cenários sugeridos"
                : "Proposta de padronização"
          }
        >
          <h4>
            {answer.operation === "questionar"
              ? "Perguntas para revisar o item"
              : answer.operation === "cenarios"
                ? "Cenários sugeridos (ainda não salvos)"
                : "Texto proposto — não aplicado"}
          </h4>
          {answer.operation === "cenarios" ? (
            <>
              {answer.scenarios.length > 0 && (
                <ol className="copilot-scenarios">
                  {answer.scenarios.map((scenario, index) => (
                    <li key={index}>
                      <p>
                        <strong>{scenario.nome}</strong>{" "}
                        <span className="copilot-label">
                          {SCENARIO_TYPE_LABELS[scenario.tipo]}
                        </span>
                      </p>
                      <dl>
                        <div>
                          <dt>DADO</dt>
                          <dd>{scenario.dado}</dd>
                        </div>
                        <div>
                          <dt>QUANDO</dt>
                          <dd>{scenario.quando}</dd>
                        </div>
                        <div>
                          <dt>ENTÃO</dt>
                          <dd>{scenario.entao}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="btn-garakis secondary"
                        disabled={disabled}
                        aria-label={`Usar o cenário ${scenario.nome} no editor de cenários`}
                        onClick={() =>
                          setNote(
                            onUseScenario?.(scenario)
                              ? `Cenário "${scenario.nome}" copiado para o editor de cenários. Revise e salve para incluí-lo no PBI.`
                              : "Há um cenário em edição no formulário. Salve ou cancele esse cenário antes de usar outra sugestão.",
                          )
                        }
                      >
                        Usar no editor
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {answer.questions.length > 0 && (
                <>
                  <p>Informações a esclarecer:</p>
                  <ul>
                    {answer.questions.map((question, index) => (
                      <li key={index}>{question}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : answer.operation === "questionar" ? (
            <>
              <p>{answer.summary}</p>
              {answer.questions.length > 0 ? (
                <ul>
                  {answer.questions.map((item, index) => (
                    <li key={index}>
                      <strong>{DIMENSION_LABELS[item.dimension]}: </strong>
                      {item.question}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma lacuna relevante foi identificada nesta análise.</p>
              )}
            </>
          ) : (
            <>
              {answer.proposal && (
                <dl>
                  {Object.entries(answer.proposal).map(([field, value]) => (
                    <div key={field}>
                      <dt>{FIELD_LABELS[field]}</dt>
                      <dd>{value || "Sem observações adicionais."}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {answer.questions.length > 0 && (
                <>
                  <p>Informações a esclarecer:</p>
                  <ul>
                    {answer.questions.map((question, index) => (
                      <li key={index}>{question}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          <button
            type="button"
            className="btn-garakis secondary"
            onClick={() => setAnswer(null)}
          >
            Descartar resposta
          </button>
        </aside>
      )}
    </section>
  );
}
