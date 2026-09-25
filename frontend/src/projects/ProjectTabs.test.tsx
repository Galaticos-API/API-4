// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Projects } from "./Projects";

const project = { id: "p-1", nome: "Sinapse", cliente: "Cliente", descricao: "Contexto", status: "ativo" };
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

function route(archived = false) {
  return vi.fn((url: RequestInfo | URL) => {
    const path = String(url);
    if (path === "/api/v1/projects/p-1") return json({ ...project, status: archived ? "arquivado" : "ativo" });
    if (path === "/api/v1/projects/p-1/documents") return json({ items: [], next_cursor: null, limites: { max_bytes: 1048576, extensoes_permitidas: [".pdf", ".md"] } });
    if (path === "/api/v1/projects/p-1/repo-analyses") return json([]);
    return json([]);
  });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("exibe as três abas do projeto com a de backlog selecionada", async () => {
  vi.stubGlobal("fetch", route());
  render(<Projects pathname="/projects/p-1" canCreate />);

  const tabs = await screen.findAllByRole("tab");
  expect(tabs.map(tab => tab.textContent)).toEqual(["Backlog e épicos", "Documentos", "Análise de repositório"]);
  expect(screen.getByRole("tab", { name: "Backlog e épicos" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toBeInTheDocument();
});

it("abre a aba de documentos do projeto e navega por teclado", async () => {
  const request = route();
  vi.stubGlobal("fetch", request);
  render(<Projects pathname="/projects/p-1" canCreate />);

  fireEvent.click(await screen.findByRole("tab", { name: "Documentos" }));
  expect(await screen.findByText("Nenhum documento neste projeto")).toBeInTheDocument();
  expect(request.mock.calls.map(call => String(call[0]))).toContain("/api/v1/projects/p-1/documents");

  fireEvent.keyDown(screen.getByRole("tab", { name: "Documentos" }), { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "Análise de repositório" })).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(screen.getByRole("tab", { name: "Análise de repositório" }), { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "Backlog e épicos" })).toHaveAttribute("aria-selected", "true");
});

it("projeto arquivado mantém os documentos somente para consulta", async () => {
  vi.stubGlobal("fetch", route(true));
  render(<Projects pathname="/projects/p-1" canCreate />);

  fireEvent.click(await screen.findByRole("tab", { name: "Documentos" }));
  expect(await screen.findByText(/Projeto arquivado: os documentos ficam disponíveis somente para consulta/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Selecionar documento")).toBeNull();
});
