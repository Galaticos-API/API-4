// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BacklogTreeView } from "./BacklogTreeView";
import type { ProjectBacklogTree } from "../../api/api_backlog_tree";

const tree: ProjectBacklogTree = {
  project: { id: "project-1", nome: "Sinapse", status: "ativo" },
  technologies: [{ id: "react", nome: "React" }, { id: "node", nome: "Node.js" }],
  epics: [{
    id: "epic-1", titulo: "Organizar requisitos", status: "ativo", tecnologias: [],
    features: [{
      id: "feature-1", titulo: "Navegação do backlog", status: "concluido", tecnologias: [{ id: "react", nome: "React" }],
      pbis: [{ id: "pbi-1", codigo: "PBI-01.4.1", titulo: "Expandir árvore", status: "rascunho", tecnologias: [{ id: "react", nome: "React" }] }],
    }],
  }],
};

const hit = (overrides: Record<string, unknown> = {}) => ({
  tipo: "pbi", id: "pbi-1", titulo: "Expandir árvore", codigo: "PBI-01.4.1", status: "rascunho", campo: "titulo",
  trecho: { texto: "Expandir árvore", destaques: [[0, 8]] },
  caminho: [
    { tipo: "epico", id: "epic-1", titulo: "Organizar requisitos", codigo: null },
    { tipo: "feature", id: "feature-1", titulo: "Navegação do backlog", codigo: null },
    { tipo: "pbi", id: "pbi-1", titulo: "Expandir árvore", codigo: "PBI-01.4.1" },
  ],
  tecnologias: [{ id: "react", nome: "React" }],
  ...overrides,
});

const search = (items: unknown[], total = items.length, termo = "expandir") => ({ projeto_id: "project-1", termo, total, limite: 50, items });
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

function stub(handler: (url: URL) => Promise<Response>) {
  const request = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/v1/projects/project-1/backlog-tree") return json(tree);
    return handler(url);
  });
  vi.stubGlobal("fetch", request);
  return request;
}

const searchCalls = (request: ReturnType<typeof stub>) =>
  request.mock.calls.map((call) => new URL(String(call[0]), "http://localhost")).filter((url) => url.pathname.endsWith("/backlog-search"));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

const type = async (value: string) => {
  fireEvent.change(await screen.findByLabelText(/Buscar no backlog/), { target: { value } });
};

it("mostra o campo de busca junto aos filtros e orienta o mínimo de caracteres sem chamar a API", async () => {
  const request = stub(() => json(search([])));
  render(<BacklogTreeView projectId="project-1" canCreate />);

  await type("a");
  expect(screen.getByText("Digite ao menos 2 caracteres.")).toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(searchCalls(request)).toHaveLength(0);
  expect(screen.getByRole("list", { name: "Hierarquia do backlog" })).toBeInTheDocument();
  expect(screen.getByText("1 filtro ativo")).toBeInTheDocument();
});

it("título encontrado retorna o item correto com trecho destacado, tipo e caminho navegável", async () => {
  const request = stub(() => json(search([hit()])));
  render(<BacklogTreeView projectId="project-1" canCreate />);

  await type("expandir");
  const results = await screen.findByRole("region", { name: "Resultados da busca no backlog" });
  expect(searchCalls(request)[0].searchParams.get("q")).toBe("expandir");
  expect(within(results).getByText("PBI")).toBeInTheDocument();
  expect(within(results).getByText("PBI-01.4.1")).toBeInTheDocument();
  expect(within(results).getByText("Expandir", { selector: "mark" })).toBeInTheDocument();
  expect(within(results).getByRole("status")).toHaveTextContent("1 resultado para “expandir”.");
  expect(screen.queryByRole("list", { name: "Hierarquia do backlog" })).toBeNull();

  const path = within(results).getByRole("navigation", { name: "Caminho de Expandir árvore" });
  const items = within(path).getAllByRole("listitem").map((item) => item.textContent);
  expect(items).toEqual(["Sinapse", "Organizar requisitos", "Navegação do backlog", "PBI-01.4.1 · Expandir árvore"]);
  expect(within(path).getByText(/Expandir árvore/)).toHaveAttribute("aria-current", "page");

  fireEvent.click(within(path).getByRole("button", { name: "Navegação do backlog" }));
  expect(window.location.pathname).toBe("/projects/project-1/epics/epic-1/features/feature-1");
  fireEvent.click(within(results).getByRole("button", { name: "Expandir árvore" }));
  expect(window.location.pathname).toBe("/projects/project-1/epics/epic-1/features/feature-1/pbis/pbi-1");
  fireEvent.click(within(path).getByRole("button", { name: "Organizar requisitos" }));
  expect(window.location.pathname).toBe("/projects/project-1/epics/epic-1");
});

it("descrição encontrada mostra o trecho da descrição e indica o campo", async () => {
  stub(() => json(search([hit({ campo: "descricao", trecho: { texto: "…Eu quero recuperar a senha por e-mail…", destaques: [[10, 19]] } })], 1, "recuperar")));
  render(<BacklogTreeView projectId="project-1" canCreate />);

  await type("recuperar");
  const snippet = await screen.findByText("recuperar", { selector: "mark" });
  expect(snippet.closest("p")).toHaveAttribute("data-field", "descricao");
  expect(screen.getByText("Trecho da descrição:")).toBeInTheDocument();
});

it("combina texto, status e tecnologia e conta os filtros ativos", async () => {
  const request = stub(() => json(search([hit()])));
  render(<BacklogTreeView projectId="project-1" canCreate />);

  await type("expandir");
  await screen.findByRole("region", { name: "Resultados da busca no backlog" });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "rascunho" } });
  fireEvent.change(screen.getByLabelText("Tecnologia"), { target: { value: "react" } });

  await waitFor(() => {
    const calls = searchCalls(request);
    const last = calls[calls.length - 1];
    expect(last.searchParams.get("q")).toBe("expandir");
    expect(last.searchParams.get("status")).toBe("rascunho");
    expect(last.searchParams.get("tecnologia")).toBe("react");
  });
  expect(screen.getByText("3 filtros ativos")).toBeInTheDocument();
});

it("a busca é sempre enviada para o projeto aberto", async () => {
  const request = stub(() => json(search([])));
  render(<BacklogTreeView projectId="project-1" canCreate />);
  await type("login");
  await waitFor(() => expect(searchCalls(request)).toHaveLength(1));
  expect(searchCalls(request)[0].pathname).toBe("/api/v1/projects/project-1/backlog-search");
});

it("estado vazio permite limpar os critérios e voltar à árvore", async () => {
  stub(() => json(search([], 0, "inexistente")));
  render(<BacklogTreeView projectId="project-1" canCreate />);

  fireEvent.change(await screen.findByLabelText("Status"), { target: { value: "rascunho" } });
  await type("inexistente");
  expect(await screen.findByText("Nenhum item encontrado")).toBeInTheDocument();
  expect(screen.getByText(/com os filtros atuais/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Limpar só a busca" }));
  expect(await screen.findByRole("list", { name: "Hierarquia do backlog" })).toBeInTheDocument();
  expect((screen.getByLabelText(/Buscar no backlog/) as HTMLInputElement).value).toBe("");
  expect(screen.getByLabelText("Status")).toHaveValue("rascunho");

  await type("inexistente");
  fireEvent.click(await screen.findByRole("button", { name: "Limpar critérios" }));
  expect(await screen.findByRole("list", { name: "Hierarquia do backlog" })).toBeInTheDocument();
  expect(screen.getByLabelText("Status")).toHaveValue("");
  expect(screen.getByText("0 filtros ativos")).toBeInTheDocument();
});

it("texto e filtros persistem na sessão ao sair e voltar", async () => {
  stub(() => json(search([hit()])));
  const first = render(<BacklogTreeView projectId="project-1" canCreate />);
  await type("expandir");
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "rascunho" } });
  await screen.findByRole("region", { name: "Resultados da busca no backlog" });
  fireEvent.click(screen.getByRole("button", { name: "Expandir árvore" }));
  first.unmount();

  expect(JSON.parse(window.sessionStorage.getItem("sinapse.backlog.filters.project-1")!)).toEqual({ status: "rascunho", technologyId: "", query: "expandir" });
  render(<BacklogTreeView projectId="project-1" canCreate />);
  expect(await screen.findByRole("region", { name: "Resultados da busca no backlog" })).toBeInTheDocument();
  expect((screen.getByLabelText(/Buscar no backlog/) as HTMLInputElement).value).toBe("expandir");
  expect(screen.getByLabelText("Status")).toHaveValue("rascunho");
});

it("filtros salvos por versões anteriores (sem texto) continuam válidos", async () => {
  window.sessionStorage.setItem("sinapse.backlog.filters.project-1", JSON.stringify({ status: "concluido", technologyId: "" }));
  stub(() => json(search([])));
  render(<BacklogTreeView projectId="project-1" canCreate />);
  expect(await screen.findByLabelText("Status")).toHaveValue("concluido");
  expect((screen.getByLabelText(/Buscar no backlog/) as HTMLInputElement).value).toBe("");
});

it("erro da busca oferece nova tentativa e mensagens do servidor são legíveis", async () => {
  let calls = 0;
  stub(() => (++calls === 1 ? json({ error: "x" }, 500) : json(search([hit()]))));
  render(<BacklogTreeView projectId="project-1" canCreate />);

  await type("expandir");
  expect((await screen.findByRole("alert")).textContent).toBe("Não foi possível buscar no backlog. Tente novamente.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByRole("region", { name: "Resultados da busca no backlog" })).toBeInTheDocument();
});

it("resultados acima do limite avisam que a lista foi truncada", async () => {
  stub(() => json(search([hit()], 80)));
  render(<BacklogTreeView projectId="project-1" canCreate />);
  await type("expandir");
  expect(await screen.findByText("Mostrando 1 de 80 resultados para “expandir”.")).toBeInTheDocument();
  expect(screen.getByText(/Há mais resultados do que o limite exibido/)).toBeInTheDocument();
});

it("digitar rapidamente dispara uma única busca depois do atraso", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const request = stub(() => json(search([hit()])));
  render(<BacklogTreeView projectId="project-1" canCreate />);
  const input = await screen.findByLabelText(/Buscar no backlog/);

  for (const value of ["ex", "exp", "expa", "expan"]) fireEvent.change(input, { target: { value } });
  expect(searchCalls(request)).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  await waitFor(() => expect(searchCalls(request)).toHaveLength(1));
  expect(searchCalls(request)[0].searchParams.get("q")).toBe("expan");
});
