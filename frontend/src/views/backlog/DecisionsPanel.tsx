import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDecision,
  describeDecisionError,
  listDecisions,
  type Decision,
  type DecisionInput,
  type DecisionKind,
  type DecisionList,
} from "../../api/api_decisions";
import { Alert, Badge, Button, EmptyState } from "../common/ui";
import "../../assets/styles/decisions.css";

const LEVEL_LABEL: Record<DecisionKind, string> = {
  projeto: "Projeto",
  epico: "Épico",
  feature: "Feature",
  pbi: "PBI",
};

const EMPTY: DecisionInput = { titulo: "", contexto: "", decisao: "", justificativa: "", alternativas: "" };

type FieldErrors = Partial<Record<keyof DecisionInput, string>>;

export function validateDecision(values: DecisionInput): FieldErrors {
  const errors: FieldErrors = {};
  if (values.titulo.trim().length < 3) errors.titulo = "Informe um título com ao menos 3 caracteres.";
  if (!values.contexto.trim()) errors.contexto = "Descreva o contexto da decisão.";
  if (!values.decisao.trim()) errors.decisao = "Registre o que foi decidido.";
  if (!values.justificativa.trim()) errors.justificativa = "Explique por que esta decisão foi tomada.";
  for (const field of ["contexto", "decisao", "justificativa", "alternativas"] as const) {
    if (values[field].length > 5000) errors[field] = "Use no máximo 5000 caracteres.";
  }
  if (values.titulo.length > 255) errors.titulo = "Use no máximo 255 caracteres.";
  return errors;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function DecisionCard({ decision }: { decision: Decision }) {
  const inherited = decision.origem.herdada;
  return (
    <li className={`decision-card${inherited ? " decision-card--inherited" : ""}`} data-level={decision.origem.tipo}>
      <header>
        <h4>{decision.titulo}</h4>
        {inherited && (
          <Badge tone="info">
            Herdada · {LEVEL_LABEL[decision.origem.tipo]}: {decision.origem.codigo ? `${decision.origem.codigo} · ` : ""}{decision.origem.titulo}
          </Badge>
        )}
      </header>
      <p className="decision-meta">
        {decision.autor?.nome ?? "Autor não informado"} · <time dateTime={decision.created_at}>{formatDate(decision.created_at)}</time>
      </p>
      <dl>
        <dt>Contexto</dt>
        <dd>{decision.contexto}</dd>
        <dt>Decisão</dt>
        <dd>{decision.decisao}</dd>
        <dt>Justificativa</dt>
        <dd>{decision.justificativa}</dd>
        {decision.alternativas && (
          <>
            <dt>Alternativas descartadas</dt>
            <dd>{decision.alternativas}</dd>
          </>
        )}
      </dl>
    </li>
  );
}

export function DecisionsPanel({
  kind,
  id,
  canWrite,
  readOnlyNote,
}: {
  kind: DecisionKind;
  id: string;
  canWrite: boolean;
  readOnlyNote?: string;
}) {
  const [state, setState] = useState<{ state: "loading" } | { state: "error" } | { state: "ready"; data: DecisionList }>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<DecisionInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ state: "loading" });
    listDecisions(kind, id, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ state: "ready", data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ state: "error" }); });
    return () => controller.abort();
  }, [kind, id, attempt]);

  const change = (field: keyof DecisionInput, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError("");
  };

  const close = useCallback(() => {
    setOpen(false);
    setValues(EMPTY);
    setErrors({});
    setSaveError("");
    window.setTimeout(() => openButton.current?.focus(), 0);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    const problems = validateDecision(values);
    setErrors(problems);
    setNotice("");
    const first = (Object.keys(problems) as Array<keyof DecisionInput>)[0];
    if (first) {
      form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    lock.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const created = await createDecision(kind, id, values);
      if (!mounted.current) return;
      setState((current) => current.state === "ready"
        ? { state: "ready", data: { ...current.data, decisoes: [...current.data.decisoes, { ...created, origem: { ...created.origem, herdada: false } }] } }
        : current);
      setNotice("Decisão registrada com autor e data.");
      close();
    } catch (error) {
      if (mounted.current) setSaveError(describeDecisionError(error));
    } finally {
      lock.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const own = state.state === "ready" ? state.data.decisoes.filter((item) => !item.origem.herdada) : [];
  const inherited = state.state === "ready" ? state.data.decisoes.filter((item) => item.origem.herdada) : [];

  return (
    <section className="decisions-panel card-garakis" aria-labelledby={`decisions-title-${id}`}>
      <div className="decisions-head">
        <div>
          <h3 id={`decisions-title-${id}`}>Decisões</h3>
          <p className="muted">O motivo por trás das definições, com autor e data. Registrar uma decisão nunca é obrigatório para concluir o item.</p>
        </div>
        {canWrite && !open && (
          <Button ref={openButton} onClick={() => { setOpen(true); setNotice(""); }} aria-expanded={open} aria-controls={`decision-form-${id}`}>
            Registrar decisão
          </Button>
        )}
      </div>

      {!canWrite && readOnlyNote && <Alert tone="warning">{readOnlyNote}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {open && canWrite && (
        <form id={`decision-form-${id}`} ref={form} className="decision-form" onSubmit={submit} noValidate aria-busy={saving}>
          <h4>Nova decisão</h4>
          {(
            [
              ["titulo", "Título", "input"],
              ["contexto", "Contexto", "textarea"],
              ["decisao", "Decisão", "textarea"],
              ["justificativa", "Justificativa", "textarea"],
              ["alternativas", "Alternativas consideradas e descartadas (opcional)", "textarea"],
            ] as const
          ).map(([field, label, control]) => (
            <div className="field-garakis" key={field}>
              <label htmlFor={`decision-${id}-${field}`}>{label}</label>
              {control === "input" ? (
                <input
                  id={`decision-${id}-${field}`}
                  name={field}
                  className="input-garakis"
                  value={values[field]}
                  disabled={saving}
                  maxLength={255}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={errors[field] ? `decision-${id}-${field}-error` : undefined}
                  onChange={(event) => change(field, event.target.value)}
                />
              ) : (
                <textarea
                  id={`decision-${id}-${field}`}
                  name={field}
                  className="input-garakis"
                  rows={3}
                  value={values[field]}
                  disabled={saving}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={errors[field] ? `decision-${id}-${field}-error` : undefined}
                  onChange={(event) => change(field, event.target.value)}
                />
              )}
              {errors[field] && <p id={`decision-${id}-${field}-error`} role="alert" className="decision-error">{errors[field]}</p>}
            </div>
          ))}
          {saveError && <Alert tone="danger" role="alert">{saveError}</Alert>}
          <div className="project-actions">
            <Button type="submit" disabled={saving}>{saving ? "Registrando…" : "Registrar decisão"}</Button>
            <Button type="button" variant="secondary" disabled={saving} onClick={close}>Cancelar</Button>
          </div>
        </form>
      )}

      {state.state === "loading" && <p className="help" role="status">Carregando decisões…</p>}

      {state.state === "error" && (
        <Alert tone="danger" role="alert">
          Não foi possível carregar as decisões.{" "}
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button>
        </Alert>
      )}

      {state.state === "ready" && own.length === 0 && inherited.length === 0 && (
        <EmptyState
          title="Nenhuma decisão registrada"
          description={canWrite ? "Registre a primeira decisão para que o motivo desta definição não se perca." : "Ainda não há decisões neste item nem nos níveis acima."}
        />
      )}

      {state.state === "ready" && own.length > 0 && (
        <div>
          <h4 className="decisions-group">Neste item ({own.length})</h4>
          <ol className="decision-list" aria-label="Decisões deste item, da mais antiga para a mais recente">
            {own.map((decision) => <DecisionCard key={decision.id} decision={decision} />)}
          </ol>
        </div>
      )}

      {state.state === "ready" && own.length === 0 && inherited.length > 0 && (
        <p className="help">Este item ainda não tem decisões próprias.</p>
      )}

      {state.state === "ready" && inherited.length > 0 && (
        <div>
          <h4 className="decisions-group">Herdadas dos níveis acima ({inherited.length})</h4>
          <ol className="decision-list" aria-label="Decisões herdadas dos ascendentes">
            {inherited.map((decision) => <DecisionCard key={decision.id} decision={decision} />)}
          </ol>
        </div>
      )}
    </section>
  );
}
