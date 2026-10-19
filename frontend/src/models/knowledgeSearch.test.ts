import { describe, expect, it } from "vitest";
import { originLink, searchExcerpt } from "./knowledgeSearch";
import type { KnowledgeHit } from "../api/api_knowledge";

const hit: KnowledgeHit = { id: "c1", project_id: "p1", project_name: "Projeto", entity_id: "b1", entity_type: "pbi", title: "Autenticar", text: "Descrição: Rotas usam JWT.", metadata: {}, source_url: "/projects/p1/epics/e1/features/f1/pbis/b1", relevance_score: 1 };
describe("origem da busca", () => {
  it("gera um trecho curto perto da ocorrência", () => {
    const text = "x".repeat(500) + " JWT protege rotas " + "y".repeat(500);
    const excerpt = searchExcerpt(text, "jwt");
    expect(excerpt).toContain("JWT");
    expect(excerpt.length).toBeLessThanOrEqual(302);
    expect(originLink(hit, "jwt")).toContain("#search-origin=Rotas%20usam%20JWT.");
  });
  it.each(["javascript:alert(1)", "//evil.test/path", "https://evil.test/", "/projects/p2/epics/e1/features/f1/pbis/b1", "/projects/p1/epics/e1/features/f1/pbis/outro", "/projects/p1/../p2", "/projects/p1/\\evil"])("não oferece navegação insegura: %s", source_url => {
    expect(originLink({ ...hit, source_url }, "jwt")).toBeNull();
  });
  it("posiciona decisão na origem conhecida", () => {
    expect(originLink({ ...hit, entity_type: "decisao", source_url: "/projects/p1" }, "jwt")).toBe("/projects/p1#decision-b1");
  });
  it("não inventa uma rota quando ela não existe", () => {
    expect(originLink({ ...hit, source_url: null }, "jwt")).toBeNull();
  });
});

it.each([
  ["pbi", "/projects/p1/epics/b1"],
  ["feature", "/projects/p1/epics/b1"],
  ["epico", "/projects/p1/epics/e1/features/b1"],
] as const)("recusa rota incompatível com o nível %s", (entity_type, source_url) => {
  expect(originLink({...hit,entity_type,source_url}, "jwt")).toBeNull();
});

it.each(["/projects/p1/documents", "/projects/p1/epics/new"])("não envia uma decisão para uma tela sem decisões: %s", source_url => {
  expect(originLink({...hit,entity_type:"decisao",source_url},"jwt")).toBeNull();
});
