import { useEffect, useState } from "react";
import { ApiError } from "../api/api_auth";
import { camposFaltantesDe, getChangeJustificationPolicy, listAuditHistory, type AuditHistoryItem } from "../api/api_backlog";

const ACAO_LABELS: Record<string, string> = {
  CRIAR_PBI: "Criação",
  ATUALIZAR_PBI: "Alteração",
  CONCLUIR_PBI: "Conclusão",
  CRIAR_EPICO: "Criação",
  ATUALIZAR_EPICO: "Alteração",
  CONCLUIR_EPICO: "Conclusão",
  CRIAR_FEATURE: "Criação",
  ATUALIZAR_FEATURE: "Alteração",
  CONCLUIR_FEATURE: "Conclusão",
};

export function ChangeJustificationField({
  value,
  onChange,
  required,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  required: boolean;
  disabled: boolean;
}) {
  return (
    <div className="project-field">
      <label htmlFor="justificativa-alteracao">
        Justificativa da alteração{required ? " (obrigatória)" : " (opcional)"}
      </label>
      <textarea
        id="justificativa-alteracao"
        name="justificativa"
        rows={3}
        disabled={disabled}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-required={required}
      />
      <p>Explique por que a especificação deste item concluído está mudando. A justificativa fica vinculada a esta versão no histórico.</p>
    </div>
  );
}

export async function loadJustificationRequirement(signal?: AbortSignal): Promise<boolean> {
  try {
    const policy = await getChangeJustificationPolicy(signal);
    return policy.justificativa_alteracao_obrigatoria;
  } catch {
    return true;
  }
}

export function justificationSaveError(error: unknown, fallback: string): string {
  const campos = camposFaltantesDe(error);
  if (campos?.includes("justificativa") || (error instanceof ApiError && error.status === 400 && /justificativa/i.test(JSON.stringify(error.details ?? "")))) {
    return "Informe a justificativa da alteração.";
  }
  return fallback;
}

export function ItemAuditHistory({
  entidadeTipo,
  entidadeId,
}: {
  entidadeTipo: "epico" | "feature" | "pbi";
  entidadeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ state: "idle" } | { state: "loading" } | { state: "error" } | { state: "ready"; items: AuditHistoryItem[] }>({ state: "idle" });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setResult({ state: "loading" });
    listAuditHistory(entidadeTipo, entidadeId, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setResult({ state: "ready", items }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ state: "error" }); });
    return () => controller.abort();
  }, [open, entidadeTipo, entidadeId]);

  return (
    <section className="glass-panel project-card" aria-label="Histórico de alterações">
      <div className="projects-heading">
        <div>
          <p className="projects-eyebrow">Rastreabilidade</p>
          <h3>Histórico de alterações</h3>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setOpen((value) => !value)}>
          {open ? "Ocultar histórico" : "Abrir histórico"}
        </button>
      </div>
      {open && result.state === "loading" && <p role="status">Carregando histórico…</p>}
      {open && result.state === "error" && <p role="alert">Não foi possível carregar o histórico.</p>}
      {open && result.state === "ready" && (result.items.length === 0
        ? <p>Nenhuma alteração registrada para este item.</p>
        : <ol>
          {result.items.map((item) => (
            <li key={item.id}>
              <strong>{ACAO_LABELS[item.acao] ?? item.acao}</strong>
              {" · "}
              {item.usuario_nome || "Sistema"}
              {" · "}
              {formatAuditDate(item.created_at)}
              <div>{item.justificativa ? `Justificativa: ${item.justificativa}` : "Sem justificativa nesta versão."}</div>
            </li>
          ))}
        </ol>)}
    </section>
  );
}

function formatAuditDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}
