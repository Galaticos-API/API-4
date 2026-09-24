import { useState, useEffect, useRef } from "react";
import { getItemHistory, type AuditHistoryItem } from "../../api/api_backlog";
import { describeAuditChanges } from "../../models/auditChanges";

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
  const [attempt, setAttempt] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const continuationController = useRef<AbortController | null>(null);
  const entityKey = `${entidadeTipo}:${entidadeId}`;
  const currentEntityKey = useRef(entityKey);
  currentEntityKey.current = entityKey;

  useEffect(() => {
    const controller = new AbortController();
    continuationController.current?.abort();
    setLoading(true);
    setError(null);
    setHistory([]);
    setNextCursor(null);
    setMoreError(null);
    setLoadingMore(false);

    try {
      getItemHistory(entidadeTipo, entidadeId, controller.signal)
        .then((page) => {
          if (!controller.signal.aborted) {
            setHistory(page.items);
            setNextCursor(page.next_cursor);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setHistory([]);
            setError("Não foi possível carregar o histórico. Verifique sua conexão e tente novamente.");
            setLoading(false);
          }
        });
    } catch {
      if (!controller.signal.aborted) {
        setHistory([]);
        setError("Não foi possível carregar o histórico. Verifique sua conexão e tente novamente.");
        setLoading(false);
      }
    }

    return () => {
      controller.abort();
      continuationController.current?.abort();
    };
  }, [entidadeTipo, entidadeId, refreshTrigger, attempt]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    continuationController.current?.abort();
    const controller = new AbortController();
    continuationController.current = controller;
    const requestedEntityKey = entityKey;
    setLoadingMore(true);
    setMoreError(null);

    try {
      const page = await getItemHistory(
        entidadeTipo,
        entidadeId,
        controller.signal,
        nextCursor,
      );
      if (!controller.signal.aborted && currentEntityKey.current === requestedEntityKey) {
        setHistory((items) => {
          const existingIds = new Set(items.map((item) => item.id));
          return [...items, ...page.items.filter((item) => !existingIds.has(item.id))];
        });
        setNextCursor(page.next_cursor);
      }
    } catch {
      if (!controller.signal.aborted && currentEntityKey.current === requestedEntityKey) {
        setMoreError("Não foi possível carregar os próximos registros. Tente novamente.");
      }
    } finally {
      if (!controller.signal.aborted && currentEntityKey.current === requestedEntityKey) {
        setLoadingMore(false);
      }
    }
  }

  if (loading) {
    return <div className="glass-panel projects-state" role="status">Carregando histórico de auditoria…</div>;
  }

  if (error) {
    return (
      <div className="glass-panel projects-state">
        <p role="alert">{error}</p>
        <button
          className="btn-secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Tentar novamente
        </button>
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
          {history.map((item) => {
            const changes = describeAuditChanges({
              ...item.dados_json,
              ...(item.pbi_snapshot ? { pbi_snapshot: item.pbi_snapshot } : {}),
            });
            return (
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
                  {item.pbi_versao !== null && item.pbi_versao !== undefined && (
                    <span className="badge badge-info">Versão {item.pbi_versao}</span>
                  )}
                </div>
                {changes.length > 0 && (
                  <dl className="history-change-list">
                    {changes.map((change) => (
                      <div key={change.field}>
                        <dt>{change.label}</dt>
                        <dd>
                          {change.before !== undefined
                            ? `${change.before} → ${change.after ?? "Não informado"}`
                            : change.after}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
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
            );
          })}
          </ul>
        )}
        {moreError && <p role="alert">{moreError}</p>}
        {nextCursor && (
          <button
            className="btn-secondary"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? "Carregando…" : "Carregar mais registros"}
          </button>
        )}
      </div>
    </section>
  );
}
