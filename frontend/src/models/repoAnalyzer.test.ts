import { expect, it } from "vitest";
import {
  analysisDuration,
  formatDuration,
  readStats,
  repositoryLabel,
  stageStates,
  validateRepositoryUrl,
} from "./repoAnalyzer";

it("marca etapas concluídas, atual e pendentes conforme a etapa informada pelo analisador", () => {
  expect(stageStates({ status: "em_execucao", etapa: "scan" })).toEqual(["done", "done", "current", "pending", "pending"]);
  expect(stageStates({ status: "iniciado", etapa: "queued" })).toEqual(["current", "pending", "pending", "pending", "pending"]);
  expect(stageStates({ status: "concluido", etapa: "done" })).toEqual(["done", "done", "done", "done", "done"]);
  expect(stageStates({ status: "falha", etapa: "files" })).toEqual(["done", "done", "done", "failed", "pending"]);
});

it("valida somente URLs de repositório público do GitHub", () => {
  expect(validateRepositoryUrl("")).toBe("Informe a URL do repositório.");
  expect(validateRepositoryUrl("https://gitlab.com/a/b")).toMatch(/Use o formato/);
  expect(validateRepositoryUrl("https://github.com/acme")).toMatch(/Use o formato/);
  expect(validateRepositoryUrl(" https://github.com/acme/api/ ")).toBe("");
});

it("formata duração e nome do repositório", () => {
  expect(formatDuration(42)).toBe("42 s");
  expect(formatDuration(125)).toBe("2 min 5 s");
  expect(formatDuration(3720)).toBe("1 h 2 min");
  expect(repositoryLabel("https://github.com/acme/api/")).toBe("acme/api");
});

it("calcula a duração pela conclusão, pela falha ou pelo relógio atual", () => {
  const base = { created_at: "2026-09-25T10:00:00Z", updated_at: "2026-09-25T10:03:00Z" };
  expect(analysisDuration({ ...base, status: "concluido", concluido_em: "2026-09-25T10:05:00Z" })).toBe(300);
  expect(analysisDuration({ ...base, status: "falha", concluido_em: null })).toBe(180);
  expect(analysisDuration({ ...base, status: "em_execucao", concluido_em: null }, Date.parse("2026-09-25T10:01:00Z"))).toBe(60);
  expect(analysisDuration({ created_at: "invalida", updated_at: "x", status: "em_execucao", concluido_em: null })).toBeNull();
});

it("lê estatísticas de forma defensiva", () => {
  expect(readStats(null)).toEqual({ filesTotal: null, filesProcessed: null, etaSeconds: null, languages: [] });
  const stats = readStats({ files_total: 40, files_processed: 12, eta_seconds: 90, language_counts: { ts: 20, py: 5, md: 0, x: "n" } });
  expect(stats.filesTotal).toBe(40);
  expect(stats.filesProcessed).toBe(12);
  expect(stats.etaSeconds).toBe(90);
  expect(stats.languages).toEqual([{ name: "ts", count: 20 }, { name: "py", count: 5 }]);
});
