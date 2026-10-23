import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "./api_auth";
import { describeReuseError, parseSimilarItem, reuseSimilarItem, searchSimilarItems, similarItemPath } from "./api_similar_items";

const raw = (overrides: Record<string, unknown> = {}) => ({
  tipo: "pbi", id: "pbi-9", codigo: "PBI-02.1.3", titulo: "Validar login", status: "pronto", similaridade: 0.83,
  trecho: "Como usuário quero entrar", projeto: { id: "p2", nome: "Beta" }, outro_projeto: true,
  caminho: [{ tipo: "epico", id: "e2", titulo: "Acesso" }, { tipo: "feature", id: "f2", titulo: "Login" }],
  origem: "Beta › Acesso › Login", ja_aproveitado: false,
  ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

it("consulta o acervo pelo projeto atual enviando só o rascunho", async () => {
  const request = vi.fn(() => json({ items: [raw()], total: 1, degradado: false }));
  vi.stubGlobal("fetch", request);
  const result = await searchSimilarItems("p1", { tipo: "pbi", titulo: "Validar login", descricao: "entrar com e-mail" });
  const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/v1/projects/p1/similar-items");
  expect(init.method).toBe("POST");
  expect(JSON.parse(String(init.body))).toEqual({ tipo: "pbi", titulo: "Validar login", descricao: "entrar com e-mail" });
  expect(result.items[0]).toMatchObject({ id: "pbi-9", outro_projeto: true, origem: "Beta › Acesso › Login" });
});

it("rejeita resposta malformada em vez de exibir lixo", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json({ items: [{ id: 1 }] })));
  await expect(searchSimilarItems("p1", { tipo: "pbi", titulo: "x" })).rejects.toThrow();
});

it("monta a origem a partir do caminho quando o servidor não a envia", () => {
  expect(parseSimilarItem(raw({ origem: undefined })).origem).toBe("Beta › Acesso › Login");
});

it("monta o link de consulta por tipo e ignora caminho incompleto", () => {
  expect(similarItemPath(parseSimilarItem(raw()))).toBe("/projects/p2/epics/e2/features/f2/pbis/pbi-9");
  expect(similarItemPath(parseSimilarItem(raw({ tipo: "epico", id: "e2", caminho: [] })))).toBe("/projects/p2/epics/e2");
  expect(similarItemPath(parseSimilarItem(raw({ caminho: [] })))).toBeNull();
});

it("aproveitar chama a rota do tipo do item e devolve relação e propostas", async () => {
  const suggestion = {
    id: "s1", entidade_tipo: "pbi", entidade_id: "pbi-1", campo: "titulo", valor_sugerido: "Validar login", valor_resolvido: null,
    origem: "similar:pbi:pbi-9", status: "pendente", criado_por: "u1", criado_por_nome: "Ana", resolvido_por: null,
    resolvido_por_nome: null, resolvido_em: null, created_at: "2026-10-21T10:00:00Z", updated_at: "2026-10-21T10:00:00Z",
  };
  const request = vi.fn(() => json({
    relacao: { id: "r1", tipo_relacao: "reaproveitado_de", destino_tipo: "pbi", destino_id: "pbi-1", origem_tipo: "pbi", origem_id: "pbi-9", origem_projeto_id: "p2", campos: ["titulo"] },
    sugestoes: [suggestion],
  }, 201));
  vi.stubGlobal("fetch", request);
  const result = await reuseSimilarItem("pbi", "pbi-1", "pbi-9");
  const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/v1/pbis/pbi-1/similar-items/pbi-9/reuse");
  expect(JSON.parse(String(init.body))).toEqual({});
  expect(result.relacao.campos).toEqual(["titulo"]);
  expect(result.sugestoes[0].origem).toBe("similar:pbi:pbi-9");
});

it("traduz erros de aproveitamento para mensagens claras", () => {
  expect(describeReuseError(new ApiError(403, undefined))).toMatch(/perfil/);
  expect(describeReuseError(new ApiError(409, { error: "O item de origem está arquivado e não pode ser aproveitado." }))).toMatch(/arquivado/);
  expect(describeReuseError(new Error("x"))).toMatch(/Não foi possível/);
});
