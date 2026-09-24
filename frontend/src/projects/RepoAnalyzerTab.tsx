import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/api_auth";
import { serverMessage } from "../api/api_errors";
import { Alert, Badge, Button, EmptyState, Field, Progress, type BadgeTone } from "../components/ui";
import { listRepoAnalyses, startRepoAnalysis, type RepoAnalysis, type RepoAnalysisStatus } from "./repo-analyzer.api";
import "./repo-analyzer.css";

const POLL_INTERVAL_MS = 4000;
const GITHUB_URL = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/i;

const STATUS_VIEW: Record<RepoAnalysisStatus, { label: string; tone: BadgeTone }> = {
    iniciado: { label: "Na fila", tone: "info" },
    em_execucao: { label: "Em execução", tone: "brand" },
    concluido: { label: "Concluída", tone: "success" },
    falha: { label: "Falhou", tone: "danger" },
};

type LoadState = { state: "loading" } | { state: "error"; message: string } | { state: "ready" };

function isActive(analysis: RepoAnalysis): boolean {
    return analysis.status === "iniciado" || analysis.status === "em_execucao";
}

function repositoryLabel(url: string): string {
    return url.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/$/, "");
}

function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data indisponível";
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function describeLoadError(error: unknown): string {
    if (error instanceof ApiError && error.status === 401) return "É necessário entrar para consultar as análises.";
    if (error instanceof ApiError && error.status === 403) return "Você não tem permissão para consultar as análises deste projeto.";
    return "Não foi possível carregar as análises. Tente novamente.";
}

function describeStartError(error: unknown): string {
    if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para iniciar a análise.";
    if (error instanceof ApiError && error.status === 403) return "Você não tem permissão para iniciar análises neste projeto.";
    if (error instanceof ApiError && error.status === 400) return serverMessage(error) ?? "Revise a URL informada e tente novamente.";
    return "Não foi possível iniciar a análise. Tente novamente em instantes.";
}

function downloadMarkdown(content: string, repositoryName: string): void {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-${repositoryName.replace(/[^a-zA-Z0-9]/g, "-")}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RepoAnalyzerTab({ projectId }: { projectId: string }) {
    const [load, setLoad] = useState<LoadState>({ state: "loading" });
    const [analyses, setAnalyses] = useState<RepoAnalysis[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [repoUrl, setRepoUrl] = useState("");
    const [urlError, setUrlError] = useState("");
    const [startError, setStartError] = useState("");
    const [starting, setStarting] = useState(false);
    const [pollFailed, setPollFailed] = useState(false);
    const startingRef = useRef(false);
    const mounted = useRef(true);
    const requestId = useRef(0);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const refresh = useCallback(async (silent: boolean) => {
        const current = ++requestId.current;
        if (!silent) setLoad({ state: "loading" });
        try {
            const data = await listRepoAnalyses(projectId);
            if (!mounted.current || current !== requestId.current) return;
            setAnalyses(data);
            setSelectedId(previous => previous && data.some(item => item.id === previous) ? previous : data[0]?.id ?? null);
            setPollFailed(false);
            setLoad({ state: "ready" });
        } catch (error) {
            if (!mounted.current || current !== requestId.current) return;
            if (silent) setPollFailed(true);
            else setLoad({ state: "error", message: describeLoadError(error) });
        }
    }, [projectId]);

    useEffect(() => {
        void refresh(false);
    }, [refresh]);

    const hasActive = analyses.some(isActive);

    useEffect(() => {
        if (!hasActive) return;
        const timer = setInterval(() => { void refresh(true); }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [hasActive, refresh]);

    async function handleStart(event: React.FormEvent) {
        event.preventDefault();
        if (startingRef.current) return;
        const url = repoUrl.trim();
        setStartError("");
        if (!url) {
            setUrlError("Informe a URL do repositório.");
            return;
        }
        if (!GITHUB_URL.test(url)) {
            setUrlError("Use o formato https://github.com/usuario/repositorio.");
            return;
        }
        setUrlError("");
        startingRef.current = true;
        setStarting(true);
        try {
            const created = await startRepoAnalysis(projectId, url);
            if (!mounted.current) return;
            setRepoUrl("");
            setAnalyses(previous => [created, ...previous.filter(item => item.id !== created.id)]);
            setSelectedId(created.id);
            setLoad({ state: "ready" });
            void refresh(true);
        } catch (error) {
            if (mounted.current) setStartError(describeStartError(error));
        } finally {
            startingRef.current = false;
            if (mounted.current) setStarting(false);
        }
    }

    const selected = analyses.find(item => item.id === selectedId) ?? null;

    return (
        <section className="repo-analyzer" aria-label="Análise de repositório">
            <div className="glass-panel repo-analyzer-intro">
                <h3>Análise de repositório GitHub</h3>
                <p>Informe a URL de um repositório público do GitHub para gerar o relatório técnico de arquitetura. O acompanhamento é atualizado automaticamente.</p>
                <form className="repo-analyzer-form" onSubmit={handleStart} noValidate>
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
                            onChange={event => { setRepoUrl(event.target.value); setUrlError(""); setStartError(""); }}
                        />
                    </Field>
                    <Button type="submit" disabled={starting}>{starting ? "Iniciando…" : "Iniciar análise"}</Button>
                </form>
                {startError && <Alert tone="danger" role="alert" title="Não foi possível iniciar a análise">{startError}</Alert>}
            </div>

            {load.state === "loading" && <div className="glass-panel projects-state" role="status">Carregando análises…</div>}

            {load.state === "error" && (
                <div className="glass-panel projects-state">
                    <p role="alert">{load.message}</p>
                    <Button variant="secondary" onClick={() => void refresh(false)}>Tentar novamente</Button>
                </div>
            )}

            {load.state === "ready" && (
                <div className="repo-analyzer-layout">
                    <div className="glass-panel analysis-history">
                        <div className="analysis-history-header">
                            <h4>Histórico de análises</h4>
                            <Button variant="ghost" size="sm" onClick={() => void refresh(true)}>Atualizar</Button>
                        </div>
                        {pollFailed && <Alert tone="warning" role="status">Não foi possível atualizar agora. Tentaremos novamente em instantes.</Alert>}
                        {analyses.length === 0 ? (
                            <p className="ds-help">Nenhuma análise realizada neste projeto.</p>
                        ) : (
                            <ul className="analysis-list">
                                {analyses.map(item => {
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
                                                    <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="glass-panel analysis-details" aria-live="polite">
                        {selected ? <AnalysisDetails analysis={selected} /> : (
                            <EmptyState
                                title="Nenhuma análise selecionada"
                                description="Informe a URL de um repositório acima para iniciar a primeira análise deste projeto."
                            />
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

function AnalysisDetails({ analysis }: { analysis: RepoAnalysis }) {
    const view = STATUS_VIEW[analysis.status] ?? STATUS_VIEW.iniciado;
    const progress = analysis.progresso ?? 0;
    return (
        <>
            <div className="analysis-details-header">
                <div>
                    <h4>{analysis.repositorio_url}</h4>
                    <p>
                        <Badge tone={view.tone}>{view.label}</Badge>
                        {" "}Iniciada em {formatDate(analysis.created_at)}
                        {analysis.autor_nome ? ` por ${analysis.autor_nome}` : ""}
                    </p>
                </div>
                {analysis.status === "concluido" && analysis.relatorio_markdown && (
                    <Button variant="secondary" size="sm" onClick={() => downloadMarkdown(analysis.relatorio_markdown ?? "", analysis.repositorio_url)}>
                        Baixar relatório (.md)
                    </Button>
                )}
            </div>

            {isActive(analysis) && (
                <div className="analysis-progress">
                    <div className="analysis-progress-line">
                        <span>Etapa: {analysis.etapa_label || analysis.etapa || "Na fila"}</span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} label="Progresso da análise" />
                    {analysis.mensagem && <p>{analysis.mensagem}</p>}
                </div>
            )}

            {analysis.status === "falha" && (
                <Alert tone="danger" role="alert" title="A análise falhou">
                    {analysis.erro || "O pipeline não informou o motivo da falha. Inicie uma nova análise para tentar novamente."}
                </Alert>
            )}

            {analysis.status === "concluido" && !analysis.relatorio_markdown && (
                <Alert tone="warning">A análise foi concluída, mas o relatório ainda não está disponível. Use Atualizar em instantes.</Alert>
            )}

            {analysis.status === "concluido" && analysis.relatorio_markdown && (
                <div className="analysis-report">
                    <h5>Relatório técnico gerado</h5>
                    <pre>{analysis.relatorio_markdown}</pre>
                </div>
            )}
        </>
    );
}
