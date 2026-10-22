// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectDetail } from "./ProjectDetail";
import { RepoAnalyzerView } from "./RepoAnalyzerView";

const analysis = (overrides: Record<string, unknown> = {}) => ({
  id: "a-1", projeto_id: "p-1", repositorio_url: "https://github.com/acme/api", run_id: "r-1", status: "em_execucao",
  etapa: "scan", etapa_label: "Inventariando arquivos", progresso: 30, mensagem: null, erro: null, relatorio_markdown: null,
  metadados: null, created_at: "2026-09-20T13:00:00Z", updated_at: "2026-09-20T13:00:00Z", concluido_em: null,
  autor_nome: "Ana PO", autor_email: null,
  ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.history.replaceState(null, '', window.location.pathname); });

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
  await waitFor(
    () => expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true"),
    { timeout: 3000 },
  );
  expect(screen.queryByRole("heading", { name: "Título" })).toBeNull();
  expect(screen.getByText(/# Título/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true");
});

it("mantém o formato ao atualizar e volta à leitura ao selecionar outra análise", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json([
    analysis({ status: "concluido", relatorio_markdown: "# Primeiro" }),
    analysis({ id: "a-2", repositorio_url: "https://github.com/acme/outro", status: "concluido", relatorio_markdown: "# Segundo" }),
  ])));
  render(<RepoAnalyzerView projectId="p-1" />);

  await screen.findByRole("heading", { name: "Primeiro" });
  fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
  expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar" })).toHaveAttribute("aria-busy", "false"));
  expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true");

  const history = screen.getByRole("complementary", { name: "Histórico de análises" });
  fireEvent.click(within(history).getByText("acme/outro"));
  expect(await screen.findByRole("heading", { name: "Segundo" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Leitura" })).toHaveAttribute("aria-pressed", "true");
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
  expect(JSON.parse(String(init.body))).toEqual({ repositorio_url: "https://github.com/acme/novo", perfil: "quick" });
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
  expect(JSON.parse(String(init.body))).toEqual({ repositorio_url: "https://github.com/acme/api", perfil: "quick" });
});

it("perfil sem permissão apenas consulta", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json([])));
  render(<RepoAnalyzerView projectId="p-1" canStart={false} />);
  expect(await screen.findByText(/não pode iniciar novas/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Iniciar análise" })).toBeNull();
});

it("envia perfil rápido ao iniciar uma análise", async () => {
  const created = analysis({ status: "iniciado", etapa: "queued", etapa_label: "Na fila", progresso: 0 });
  const request = vi.fn()
    .mockImplementationOnce(() => json([]))
    .mockImplementationOnce(() => json(created, 201))
    .mockImplementation(() => json([created]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerView projectId="p-1" />);
  await screen.findByText("Nenhuma análise realizada neste projeto.");

  fireEvent.change(screen.getByDisplayValue("Rápida · até 8 arquivos prioritários"), { target: { value: "balanced" } });
  fireEvent.change(screen.getByLabelText(/URL do repositório/), { target: { value: "https://github.com/acme/api" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar análise" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  const [, options] = request.mock.calls[1] as [string, RequestInit];
  expect(JSON.parse(String(options.body))).toEqual({ repositorio_url: "https://github.com/acme/api", perfil: "balanced" });
});

it("pausa uma análise e oferece retomada pelo checkpoint", async () => {
  const paused = analysis({ status: "pausada", etapa: "files", etapa_label: "Analisando arquivos", progresso: 42, mensagem: "Progresso salvo." });
  const request = vi.fn()
    .mockImplementationOnce(() => json([analysis()]))
    .mockImplementationOnce(() => json(paused))
    .mockImplementationOnce(() => json([paused]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerView projectId="p-1" />);
  await screen.findByRole("button", { name: "Pausar" });
  fireEvent.click(screen.getByRole("button", { name: "Pausar" }));

  expect(await screen.findByRole("button", { name: "Retomar análise" })).toBeInTheDocument();
  expect(screen.getAllByText("Pausada").length).toBeGreaterThan(0);
  expect(request.mock.calls[1][0]).toBe("/api/v1/projects/p-1/repo-analyses/a-1/pause");
});

it("permite continuar uma análise que falhou depois de salvar progresso", async () => {
  const failed = analysis({ status: "falha", etapa: "error", erro: "Limite temporário de saída", metadados: { files_total: 8, files_processed: 5, can_resume: true } });
  const resumed = analysis({ status: "iniciado", etapa: "queued", mensagem: "Retomando do último ponto salvo…" });
  const request = vi.fn()
    .mockImplementationOnce(() => json([failed]))
    .mockImplementationOnce(() => json(resumed))
    .mockImplementationOnce(() => json([resumed]));
  vi.stubGlobal("fetch", request);
  render(<RepoAnalyzerView projectId="p-1" />);

  fireEvent.click(await screen.findByRole("button", { name: "Continuar com progresso salvo" }));
  expect(request.mock.calls[1][0]).toBe("/api/v1/projects/p-1/repo-analyses/a-1/resume");
  expect(await screen.findByText("Retomando do último ponto salvo…")).toBeInTheDocument();
});

it("pede confirmação antes de cancelar e registra o estado cancelado", async () => {
  const cancelled = analysis({ status: "cancelada", etapa: "files", etapa_label: "Analisando arquivos", progresso: 30, mensagem: "Análise cancelada pelo usuário." });
  const request = vi.fn()
    .mockImplementationOnce(() => json([analysis()]))
    .mockImplementationOnce(() => json(cancelled))
    .mockImplementationOnce(() => json([cancelled]));
  vi.stubGlobal("fetch", request);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<RepoAnalyzerView projectId="p-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar análise" }));

  expect(window.confirm).toHaveBeenCalled();
  expect((await screen.findAllByText("Cancelada")).length).toBeGreaterThan(0);
  expect(request.mock.calls[1][0]).toBe("/api/v1/projects/p-1/repo-analyses/a-1/cancel");
});

it('seleciona o relatorio indicado pela busca e permite reprocessar sem nova analise', async () => {
  window.history.replaceState(null, '', '#repo-analyzer=a-2');
  let retry = false;
  const older = () => analysis({ id: 'a-2', run_id: 'run-42', status: 'concluido', indexacao_status: retry ? 'pendente' : 'falha', relatorio_markdown: '# Relatorio selecionado' });
  const request = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { retry = true; return json(older()); }
    return json([analysis({ status: 'concluido' }), older()]);
  });
  vi.stubGlobal('fetch', request);
  try {
    render(<RepoAnalyzerView projectId="p-1" />);
    expect(await screen.findByRole('heading', { name: 'Relatorio selecionado' })).toBeInTheDocument();
    expect(screen.getByText('Execução: run-42')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reprocessar relatório' }));
    await waitFor(() => expect(request.mock.calls.some(([url, init]) => url.endsWith('/a-2/indexing/retry') && init?.method === 'POST')).toBe(true));
    expect(await screen.findByText('Indexação no acervo: pendente')).toBeInTheDocument();
  } finally { window.history.replaceState(null, '', window.location.pathname); }
});

for (const role of ['po', 'admin', 'dev']) {
 it(`S2-23: ações do relatório respeitam o papel ${role} no detalhe do projeto`, async()=>{
  vi.stubGlobal('fetch',vi.fn(()=>json([analysis({status:'concluido',relatorio_markdown:'# Revisado',indexacao_status:'falha'})])));
  render(<ProjectDetail project={{id:'p-1',nome:'QA',cliente:'QA',descricao:'',status:'ativo'}} canCreate={role!=='dev'} initialTab="repo-analyzer"/>);
  await screen.findByRole('heading',{name:'Revisado'});
  expect(Boolean(screen.queryByRole('button',{name:'Reprocessar relatório'}))).toBe(role!=='dev');
 });
}
it('S2-23: aprovação envia a versão exibida, bloqueia cliques durante loading e apresenta falha sem perder relatório',async()=>{
 let finish!: (response:Response)=>void;
 const report=analysis({status:'concluido',relatorio_markdown:'# Rascunho revisável',relatorio_revisao:7,indexacao_status:'aguardando_aprovacao'});
 const request=vi.fn((_:unknown,init?:RequestInit)=>init?.method==='POST'?new Promise<Response>(resolve=>{finish=resolve;}):json([report]));
 vi.stubGlobal('fetch',request);
 render(<RepoAnalyzerView projectId="p-1" canStart/>);
 const approve=await screen.findByRole('button',{name:'Aprovar relatório e publicar no acervo'});
 fireEvent.click(approve);
 await waitFor(()=>expect(approve).toBeDisabled());
 expect(screen.getByRole('button',{name:'Publicando…'})).toBeDisabled();
 const post=request.mock.calls.find(([,init])=>init?.method==='POST')!;
 expect(JSON.parse(post[1]!.body as string)).toEqual({relatorio_revisao:7});
 finish(new Response(JSON.stringify({error:'O relatório mudou. Atualize a página.'}),{status:409,headers:{'Content-Type':'application/json'}}));
 expect(await screen.findByRole('alert')).toHaveTextContent('O relatório mudou');
 expect(screen.getByRole('heading',{name:'Rascunho revisável'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Aprovar relatório e publicar no acervo'})).toBeEnabled();
});
it('S2-23: desenvolvedor pode ler rascunho e não pode aprová-lo',async()=>{
 vi.stubGlobal('fetch',vi.fn(()=>json([analysis({status:'concluido',relatorio_markdown:'# Rascunho',indexacao_status:'aguardando_aprovacao'})])));
 render(<RepoAnalyzerView projectId="p-1" canStart={false}/>);
 await screen.findByRole('heading',{name:'Rascunho'});
 expect(screen.getByText(/Gerado por IA e ainda não revisado/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Aprovar relatório e publicar no acervo'})).toBeNull();
});
