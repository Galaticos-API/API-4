// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DocumentsView } from "./DocumentsView";

const limites = { max_bytes: 1024 * 1024, extensoes_permitidas: [".pdf", ".docx", ".md", ".txt"] };
const doc = (overrides: Record<string, unknown> = {}) => ({
  id: "d-1", projeto_id: "p-1", nome: "Escopo.pdf", extensao: ".pdf", mime: "application/pdf", tamanho_bytes: 2048,
  status_processamento: "pendente", armazenamento_pendente: false, autor_id: "u-1", autor_nome: "Ana PO",
  created_at: "2026-09-20T13:00:00Z", updated_at: "2026-09-20T13:00:00Z", ...overrides,
});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const listing = (items: unknown[], next_cursor: string | null = null) => json({ items, next_cursor, limites, paginacao: { tamanho_pagina: 20, tamanho_maximo: 50 } });
const urlOf = (call: unknown[]) => String(call[0]);

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const pick = (file: File) => fireEvent.change(screen.getByLabelText("Selecionar documento"), { target: { files: [file] } });
const view = (props: Partial<React.ComponentProps<typeof DocumentsView>> = {}) =>
  render(<DocumentsView projectId="p-1" projectName="Sinapse" canWrite {...props} />);

it("sem projeto, orienta a abrir um projeto e não chama a API", () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  render(<DocumentsView />);
  expect(screen.getByText("Escolha um projeto")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ver projetos" }));
  expect(window.location.pathname).toBe("/projects");
  expect(request).not.toHaveBeenCalled();
});

it("lista somente os documentos do projeto com metadados e status honestos sobre a ingestão", async () => {
  const request = vi.fn(() => listing([
    doc(),
    doc({ id: "d-2", nome: "Notas.md", extensao: ".md", tamanho_bytes: 3 * 1024 * 1024, status_processamento: "processado", autor_nome: null }),
    doc({ id: "d-3", nome: "Falhou.txt", extensao: ".txt", status_processamento: "falha" }),
  ]));
  vi.stubGlobal("fetch", request);
  view();

  const table = await screen.findByRole("table");
  expect(urlOf(request.mock.calls[0])).toBe("/api/v1/projects/p-1/documents");
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(4);
  expect(within(rows[1]).getByText("Escopo.pdf")).toBeInTheDocument();
  expect(within(rows[1]).getByText("PDF")).toBeInTheDocument();
  expect(within(rows[1]).getByText("2,0 KB")).toBeInTheDocument();
  expect(within(rows[1]).getByText("Ana PO")).toBeInTheDocument();
  expect(within(rows[1]).getByText("Aguardando ingestão")).toBeInTheDocument();
  expect(within(rows[2]).getByText("Disponível no acervo")).toBeInTheDocument();
  expect(within(rows[2]).getByText("Não informado")).toBeInTheDocument();
  expect(within(rows[3]).getByText("Falha no processamento")).toBeInTheDocument();
  expect(screen.getByText(/depende da S2-01/)).toBeInTheDocument();
});

it("mostra estado de armazenamento em finalização quando o servidor sinaliza pendência", async () => {
  vi.stubGlobal("fetch", vi.fn(() => listing([doc({ armazenamento_pendente: true })])));
  view();
  expect(await screen.findByText("Finalizando armazenamento")).toBeInTheDocument();
});

it("carregamento, vazio e orientação do primeiro envio", async () => {
  vi.stubGlobal("fetch", vi.fn(() => listing([])));
  view();
  expect(screen.getByText("Carregando documentos…")).toBeInTheDocument();
  expect(await screen.findByText("Nenhum documento neste projeto")).toBeInTheDocument();
  expect(screen.getByText(/Envie o primeiro arquivo \(PDF, DOCX, MD, TXT\)/)).toBeInTheDocument();
  expect(screen.getByText(/Máximo 1,0 MB/)).toBeInTheDocument();
});

it("erro de carregamento oferece nova tentativa preservando o contexto do projeto", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => json({ error: "falha" }, 500))
    .mockImplementationOnce(() => listing([doc()]));
  vi.stubGlobal("fetch", request);
  view();

  expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível carregar os documentos. Tente novamente.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Escopo.pdf")).toBeInTheDocument();
  expect(request.mock.calls.map(urlOf)).toEqual(["/api/v1/projects/p-1/documents", "/api/v1/projects/p-1/documents"]);
});

it("Atualizar recarrega a lista e mantém os dados quando a atualização falha", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc()]))
    .mockImplementationOnce(() => listing([doc({ status_processamento: "processado" })]))
    .mockImplementationOnce(() => json({ error: "x" }, 500));
  vi.stubGlobal("fetch", request);
  view();

  await screen.findByText("Aguardando ingestão");
  fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
  expect(await screen.findByText("Disponível no acervo")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
  expect(await screen.findByText(/Não foi possível carregar os documentos/)).toBeInTheDocument();
  expect(screen.getByText("Disponível no acervo")).toBeInTheDocument();
});

it("atualiza sozinho enquanto há documento em processamento", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc({ status_processamento: "processando" })]))
    .mockImplementation(() => listing([doc({ status_processamento: "processado" })]));
  vi.stubGlobal("fetch", request);
  view();

  await screen.findByText("Processando");
  await vi.advanceTimersByTimeAsync(10_100);
  expect(await screen.findByText("Disponível no acervo")).toBeInTheDocument();
});

it("paginação: Carregar mais usa o cursor, evita duplicados e trata falha", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc({ id: "d-1", nome: "Um.pdf" })], "cursor-1"))
    .mockImplementationOnce(() => json({ error: "x" }, 500))
    .mockImplementationOnce(() => listing([doc({ id: "d-1", nome: "Um.pdf" }), doc({ id: "d-2", nome: "Dois.pdf" })], null));
  vi.stubGlobal("fetch", request);
  view();

  await screen.findByText("Um.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
  expect(await screen.findByText("Não foi possível carregar mais documentos.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
  expect(await screen.findByText("Dois.pdf")).toBeInTheDocument();
  expect(screen.getAllByText("Um.pdf")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  expect(urlOf(request.mock.calls[1])).toBe("/api/v1/projects/p-1/documents?cursor=cursor-1");
});

it("perfil de leitura consulta sem enviar nem remover", async () => {
  vi.stubGlobal("fetch", vi.fn(() => listing([doc()])));
  view({ canWrite: false });
  await screen.findByText("Escopo.pdf");
  expect(screen.getByText(/pode consultar documentos, mas não pode enviar ou remover/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Selecionar documento")).toBeNull();
  expect(screen.queryByRole("button", { name: /Remover/ })).toBeNull();
});

it("projeto arquivado exibe somente consulta e esconde ações de escrita", async () => {
  vi.stubGlobal("fetch", vi.fn(() => listing([doc()])));
  view({ archived: true, canWrite: false });
  expect(await screen.findByText(/Projeto arquivado: os documentos ficam disponíveis somente para consulta/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Selecionar documento")).toBeNull();
  expect(screen.queryByRole("button", { name: /Remover/ })).toBeNull();
});

it("recusa no cliente formato e tamanho inválidos sem chamar o servidor", async () => {
  const request = vi.fn(() => listing([]));
  vi.stubGlobal("fetch", request);
  view();
  await screen.findByText("Nenhum documento neste projeto");

  pick(new File(["x"], "programa.exe"));
  expect(await screen.findByText(/Formato não suportado\. Envie arquivos PDF, DOCX, MD, TXT\./)).toBeInTheDocument();
  pick(new File([new Uint8Array(limites.max_bytes + 1)], "grande.txt"));
  expect(await screen.findByText(/excede o limite de 1,0 MB/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Enviar documento" })).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});

it("envia o arquivo como corpo binário, adiciona à lista e avisa que a indexação depende da S2-01", async () => {
  const created = doc({ id: "d-9", nome: "Nova.txt", extensao: ".txt", tamanho_bytes: 5 });
  const request = vi.fn()
    .mockImplementationOnce(() => listing([]))
    .mockImplementationOnce(() => json(created, 201));
  vi.stubGlobal("fetch", request);
  view();
  await screen.findByText("Nenhum documento neste projeto");

  const file = new File(["12345"], "Nova.txt", { type: "text/plain" });
  pick(file);
  fireEvent.click(screen.getByRole("button", { name: "Enviar documento" }));

  await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
  expect(screen.getByText(/foi armazenado\. A indexação do acervo depende da integração da S2-01/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Limpar seleção" })).toBeNull();
  const [url, init] = request.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("/api/v1/projects/p-1/documents");
  expect(init.method).toBe("POST");
  expect(init.body).toBe(file);
  expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
});

it("armazenamento pendente após o envio é informado ao usuário", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([]))
    .mockImplementationOnce(() => json(doc({ armazenamento_pendente: true, nome: "Nova.md" }), 201));
  vi.stubGlobal("fetch", request);
  view();
  await screen.findByText("Nenhum documento neste projeto");
  pick(new File(["# ok"], "Nova.md"));
  fireEvent.click(screen.getByRole("button", { name: "Enviar documento" }));
  expect(await screen.findByText(/armazenamento está sendo finalizado/)).toBeInTheDocument();
});

it("falha no envio mantém a seleção e permite tentar novamente; 409 de projeto arquivado é explicado", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([]))
    .mockImplementationOnce(() => json({ error: "Não foi possível armazenar o arquivo agora. Sua seleção foi mantida; tente novamente." }, 503))
    .mockImplementationOnce(() => json({ error: "Projeto arquivado é somente leitura e não recebe novos documentos." }, 409))
    .mockImplementationOnce(() => json(doc({ nome: "Nova.md" }), 201));
  vi.stubGlobal("fetch", request);
  view();
  await screen.findByText("Nenhum documento neste projeto");

  pick(new File(["# ok"], "Nova.md"));
  fireEvent.click(screen.getByRole("button", { name: "Enviar documento" }));
  expect(await screen.findByText(/Não foi possível armazenar o arquivo agora/)).toBeInTheDocument();
  expect(screen.getByText("Nova.md")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Enviar documento" }));
  expect(await screen.findByText(/Projeto arquivado/)).toBeInTheDocument();
  expect(screen.getByText("Nova.md")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Enviar documento" }));
  await screen.findByRole("table");
  expect(request).toHaveBeenCalledTimes(4);
});

it("não envia duas vezes ao clicar repetidamente durante o envio", async () => {
  let finish!: (response: Response) => void;
  const request = vi.fn()
    .mockImplementationOnce(() => listing([]))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", request);
  view();
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
  const request = vi.fn(() => listing([doc()]));
  vi.stubGlobal("fetch", request);
  view();

  fireEvent.click(await screen.findByRole("button", { name: "Remover Escopo.pdf" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("Remover “Escopo.pdf”?");
  fireEvent.click(within(dialog).getByText("Cancelar"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Escopo.pdf")).toBeInTheDocument();
});

it("remove após confirmação explícita, no escopo do projeto, e retira o documento da lista", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc(), doc({ id: "d-2", nome: "Outro.md", extensao: ".md" })]))
    .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", request);
  view();

  fireEvent.click(await screen.findByRole("button", { name: "Remover Escopo.pdf" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByText("Confirmar remoção"));

  await waitFor(() => expect(screen.queryByText("Escopo.pdf")).toBeNull());
  expect(screen.getByText("Outro.md")).toBeInTheDocument();
  expect(screen.getByText(/foi removido deste projeto/)).toBeInTheDocument();
  const [url, init] = request.mock.calls[1] as [string, RequestInit];
  expect(url).toBe("/api/v1/projects/p-1/documents/d-1");
  expect(init.method).toBe("DELETE");
});

it("falha na remoção mantém o documento e mostra o motivo; conflito de arquivamento é explicado", async () => {
  const request = vi.fn()
    .mockImplementationOnce(() => listing([doc()]))
    .mockImplementationOnce(() => json({ error: "Não foi possível remover o documento. Ele continua disponível; tente novamente." }, 500))
    .mockImplementationOnce(() => json({ error: "Projeto arquivado é somente leitura e não permite remover documentos." }, 409));
  vi.stubGlobal("fetch", request);
  view();

  fireEvent.click(await screen.findByRole("button", { name: "Remover Escopo.pdf" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByText("Confirmar remoção"));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("continua disponível");
  expect(screen.getByText("Escopo.pdf", { selector: "td" })).toBeInTheDocument();

  fireEvent.click(within(dialog).getByText("Confirmar remoção"));
  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent(/somente leitura|Projeto arquivado/));
  expect(screen.getByText("Escopo.pdf", { selector: "td" })).toBeInTheDocument();
});

it("modo incorporado usa cabeçalho de seção e não um segundo título de página", async () => {
  vi.stubGlobal("fetch", vi.fn(() => listing([])));
  view({ embedded: true });
  expect(await screen.findByRole("heading", { level: 2, name: "Documentos do projeto" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});
