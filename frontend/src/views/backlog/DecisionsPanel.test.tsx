// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DecisionsPanel, validateDecision } from "./DecisionsPanel";

const node = (tipo: string, id: string, titulo: string, codigo: string | null = null) => ({ tipo, id, titulo, codigo });
const decision = (overrides: Record<string, unknown> = {}) => ({
  id: "d-1", titulo: "Usar PostgreSQL", contexto: "Persistência relacional", decisao: "Adotar PostgreSQL 16", justificativa: "Suporta pgvector",
  alternativas: null, autor: { id: "u-1", nome: "Ana PO" }, created_at: "2026-09-20T13:00:00Z",
  origem: { ...node("pbi", "pbi-1", "Registrar decisão", "PBI-01.5.1"), herdada: false }, ...overrides,
});
const list = (decisoes: unknown[]) => ({
  entidade: node("pbi", "pbi-1", "Registrar decisão", "PBI-01.5.1"),
  ancestrais: [node("projeto", "p-1", "Sinapse"), node("epico", "e-1", "Especificar"), node("feature", "f-1", "Decisões")],
  decisoes,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const urlOf = (call: unknown[]) => String(call[0]);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
const fillAll = () => {
  fill("Título", "Adotar filas");
  fill("Contexto", "Precisamos de processamento assíncrono");
  fill("^Decisão$", "Usar fila em memória");
  fill("Justificativa", "Menor custo operacional");
};

it("lista decisões do item em ordem, com autor e data, e separa as herdadas dos ascendentes", async () => {
  const request = vi.fn(() => json(list([
    decision({ id: "d-a", titulo: "Decisão do projeto", origem: { ...node("projeto", "p-1", "Sinapse"), herdada: true } }),
    decision({ id: "d-b", titulo: "Decisão da feature", origem: { ...node("feature", "f-1", "Decisões"), herdada: true } }),
    decision({ id: "d-c", titulo: "Decisão própria 1" }),
    decision({ id: "d-d", titulo: "Decisão própria 2", alternativas: "MySQL descartado" }),
  ])));
  vi.stubGlobal("fetch", request);
  render(<DecisionsPanel kind="pbi" id="pbi-1" canWrite />);

  expect(await screen.findByText("Neste item (2)")).toBeInTheDocument();
  expect(urlOf(request.mock.calls[0])).toBe("/api/v1/pbis/pbi-1/decisions");
  const own = screen.getByRole("list", { name: "Decisões deste item, da mais antiga para a mais recente" });
  expect(within(own).getAllByRole("heading", { level: 4 }).map((item) => item.textContent)).toEqual(["Decisão própria 1", "Decisão própria 2"]);
  expect(within(own).getAllByText(/Ana PO/)).toHaveLength(2);
  expect(within(own).getByText("MySQL descartado")).toBeInTheDocument();
  expect(within(own).getByText("Alternativas descartadas")).toBeInTheDocument();

  expect(screen.getByText("Herdadas dos níveis acima (2)")).toBeInTheDocument();
  const inherited = screen.getByRole("list", { name: "Decisões herdadas dos ascendentes" });
  expect(within(inherited).getByText(/Herdada · Projeto: Sinapse/)).toBeInTheDocument();
  expect(within(inherited).getByText(/Herdada · Feature: Decisões/)).toBeInTheDocument();
  expect(inherited.querySelectorAll(".decision-card--inherited")).toHaveLength(2);
  expect(own.querySelectorAll(".decision-card--inherited")).toHaveLength(0);
});

it("estado vazio orienta o registro para quem pode escrever e informa quando é somente consulta", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json(list([]))));
  render(<DecisionsPanel kind="pbi" id="pbi-1" canWrite />);
  expect(await screen.findByText(/Registre a primeira decisão/)).toBeInTheDocument();
  cleanup();

  vi.stubGlobal("fetch", vi.fn(() => json(list([]))));
  render(<DecisionsPanel kind="pbi" id="pbi-1" canWrite={false} readOnlyNote="Item arquivado: somente consulta." />);
  expect(await screen.findByText(/Ainda não há decisões neste item nem nos níveis acima/)).toBeInTheDocument();
  expect(screen.getByText("Item arquivado: somente consulta.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Registrar decisão" })).toBeNull();
});

it("quando só há decisões herdadas, informa que o item ainda não tem decisões próprias", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json(list([decision({ origem: { ...node("epico", "e-1", "Especificar"), herdada: true } })]))));
  render(<DecisionsPanel kind="pbi" id="pbi-1" canWrite={false} />);
  expect(await screen.findByText("Este item ainda não tem decisões próprias.")).toBeInTheDocument();
});

it("validação client-side aponta cada campo obrigatório e foca o primeiro inválido", async () => {
  const request = vi.fn(() => json(list([])));
  vi.stubGlobal("fetch", request);
  render(<DecisionsPanel kind="epico" id="e-1" canWrite />);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar decisão" }));
  fireEvent.submit(document.querySelector("form")!);

  expect(screen.getByText("Informe um título com ao menos 3 caracteres.")).toBeInTheDocument();
  expect(screen.getByText("Descreva o contexto da decisão.")).toBeInTheDocument();
  expect(screen.getByText("Registre o que foi decidido.")).toBeInTheDocument();
  expect(screen.getByText("Explique por que esta decisão foi tomada.")).toBeInTheDocument();
  expect(document.activeElement).toBe(screen.getByLabelText("Título"));
  expect(request).toHaveBeenCalledTimes(1);
  expect(validateDecision({ titulo: "ab", contexto: "x".repeat(5001), decisao: "d", justificativa: "j", alternativas: "" }).contexto).toMatch(/5000/);
});

it("registra a decisão com alternativas, exibe autor e data e devolve o foco ao botão", async () => {
  const created = decision({ id: "d-new", titulo: "Adotar filas", alternativas: "RabbitMQ" });
  const request = vi.fn()
    .mockImplementationOnce(() => json(list([])))
    .mockImplementationOnce(() => json(created, 201));
  vi.stubGlobal("fetch", request);
  render(<DecisionsPanel kind="pbi" id="pbi-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Registrar decisão" }));
  fillAll();
  fill("Alternativas", "RabbitMQ");
  fireEvent.click(within(document.querySelector("form")!).getByRole("button", { name: "Registrar decisão" }));

  expect(await screen.findByText("Decisão registrada com autor e data.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 4, name: "Adotar filas" })).toBeInTheDocument();
  expect(screen.getByText("RabbitMQ")).toBeInTheDocument();
  expect(document.querySelector("form")).toBeNull();
  const [url, init] = request.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("/api/v1/pbis/pbi-1/decisions");
  expect(JSON.parse(String(init.body))).toEqual({ titulo: "Adotar filas", contexto: "Precisamos de processamento assíncrono", decisao: "Usar fila em memória", justificativa: "Menor custo operacional", alternativas: "RabbitMQ" });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Registrar decisão" })));
});

it("alternativas ficam nulas quando não informadas", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json(list([])))
    .mockImplementationOnce(() => json(decision({ titulo: "Adotar filas" }), 201));
  vi.stubGlobal("fetch", request);
  render(<DecisionsPanel kind="projeto" id="p-1" canWrite />);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar decisão" }));
  fillAll();
  fireEvent.click(within(document.querySelector("form")!).getByRole("button", { name: "Registrar decisão" }));
  await screen.findByText("Decisão registrada com autor e data.");
  expect(JSON.parse(String((request.mock.calls[1][1] as RequestInit).body)).alternativas).toBeNull();
  expect(urlOf(request.mock.calls[1])).toBe("/api/v1/projects/p-1/decisions");
});

it("falha ao salvar mantém o texto digitado e permite tentar novamente; 409 explica o arquivamento", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json(list([])))
    .mockImplementationOnce(() => json({ error: "x" }, 500))
    .mockImplementationOnce(() => json({ error: "Item ou ancestral arquivado está disponível apenas para leitura." }, 409))
    .mockImplementationOnce(() => json(decision(), 201));
  vi.stubGlobal("fetch", request);
  render(<DecisionsPanel kind="pbi" id="pbi-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Registrar decisão" }));
  fillAll();
  const submit = () => fireEvent.click(within(document.querySelector("form")!).getByRole("button", { name: "Registrar decisão" }));
  submit();
  expect(await screen.findByText(/O texto foi mantido/)).toBeInTheDocument();
  expect(screen.getByLabelText("Título")).toHaveValue("Adotar filas");

  submit();
  expect(await screen.findByText(/arquivado está disponível apenas para leitura/)).toBeInTheDocument();
  submit();
  await screen.findByText("Decisão registrada com autor e data.");
  expect(request).toHaveBeenCalledTimes(4);
});

it("cancelar descarta o formulário sem chamar o servidor e não envia duas vezes ao clicar rápido", async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn()
    .mockImplementationOnce(() => json(list([])))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", request);
  render(<DecisionsPanel kind="pbi" id="pbi-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Registrar decisão" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(document.querySelector("form")).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Registrar decisão" }));
  fillAll();
  const button = within(document.querySelector("form")!).getByRole("button", { name: "Registrar decisão" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(request).toHaveBeenCalledTimes(2);
  finish(new Response(JSON.stringify(decision()), { status: 201 }));
  await screen.findByText("Decisão registrada com autor e data.");
});

it("erro ao carregar oferece nova tentativa", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ error: "x" }, 500))
    .mockImplementationOnce(() => json(list([decision()])));
  vi.stubGlobal("fetch", request);
  render(<DecisionsPanel kind="feature" id="f-1" canWrite={false} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível carregar as decisões.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Usar PostgreSQL")).toBeInTheDocument();
  expect(urlOf(request.mock.calls[0])).toBe("/api/v1/features/f-1/decisions");
});
