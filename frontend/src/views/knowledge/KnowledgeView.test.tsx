// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  expect(screen.getByRole("link", { name: "Abrir origem" })).toHaveAttribute("href", result.source_url + "#search-origin=" + encodeURIComponent(result.text));
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

it("mostra ausência de resultados e envia os filtros simultaneamente", async () => {
  const request = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    return url.includes("/projects?") ? json(projectPage)
      : url.includes("/technologies") ? json({ items: [{ id: "tech-1", nome: "TypeScript" }] })
      : json({ items: [], total: 0 });
  });
  vi.stubGlobal("fetch", request);
  render(<KnowledgeView />);
  fireEvent.change(await screen.findByLabelText("Escopo do projeto"), { target: { value: "project-1" } });
  await screen.findByRole("option", { name: "TypeScript" });
  fireEvent.change(screen.getByLabelText("Tecnologia"), { target: { value: "tech-1" } });
  fireEvent.change(screen.getByLabelText("Nível"), { target: { value: "pbi" } });
  fireEvent.change(screen.getByLabelText("Pesquisar no acervo"), { target: { value: "jwt" } });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));
  expect(await screen.findByText("Nenhum resultado encontrado")).toBeInTheDocument();
  const url = request.mock.calls.map(call => String(call[0])).find(url => url.includes("/search?"))!;
  expect(url).toContain("tecnologia_id=tech-1");
  expect(url).toContain("nivel=pbi");
  expect(url).toContain("projeto_id=project-1");
});

it("descarta resposta antiga ao trocar projeto durante a consulta", async () => {
  let resolveOld!: (response: Response) => void;
  const request = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/projects?")) return json({ ...projectPage, items: [...projectPage.items, { ...projectPage.items[0], id: "project-2", nome: "Projeto Beta" }], total: 2 });
    if (url.includes("/technologies")) return json({ items: [] });
    if (url.includes("projeto_id=project-1")) return new Promise<Response>(resolve => { resolveOld = resolve; });
    return json({ items: [], total: 0 });
  });
  vi.stubGlobal("fetch", request);
  render(<KnowledgeView />);
  await screen.findByRole("option", { name: "Projeto Beta" });
  fireEvent.change(screen.getByLabelText("Escopo do projeto"), { target: { value: "project-1" } });
  fireEvent.change(screen.getByLabelText("Pesquisar no acervo"), { target: { value: "jwt" } });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));
  expect(screen.getByRole("button", { name: "Buscando..." })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Escopo do projeto"), { target: { value: "project-2" } });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));
  expect(await screen.findByText("Nenhum resultado encontrado")).toBeInTheDocument();
  await act(async () => { resolveOld(new Response(JSON.stringify({ items: [result], total: 1 }))); });
  expect(screen.queryByText(result.title)).not.toBeInTheDocument();
});

it("recusa resultado fora do projeto selecionado e permite repetir a busca", async () => {
  let valid = false;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("/projects?") ? json(projectPage)
    : String(input).includes("/technologies") ? json({ items: [] })
    : json({ items: [{ ...result, project_id: valid ? "project-1" : "project-2" }], total: 1 })));
  render(<KnowledgeView />);
  await screen.findByRole("option", { name: "Projeto Alfa" });
  fireEvent.change(screen.getByLabelText("Escopo do projeto"), { target: { value: "project-1" } });
  fireEvent.change(screen.getByLabelText("Pesquisar no acervo"), { target: { value: "jwt" } });
  fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText(result.title)).not.toBeInTheDocument();
  valid = true;
  fireEvent.click(screen.getByRole("button", { name: "Tentar busca novamente" }));
  expect(await screen.findByText(result.title)).toBeInTheDocument();
});

it("bloqueia consultas acima de 200 caracteres", async () => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("/projects?") ? json(projectPage) : json({ items: [] })));
  render(<KnowledgeView />);
  await screen.findByRole("option", { name: "Projeto Alfa" });
  fireEvent.change(screen.getByLabelText("Escopo do projeto"), { target: { value: "project-1" } });
  fireEvent.change(screen.getByLabelText("Pesquisar no acervo"), { target: { value: "a".repeat(201) } });
  expect(screen.getByRole("button", { name: "Pesquisar" })).toBeDisabled();
});

it("não fica carregando indefinidamente quando o catálogo de projetos trava", async () => {
  const timeout = AbortSignal.timeout(10);
  const spy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout);
  vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) reject(signal.reason);
    else signal?.addEventListener("abort", () => reject(signal.reason), {once:true});
  })));
  try {
    render(<KnowledgeView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os projetos");
    expect(screen.getByRole("button", {name:"Tentar novamente"})).toBeEnabled();
  } finally { spy.mockRestore(); }
});

it("lista todas as páginas e omite projetos arquivados", async () => {
  vi.stubGlobal("fetch",vi.fn((input:RequestInfo|URL)=>{
    const url=String(input);
    if(url.includes("/technologies"))return json({items:[]});
    const second=url.includes("offset=50");
    return json({...projectPage,total:51,offset:second?50:0,items:second?[{...projectPage.items[0],id:"p51",nome:"Último projeto"}]:[...projectPage.items,{...projectPage.items[0],id:"archived",nome:"Arquivo",status:"arquivado"}]});
  }));
  render(<KnowledgeView />);
  expect(await screen.findByRole("option",{name:"Último projeto"})).toBeInTheDocument();
  expect(screen.queryByRole("option",{name:"Arquivo"})).not.toBeInTheDocument();
});
