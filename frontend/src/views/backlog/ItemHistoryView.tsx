import { useState, useEffect } from "react";
import { getItemHistory, AuditHistoryItem } from "../../api/api_backlog";

export interface ItemHistoryViewProps {
  entidadeTipo: "epico" | "feature" | "pbi";
  entidadeId: string;
  refreshTrigger?: number;
}

export function ItemHistoryView({
  entidadeTipo,
  entidadeId,
  refreshTrigger = 0,
}: ItemHistoryViewProps) {
  const [history, setHistory] = useState<AuditHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    try {
      getItemHistory(entidadeTipo, entidadeId, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) {
            setHistory(items);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setHistory([]);
            setLoading(false);
          }
        });
    } catch {
      if (!controller.signal.aborted) {
        setHistory([]);
        setLoading(false);
      }
    }

    return () => controller.abort();
  }, [entidadeTipo, entidadeId, refreshTrigger]);

  if (loading) {
    return <div className="glass-panel projects-state" role="status">Carregando histórico de auditoria…</div>;
  }

  if (error) {
    return (
      <div className="glass-panel projects-state">
        <p role="alert">{error}</p>
      </div>
    );
  }

  return (
    <section className="glass-panel item-history-panel" aria-label="Histórico de auditoria">
      <header className="quality-panel-header">
        <div className="quality-panel-header-left">
          <span className="projects-eyebrow">Rastreabilidade e auditoria</span>
          <h4 className="quality-panel-title">Histórico de alterações e justificativas</h4>
        </div>
      </header>

      <div className="quality-panel-body">
        <p className="quality-help-text">
          Estes registros contêm o histórico de justificativas e alterações deste item. 
          <em>Nota: Decisões de negócio e deliberações técnicas são registradas no módulo de Decisões.</em>
        </p>

        {history.length === 0 ? (
          <p className="projects-state">Nenhum registro de alteração encontrado para este item.</p>
        ) : (
          <ul className="history-list" role="list" style={{ listStyle: "none", padding: 0, marginTop: "1rem" }}>
            {history.map((item) => (
              <li
                key={item.id}
                className="history-item-card"
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "1rem",
                  marginBottom: "0.75rem",
                  background: "rgba(10, 13, 20, 0.6)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <strong>{item.usuario_nome || "Usuário não identificado"}</strong>
                  <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                  <span className="badge badge-info" style={{ marginRight: "0.5rem" }}>{item.acao}</span>
                </div>
                {item.justificativa ? (
                  <div className="history-justification" style={{ background: "rgba(249, 115, 22, 0.1)", borderLeft: "3px solid #F97316", padding: "0.5rem 0.75rem", borderRadius: "4px" }}>
                    <strong>Justificativa da alteração:</strong> {item.justificativa}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.85rem", fontStyle: "italic", opacity: 0.6 }}>
                    Sem justificativa registrada (alteração em rascunho ou sem exigência).
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
