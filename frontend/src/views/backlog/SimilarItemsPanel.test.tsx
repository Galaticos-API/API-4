// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { reuseAfterCreate, SimilarItemsPanel, SimilarSelection } from "./SimilarItemsPanel";
import { parseSimilarItem } from "../../api/api_similar_items";

const raw = (overrides: Record<string, unknown> = {}) => ({
  tipo: "epico", id: "e-9", codigo: null, titulo: "Autenticação de usuários", status: "concluido", similaridade: 0.84,
  trecho: "Permitir login seguro", projeto: { id: "p2", nome: "Beta" }, outro_projeto: true,
  caminho: [], origem: "Beta", ja_aproveitado: false,
  ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const found = (items: unknown[] = [raw()]) => json({ items, total: items.length, degradado: false });
const props = { kind: "epico" as const, projectId: "p1", titulo: "Autenticar usuários", descricao: "Login com e-mail e senha", debounceMs: 0 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("não consulta enquanto o texto é curto demais", async () => {
  const request = vi.fn(() => found());
  vi.stubGlobal("fetch", request);
  render(<SimilarItemsPanel {...props} titulo="Login" descricao="" />);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Itens semelhantes no acervo")).toBeNull();
});

it("mostra só um resumo recolhido e revela a origem e o aviso de outro projeto ao abrir", async () => {
  const request = vi.fn(() => found());
  vi.stubGlobal("fetch", request);
  render(<SimilarItemsPanel {...props} />);

  const toggle = await screen.findByRole("button", { name: /1 item semelhante no acervo \(1 de outro projeto\)/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Autenticação de usuários")).toBeNull();
  const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/v1/projects/p1/similar-items");
  expect(JSON.parse(String(init.body))).toMatchObject({ tipo: "epico", titulo: "Autenticar usuários" });

  fireEvent.click(toggle);
  expect(screen.getByText("Autenticação de usuários")).toBeInTheDocument();
  expect(screen.getByText("Outro projeto")).toBeInTheDocument();
  expect(screen.getByText("84% semelhante")).toBeInTheDocument();
  expect(screen.getByText("Beta")).toBeInTheDocument();
});

it("não exibe nada quando não há semelhança ou quando a consulta falha", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => found([]))
    .mockImplementationOnce(() => json({ error: "falhou" }, 500));
  vi.stubGlobal("fetch", request);
  const { rerender } = render(<SimilarItemsPanel {...props} />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("complementary")).toBeNull();
  rerender(<SimilarItemsPanel {...props} titulo="Autenticar usuários finais" />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("no item já salvo, aproveitar chama a API, avisa o chamador e marca como aproveitado", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => found())
    .mockImplementationOnce(() => json({
      relacao: { id: "r1", tipo_relacao: "reaproveitado_de", destino_tipo: "epico", destino_id: "e-1", origem_tipo: "epico", origem_id: "e-9", origem_projeto_id: "p2", campos: ["titulo"] },
      sugestoes: [],
    }, 201));
  vi.stubGlobal("fetch", request);
  const onReused = vi.fn();
  render(<SimilarItemsPanel {...props} excludeId="e-1" reuseTargetId="e-1" onReused={onReused} />);

  fireEvent.click(await screen.findByRole("button", { name: /item semelhante no acervo/ }));
  fireEvent.click(screen.getByRole("button", { name: "Aproveitar" }));

  await waitFor(() => expect(onReused).toHaveBeenCalledTimes(1));
  const [url] = request.mock.calls[1] as unknown as [string];
  expect(url).toBe("/api/v1/epics/e-1/similar-items/e-9/reuse");
  expect(JSON.parse(String((request.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ excluir_id: "e-1" });
  expect(await screen.findByText("Já aproveitado")).toBeInTheDocument();
});

it("mostra o erro do aproveitamento sem esconder a lista", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => found())
    .mockImplementationOnce(() => json({ error: "O item de origem está arquivado e não pode ser aproveitado." }, 409));
  vi.stubGlobal("fetch", request);
  render(<SimilarItemsPanel {...props} reuseTargetId="e-1" />);
  fireEvent.click(await screen.findByRole("button", { name: /item semelhante no acervo/ }));
  fireEvent.click(screen.getByRole("button", { name: "Aproveitar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("arquivado");
  expect(screen.getByText("Autenticação de usuários")).toBeInTheDocument();
});

it("na criação, a escolha é só guardada e pode ser desfeita", async () => {
  vi.stubGlobal("fetch", vi.fn(() => found()));
  const onSelect = vi.fn();
  render(<SimilarItemsPanel {...props} onSelect={onSelect} />);
  fireEvent.click(await screen.findByRole("button", { name: /item semelhante no acervo/ }));
  fireEvent.click(screen.getByRole("button", { name: "Aproveitar ao criar" }));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "e-9", origem: "Beta" }));
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
});

it("registra a origem depois de criar e ignora falha sem travar a navegação", async () => {
  const request = vi.fn(() => json({ relacao: { id: "r", tipo_relacao: "reaproveitado_de", destino_tipo: "epico", destino_id: "novo", origem_tipo: "epico", origem_id: "e-9", origem_projeto_id: "p2", campos: [] }, sugestoes: [] }, 201));
  vi.stubGlobal("fetch", request);
  await reuseAfterCreate("epico", "novo", parseSimilarItem(raw()));
  expect((request.mock.calls[0] as unknown as [string])[0]).toBe("/api/v1/epics/novo/similar-items/e-9/reuse");

  const failing = vi.fn(() => json({ error: "x" }, 500));
  vi.stubGlobal("fetch", failing);
  await expect(reuseAfterCreate("epico", "novo", parseSimilarItem(raw()))).resolves.toBeUndefined();
  await reuseAfterCreate("epico", "novo", null);
  expect(failing).toHaveBeenCalledTimes(1);
});

it("a escolha feita fica visível com a origem mesmo fora da lista", () => {
  const onClear = vi.fn();
  render(<SimilarSelection item={parseSimilarItem(raw())} onClear={onClear} />);
  expect(screen.getByRole("status")).toHaveTextContent("Será aproveitado ao criar");
  expect(screen.getByRole("status")).toHaveTextContent("origem: Beta");
  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  expect(onClear).toHaveBeenCalled();
});

it("ocultar remove o painel", async () => {
  vi.stubGlobal("fetch", vi.fn(() => found()));
  render(<SimilarItemsPanel {...props} />);
  await screen.findByRole("button", { name: /item semelhante no acervo/ });
  fireEvent.click(screen.getByRole("button", { name: "Ocultar itens semelhantes" }));
  expect(screen.queryByLabelText("Itens semelhantes no acervo")).toBeNull();
});
