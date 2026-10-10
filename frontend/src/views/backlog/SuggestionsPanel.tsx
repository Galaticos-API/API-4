import { useEffect, useRef, useState } from "react";
import {
  acceptSuggestion,
  describeSuggestionError,
  discardSuggestion,
  editSuggestion,
  listSuggestions,
  type Suggestion,
  type SuggestionKind,
} from "../../api/api_suggestions";
import { AISuggestion, Alert, Badge, Button, EmptyState } from "../common/ui";

const FIELD_LABEL: Record<string, string> = {
  titulo: "Título",
  descricao: "Descrição",
  objetivo: "Objetivo",
  escopo_macro: "Escopo macro",
  resultado_esperado: "Resultado esperado",
  historia_como_um: "Como um",
  historia_eu_quero: "Eu quero",
  historia_para_que: "Para que",
  regras_observacoes: "Regras e observações",
};

const STATUS_LABEL: Record<Suggestion["status"], string> = {
  pendente: "Pendente",
  aceita: "Aceita",
  editada: "Editada",
  descartada: "Descartada",
};

function fieldLabel(campo: string): string {
  return FIELD_LABEL[campo] ?? campo;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function ResolvedSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const tone = suggestion.status === "descartada" ? "danger" : "success";
  return (
    <li className="project-field" data-status={suggestion.status}>
      <Badge tone={tone}>{STATUS_LABEL[suggestion.status]}</Badge>
      <p><strong>{fieldLabel(suggestion.campo)}</strong></p>
      {suggestion.valor_resolvido && <p>{suggestion.valor_resolvido}</p>}
      <p className="muted">
        {suggestion.resolvido_por_nome ?? "Autor não informado"}
        {suggestion.resolvido_em ? ` · ${formatDate(suggestion.resolvido_em)}` : ""}
      </p>
    </li>
  );
}

function PendingSuggestionCard({
  suggestion,
  canWrite,
  onResolved,
}: {
  suggestion: Suggestion;
  canWrite: boolean;
  onResolved: (updated: Suggestion) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [valor, setValor] = useState(suggestion.valor_sugerido);
  const [justificativa, setJustificativa] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  const run = async (action: () => Promise<Suggestion>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await action();
      onResolved(updated);
    } catch (caught) {
      setError(describeSuggestionError(caught));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <AISuggestion
      onAccept={canWrite && !editing ? () => run(() => acceptSuggestion(suggestion.entidade_tipo, suggestion.entidade_id, suggestion.id, justificativa)) : undefined}
      onEdit={canWrite ? () => setEditing((value) => !value) : undefined}
      onDiscard={canWrite ? () => run(() => discardSuggestion(suggestion.entidade_tipo, suggestion.entidade_id, suggestion.id)) : undefined}
    >
      <p className="muted">
        Campo: <strong>{fieldLabel(suggestion.campo)}</strong>
        {suggestion.criado_por_nome ? ` · Proposto por ${suggestion.criado_por_nome}` : ""}
      </p>
      {editing ? (
        <div className="project-field">
          <label htmlFor={`suggestion-edit-${suggestion.id}`}>Valor editado</label>
          <textarea
            id={`suggestion-edit-${suggestion.id}`}
            className="input-garakis"
            rows={3}
            disabled={busy}
            value={valor}
            onChange={(event) => setValor(event.target.value)}
          />
        </div>
      ) : (
        <p>{suggestion.valor_sugerido}</p>
      )}
      {canWrite && (
        <div className="project-field">
          <label htmlFor={`suggestion-justificativa-${suggestion.id}`}>Justificativa (obrigatória apenas se o item já estiver concluído)</label>
          <input
            id={`suggestion-justificativa-${suggestion.id}`}
            className="input-garakis"
            type="text"
            disabled={busy}
            value={justificativa}
            onChange={(event) => setJustificativa(event.target.value)}
          />
        </div>
      )}
      {editing && (
        <div className="project-actions">
          <Button disabled={busy || !valor.trim()} onClick={() => run(() => editSuggestion(suggestion.entidade_tipo, suggestion.entidade_id, suggestion.id, valor.trim(), justificativa))}>
            {busy ? "Confirmando…" : "Confirmar edição"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setEditing(false); setValor(suggestion.valor_sugerido); }}>Cancelar</Button>
        </div>
      )}
      {error && <Alert tone="danger" role="alert">{error}</Alert>}
    </AISuggestion>
  );
}

export function SuggestionsPanel({
  kind,
  id,
  canWrite,
  readOnlyNote,
}: {
  kind: SuggestionKind;
  id: string;
  canWrite: boolean;
  readOnlyNote?: string;
}) {
  const [state, setState] = useState<{ state: "loading" } | { state: "error" } | { state: "ready"; items: Suggestion[] }>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ state: "loading" });
    listSuggestions(kind, id, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setState({ state: "ready", items }); })
      .catch(() => { if (!controller.signal.aborted) setState({ state: "error" }); });
    return () => controller.abort();
  }, [kind, id, attempt]);

  const replace = (updated: Suggestion) => {
    if (!mounted.current) return;
    setState((current) => current.state === "ready"
      ? { state: "ready", items: current.items.map((item) => (item.id === updated.id ? updated : item)) }
      : current);
  };

  const pending = state.state === "ready" ? state.items.filter((item) => item.status === "pendente") : [];
  const resolved = state.state === "ready" ? state.items.filter((item) => item.status !== "pendente") : [];

  return (
    <section className="decisions-panel card-garakis" aria-labelledby={`suggestions-title-${id}`}>
      <div className="decisions-head">
        <div>
          <h3 id={`suggestions-title-${id}`}>Sugestões da IA</h3>
          <p className="muted">
            Toda sugestão exige aceite, edição ou descarte explícito. Nenhuma altera o item por conta própria. O cadastro manual
            funciona normalmente mesmo com a IA desligada ou indisponível.
          </p>
        </div>
      </div>

      {!canWrite && readOnlyNote && <Alert tone="warning">{readOnlyNote}</Alert>}

      {state.state === "loading" && <p className="help" role="status">Carregando sugestões…</p>}

      {state.state === "error" && (
        <Alert tone="danger" role="alert">
          Não foi possível carregar as sugestões.{" "}
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button>
        </Alert>
      )}

      {state.state === "ready" && pending.length === 0 && resolved.length === 0 && (
        <EmptyState
          title="Nenhuma sugestão da IA para este item"
          description="Quando a IA propuser um campo, ele aparecerá aqui para aceite, edição ou descarte explícito."
        />
      )}

      {state.state === "ready" && pending.length > 0 && (
        <div>
          <h4 className="decisions-group">Pendentes ({pending.length})</h4>
          <div className="decision-list" style={{ display: "grid", gap: 16 }}>
            {pending.map((suggestion) => (
              <PendingSuggestionCard key={suggestion.id} suggestion={suggestion} canWrite={canWrite} onResolved={replace} />
            ))}
          </div>
        </div>
      )}

      {state.state === "ready" && resolved.length > 0 && (
        <div>
          <h4 className="decisions-group">Resolvidas ({resolved.length})</h4>
          <ul className="decision-list" aria-label="Sugestões já resolvidas">
            {resolved.map((suggestion) => <ResolvedSuggestionCard key={suggestion.id} suggestion={suggestion} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
