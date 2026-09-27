import type { RepoAnalysis, RepoAnalysisStatus } from "../projects/repo-analyzer.api";

export const ANALYSIS_STAGES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "ollama", label: "Verificar IA local" },
  { key: "clone", label: "Clonar repositório" },
  { key: "scan", label: "Inventariar arquivos" },
  { key: "files", label: "Analisar arquivos" },
  { key: "synthesis", label: "Gerar síntese" },
];

export type StageState = "done" | "current" | "pending" | "failed";

export function stageStates(analysis: Pick<RepoAnalysis, "status" | "etapa">): StageState[] {
  if (analysis.status === "concluido") return ANALYSIS_STAGES.map(() => "done");
  const current = ANALYSIS_STAGES.findIndex((stage) => stage.key === analysis.etapa);
  const position = current === -1 ? 0 : current;
  return ANALYSIS_STAGES.map((_, index) => {
    if (index < position) return "done";
    if (index === position) return analysis.status === "falha" ? "failed" : "current";
    return "pending";
  });
}

export const STATUS_VIEW: Record<RepoAnalysisStatus, { label: string; tone: "info" | "brand" | "success" | "danger" }> = {
  iniciado: { label: "Na fila", tone: "info" },
  em_execucao: { label: "Em execução", tone: "brand" },
  concluido: { label: "Concluída", tone: "success" },
  falha: { label: "Falhou", tone: "danger" },
};

export function isActive(analysis: Pick<RepoAnalysis, "status">): boolean {
  return analysis.status === "iniciado" || analysis.status === "em_execucao";
}

export function repositoryLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/$/, "");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export function analysisDuration(analysis: Pick<RepoAnalysis, "created_at" | "concluido_em" | "updated_at" | "status">, now: number = Date.now()): number | null {
  const start = Date.parse(analysis.created_at);
  if (Number.isNaN(start)) return null;
  const finishedAt = analysis.concluido_em ? Date.parse(analysis.concluido_em) : analysis.status === "falha" ? Date.parse(analysis.updated_at) : now;
  if (Number.isNaN(finishedAt)) return null;
  return Math.max(0, (finishedAt - start) / 1000);
}

export interface AnalysisStats {
  filesTotal: number | null;
  filesProcessed: number | null;
  etaSeconds: number | null;
  languages: Array<{ name: string; count: number }>;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readStats(metadata: Record<string, unknown> | null | undefined): AnalysisStats {
  const languagesRaw = metadata?.language_counts;
  const languages =
    languagesRaw && typeof languagesRaw === "object"
      ? Object.entries(languagesRaw as Record<string, unknown>)
          .flatMap(([name, count]) => (typeof count === "number" && count > 0 ? [{ name, count }] : []))
          .sort((left, right) => right.count - left.count)
          .slice(0, 6)
      : [];
  return {
    filesTotal: numberOrNull(metadata?.files_total),
    filesProcessed: numberOrNull(metadata?.files_processed),
    etaSeconds: numberOrNull(metadata?.eta_seconds),
    languages,
  };
}

const GITHUB_URL = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/i;

export function validateRepositoryUrl(value: string): string {
  const url = value.trim();
  if (!url) return "Informe a URL do repositório.";
  if (!GITHUB_URL.test(url)) return "Use o formato https://github.com/usuario/repositorio.";
  return "";
}
