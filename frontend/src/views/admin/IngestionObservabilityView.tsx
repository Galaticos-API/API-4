import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchIngestionSnapshot,
  reprocessIngestionDocument,
  type IngestionDocument,
  type IngestionSnapshot,
  type IngestionStatus,
} from "../../api/api_ingestion";
import { Alert, Badge, Button, EmptyState } from "../common/ui";
import "../../assets/styles/ingestion.css";

const STATUS_LABEL: Record<IngestionStatus, string> = {
  pendente: "Pendente",
  processando: "Processando",
  processado: "Processado",
  falha: "Falha",
};

const STATUS_TONE: Record<IngestionStatus, "warning" | "info" | "success" | "danger"> = {
  pendente: "warning",
  processando: "info",
  processado: "success",
  falha: "danger",
};

const PIPELINE_STEPS: Array<{ key: IngestionStatus; label: string; tooltip: string }> = [
  { key: "pendente",    label: "Recebido",     tooltip: "Documento gravado, aguardando o worker reivindicar" },
  { key: "processando", label: "Processando",  tooltip: "Worker chamou o ai-service e aguarda chunks + embeddings" },
  { key: "processado",  label: "Indexado",     tooltip: "Chunks persistidos; aparece na busca híbrida S2-06" },
];

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function formatInstant(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function PipelineBar({ status }: { status: IngestionStatus }) {
  const reachedIndex = status === "falha" ? -1 : PIPELINE_STEPS.findIndex((step) => step.key === status);
  return (
    <ol className={`pipeline-bar${status === "falha" ? " pipeline-bar--failed" : ""}`} aria-label={`Estado do pipeline: ${STATUS_LABEL[status]}`}>
      {PIPELINE_STEPS.map((step, index) => (
        <li
          key={step.key}
          className={`pipeline-step${index <= reachedIndex ? " pipeline-step--reached" : ""}${step.key === status ? " pipeline-step--current" : ""}`}
          title={step.tooltip}
        >
          <span className="pipeline-step-dot" aria-hidden="true" />
          <span className="pipeline-step-label">{step.label}</span>
        </li>
      ))}
      {status === "falha" && (
        <li className="pipeline-step pipeline-step--failure">
          <span className="pipeline-step-dot" aria-hidden="true" />
          <span className="pipeline-step-label">Falha</span>
        </li>
      )}
    </ol>
  );
}

function DocumentRow({ item, canRetry, onRetry, retryingId }: {
  item: IngestionDocument;
  canRetry: boolean;
  onRetry: (item: IngestionDocument) => void;
  retryingId: string | null;
}) {
  return (
    <article className={`ingestion-row ingestion-row--${item.status_processamento}`}>
      <header className="ingestion-row-head">
        <div>
          <h4>{item.nome}</h4>
          <p className="muted">
            <strong>{item.projeto_nome}</strong>
            {item.extensao ? ` · ${item.extensao.replace(".", "").toUpperCase()}` : ""}
            {" · "}
            {formatBytes(item.tamanho_bytes)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[item.status_processamento]}>{STATUS_LABEL[item.status_processamento]}</Badge>
      </header>

      <PipelineBar status={item.status_processamento} />

      <dl className="ingestion-row-meta">
        <div><dt>Tentativas</dt><dd>{item.processamento_tentativas}</dd></div>
        <div><dt>Próxima tentativa</dt><dd>{formatInstant(item.processamento_proxima_tentativa)}</dd></div>
        <div><dt>Atualizado em</dt><dd>{formatInstant(item.updated_at)}</dd></div>
      </dl>

      {item.processamento_erro && (
        <Alert tone="danger" title="Motivo da falha">{item.processamento_erro}</Alert>
      )}

      {canRetry && item.status_processamento === "falha" && (
        <div className="ingestion-row-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={retryingId === item.id}
            onClick={() => onRetry(item)}
          >
            {retryingId === item.id ? "Agendando…" : "Reprocessar"}
          </Button>
        </div>
      )}
    </article>
  );
}

export function IngestionObservabilityView() {
  const [snapshot, setSnapshot] = useState<IngestionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const scope = useRef(new AbortController());

  const refresh = useCallback(async (quiet = false) => {
    if (scope.current.signal.aborted) return;
    if (!quiet) setLoading(true);
    try {
      const data = await fetchIngestionSnapshot(scope.current.signal);
      if (!scope.current.signal.aborted) {
        setSnapshot(data);
        setError(null);
      }
    } catch (caught) {
      if (!scope.current.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Não foi possível carregar o estado da ingestão.");
      }
    } finally {
      if (!scope.current.signal.aborted && !quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    void refresh(false);
    const timer = window.setInterval(() => { void refresh(true); }, 5_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const onRetry = useCallback(async (item: IngestionDocument) => {
    setRetrying(item.id);
    setActionMessage(null);
    try {
      await reprocessIngestionDocument(item.projeto_id, item.id);
      setActionMessage(`O documento “${item.nome}” foi recolocado na fila. O worker vai pegar no próximo ciclo (≈ a cada 5 s).`);
      await refresh(true);
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : "Não foi possível reagendar o documento.");
    } finally {
      setRetrying(null);
    }
  }, [refresh]);

  if (loading && !snapshot) {
    return (
      <section className="page-container">
        <h1>Pipeline de ingestão</h1>
        <div className="ds-card ds-card--glass projects-state" role="status">Carregando estado da fila…</div>
      </section>
    );
  }

  if (error && !snapshot) {
    return (
      <section className="page-container">
        <h1>Pipeline de ingestão</h1>
        <Alert tone="danger" title="Falha ao consultar o pipeline">{error}</Alert>
        <Button variant="secondary" onClick={() => void refresh(false)}>Tentar novamente</Button>
      </section>
    );
  }

  if (!snapshot) return null;

  const totalMovimentando = snapshot.counts.pendente + snapshot.counts.processando;

  return (
    <section className="page-container ingestion-view" aria-label="Pipeline de ingestão">
      <header className="ingestion-head">
        <div>
          <div className="eyebrow">ADMIN · PIPELINE</div>
          <h1>Ingestão de documentos</h1>
          <p className="muted">
            Visão em tempo real do worker da S2-01 processando os uploads. Equivale ao
            editor do n8n: aqui você vê cada documento chegar, ser processado, indexado
            ou falhar, sem precisar abrir uma segunda ferramenta.
          </p>
        </div>
        <div className="ingestion-head-actions">
          <span className="muted">
            Atualizado em {formatInstant(snapshot.generated_at)} · auto-refresh 5 s
          </span>
          <Button variant="secondary" onClick={() => void refresh(false)}>Atualizar agora</Button>
        </div>
      </header>

      {actionMessage && <Alert tone="info">{actionMessage}</Alert>}
      {error && <Alert tone="warning">Falha ao atualizar: {error}</Alert>}

      <section className="ingestion-counters" aria-label="Contagem por estado">
        {(["pendente", "processando", "processado", "falha"] as IngestionStatus[]).map((status) => (
          <article key={status} className={`ingestion-counter ingestion-counter--${status}`}>
            <span className="ingestion-counter-value">{snapshot.counts[status]}</span>
            <span className="ingestion-counter-label">{STATUS_LABEL[status]}</span>
          </article>
        ))}
      </section>

      <section aria-labelledby="ingestion-active-title">
        <h2 id="ingestion-active-title">Em andamento ({totalMovimentando})</h2>
        {snapshot.active.length === 0 ? (
          <EmptyState
            title="Fila vazia"
            description="Nenhum documento aguardando ou em processamento no momento. Envie um upload para ver o pipeline em ação."
          />
        ) : (
          <div className="ingestion-list">
            {snapshot.active.map((item) => (
              <DocumentRow key={item.id} item={item} canRetry={false} onRetry={onRetry} retryingId={retrying} />
            ))}
          </div>
        )}
      </section>

      {snapshot.failed.length > 0 && (
        <section aria-labelledby="ingestion-failed-title">
          <h2 id="ingestion-failed-title">Falhas recentes ({snapshot.failed.length})</h2>
          <div className="ingestion-list">
            {snapshot.failed.map((item) => (
              <DocumentRow key={item.id} item={item} canRetry onRetry={onRetry} retryingId={retrying} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="ingestion-recent-title">
        <h2 id="ingestion-recent-title">Últimas atualizações</h2>
        {snapshot.recent.length === 0 ? (
          <EmptyState title="Nenhum documento registrado" description="O histórico aparece aqui conforme os uploads acontecem." />
        ) : (
          <div className="ingestion-list">
            {snapshot.recent.map((item) => (
              <DocumentRow key={item.id} item={item} canRetry={item.status_processamento === "falha"} onRetry={onRetry} retryingId={retrying} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
