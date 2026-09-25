// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChatView } from "./ChatView";

const PROJECT = { id: "p-1", nome: "Sinapse", cliente: "C", descricao: "", status: "ativo" };
const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1", titulo: "Decisões do login", projeto_id: "p-1", projeto_nome: "Sinapse", updated_at: new Date().toISOString(), ...overrides,
});
const message = (overrides: Record<string, unknown> = {}) => ({
  id: "m-1", conversa_id: "c-1", remetente: "assistant", conteudo: "Resposta **importante**", fontes_json: [], created_at: "2026-09-25T10:00:00Z", ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

interface Routes {
  conversations?: unknown[] | "error";
  messages?: Record<string, unknown[] | "error">;
  query?: (body: Record<string, unknown>) => Promise<Response>;
}

function api(routes: Routes = {}) {
  return vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path.startsWith("/api/v1/projects")) return json({ items: [PROJECT], total: 1, limit: 50, offset: 0 });
    if (path === "/api/v1/chat/conversations") {
      return routes.conversations === "error" ? json({ error: "x" }, 500) : json({ items: routes.conversations ?? [], total: 0 });
    }
    const messages = path.match(/^\/api\/v1\/chat\/conversations\/([^/]+)\/messages$/);
    if (messages) {
      const items = routes.messages?.[messages[1]] ?? [];
      return items === "error" ? json({ error: "x" }, 500) : json({ items, total: items.length });
    }
    if (path === "/api/v1/chat/query") return (routes.query ?? (() => json({ conversa_id: "c-9", resposta: "Ok", fontes: [], origem: "assistente" })))(JSON.parse(String(init?.body)));
    return json({});
  });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const composer = () => screen.getByLabelText("Sua pergunta") as HTMLTextAreaElement;
const queryCalls = (request: ReturnType<typeof api>) =>
  request.mock.calls.filter((call) => String(call[0]) === "/api/v1/chat/query").map((call) => JSON.parse(String((call[1] as RequestInit).body)));

it("abre a conversa mais recente, renderiza Markdown, fontes e trava o escopo", async () => {
  vi.stubGlobal("fetch", api({
    conversations: [conversation()],
    messages: { "c-1": [message({ remetente: "user", id: "m-0", conteudo: "Qual a decisão?" }), message({ fontes_json: [{ id: "s1", titulo: "ADR-01", tipo: "decisao" }] })] },
  }));
  render(<ChatView />);

  expect(await screen.findByText("importante")).toBeInTheDocument();
  expect(screen.getByText("importante").tagName).toBe("STRONG");
  expect(screen.getByRole("heading", { level: 2, name: "Decisões do login" })).toBeInTheDocument();
  const log = screen.getByRole("log", { name: "Mensagens da conversa" });
  expect(within(log).getAllByRole("article")).toHaveLength(2);
  expect(screen.getByText("Fontes citadas (1)")).toBeInTheDocument();
  expect(screen.getByText("ADR-01")).toBeInTheDocument();
  expect(screen.getByLabelText("Escopo da consulta")).toBeDisabled();
  expect(screen.getByRole("button", { name: /Decisões do login/ })).toHaveAttribute("aria-current", "true");
});

it("sem conversas mostra orientação, sugestões preenchem o campo e o escopo é escolhido", async () => {
  vi.stubGlobal("fetch", api());
  render(<ChatView />);

  expect(await screen.findByText("Nenhuma conversa ainda. Faça sua primeira pergunta.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Como posso ajudar?" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Quais decisões já foram tomadas/ }));
  expect(composer().value).toMatch(/Quais decisões já foram tomadas/);
  expect(await screen.findByRole("option", { name: "Sinapse" })).toBeInTheDocument();
  expect(screen.getByLabelText("Escopo da consulta")).toBeEnabled();
});

it("Enter envia com o projeto do escopo, cria a conversa lazy e não recarrega as mensagens", async () => {
  const request = api({
    query: () => json({ conversa_id: "c-9", resposta: "Uma **resposta**", fontes: [{ id: "s1", titulo: "PBI-1", tipo: "pbi" }], origem: "assistente" }),
  });
  vi.stubGlobal("fetch", request);
  render(<ChatView />);
  await screen.findByRole("option", { name: "Sinapse" });

  fireEvent.change(screen.getByLabelText("Escopo da consulta"), { target: { value: "p-1" } });
  fireEvent.change(composer(), { target: { value: "Como funciona o login?" } });
  fireEvent.keyDown(composer(), { key: "Enter" });

  expect(await screen.findByText("resposta")).toBeInTheDocument();
  expect(queryCalls(request)).toEqual([{ pergunta: "Como funciona o login?", projeto_id: "p-1" }]);
  expect(screen.getByText("Como funciona o login?")).toBeInTheDocument();
  expect(composer().value).toBe("");
  expect(screen.getByText("Fontes citadas (1)")).toBeInTheDocument();
  expect(request.mock.calls.some((call) => /c-9\/messages/.test(String(call[0])))).toBe(false);
  expect(screen.getByLabelText("Escopo da consulta")).toBeDisabled();
});

it("Shift+Enter não envia e o limite de caracteres bloqueia o envio", async () => {
  const request = api();
  vi.stubGlobal("fetch", request);
  render(<ChatView />);
  await screen.findByText(/Nenhuma conversa ainda/);

  fireEvent.change(composer(), { target: { value: "linha 1" } });
  fireEvent.keyDown(composer(), { key: "Enter", shiftKey: true });
  expect(queryCalls(request)).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();

  fireEvent.change(composer(), { target: { value: "x".repeat(2001) } });
  expect(screen.getByText("Reduza 1 caractere(s).")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  fireEvent.keyDown(composer(), { key: "Enter" });
  expect(queryCalls(request)).toHaveLength(0);
});

it("em conversa existente envia conversa_id sem trocar de projeto", async () => {
  const request = api({ conversations: [conversation()], messages: { "c-1": [message()] } });
  vi.stubGlobal("fetch", request);
  render(<ChatView />);
  await screen.findByText("importante");

  fireEvent.change(composer(), { target: { value: "Mais detalhes?" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await screen.findByText("Ok");
  expect(queryCalls(request)).toEqual([{ pergunta: "Mais detalhes?", conversa_id: "c-1" }]);
});

it("falha ao enviar marca a mensagem, explica e permite tentar novamente sem duplicá-la", async () => {
  let attempts = 0;
  const request = api({
    query: () => (++attempts === 1 ? json({ error: "x" }, 500) : json({ conversa_id: "c-9", resposta: "Agora deu", fontes: [], origem: "assistente" })),
  });
  vi.stubGlobal("fetch", request);
  render(<ChatView />);
  await screen.findByText(/Nenhuma conversa ainda/);

  fireEvent.change(composer(), { target: { value: "Pergunta importante" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

  expect(await screen.findByText(/Não foi possível falar com o assistente agora/)).toBeInTheDocument();
  expect(screen.getByText("Não enviada")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

  expect(await screen.findByText("Agora deu")).toBeInTheDocument();
  expect(screen.getAllByText("Pergunta importante")).toHaveLength(1);
  expect(screen.queryByText("Não enviada")).toBeNull();
  expect(screen.queryByText(/Não foi possível falar com o assistente agora/)).toBeNull();
});

it("erro 400 do servidor exibe a mensagem específica", async () => {
  vi.stubGlobal("fetch", api({ query: () => json({ error: "A pergunta pode ter no máximo 2000 caracteres." }, 400) }));
  render(<ChatView />);
  await screen.findByText(/Nenhuma conversa ainda/);
  fireEvent.change(composer(), { target: { value: "oi" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(await screen.findByText("A pergunta pode ter no máximo 2000 caracteres.")).toBeInTheDocument();
});

it("marca respostas vindas de busca textual e mantém o texto padrão quando não há resultado", async () => {
  const answers = [
    { conversa_id: "c-9", resposta: "O assistente está indisponível. Estes trechos... - trecho A", fontes: [{ id: "k", titulo: "Trecho de documento", tipo: "documento" }], origem: "busca_textual" },
    { conversa_id: "c-9", resposta: "Informação não encontrada no acervo do projeto.", fontes: [], origem: "sem_resultado" },
  ];
  vi.stubGlobal("fetch", api({ query: () => json(answers.shift()) }));
  render(<ChatView />);
  await screen.findByText(/Nenhuma conversa ainda/);

  fireEvent.change(composer(), { target: { value: "primeira pergunta" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(await screen.findByText("Busca textual")).toBeInTheDocument();
  expect(screen.getByText("Fontes citadas (1)")).toBeInTheDocument();

  fireEvent.change(composer(), { target: { value: "segunda pergunta" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(await screen.findByText("Informação não encontrada no acervo do projeto.")).toBeInTheDocument();
  expect(screen.getAllByText("Busca textual")).toHaveLength(1);
});

it("trata erro ao carregar conversas e mensagens com nova tentativa", async () => {
  let conversationsCalls = 0;
  const request = vi.fn((url: RequestInfo | URL) => {
    const path = String(url);
    if (path.startsWith("/api/v1/projects")) return json({ items: [], total: 0, limit: 50, offset: 0 });
    if (path === "/api/v1/chat/conversations") return ++conversationsCalls === 1 ? json({ error: "x" }, 500) : json({ items: [conversation()], total: 1 });
    return json({ error: "x" }, 500);
  });
  vi.stubGlobal("fetch", request);
  render(<ChatView />);

  expect(await screen.findByText(/Não foi possível carregar as conversas/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText(/Não foi possível carregar as mensagens desta conversa/)).toBeInTheDocument();
});

it("alternar de conversa carrega as mensagens da escolhida e ignora respostas atrasadas", async () => {
  let releaseFirst!: (response: Response) => void;
  const request = vi.fn((url: RequestInfo | URL) => {
    const path = String(url);
    if (path.startsWith("/api/v1/projects")) return json({ items: [PROJECT], total: 1, limit: 50, offset: 0 });
    if (path === "/api/v1/chat/conversations") return json({ items: [conversation({ id: "c-1", titulo: "Primeira" }), conversation({ id: "c-2", titulo: "Segunda", projeto_id: null, projeto_nome: null })], total: 2 });
    if (path.endsWith("/c-1/messages")) return new Promise<Response>((resolve) => { releaseFirst = resolve; });
    if (path.endsWith("/c-2/messages")) return json({ items: [message({ id: "m-2", conteudo: "Conteúdo da segunda" })], total: 1 });
    return json({});
  });
  vi.stubGlobal("fetch", request);
  render(<ChatView />);

  const second = await screen.findByRole("button", { name: /Segunda/ });
  fireEvent.click(second);
  expect(await screen.findByText("Conteúdo da segunda")).toBeInTheDocument();
  releaseFirst(new Response(JSON.stringify({ items: [message({ id: "m-1", conteudo: "Conteúdo atrasado" })], total: 1 })));
  await waitFor(() => expect(screen.queryByText("Conteúdo atrasado")).toBeNull());
  expect(screen.getByRole("heading", { level: 2, name: "Segunda" })).toBeInTheDocument();
});

it("Nova conversa limpa a tela e libera o escopo", async () => {
  vi.stubGlobal("fetch", api({ conversations: [conversation()], messages: { "c-1": [message()] } }));
  render(<ChatView />);
  await screen.findByText("importante");

  fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
  expect(screen.queryByText("importante")).toBeNull();
  expect(screen.getByRole("heading", { name: "Como posso ajudar?" })).toBeInTheDocument();
  expect(screen.getByLabelText("Escopo da consulta")).toBeEnabled();
  expect(document.activeElement).toBe(composer());
});

it("copia a resposta do assistente", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  vi.stubGlobal("fetch", api({ conversations: [conversation()], messages: { "c-1": [message()] } }));
  render(<ChatView />);
  await screen.findByText("importante");
  fireEvent.click(screen.getByRole("button", { name: "Copiar resposta" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("Resposta **importante**"));
  expect(await screen.findByRole("button", { name: "Copiado" })).toBeInTheDocument();
});
