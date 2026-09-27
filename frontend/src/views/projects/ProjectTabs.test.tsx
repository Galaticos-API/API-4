// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectsView } from "./ProjectsView";

const project = { id: "p-1", nome: "Sinapse", cliente: "Cliente", descricao: "Contexto", status: "ativo" };
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const limites = { max_bytes: 1048576, extensoes_permitidas: [".pdf", ".md"] };

function api(archived = false) {
  return vi.fn((url: RequestInfo | URL) => {
    const path = String(url);
    if (path === "/api/v1/projects/p-1") return json({ ...project, status: archived ? "arquivado" : "ativo" });
    if (path.startsWith("/api/v1/projects/p-1/documents")) return json({ items: [], next_cursor: null, limites });
    if (path === "/api/v1/projects/p-1/repo-analyses") return json([]);
    if (path.includes("/backlog-tree")) return json({ project_id: "p-1", epicos: [], filtros: {} });
    return json([]);
  });
}

beforeEach(() => window.history.replaceState(null, "", "/projects/p-1"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

const renderDetail = (props: { canCreate?: boolean; pathname?: string } = {}) =>
  render(<ProjectsView pathname={props.pathname ?? "/projects/p-1"} canCreate={props.canCreate ?? true} />);

it("expõe as abas com papéis acessíveis e a visão geral selecionada", async () => {
  vi.stubGlobal("fetch", api());
  renderDetail();

  const tabs = await screen.findAllByRole("tab");
  expect(tabs.map((tab) => tab.textContent)).toEqual(["Visão geral", "Backlog", "Decisões", "Documentos", "Análise de repositório"]);
  expect(screen.getByRole("tab", { name: "Visão geral" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Backlog" })).toHaveAttribute("tabindex", "-1");
  const panel = screen.getByRole("tabpanel");
  expect(panel).toHaveAttribute("aria-labelledby", "project-tab-overview");
  expect(screen.getByRole("tablist", { name: "Contexto do projeto" })).toBeInTheDocument();
});

it("abre Documentos por clique, registra o hash e carrega somente o projeto aberto", async () => {
  const request = api();
  vi.stubGlobal("fetch", request);
  renderDetail();

  fireEvent.click(await screen.findByRole("tab", { name: "Documentos" }));
  expect(await screen.findByText("Nenhum documento neste projeto")).toBeInTheDocument();
  expect(window.location.hash).toBe("#documents");
  expect(screen.getByRole("tab", { name: "Documentos" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "project-tab-documents");
  expect(request.mock.calls.map((call) => String(call[0]))).toContain("/api/v1/projects/p-1/documents");
});

it("navega por teclado com setas, Home e End, movendo o foco", async () => {
  vi.stubGlobal("fetch", api());
  renderDetail();

  const overview = await screen.findByRole("tab", { name: "Visão geral" });
  overview.focus();
  fireEvent.keyDown(overview, { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "Backlog" })).toHaveAttribute("aria-selected", "true");
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Backlog" }));
  fireEvent.keyDown(document.activeElement as Element, { key: "End" });
  expect(screen.getByRole("tab", { name: "Análise de repositório" })).toHaveAttribute("aria-selected", "true");
  expect(window.location.hash).toBe("#repo-analyzer");
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "Visão geral" })).toHaveAttribute("aria-selected", "true");
  expect(window.location.hash).toBe("");
  fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
  expect(screen.getByRole("tab", { name: "Análise de repositório" })).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
  expect(screen.getByRole("tab", { name: "Visão geral" })).toHaveAttribute("aria-selected", "true");
});

it("restaura a aba pelo hash e pela rota /documents", async () => {
  window.history.replaceState(null, "", "/projects/p-1#repo-analyzer");
  vi.stubGlobal("fetch", api());
  renderDetail();
  expect(await screen.findByRole("tab", { name: "Análise de repositório" })).toHaveAttribute("aria-selected", "true");
  expect(await screen.findByText("Nenhuma análise realizada neste projeto.")).toBeInTheDocument();
  cleanup();

  window.history.replaceState(null, "", "/projects/p-1/documents");
  renderDetail({ pathname: "/projects/p-1/documents" });
  expect(await screen.findByRole("tab", { name: "Documentos" })).toHaveAttribute("aria-selected", "true");
});

it("responde a mudanças de hash sem recarregar", async () => {
  vi.stubGlobal("fetch", api());
  renderDetail();
  await screen.findByRole("tab", { name: "Visão geral" });
  window.history.replaceState(null, "", "/projects/p-1#documents");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  expect(await screen.findByRole("tab", { name: "Documentos" })).toHaveAttribute("aria-selected", "true");
});

it("projeto arquivado mantém documentos somente para consulta e bloqueia novas análises", async () => {
  vi.stubGlobal("fetch", api(true));
  renderDetail();

  fireEvent.click(await screen.findByRole("tab", { name: "Documentos" }));
  expect(await screen.findByText(/Projeto arquivado: os documentos ficam disponíveis somente para consulta/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Selecionar documento")).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "Análise de repositório" }));
  expect(await screen.findByText(/não pode iniciar novas/)).toBeInTheDocument();
});

it("perfil de leitura vê Documentos sem ações de escrita", async () => {
  vi.stubGlobal("fetch", api());
  renderDetail({ canCreate: false });
  fireEvent.click(await screen.findByRole("tab", { name: "Documentos" }));
  expect(await screen.findByText(/pode consultar documentos, mas não pode enviar ou remover/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Selecionar documento")).toBeNull();
});
