// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RepoAnalyzerTab } from "./RepoAnalyzerTab";

const analysis = (overrides: Record<string, unknown> = {}) => ({
  id: "a-1", projeto_id: "p-1", repositorio_url: "https://github.com/acme/api", run_id: "r-1", status: "em_execucao",
  etapa: "scan", etapa_label: "Varredura", progresso: 30, mensagem: null, erro: null, relatorio_markdown: null,
  created_at: "2026-09-20T13:00:00Z", updated_at: "2026-09-20T13:00:00Z", autor_nome: "Ana PO", autor_email: null,
  ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("mostra o histórico e detalha a primeira análise sem simular autor", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json([analysis({ autor_nome: null })])));
  render(<RepoAnalyzerTab projectId="p-1" />);

  expect(await screen.findByText("Etapa: Varredura")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Progresso da análise" })).toHaveAttribute("aria-valuenow", "30");
  expect(screen.queryByText(/po@sinapse\.local/)).toBeNull();
  expect(screen.getAllByText("Em execução").length).toBeGreaterThan(0);
});

it("avança a barra de progresso e conclui com relatório enquanto consulta em segundo plano", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const request = vi.fn()
    .mockImplementationOnce(() => json([analysis()]))
    .mockImplementationOnce(() => json([analysis({ progresso: 70, etapa_label: "Síntese" })]))
    .mockImplementation(() => json([analysis({ status: "concluido", progresso: 100, relatorio_markdown: "# Relatório final" })]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerTab projectId="p-1" />);

  await screen.findByText("Etapa: Varredura");
  await vi.advanceTimersByTimeAsync(4100);
  expect(await screen.findByText("Etapa: Síntese")).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(4100);
  expect(await screen.findByText("# Relatório final")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Baixar relatório (.md)" })).toBeInTheDocument();
  const calls = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(9000);
  expect(request.mock.calls.length).toBe(calls);
});

it("erro ao carregar oferece nova tentativa e não deixa a tela vazia sem explicação", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ error: "x" }, 500))
    .mockImplementationOnce(() => json([]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerTab projectId="p-1" />);

  expect((await screen.findByRole("alert")).textContent).toBe("Não foi possível carregar as análises. Tente novamente.");
  fireEvent.click(screen.getByText("Tentar novamente"));
  expect(await screen.findByText("Nenhuma análise realizada neste projeto.")).toBeInTheDocument();
  expect(screen.getByText("Nenhuma análise selecionada")).toBeInTheDocument();
});

it("valida a URL no cliente antes de chamar o backend", async () => {
  const request = vi.fn(() => json([]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerTab projectId="p-1" />);
  await screen.findByText("Nenhuma análise realizada neste projeto.");

  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  expect(screen.getByText("Informe a URL do repositório.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/URL do repositório/), { target: { value: "https://gitlab.com/acme/api" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  expect(screen.getByText("Use o formato https://github.com/usuario/repositorio.")).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(1);
});

it("inicia a análise, seleciona a nova e exibe a mensagem do servidor quando recusa", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json([]))
    .mockImplementationOnce(() => json({ error: "Falha ao iniciar análise no motor de IA: indisponível" }, 400))
    .mockImplementationOnce(() => json(analysis({ id: "a-2", repositorio_url: "https://github.com/acme/novo", status: "iniciado", progresso: 0, etapa_label: "Na fila" }), 201))
    .mockImplementation(() => json([analysis({ id: "a-2", repositorio_url: "https://github.com/acme/novo", status: "iniciado", progresso: 0, etapa_label: "Na fila" })]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerTab projectId="p-1" />);
  await screen.findByText("Nenhuma análise realizada neste projeto.");

  fireEvent.change(screen.getByLabelText(/URL do repositório/), { target: { value: "https://github.com/acme/novo" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  expect(await screen.findByText(/Falha ao iniciar análise no motor de IA/)).toBeInTheDocument();
  expect(screen.getByLabelText(/URL do repositório/)).toHaveValue("https://github.com/acme/novo");

  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  const details = await screen.findByText("Etapa: Na fila");
  expect(details).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText(/URL do repositório/)).toHaveValue(""));
  const [, init] = request.mock.calls[2] as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({ repositorio_url: "https://github.com/acme/novo" });
});

it("análise com falha mostra o motivo e alterna entre análises pelo histórico", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json([
    analysis({ id: "a-1", status: "falha", erro: "Repositório inacessível", progresso: 10 }),
    analysis({ id: "a-2", repositorio_url: "https://github.com/acme/outro", status: "concluido", progresso: 100, relatorio_markdown: "# Outro" }),
  ])));
  render(<RepoAnalyzerTab projectId="p-1" />);

  expect(await screen.findByText("Repositório inacessível")).toBeInTheDocument();
  const list = screen.getByRole("list");
  fireEvent.click(within(list).getByText("acme/outro"));
  expect(await screen.findByText("# Outro")).toBeInTheDocument();
  expect(within(list).getByText("acme/outro").closest("button")).toHaveAttribute("aria-current", "true");
});
