import { describe, expect, it } from "vitest";
import { describeAuditChanges } from "./auditChanges";

describe("describeAuditChanges", () => {
  it("apresenta valores anteriores e novos dos campos conhecidos", () => {
    expect(describeAuditChanges({
      alteracoes: { titulo: "Título novo", objetivo: "Objetivo novo", justificativa: "não duplicar" },
      anterior: { titulo: "Título antigo", objetivo: null },
      novo: { titulo: "Título novo", objetivo: "Objetivo novo" },
    })).toEqual([
      { field: "titulo", label: "Título", before: "Título antigo", after: "Título novo" },
      { field: "objetivo", label: "Objetivo", before: "Não informado", after: "Objetivo novo" },
    ]);
  });

  it("mantém compatibilidade com eventos legados e não expõe propriedades desconhecidas", () => {
    expect(describeAuditChanges({
      alteracoes: { titulo: "Título corrigido", token_interno: "segredo" },
      anterior: { titulo: "Título antigo" },
      novo: { titulo: "Título corrigido" },
    })).toEqual([
      { field: "titulo", label: "Título", before: "Título antigo", after: "Título corrigido" },
    ]);
  });

  it("apresenta snapshot de versão PBI somente pelos campos permitidos", () => {
    expect(describeAuditChanges({
      pbi_snapshot: { titulo: "Versão salva", historia_eu_quero: "acompanhar versão", campo_interno: "não expor" },
    })).toEqual([
      { field: "titulo", label: "Título", after: "Versão salva" },
      { field: "historia_eu_quero", label: "EU QUERO", after: "acompanhar versão" },
    ]);
  });
});
