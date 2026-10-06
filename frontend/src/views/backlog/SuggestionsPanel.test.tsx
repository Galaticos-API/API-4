// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SuggestionsPanel } from "./SuggestionsPanel";

const suggestion = (overrides: Record<string, unknown> = {}) => ({
  id: "s-1", entidade_tipo: "pbi", entidade_id: "pbi-1", campo: "titulo", valor_sugerido: "Validar login com e-mail",
  valor_resolvido: null, origem: "manual", status: "pendente", criado_por: "u-1", criado_por_nome: "Harness PRO4TECH",
  resolvido_por: null, resolvido_por_nome: null, resolvido_em: null,
  created_at: "2026-09-20T13:00:00Z", updated_at: "2026-09-20T13:00:00Z",
  ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const urlOf = (call: unknown[]) => String(call[0]);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lista sugestões pendentes e resolvidas, separadas", async () => {
  const request = vi.fn(() => json({ items: [suggestion(), suggestion({ id: "s-2", status: "descartada", resolvido_por_nome: "Ana PO", resolvido_em: "2026-09-21T10:00:00Z" })] }));
  vi.stubGlobal("fetch", request);
  render(<SuggestionsPanel kind="pbi" id="pbi-1" canWrite />);

  expect(await screen.findByText("Pendentes (1)")).toBeInTheDocument();
  expect(urlOf(request.mock.calls[0])).toBe("/api/v1/pbis/pbi-1/suggestions");
  expect(screen.getByText("Validar login com e-mail")).toBeInTheDocument();
  expect(screen.getByText(/Proposto por Harness PRO4TECH/)).toBeInTheDocument();
  expect(screen.getByText("Resolvidas (1)")).toBeInTheDocument();
  expect(screen.getByText("Descartada")).toBeInTheDocument();
});

it("estado vazio e mensagem de somente leitura quando não pode escrever", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json({ items: [] })));
  render(<SuggestionsPanel kind="epico" id="e-1" canWrite={false} readOnlyNote="Item arquivado: somente consulta." />);
  expect(await screen.findByText("Nenhuma sugestão da IA para este item")).toBeInTheDocument();
  expect(screen.getByText("Item arquivado: somente consulta.")).toBeInTheDocument();
});

it("aceitar aplica o valor e remove a sugestão da lista de pendentes", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ items: [suggestion()] }))
    .mockImplementationOnce(() => json(suggestion({ status: "aceita", valor_resolvido: "Validar login com e-mail", resolvido_por_nome: "Ana PO", resolvido_em: "2026-09-21T10:00:00Z" })));
  vi.stubGlobal("fetch", request);
  render(<SuggestionsPanel kind="pbi" id="pbi-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
  expect(await screen.findByText("Resolvidas (1)")).toBeInTheDocument();
  expect(screen.getByText("Aceita")).toBeInTheDocument();
  expect(screen.queryByText("Pendentes (1)")).toBeNull();
  const [url, init] = request.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("/api/v1/pbis/pbi-1/suggestions/s-1/accept");
  expect(JSON.parse(String(init.body))).toEqual({});
});

it("editar abre um campo de valor e confirma com o texto alterado", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ items: [suggestion()] }))
    .mockImplementationOnce(() => json(suggestion({ status: "editada", valor_sugerido: "Validar login com e-mail", valor_resolvido: "Validar login com e-mail corporativo" })));
  vi.stubGlobal("fetch", request);
  render(<SuggestionsPanel kind="pbi" id="pbi-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Editar antes de aceitar" }));
  const textarea = screen.getByLabelText("Valor editado");
  fireEvent.change(textarea, { target: { value: "Validar login com e-mail corporativo" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar edição" }));

  expect(await screen.findByText("Editada")).toBeInTheDocument();
  const [url, init] = request.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("/api/v1/pbis/pbi-1/suggestions/s-1/edit");
  expect(JSON.parse(String(init.body))).toEqual({ valor: "Validar login com e-mail corporativo" });
});

it("descartar nunca altera o item e some da lista de pendentes", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ items: [suggestion()] }))
    .mockImplementationOnce(() => json(suggestion({ status: "descartada", valor_resolvido: null })));
  vi.stubGlobal("fetch", request);
  render(<SuggestionsPanel kind="pbi" id="pbi-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
  expect(await screen.findByText("Descartada")).toBeInTheDocument();
  const [url] = request.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("/api/v1/pbis/pbi-1/suggestions/s-1/discard");
});

it("409 ao aceitar sugestão já resolvida de outra forma explica o conflito", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ items: [suggestion()] }))
    .mockImplementationOnce(() => json({ error: "Esta sugestão já foi descartada anteriormente; nenhuma nova ação foi aplicada." }, 409));
  vi.stubGlobal("fetch", request);
  render(<SuggestionsPanel kind="pbi" id="pbi-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
  expect(await screen.findByText(/já foi descartada anteriormente/)).toBeInTheDocument();
  expect(screen.getByText("Validar login com e-mail")).toBeInTheDocument();
});

it("sem permissão de escrita não mostra ações, apenas a nota de somente leitura", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json({ items: [suggestion()] })));
  render(<SuggestionsPanel kind="pbi" id="pbi-1" canWrite={false} readOnlyNote="Item arquivado." />);
  await screen.findByText("Validar login com e-mail");
  expect(screen.queryByRole("button", { name: "Aceitar" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Editar antes de aceitar" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull();
});

it("erro ao carregar oferece nova tentativa", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ error: "x" }, 500))
    .mockImplementationOnce(() => json({ items: [suggestion()] }));
  vi.stubGlobal("fetch", request);
  render(<SuggestionsPanel kind="feature" id="f-1" canWrite={false} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível carregar as sugestões.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Validar login com e-mail")).toBeInTheDocument();
  expect(urlOf(request.mock.calls[0])).toBe("/api/v1/features/f-1/suggestions");
});

it("justificativa preenchida é enviada ao aceitar", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ items: [suggestion()] }))
    .mockImplementationOnce(() => json(suggestion({ status: "aceita", valor_resolvido: "Validar login com e-mail" })));
  vi.stubGlobal("fetch", request);
  render(<SuggestionsPanel kind="pbi" id="pbi-1" canWrite />);

  const card = (await screen.findByText("Validar login com e-mail")).closest("section")!;
  fireEvent.change(within(card).getByLabelText(/Justificativa/), { target: { value: "Correção aprovada em revisão" } });
  fireEvent.click(within(card).getByRole("button", { name: "Aceitar" }));

  const [, init] = request.mock.calls[1] as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({ justificativa: "Correção aprovada em revisão" });
});
