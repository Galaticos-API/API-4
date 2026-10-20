import { afterEach, expect, it, vi } from "vitest";
import {
  askCopilot,
  missingStoryFields,
  parseCopilotAnswer,
  type CopilotLevel,
} from "./api_copilot";
import { ApiError } from "./api_auth";
const answer = {
  mode: "levantamento",
  operation: "padronizar",
  level: "feature",
  version: 1,
  schema_version: 1,
  result: {
    proposal: {
      titulo: "Consultar pedido",
      descricao: "Consulta do pedido",
      objetivo: "Acompanhar entrega",
    },
    questions: [],
  },
};
afterEach(() => vi.unstubAllGlobals());
it.each([
  { ...answer, mode: "consulta" },
  { ...answer, level: "pbi" },
  { ...answer, schema_version: 2 },
  { ...answer, version: -1 },
  {
    ...answer,
    result: { proposal: { titulo: "Consultar pedido" }, questions: [] },
  },
  {
    ...answer,
    result: {
      proposal: { ...answer.result.proposal, sql: "DROP TABLE" },
      questions: [],
    },
  },
  { ...answer, result: { proposal: null, questions: [] } },
])("recusa contrato incompatível %#", (value) => {
  expect(() => parseCopilotAnswer(value, "padronizar", "feature")).toThrow(
    "resposta incompatível",
  );
});
it.each(["epico", "feature", "pbi"] as CopilotLevel[])(
  "não aceita campos de outro nível: %s",
  (level) => {
    if (level !== "feature")
      expect(() =>
        parseCopilotAnswer({ ...answer, level }, "padronizar", level),
      ).toThrow();
    else
      expect(parseCopilotAnswer(answer, "padronizar", level).operation).toBe(
        "padronizar",
      );
  },
);
it("bloqueia conteúdo acima do limite antes de enviá-lo sem truncar silenciosamente", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    askCopilot(
      "p1",
      "pbi",
      "questionar",
      { titulo: "x".repeat(6001) },
      new AbortController().signal,
    ),
  ).rejects.toThrow("6.000");
  expect(fetch).not.toHaveBeenCalled();
});

const scenario = {
  nome: "Aprovar pedido",
  tipo: "caminho_principal",
  dado: "que há um pedido pendente",
  quando: "o gestor aprova",
  entao: "o pedido fica aprovado",
};
const scenarios = {
  mode: "levantamento",
  operation: "cenarios",
  level: "pbi",
  version: 0,
  schema_version: 1,
  result: { scenarios: [scenario], questions: [] },
};
it("PBI-03.1.3: aceita cenários nomeados e tipados", () => {
  expect(parseCopilotAnswer(scenarios, "cenarios", "pbi")).toEqual({
    operation: "cenarios",
    version: 0,
    scenarios: [scenario],
    questions: [],
  });
});
it.each([
  { scenarios: [{ ...scenario, tipo: "outro" }], questions: [] },
  { scenarios: [{ ...scenario, nome: "x".repeat(256) }], questions: [] },
  { scenarios: [{ ...scenario, entao: " " }], questions: [] },
  { scenarios: [{ ...scenario, extra: "x" }], questions: [] },
  { scenarios: [], questions: [] },
  { scenarios: [scenario] },
])("PBI-03.1.3: rejeita resposta de cenários fora do contrato %#", (result) => {
  expect(() =>
    parseCopilotAnswer({ ...scenarios, result }, "cenarios", "pbi"),
  ).toThrow("Sua edição foi preservada");
});
it("identifica a recusa por história incompleta e os blocos faltantes", () => {
  expect(
    missingStoryFields(
      new ApiError(400, {
        code: "HISTORIA_INCOMPLETA",
        details: { campos: ["historia_como_um"] },
      }),
    ),
  ).toEqual(["historia_como_um"]);
  expect(missingStoryFields(new ApiError(400, { code: "VALIDATION_ERROR" }))).toBeNull();
  expect(missingStoryFields(new ApiError(503, {}))).toBeNull();
});
