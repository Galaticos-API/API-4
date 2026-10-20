import { afterEach, expect, it, vi } from "vitest";
import {
  askCopilot,
  parseCopilotAnswer,
  type CopilotLevel,
} from "./api_copilot";
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
