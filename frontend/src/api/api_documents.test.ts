// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "./api_auth";
import {
  describeRemovalError,
  describeUploadError,
  fileExtension,
  formatBytes,
  listDocuments,
  removeDocument,
  uploadDocument,
  validateSelection,
} from "./api_documents";

const limits = { max_bytes: 1024 * 1024, extensoes_permitidas: [".pdf", ".docx", ".md", ".txt"] };
const document = {
  id: "d-1", projeto_id: "p-1", nome: "Escopo.pdf", extensao: ".pdf", mime: "application/pdf", tamanho_bytes: 2048,
  status_processamento: "pendente", autor_id: "u-1", autor_nome: "Ana", created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

it("lista documentos do projeto e valida o contrato", async () => {
  const request = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify({ items: [document], limites: limits })));
  vi.stubGlobal("fetch", request);
  const result = await listDocuments("p-1");
  expect(request.mock.calls[0][0]).toBe("/api/v1/projects/p-1/documents");
  expect(result.items[0].nome).toBe("Escopo.pdf");
  expect(result.limites.max_bytes).toBe(limits.max_bytes);
});

it("recusa respostas fora do contrato", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "x" }], limites: limits }))));
  await expect(listDocuments("p-1")).rejects.toThrow("Resposta de documento inválida");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }))));
  await expect(listDocuments("p-1")).rejects.toThrow("Limites de envio inválidos");
});

it("envia o arquivo como corpo binário com o nome codificado e sem depender do MIME do cliente", async () => {
  const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(document), { status: 201 }));
  vi.stubGlobal("fetch", request);
  const file = new File(["conteudo"], "Especificação final.pdf", { type: "text/plain" });
  await uploadDocument("p-1", file);
  const [url, init] = request.mock.calls[0];
  expect(url).toBe("/api/v1/projects/p-1/documents");
  expect(init?.method).toBe("POST");
  expect(init?.body).toBe(file);
  const headers = init?.headers as Record<string, string>;
  expect(headers["Content-Type"]).toBe("application/octet-stream");
  expect(decodeURIComponent(headers["X-File-Name"])).toBe("Especificação final.pdf");
});

it("remove com DELETE no documento do projeto", async () => {
  const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", request);
  await removeDocument("p-1", "d-1");
  expect(request.mock.calls[0][0]).toBe("/api/v1/projects/p-1/documents/d-1");
  expect(request.mock.calls[0][1]?.method).toBe("DELETE");
});

it("valida a seleção com os limites informados pelo backend", () => {
  expect(validateSelection(new File(["a"], "ok.md"), limits)).toBeNull();
  expect(validateSelection(new File(["a"], "app.exe"), limits)).toMatch(/Formato não suportado/);
  expect(validateSelection(new File([], "vazio.txt"), limits)).toBe("O arquivo está vazio.");
  expect(validateSelection(new File([new Uint8Array(limits.max_bytes + 1)], "grande.txt"), limits)).toMatch(/excede o limite de 1,0 MB/);
});

it("formata tamanhos e extensões", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(2048)).toBe("2,0 KB");
  expect(formatBytes(5 * 1024 * 1024)).toBe("5,0 MB");
  expect(fileExtension("Arquivo.Final.PDF")).toBe(".pdf");
  expect(fileExtension("semextensao")).toBe("");
});

it("traduz erros de envio e remoção em mensagens humanas", () => {
  expect(describeUploadError(new ApiError(413, { error: "O arquivo excede o limite de 20 MB." }))).toBe("O arquivo excede o limite de 20 MB.");
  expect(describeUploadError(new ApiError(403))).toMatch(/perfil não permite/);
  expect(describeUploadError(new ApiError(401))).toMatch(/sessão expirou/);
  expect(describeUploadError(new TypeError("Failed to fetch"))).toMatch(/seleção foi mantida/);
  expect(describeRemovalError(new ApiError(500, { error: "Não foi possível remover o documento. Ele continua disponível; tente novamente." }))).toMatch(/continua disponível/);
  expect(describeRemovalError(new Error("x"))).toMatch(/continua disponível/);
});
