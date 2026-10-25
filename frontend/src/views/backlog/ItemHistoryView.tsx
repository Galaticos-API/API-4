import { useEffect, useRef, useState } from "react";
import { getItemHistory, type AuditHistoryItem } from "../../api/api_backlog";
import { describeAuditChanges } from "../../models/auditChanges";
import { Button } from "../common/ui";
import { ItemVersionsView } from "./ItemVersionsView";
import { OrganizationQualityPanel } from './OrganizationQualityPanel';

const actionLabels: Record<string, string> = {
  CRIAR_EPICO: "Épico criado", ATUALIZAR_EPICO: "Épico atualizado", CONCLUIR_EPICO: "Épico concluído",
  CRIAR_FEATURE: "Feature criada", ATUALIZAR_FEATURE: "Feature atualizada", CONCLUIR_FEATURE: "Feature concluída",
  CRIAR_PBI: "PBI criado", ATUALIZAR_PBI: "PBI atualizado", CONCLUIR_PBI: "PBI concluído",
  ADICIONAR_CRITERIO: "Critério adicionado", REMOVER_CRITERIO: "Critério removido",
  MOVER_CRITERIO: "Critério reordenado", REGISTRAR_DECISAO: "Decisão registrada",
};

export interface ItemHistoryViewProps {
  entidadeTipo: "epico" | "feature" | "pbi";
  entidadeId: string;
  refreshTrigger?: number;
}

export function ItemHistoryView(props: ItemHistoryViewProps) {
  return <>
    <OrganizationQualityPanel key={`quality:${props.entidadeTipo}:${props.entidadeId}`} kind={props.entidadeTipo} id={props.entidadeId} refreshTrigger={props.refreshTrigger} />
    <div className="ds-card ds-card--glass quality-panel-body">
      <ItemVersionsView key={`${props.entidadeTipo}:${props.entidadeId}`} kind={props.entidadeTipo} id={props.entidadeId} refreshTrigger={props.refreshTrigger} />
    </div>
    <AuditHistoryView {...props} />
  </>;
}

function AuditHistoryView({
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
    return <div className="ds-card ds-card--glass projects-state" role="status">Carregando histórico de auditoria…</div>;
  }

  if (error) {
    return (
      <div className="ds-card ds-card--glass projects-state">
        <p role="alert">{error}</p>
        <Button
          variant="secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <section className="ds-card ds-card--glass item-history-panel" aria-label="Histórico de auditoria">
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
          <ul className="history-list" role="list">
            {history.map((item) => {
              const changes = describeAuditChanges({
                ...item.dados_json,
                ...(item.pbi_snapshot ? { pbi_snapshot: item.pbi_snapshot } : {}),
              });
              return (
                <li
                  key={item.id}
                  className="history-item-card"
                >
                  <div className="history-entry-header">
                    <strong>{item.usuario_nome || "Usuário não identificado"}</strong>
                    <time dateTime={item.created_at}>
                      {new Date(item.created_at).toLocaleString("pt-BR")}
                    </time>
                  </div>
                  <div className="history-entry-action">
                    <span className="history-action-label" title={item.acao}>{actionLabels[item.acao] ?? item.acao.replace(/_/g, " ").toLocaleLowerCase("pt-BR")}</span>
                    {item.pbi_versao !== null && item.pbi_versao !== undefined && (
                      <span className="ds-badge ds-badge--brand">Snapshot legado {item.pbi_versao}</span>
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
                    <div className="history-justification">
                      <strong>Justificativa da alteração:</strong> {item.justificativa}
                    </div>
                  ) : (
                    <div className="history-no-justification">
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
          <Button
            variant="secondary"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? "Carregando…" : "Carregar mais registros"}
          </Button>
        )}
      </div>
    </section>
  );
}
