// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DocumentsTab } from "./DocumentsTab";

const limites = { max_bytes: 1024 * 1024, extensoes_permitidas: [".pdf", ".docx", ".md", ".txt"] };
const doc = (overrides: Record<string, unknown> = {}) => ({
  id: "d-1", projeto_id: "p-1", nome: "Escopo.pdf", extensao: ".pdf", mime: "application/pdf", tamanho_bytes: 2048,
  status_processamento: "pendente", autor_id: "u-1", autor_nome: "Ana PO", created_at: "2026-09-20T13:00:00Z", updated_at: "2026-09-20T13:00:00Z",
  ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const listing = (items: unknown[]) => json({ items, limites });

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("Selecionar documento"), { target: { files: [file] } });
}

it("lista somente os documentos do projeto aberto com metadados e status", async () => {
  const request = vi.fn((..._args: unknown[]) => listing([
    doc(),
    doc({ id: "d-2", nome: "Notas.md", extensao: ".md", tamanho_bytes: 3 * 1024 * 1024, status_processamento: "processado", autor_nome: null }),
  ]));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);

  const table = await screen.findByRole("table");
  expect(request.mock.calls[0][0]).toBe("/api/v1/projects/p-1/documents");
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText("Escopo.pdf")).toBeInTheDocument();
  expect(within(rows[1]).getByText("PDF")).toBeInTheDocument();
  expect(within(rows[1]).getByText("2,0 KB")).toBeInTheDocument();
  expect(within(rows[1]).getByText("Ana PO")).toBeInTheDocument();
  expect(within(rows[1]).getByText("Pendente")).toBeInTheDocument();
  expect(within(rows[2]).getByText("Processado")).toBeInTheDocument();
  expect(within(rows[2]).getByText("Não informado")).toBeInTheDocument();
  expect(within(rows[2]).getByText("3,0 MB")).toBeInTheDocument();
});

it("mostra carregamento e depois o estado vazio orientando o primeiro envio", async () => {
  vi.stubGlobal("fetch", vi.fn(() => listing([])));
  render(<DocumentsTab projectId="p-1" canWrite />);
  expect(screen.getByRole("status").textContent).toBe("Carregando documentos…");
  expect(await screen.findByText("Nenhum documento neste projeto")).toBeInTheDocument();
  expect(screen.getByText(/Envie o primeiro arquivo \(PDF, DOCX, MD e TXT\)/)).toBeInTheDocument();
  expect(screen.getByText(/Tamanho máximo: 1,0 MB/)).toBeInTheDocument();
});

it("erro de carregamento oferece nova tentativa preservando o contexto do projeto", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ error: "falha" }, 500))
    .mockImplementationOnce(() => listing([doc()]));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);

  expect((await screen.findByRole("alert")).textContent).toBe("Não foi possível carregar os documentos. Tente novamente.");
  fireEvent.click(screen.getByText("Tentar novamente"));
  expect(await screen.findByText("Escopo.pdf")).toBeInTheDocument();
  expect(request.mock.calls.map(call => call[0])).toEqual(["/api/v1/projects/p-1/documents", "/api/v1/projects/p-1/documents"]);
});

it("atualizar recarrega a lista sem alterar os documentos e informa falha mantendo os dados", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc()]))
    .mockImplementationOnce(() => listing([doc({ status_processamento: "processado" })]))
    .mockImplementationOnce(() => json({ error: "x" }, 500));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);

  await screen.findByText("Pendente");
  fireEvent.click(screen.getByText("Atualizar"));
  expect(await screen.findByText("Processado")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Atualizar"));
  expect(await screen.findByText(/podem estar desatualizados/)).toBeInTheDocument();
  expect(screen.getByText("Processado")).toBeInTheDocument();
});

it("atualiza sozinho enquanto há documento em processamento", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc({ status_processamento: "processando" })]))
    .mockImplementation(() => listing([doc({ status_processamento: "processado" })]));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);

  await screen.findByText("Processando");
  await vi.advanceTimersByTimeAsync(5100);
  expect(await screen.findByText("Processado")).toBeInTheDocument();
});

it("perfil de leitura consulta a lista sem upload nem remoção", async () => {
  vi.stubGlobal("fetch", vi.fn(() => listing([doc()])));
  render(<DocumentsTab projectId="p-1" canWrite={false} />);
  await screen.findByText("Escopo.pdf");
  expect(screen.getByText(/permite apenas consultar/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Selecionar documento")).toBeNull();
  expect(screen.queryByText("Remover")).toBeNull();
});

it("projeto arquivado exibe a nota de somente leitura", async () => {
  vi.stubGlobal("fetch", vi.fn(() => listing([doc()])));
  render(<DocumentsTab projectId="p-1" canWrite={false} readOnlyNote="Projeto arquivado: somente consulta." />);
  expect(await screen.findByText("Projeto arquivado: somente consulta.")).toBeInTheDocument();
});

it("recusa no cliente formato e tamanho inválidos sem chamar o servidor", async () => {
  const request = vi.fn((..._args: unknown[]) => listing([]));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);
  await screen.findByText("Nenhum documento neste projeto");

  pick(new File(["x"], "programa.exe"));
  expect((await screen.findByRole("alert")).textContent).toContain("Formato não suportado. Envie arquivos PDF, DOCX, MD, TXT.");
  pick(new File([new Uint8Array(limites.max_bytes + 1)], "grande.txt"));
  expect((await screen.findByRole("alert")).textContent).toContain("excede o limite de 1,0 MB");
  expect(screen.queryByText("Enviar documento", { selector: "button" })).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});

it("envia o arquivo selecionado, adiciona na lista e limpa a seleção", async () => {
  const created = doc({ id: "d-9", nome: "Nova.txt", extensao: ".txt", tamanho_bytes: 5 });
  const request = vi.fn()
    .mockImplementationOnce(() => listing([]))
    .mockImplementationOnce(() => json(created, 201));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);
  await screen.findByText("Nenhum documento neste projeto");

  const file = new File(["12345"], "Nova.txt", { type: "text/plain" });
  pick(file);
  fireEvent.click(screen.getByRole("button", { name: "Enviar documento" }));

  await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
  expect(screen.getByText(/Documento "Nova.txt" enviado com sucesso/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remover seleção" })).toBeNull();
  const [url, init] = request.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("/api/v1/projects/p-1/documents");
  expect(init.method).toBe("POST");
  expect(init.body).toBe(file);
});

it("falha no envio mantém o arquivo selecionado e permite tentar novamente", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([]))
    .mockImplementationOnce(() => json({ error: "Não foi possível armazenar o arquivo agora. Sua seleção foi mantida; tente novamente." }, 503))
    .mockImplementationOnce(() => json(doc({ nome: "Nova.md" }), 201));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);
  await screen.findByText("Nenhum documento neste projeto");

  pick(new File(["# ok"], "Nova.md"));
  fireEvent.click(screen.getByRole("button", { name: "Enviar documento" }));
  expect((await screen.findByText(/Não foi possível armazenar o arquivo agora/))).toBeInTheDocument();
  expect(screen.getByText("Nova.md")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await screen.findByRole("table");
  expect(request).toHaveBeenCalledTimes(3);
});

it("não envia duas vezes ao clicar repetidamente durante o envio", async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn()
    .mockImplementationOnce(() => listing([]))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);
  await screen.findByText("Nenhum documento neste projeto");

  pick(new File(["abc"], "a.txt"));
  const button = screen.getByRole("button", { name: "Enviar documento" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(request).toHaveBeenCalledTimes(2);
  finish(new Response(JSON.stringify(doc({ nome: "a.txt" })), { status: 201 }));
  await screen.findByRole("table");
});

it("cancelar a remoção não chama o servidor", async () => {
  const request = vi.fn((..._args: unknown[]) => listing([doc()]));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Remover Escopo.pdf" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("Remover Escopo.pdf?");
  fireEvent.click(within(dialog).getByText("Cancelar"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Escopo.pdf")).toBeInTheDocument();
});

it("remove após confirmação explícita e retira o documento da lista", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc(), doc({ id: "d-2", nome: "Outro.md", extensao: ".md" })]))
    .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Remover Escopo.pdf" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByText("Confirmar remoção"));

  await waitFor(() => expect(screen.queryByText("Escopo.pdf")).toBeNull());
  expect(screen.getByText("Outro.md")).toBeInTheDocument();
  expect(screen.getByText(/Documento "Escopo.pdf" removido/)).toBeInTheDocument();
  const [url, init] = request.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("/api/v1/projects/p-1/documents/d-1");
  expect(init.method).toBe("DELETE");
});

it("falha na remoção mantém o documento disponível e permite nova tentativa", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc()]))
    .mockImplementationOnce(() => json({ error: "Não foi possível remover o documento. Ele continua disponível; tente novamente." }, 500))
    .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", request);
  render(<DocumentsTab projectId="p-1" canWrite />);

  fireEvent.click(await screen.findByRole("button", { name: "Remover Escopo.pdf" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByText("Confirmar remoção"));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("continua disponível");
  expect(screen.getByText("Escopo.pdf", { selector: "td" })).toBeInTheDocument();

  fireEvent.click(within(dialog).getByText("Tentar novamente"));
  await waitFor(() => expect(screen.queryByText("Escopo.pdf", { selector: "td" })).toBeNull());
});
