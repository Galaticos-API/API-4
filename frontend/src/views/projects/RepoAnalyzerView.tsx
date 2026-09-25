import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/api_auth";
import { serverMessage } from "../../api/api_errors";
import {
  ANALYSIS_STAGES,
  STATUS_VIEW,
  analysisDuration,
  formatDateTime,
  formatDuration,
  isActive,
  readStats,
  repositoryLabel,
  stageStates,
  validateRepositoryUrl,
} from "../../models/repoAnalyzer";
import { listRepoAnalyses, startRepoAnalysis, type RepoAnalysis } from "../../projects/repo-analyzer.api";
import { Alert, Badge, Button, EmptyState, Field, Progress } from "../common/ui";
import { Markdown } from "../common/Markdown";
import "../../assets/styles/repo-analyzer.css";

const POLL_INTERVAL_MS = 4000;

type LoadState = { state: "loading" } | { state: "error"; message: string } | { state: "ready" };

function describeLoadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "É necessário entrar para consultar as análises.";
  if (error instanceof ApiError && error.status === 403) return "Você não tem permissão para consultar as análises deste projeto.";
  if (error instanceof ApiError && error.status === 404) return "Projeto não encontrado.";
  return "Não foi possível carregar as análises. Tente novamente.";
}

function describeStartError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para iniciar a análise.";
  if (error instanceof ApiError && error.status === 403) return "Você não tem permissão para iniciar análises neste projeto.";
  if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 503)) {
    return serverMessage(error) ?? "Revise a URL informada e tente novamente.";
  }
  return "Não foi possível iniciar a análise. Tente novamente em instantes.";
}

function downloadMarkdown(content: string, repositoryName: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-${repositoryName.replace(/[^a-zA-Z0-9]/g, "-")}.md`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function RepoAnalyzerView({ projectId, canStart = true }: { projectId: string; canStart?: boolean }) {
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const [analyses, setAnalyses] = useState<RepoAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startingRef = useRef(false);
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async (silent: boolean) => {
    const current = ++requestId.current;
    if (silent) setRefreshing(true);
    else setLoad({ state: "loading" });
    try {
      const data = await listRepoAnalyses(projectId);
      if (!mounted.current || current !== requestId.current) return;
      setAnalyses(data);
      setSelectedId((previous) => (previous && data.some((item) => item.id === previous) ? previous : data[0]?.id ?? null));
      setPollFailed(false);
      setLoad({ state: "ready" });
    } catch (error) {
      if (!mounted.current || current !== requestId.current) return;
      if (silent) setPollFailed(true);
      else setLoad({ state: "error", message: describeLoadError(error) });
    } finally {
      if (mounted.current && current === requestId.current) setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const hasActive = analyses.some(isActive);
  const now = useNow(hasActive);

  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => { void refresh(true); }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, refresh]);

  const launch = useCallback(async (url: string) => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError("");
    try {
      const created = await startRepoAnalysis(projectId, url);
      if (!mounted.current) return;
      setRepoUrl("");
      setAnalyses((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
      setSelectedId(created.id);
      setLoad({ state: "ready" });
      void refresh(true);
    } catch (error) {
      if (mounted.current) setStartError(describeStartError(error));
    } finally {
      startingRef.current = false;
      if (mounted.current) setStarting(false);
    }
  }, [projectId, refresh]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (startingRef.current) return;
    const problem = validateRepositoryUrl(repoUrl);
    setUrlError(problem);
    if (problem) return;
    void launch(repoUrl.trim());
  };

  const selected = analyses.find((item) => item.id === selectedId) ?? null;

  return (
    <section className="repo-analyzer" aria-label="Análise de repositório">
      <header className="repo-analyzer-head">
        <div className="eyebrow">ANÁLISE DE REPOSITÓRIO</div>
        <h2>Entenda a arquitetura de um repositório</h2>
        <p className="muted">
          Informe um repositório público do GitHub. O analisador clona, inventaria os arquivos e gera um relatório técnico em Markdown.
          O acompanhamento é atualizado automaticamente.
        </p>
      </header>

      {canStart ? (
        <form className="card-garakis repo-analyzer-form" onSubmit={submit} noValidate>
          <Field label="URL do repositório" error={urlError} help="Exemplo: https://github.com/usuario/repositorio">
            <input
              className="ds-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://github.com/usuario/repositorio"
              value={repoUrl}
              disabled={starting}
              aria-invalid={Boolean(urlError)}
              onChange={(event) => { setRepoUrl(event.target.value); setUrlError(""); setStartError(""); }}
            />
          </Field>
          <Button type="submit" disabled={starting}>{starting ? "Iniciando…" : "Iniciar análise"}</Button>
        </form>
      ) : (
        <Alert>Você pode consultar as análises, mas não pode iniciar novas neste momento (projeto arquivado ou perfil somente leitura).</Alert>
      )}
      {startError && <Alert tone="danger" role="alert" title="Não foi possível iniciar a análise">{startError}</Alert>}

      {load.state === "loading" && <div className="card-garakis repo-analyzer-state" role="status">Carregando análises…</div>}

      {load.state === "error" && (
        <div className="card-garakis repo-analyzer-state">
          <p role="alert">{load.message}</p>
          <Button variant="secondary" onClick={() => void refresh(false)}>Tentar novamente</Button>
        </div>
      )}

      {load.state === "ready" && (
        <div className="repo-analyzer-layout">
          <aside className="card-garakis analysis-history" aria-label="Histórico de análises">
            <div className="analysis-history-header">
              <h3>Histórico</h3>
              <Button variant="ghost" size="sm" disabled={refreshing} aria-busy={refreshing} onClick={() => void refresh(true)}>
                {refreshing ? "Atualizando…" : "Atualizar"}
              </Button>
            </div>
            {pollFailed && <Alert tone="warning">Não foi possível atualizar agora. Tentaremos novamente em instantes.</Alert>}
            {analyses.length === 0 ? (
              <p className="help">Nenhuma análise realizada neste projeto.</p>
            ) : (
              <ul className="analysis-list">
                {analyses.map((item) => {
                  const view = STATUS_VIEW[item.status] ?? STATUS_VIEW.iniciado;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="analysis-item"
                        aria-current={item.id === selectedId}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="analysis-item-url">{repositoryLabel(item.repositorio_url)}</span>
                        <span className="analysis-item-meta">
                          <Badge tone={view.tone}>{view.label}</Badge>
                          <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <div className="card-garakis analysis-details" aria-live="polite">
            {selected ? (
              <AnalysisDetails analysis={selected} now={now} canRetry={canStart && !starting} onRetry={() => void launch(selected.repositorio_url)} />
            ) : (
              <EmptyState
                title="Nenhuma análise selecionada"
                description="Informe a URL de um repositório para iniciar a primeira análise deste projeto."
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function AnalysisDetails({ analysis, now, canRetry, onRetry }: { analysis: RepoAnalysis; now: number; canRetry: boolean; onRetry: () => void }) {
  const view = STATUS_VIEW[analysis.status] ?? STATUS_VIEW.iniciado;
  const active = isActive(analysis);
  const progress = analysis.progresso ?? 0;
  const stages = stageStates(analysis);
  const stats = readStats(analysis.metadados);
  const duration = analysisDuration(analysis, now);
  const [mode, setMode] = useState<"preview" | "raw">("preview");
  const [copied, setCopied] = useState(false);
  const report = analysis.relatorio_markdown ?? "";

  useEffect(() => { setMode("preview"); setCopied(false); }, [analysis.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="analysis-details-header">
        <div>
          <h3>
            <a href={analysis.repositorio_url} target="_blank" rel="noopener noreferrer">{repositoryLabel(analysis.repositorio_url)}</a>
          </h3>
          <p className="help">
            Iniciada em {formatDateTime(analysis.created_at)}
            {analysis.autor_nome ? ` por ${analysis.autor_nome}` : ""}
            {duration !== null ? ` · duração ${formatDuration(duration)}` : ""}
          </p>
        </div>
        <Badge tone={view.tone}>{view.label}</Badge>
      </div>

      <ol className="analysis-stepper" aria-label="Etapas da análise">
        {ANALYSIS_STAGES.map((stage, index) => (
          <li key={stage.key} data-state={stages[index]} aria-current={stages[index] === "current" ? "step" : undefined}>
            <span className="analysis-step-marker" aria-hidden="true">{stages[index] === "done" ? "✓" : stages[index] === "failed" ? "!" : index + 1}</span>
            <span className="analysis-step-label">{stage.label}</span>
            <span className="sr-only">
              {stages[index] === "done" ? " (concluída)" : stages[index] === "current" ? " (em andamento)" : stages[index] === "failed" ? " (falhou)" : " (pendente)"}
            </span>
          </li>
        ))}
      </ol>

      {active && (
        <div className="analysis-progress">
          <div className="analysis-progress-line">
            <span>{analysis.etapa_label || "Na fila"}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} label="Progresso da análise" />
          {analysis.mensagem && <p className="help">{analysis.mensagem}</p>}
          {stats.filesTotal !== null && stats.filesProcessed !== null && (
            <p className="help">
              {stats.filesProcessed} de {stats.filesTotal} arquivos analisados
              {stats.etaSeconds ? ` · restante estimado ${formatDuration(stats.etaSeconds)}` : ""}
            </p>
          )}
        </div>
      )}

      {stats.languages.length > 0 && (
        <ul className="analysis-languages" aria-label="Linguagens encontradas">
          {stats.languages.map((language) => (
            <li key={language.name}><b>{language.name}</b> {language.count}</li>
          ))}
        </ul>
      )}

      {analysis.status === "falha" && (
        <Alert tone="danger" role="alert" title="A análise falhou">
          {analysis.erro || "O analisador não informou o motivo da falha."}
        </Alert>
      )}
      {analysis.status === "falha" && (
        <div>
          <Button variant="secondary" disabled={!canRetry} onClick={onRetry}>Analisar novamente</Button>
        </div>
      )}

      {analysis.status === "concluido" && !report && (
        <Alert tone="warning">A análise foi concluída, mas o relatório ainda não está disponível. Use Atualizar em instantes.</Alert>
      )}

      {analysis.status === "concluido" && report && (
        <section className="analysis-report" aria-label="Relatório técnico">
          <div className="analysis-report-toolbar">
            <h4>Relatório técnico</h4>
            <div className="analysis-report-actions">
              <div className="analysis-toggle" role="group" aria-label="Formato de exibição">
                <button type="button" aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Leitura</button>
                <button type="button" aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>Markdown</button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void copy()}>{copied ? "Copiado" : "Copiar"}</Button>
              <Button variant="secondary" size="sm" onClick={() => downloadMarkdown(report, analysis.repositorio_url)}>Baixar .md</Button>
            </div>
          </div>
          {mode === "preview" ? <Markdown source={report} className="analysis-report-body" /> : <pre className="analysis-report-raw" tabIndex={0}>{report}</pre>}
        </section>
      )}
    </>
  );
}
