// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RepoAnalyzerView } from "./RepoAnalyzerView";

const analysis = (overrides: Record<string, unknown> = {}) => ({
  id: "a-1", projeto_id: "p-1", repositorio_url: "https://github.com/acme/api", run_id: "r-1", status: "em_execucao",
  etapa: "scan", etapa_label: "Inventariando arquivos", progresso: 30, mensagem: null, erro: null, relatorio_markdown: null,
  metadados: null, created_at: "2026-09-20T13:00:00Z", updated_at: "2026-09-20T13:00:00Z", concluido_em: null,
  autor_nome: "Ana PO", autor_email: null,
  ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("mostra histórico, etapas e progresso sem inventar autor", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json([analysis({ autor_nome: null, metadados: { files_total: 40, files_processed: 12, language_counts: { ts: 20, py: 5 } } })])));
  render(<RepoAnalyzerView projectId="p-1" />);

  expect(await screen.findByRole("progressbar", { name: "Progresso da análise" })).toHaveAttribute("aria-valuenow", "30");
  const steps = within(screen.getByRole("list", { name: "Etapas da análise" })).getAllByRole("listitem");
  expect(steps).toHaveLength(5);
  expect(steps[2]).toHaveAttribute("aria-current", "step");
  expect(steps[0]).toHaveTextContent("concluída");
  expect(screen.getByText(/12 de 40 arquivos analisados/)).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Linguagens encontradas" })).toHaveTextContent("ts");
  expect(screen.queryByText(/po@sinapse\.local/)).toBeNull();
  expect(screen.queryByText(/Ana PO/)).toBeNull();
});

it("avança o progresso e conclui com relatório renderizado enquanto consulta em segundo plano", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const request = vi.fn()
    .mockImplementationOnce(() => json([analysis()]))
    .mockImplementationOnce(() => json([analysis({ progresso: 70, etapa: "synthesis", etapa_label: "Gerando síntese" })]))
    .mockImplementation(() => json([analysis({ status: "concluido", etapa: "done", progresso: 100, relatorio_markdown: "# Relatório final\n\n- item **um**", concluido_em: "2026-09-20T13:02:00Z" })]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerView projectId="p-1" />);

  await screen.findByText("Inventariando arquivos");
  await vi.advanceTimersByTimeAsync(4100);
  expect(await screen.findByText("Gerando síntese")).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(4100);
  expect(await screen.findByRole("heading", { name: "Relatório final" })).toBeInTheDocument();
  expect(screen.getByText("um").tagName).toBe("STRONG");
  expect(screen.getByRole("button", { name: "Baixar .md" })).toBeInTheDocument();
  expect(screen.getByText(/duração 2 min/)).toBeInTheDocument();

  const calls = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(9000);
  expect(request.mock.calls.length).toBe(calls);
});

it("alterna o relatório entre leitura e Markdown bruto", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json([analysis({ status: "concluido", etapa: "done", relatorio_markdown: "# Título\n\nTexto" })])));
  render(<RepoAnalyzerView projectId="p-1" />);

  await screen.findByRole("heading", { name: "Título" });
  fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
  expect(screen.queryByRole("heading", { name: "Título" })).toBeNull();
  expect(screen.getByText(/# Título/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true");
});

it("erro ao carregar oferece nova tentativa", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ error: "x" }, 500))
    .mockImplementationOnce(() => json([]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerView projectId="p-1" />);

  expect((await screen.findByRole("alert")).textContent).toBe("Não foi possível carregar as análises. Tente novamente.");
  fireEvent.click(screen.getByText("Tentar novamente"));
  expect(await screen.findByText("Nenhuma análise realizada neste projeto.")).toBeInTheDocument();
  expect(screen.getByText("Nenhuma análise selecionada")).toBeInTheDocument();
});

it("traduz projeto inexistente e acesso negado", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json({ error: "x" }, 404)));
  render(<RepoAnalyzerView projectId="p-1" />);
  expect((await screen.findByRole("alert")).textContent).toBe("Projeto não encontrado.");
  cleanup();
  vi.stubGlobal("fetch", vi.fn(() => json({ error: "x" }, 403)));
  render(<RepoAnalyzerView projectId="p-1" />);
  expect((await screen.findByRole("alert")).textContent).toMatch(/não tem permissão/);
});

it("valida a URL no cliente antes de chamar o backend", async () => {
  const request = vi.fn(() => json([]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerView projectId="p-1" />);
  await screen.findByText("Nenhuma análise realizada neste projeto.");

  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  expect(screen.getByText("Informe a URL do repositório.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/URL do repositório/), { target: { value: "https://gitlab.com/acme/api" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  expect(screen.getByText("Use o formato https://github.com/usuario/repositorio.")).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(1);
});

it("inicia a análise, seleciona a nova e exibe a mensagem do servidor quando recusa", async () => {
  const created = analysis({ id: "a-2", repositorio_url: "https://github.com/acme/novo", status: "iniciado", progresso: 0, etapa: "queued", etapa_label: "Na fila" });
  const request = vi.fn()
    .mockImplementationOnce(() => json([]))
    .mockImplementationOnce(() => json({ error: "Falha ao iniciar análise no motor de IA: indisponível" }, 400))
    .mockImplementationOnce(() => json(created, 201))
    .mockImplementation(() => json([created]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerView projectId="p-1" />);
  await screen.findByText("Nenhuma análise realizada neste projeto.");

  fireEvent.change(screen.getByLabelText(/URL do repositório/), { target: { value: "https://github.com/acme/novo" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  expect(await screen.findByText(/Falha ao iniciar análise no motor de IA/)).toBeInTheDocument();
  expect(screen.getByLabelText(/URL do repositório/)).toHaveValue("https://github.com/acme/novo");

  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  expect(await screen.findByText("Na fila", { selector: ".analysis-progress-line span" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText(/URL do repositório/)).toHaveValue(""));
  const [url, init] = request.mock.calls[2] as [string, RequestInit];
  expect(url).toBe("/api/v1/projects/p-1/repo-analyses");
  expect(JSON.parse(String(init.body))).toEqual({ repositorio_url: "https://github.com/acme/novo" });
});

it("análise com falha mostra o motivo, permite repetir e alterna pelo histórico", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json([
      analysis({ id: "a-1", status: "falha", erro: "Repositório inacessível", progresso: 10, etapa: "clone" }),
      analysis({ id: "a-2", repositorio_url: "https://github.com/acme/outro", status: "concluido", etapa: "done", progresso: 100, relatorio_markdown: "# Outro" }),
    ]))
    .mockImplementationOnce(() => json(analysis({ id: "a-3", status: "iniciado", etapa: "queued", etapa_label: "Na fila", progresso: 0 }), 201))
    .mockImplementation(() => json([analysis({ id: "a-3", status: "iniciado", etapa: "queued", etapa_label: "Na fila", progresso: 0 })]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerView projectId="p-1" />);

  expect(await screen.findByText("Repositório inacessível")).toBeInTheDocument();
  const history = screen.getByRole("complementary", { name: "Histórico de análises" });
  fireEvent.click(within(history).getByText("acme/outro"));
  expect(await screen.findByRole("heading", { name: "Outro" })).toBeInTheDocument();
  expect(within(history).getByText("acme/outro").closest("button")).toHaveAttribute("aria-current", "true");

  fireEvent.click(within(history).getByText("acme/api"));
  fireEvent.click(await screen.findByRole("button", { name: "Analisar novamente" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  const [, init] = request.mock.calls[1] as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({ repositorio_url: "https://github.com/acme/api" });
});

it("perfil sem permissão apenas consulta", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json([])));
  render(<RepoAnalyzerView projectId="p-1" canStart={false} />);
  expect(await screen.findByText(/não pode iniciar novas/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Iniciar análise" })).toBeNull();
});
