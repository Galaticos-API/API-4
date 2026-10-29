import { describe, expect, it } from "vitest";
import { SUGGESTED_PROMPTS, suggestedPromptsForContext } from "./chat";

describe("suggestedPromptsForContext", () => {
  it("keeps initial suggestions before a topic exists", () => {
    expect(suggestedPromptsForContext([])).toEqual(SUGGESTED_PROMPTS);
  });

  it("selects suggestions for the subject of the latest user message", () => {
    const prompts = suggestedPromptsForContext([
      { remetente: "user", conteudo: "Qual banco estamos usando?" },
      { remetente: "assistant", conteudo: "O projeto usa PostgreSQL.", origem: "assistente" },
    ]);
    expect(prompts[0]).toMatch(/banco de dados/);
    expect(prompts).not.toContain("Qual é o SLA para solicitação urgente?");
  });

  it("offers different paths after no evidence, including for restored history without origin metadata", () => {
    const prompts = suggestedPromptsForContext([
      { remetente: "user", conteudo: "Qual banco estamos usando?" },
      { remetente: "assistant", conteudo: "Informação não encontrada no acervo do projeto." },
    ]);
    expect(prompts[0]).toMatch(/registro de PostgreSQL/);
    expect(prompts).not.toContain("Quais decisões sobre banco de dados estão registradas?");
  });
});
