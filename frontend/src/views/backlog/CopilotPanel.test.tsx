import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { CopilotPanel } from "./CopilotPanel";
import { EpicForm } from "./EpicsView";

const values = {
  titulo: "Consultar pedido",
  historia_como_um: "cliente",
  historia_eu_quero: "consultar pedido",
  historia_para_que: "acompanhar entrega",
  requer_interface: true,
};
const question = {
  mode: "levantamento",
  operation: "questionar",
  level: "pbi",
  version: 1,
  schema_version: 1,
  result: {
    questions: [
      {
        dimension: "permissoes_seguranca",
        question: "Quem pode consultar o pedido?",
      },
    ],
    summary: "Revisar as permissões.",
  },
};
const proposal = {
  titulo: "Consultar pedido com segurança",
  historia_como_um: "cliente autenticado",
  historia_eu_quero: "consultar meu pedido",
  historia_para_que: "acompanhar a entrega",
  regras_observacoes: "",
};
const json = (data: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(data), { status }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("questionador é o padrão, envia os campos atuais e considera cenários salvos e interface", async () => {
  const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    json(question),
  );
  vi.stubGlobal("fetch", fetch);
  render(
    <CopilotPanel
      projectId="p1"
      level="pbi"
      values={values}
      criteria={[
        {
          id: "c1",
          entidade_tipo: "pbi",
          entidade_id: "b1",
          texto: null,
          nome: "Principal",
          dado: "Cliente autorizado",
          quando: "Consultar",
          entao: "Exibir pedido",
          ordem: 1,
        },
      ]}
    />,
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(
    screen.getByRole("radio", { name: "Questionar lacunas" }),
  ).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  expect(
    await screen.findByText("Quem pode consultar o pedido?"),
  ).toBeInTheDocument();
  const init = fetch.mock.calls[0][1] as RequestInit;
  const body = JSON.parse(init.body as string);
  expect(body.fields.titulo).toBe(values.titulo);
  expect(JSON.parse(body.fields.texto_livre)).toMatchObject({
    requer_interface: true,
    criterios_salvos: [{ dado: "Cliente autorizado", entao: "Exibir pedido" }],
  });
});
it("não inventa perguntas quando a resposta não identifica lacunas", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      json({
        ...question,
        result: { summary: "Especificação completa.", questions: [] },
      }),
    ),
  );
  render(<CopilotPanel projectId="p1" level="pbi" values={values} />);
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  expect(
    await screen.findByText(
      "Nenhuma lacuna relevante foi identificada nesta análise.",
    ),
  ).toBeInTheDocument();
});
it("apresenta proposta separada, sem alterar os valores nem gravar sugestões", async () => {
  const fetch = vi.fn(() =>
    json({
      ...question,
      operation: "padronizar",
      result: { proposal, questions: [] },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<CopilotPanel projectId="p1" level="pbi" values={values} />);
  fireEvent.click(screen.getByRole("radio", { name: "Padronizar texto" }));
  fireEvent.click(screen.getByRole("button", { name: "Propor padronização" }));
  expect(await screen.findByText(proposal.titulo)).toBeInTheDocument();
  expect(values.titulo).toBe("Consultar pedido");
  fireEvent.click(screen.getByRole("button", { name: "Descartar resposta" }));
  expect(screen.queryByText(proposal.titulo)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("erro de IA permite nova tentativa sem perder o item", async () => {
  const fetch = vi
    .fn()
    .mockImplementationOnce(() => json({ error: "SEGREDO" }, 503))
    .mockImplementationOnce(() => json(question));
  vi.stubGlobal("fetch", fetch);
  render(<CopilotPanel projectId="p1" level="pbi" values={values} />);
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Sua edição foi preservada",
  );
  expect(screen.queryByText("SEGREDO")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Tentar análise novamente" }),
  );
  expect(
    await screen.findByText("Quem pode consultar o pedido?"),
  ).toBeInTheDocument();
});
it("ignora a resposta antiga se o autor continuar digitando", async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(
    (_url: unknown, _init?: RequestInit) =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(
    <CopilotPanel projectId="p1" level="pbi" values={values} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  const signal = fetch.mock.calls[0][1]!.signal!;
  rerender(
    <CopilotPanel
      projectId="p1"
      level="pbi"
      values={{ ...values, titulo: "Título em edição" }}
    />,
  );
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(new Response(JSON.stringify(question))));
  expect(
    screen.queryByText("Quem pode consultar o pedido?"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Analisar lacunas" }),
  ).toBeEnabled();
});
it("mostra demora sem bloquear a edição e cancela uma resposta tardia", async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  render(<CopilotPanel projectId="p1" level="pbi" values={values} />);
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.getByText(/ultrapassou 5 segundos/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar análise" }));
  expect(
    screen.getByText("Análise cancelada. Sua edição foi preservada."),
  ).toBeInTheDocument();
  await act(async () => resolve(new Response(JSON.stringify(question))));
  expect(
    screen.queryByText("Quem pode consultar o pedido?"),
  ).not.toBeInTheDocument();
});
it("aguarda os critérios para analisar lacunas; padronização continua disponível", () => {
  render(
    <CopilotPanel projectId="p1" level="pbi" values={values} criteria={null} />,
  );
  expect(
    screen.getByRole("button", { name: "Analisar lacunas" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Padronizar texto" }));
  expect(
    screen.getByRole("button", { name: "Propor padronização" }),
  ).toBeEnabled();
});
it("trocar o nível para épico usa padronização e descarta a resposta de PBI", async () => {
  const fetch = vi.fn(() =>
    json({
      ...question,
      level: "epico",
      operation: "padronizar",
      result: { proposal: null, questions: ["Qual o objetivo amplo?"] },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(
    <CopilotPanel projectId="p1" level="pbi" values={values} />,
  );
  rerender(
    <CopilotPanel
      projectId="p1"
      level="epico"
      values={{ titulo: "Digitalizar pedidos" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Propor padronização" }));
  expect(await screen.findByText("Qual o objetivo amplo?")).toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});
it("o formulário real pode ser salvo normalmente após indisponibilidade da IA", async () => {
  const fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
    String(url).includes("/ai/requests")
      ? json({}, 503)
      : init?.method === "POST"
        ? json({ id: "e1" })
        : json({ items: [] }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<EpicForm projetoId="p1" />);
  const title = screen.getByLabelText("Título (obrigatório)");
  fireEvent.change(title, { target: { value: "Digitalizar pedidos" } });
  fireEvent.click(screen.getByRole("button", { name: "Propor padronização" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Sua edição foi preservada",
  );
  expect(title).toHaveValue("Digitalizar pedidos");
  fireEvent.click(screen.getByRole("button", { name: "Criar épico" }));
  await act(async () => {});
  const saved = fetch.mock.calls.find(
    ([url, init]) => String(url) === "/api/v1/epics" && init?.method === "POST",
  );
  expect(saved).toBeTruthy();
  expect(JSON.parse(saved![1]!.body as string).titulo).toBe(
    "Digitalizar pedidos",
  );
});

it("timeout não apaga o rascunho e mantém a análise disponível para nova tentativa", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new DOMException("Timeout", "TimeoutError"))),
  );
  render(<CopilotPanel projectId="p1" level="pbi" values={values} />);
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "ultrapassou o tempo de espera",
  );
  expect(
    screen.getByRole("button", { name: "Tentar análise novamente" }),
  ).toBeEnabled();
});

it("conteúdo da IA é apresentado como texto, sem executar HTML", async () => {
  const text = '<img src=x onerror="alert(1)">';
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      json({ ...question, result: { summary: text, questions: [] } }),
    ),
  );
  const { container } = render(
    <CopilotPanel projectId="p1" level="pbi" values={values} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  expect(await screen.findByText(text)).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
});

it("trocar de projeto cancela a análise anterior sem apresentar dados antigos", async () => {
  let resolve!: (value: Response) => void;
  const fetch = vi.fn(
    (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(
    <CopilotPanel projectId="p1" level="pbi" values={values} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  rerender(<CopilotPanel projectId="p2" level="pbi" values={values} />);
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => resolve(new Response(JSON.stringify(question))));
  expect(
    screen.queryByText("Quem pode consultar o pedido?"),
  ).not.toBeInTheDocument();
});
it("uma resposta antiga não substitui a padronização solicitada depois da troca de modo", async () => {
  let resolve!: (value: Response) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    )
    .mockImplementationOnce(() =>
      json({
        ...question,
        operation: "padronizar",
        result: { proposal, questions: [] },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  render(<CopilotPanel projectId="p1" level="pbi" values={values} />);
  fireEvent.click(screen.getByRole("button", { name: "Analisar lacunas" }));
  fireEvent.click(screen.getByRole("radio", { name: "Padronizar texto" }));
  fireEvent.click(screen.getByRole("button", { name: "Propor padronização" }));
  expect(await screen.findByText(proposal.titulo)).toBeInTheDocument();
  await act(async () => resolve(new Response(JSON.stringify(question))));
  expect(screen.getByText(proposal.titulo)).toBeInTheDocument();
  expect(
    screen.queryByText("Quem pode consultar o pedido?"),
  ).not.toBeInTheDocument();
});
