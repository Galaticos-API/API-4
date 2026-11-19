import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { filenameFromDisposition } from "../../api/api_backlog";
import { ExportMarkdownButton } from "./ExportMarkdownButton";
import { EpicDetail } from "./EpicsView";
import { FeatureDetail } from "./FeaturesView";

const createObjectURL = vi.fn(() => "blob:export");
const revokeObjectURL = vi.fn();
let downloads: string[] = [];
let blobs: Blob[] = [];

beforeEach(() => {
  downloads = [];
  blobs = [];
  createObjectURL.mockImplementation(((blob: Blob) => { blobs.push(blob); return "blob:export"; }) as never);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const markdown = (filename: string, body = "# EP-01 Exportado\n") => new Response(body, {
  status: 200,
  headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}` },
});

test("lê o nome do arquivo do Content-Disposition, com e sem filename*", () => {
  expect(filenameFromDisposition(`attachment; filename="EP-01-a.md"; filename*=UTF-8''EP-01-%C3%A1.md`, "x.md")).toBe("EP-01-á.md");
  expect(filenameFromDisposition(`attachment; filename="FT-01.2-b.md"`, "x.md")).toBe("FT-01.2-b.md");
  expect(filenameFromDisposition(null, "x.md")).toBe("x.md");
});

test("exportar épico chama a rota do épico e baixa o arquivo devolvido", async () => {
  const fetchMock = vi.fn(async () => markdown("EP-01-especificar.md"));
  vi.stubGlobal("fetch", fetchMock);
  render(<ExportMarkdownButton kind="epics" id="epic-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Exportar Markdown" }));
  await waitFor(() => expect(downloads).toEqual(["EP-01-especificar.md"]));
  expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/v1/epics/epic-1/export/markdown");
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blobs[0]!);
  });
  expect(text).toBe("# EP-01 Exportado\n");
  expect(blobs[0]!.type).toBe("text/markdown;charset=utf-8");
});

test("exportar feature usa a rota da feature e mostra o erro do servidor", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Itens arquivados não podem ser exportados." }), { status: 409 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ExportMarkdownButton kind="features" id="feature-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Exportar Markdown" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Itens arquivados não podem ser exportados.");
  expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/v1/features/feature-1/export/markdown");
  expect(downloads).toEqual([]);
});

const epicBody = (status: string) => ({
  id: "epic-1", projeto_id: "project", titulo: "Épico", descricao: "d", objetivo: "o", escopo_macro: "e", resultado_esperado: "r",
  prioridade: "Must", status, features_count: 0, criterios_count: 0, projeto_status: "ativo", archived_at: null,
});
const featureBody = (status: string) => ({
  id: "feature-1", epico_id: "epic-1", titulo: "Feature", descricao: "d", objetivo: "o", prioridade: "Must", status,
  pbis_count: 0, criterios_count: 0, epico_titulo: "Épico", projeto_id: "project", projeto_status: "ativo", archived_at: null,
});

function stubDetail(body: unknown, path: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const pathname = new URL(url, "http://localhost").pathname;
    if (pathname === path) return new Response(JSON.stringify(body), { status: 200 });
    return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 });
  }));
}

for (const [kind, status, visible] of [["épico", "rascunho", true], ["épico", "arquivado", false], ["feature", "concluido", true], ["feature", "arquivado", false]] as const) {
  test(`tela de ${kind} ${status} ${visible ? "mostra" : "esconde"} o botão Exportar Markdown`, async () => {
    if (kind === "épico") {
      stubDetail(epicBody(status), "/api/v1/epics/epic-1");
      render(<EpicDetail projectId="project" epicId="epic-1" canEdit={false} />);
      await screen.findByRole("heading", { name: /Épico/ });
    } else {
      stubDetail(featureBody(status), "/api/v1/features/feature-1");
      render(<FeatureDetail projectId="project" epicoId="epic-1" featureId="feature-1" canEdit={false} />);
      await screen.findByRole("heading", { name: /Feature/ });
    }
    expect(screen.queryByRole("button", { name: "Exportar Markdown" }) !== null).toBe(visible);
  });
}
