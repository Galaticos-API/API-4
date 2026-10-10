// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KnowledgeView } from "./KnowledgeView";

const json = (value: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status }));
const projectPage = { items: [{ id: "project-1", nome: "Projeto Alfa", cliente: "Cliente", descricao: "", status: "ativo" }], total: 1, limit: 50, offset: 0 };
const result = {
  id: "chunk-1", project_id: "project-1", project_name: "Projeto Alfa", entity_type: "pbi", entity_id: "pbi-1",
  title: "Implementar autenticação", text: "Usar JWT para proteger as rotas.", metadata: { tecnologias_ids: ["tech-1"] },
  source_url: "/projects/project-1/epics/epic-1/features/feature-1/pbis/pbi-1", relevance_score: 0.03,
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("renderiza o contrato atual da busca e oferece navegação à origem", async () => {
  const request = vi.fn((input: RequestInfo | URL) => String(input).includes("/projects?")
    ? json(projectPage)
    : json({ items: [result], total: 1 }));
  vi.stubGlobal("fetch", request);
  render(<KnowledgeView />);

  fireEvent.change(await screen.findByLabelText("Escopo do projeto"), { target: { value: "project-1" } });
  fireEvent.change(screen.getByLabelText("Pesquisar no acervo"), { target: { value: "autenticação JWT" } });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));

  expect(await screen.findByText("Implementar autenticação")).toBeInTheDocument();
  expect(screen.getByText("Usar JWT para proteger as rotas.")).toBeInTheDocument();
  expect(screen.getByText("Projeto: Projeto Alfa")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Abrir origem" })).toHaveAttribute("href", result.source_url);
  expect(request.mock.calls.map(call => String(call[0]))).toContain("/api/v1/search?q=autentica%C3%A7%C3%A3o+JWT&projeto_id=project-1");
});

it("mantém escopo explícito, bloqueia consultas curtas e não conserva resultados antigos ao editar", async () => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("/projects?")
    ? json(projectPage)
    : json({ items: [result], total: 1 })));
  render(<KnowledgeView />);
  await screen.findByLabelText("Escopo do projeto");
  expect(screen.getByRole("button", { name: "Pesquisar" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Escopo do projeto"), { target: { value: "project-1" } });
  fireEvent.change(screen.getByLabelText("Pesquisar no acervo"), { target: { value: "jwt" } });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));
  expect(await screen.findByText("Implementar autenticação")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Pesquisar no acervo"), { target: { value: "jwt novo" } });
  expect(screen.queryByText("Implementar autenticação")).not.toBeInTheDocument();
});

it("mostra a mensagem de erro retornada pela API", async () => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("/projects?")
    ? json(projectPage)
    : json({ error: "Serviço de embeddings indisponível.", code: "EMBEDDING_SERVICE_UNAVAILABLE" }, 503)));
  render(<KnowledgeView />);
  fireEvent.change(await screen.findByLabelText("Escopo do projeto"), { target: { value: "project-1" } });
  fireEvent.change(screen.getByLabelText("Pesquisar no acervo"), { target: { value: "autenticação" } });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Serviço de embeddings indisponível.");
});
