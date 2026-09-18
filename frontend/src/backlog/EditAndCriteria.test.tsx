// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Projects as ProjectsPage } from "../projects/Projects";

const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const Projects = ({ pathname }: { pathname: string }) => <ProjectsPage pathname={pathname} canCreate />;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

const epicoAtivo = {
  id: "epic-1", projeto_id: "project-1", titulo: "Especificar o backlog", descricao: "d", objetivo: "o",
  escopo_macro: "e", resultado_esperado: "r", prioridade: "Must", status: "rascunho", features_count: 0, criterios_count: 0,
  projeto_status: "ativo",
};

const epicoArquivado = { ...epicoAtivo, id: "epic-2", projeto_status: "arquivado" };

function mockFetchFor(pathname: string, handlers: Record<string, () => Promise<Response>>) {
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    if (handlers[key]) return handlers[key]();
    throw new Error(`Requisição inesperada: ${key}`);
  });
  vi.stubGlobal("fetch", request);
  render(<Projects pathname={pathname} />);
  return request;
}

it("PBI-01.1.5 Cenário 1: edita um épico e persiste a alteração", async () => {
  const atualizado = { ...epicoAtivo, titulo: "Novo título do épico" };
  mockFetchFor(`/projects/project-1/epics/${epicoAtivo.id}`, {
    "GET /api/v1/epics/epic-1": () => response(epicoAtivo),
    "GET /api/v1/features?epico_id=epic-1&limit=100": () => response({ items: [], total: 0, limit: 100, offset: 0 }),
    "GET /api/v1/criteria?entidade_tipo=epico&entidade_id=epic-1": () => response({ items: [] }),
    "PATCH /api/v1/epics/epic-1": () => response(atualizado),
  });

  await screen.findByText("Especificar o backlog");
  fireEvent.click(screen.getByText("Editar"));
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Novo título do épico" } });
  fireEvent.click(screen.getByText("Salvar alterações"));

  expect(await screen.findByText("Novo título do épico")).toBeTruthy();
});

it("PBI-01.1.5 Cenário 2: avisa sobre alterações não salvas ao tentar sair da edição", async () => {
  mockFetchFor(`/projects/project-1/epics/${epicoAtivo.id}`, {
    "GET /api/v1/epics/epic-1": () => response(epicoAtivo),
    "GET /api/v1/features?epico_id=epic-1&limit=100": () => response({ items: [], total: 0, limit: 100, offset: 0 }),
    "GET /api/v1/criteria?entidade_tipo=epico&entidade_id=epic-1": () => response({ items: [] }),
  });

  await screen.findByText("Especificar o backlog");
  fireEvent.click(screen.getByText("Editar"));
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Alterado sem salvar" } });

  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByText("Cancelar"));
  expect(confirmSpy).toHaveBeenCalled();
  expect(screen.getByLabelText("Título")).toBeTruthy();

  confirmSpy.mockReturnValue(true);
  fireEvent.click(screen.getByText("Cancelar"));
  expect(screen.queryByLabelText("Título")).toBeNull();
});

it("PBI-01.1.5 Cenário 3: apresenta somente leitura quando o projeto do épico está arquivado", async () => {
  mockFetchFor(`/projects/project-1/epics/${epicoArquivado.id}`, {
    "GET /api/v1/epics/epic-2": () => response(epicoArquivado),
    "GET /api/v1/features?epico_id=epic-2&limit=100": () => response({ items: [], total: 0, limit: 100, offset: 0 }),
    "GET /api/v1/criteria?entidade_tipo=epico&entidade_id=epic-2": () => response({ items: [] }),
  });

  await screen.findByText("Especificar o backlog");
  expect(screen.getByText(/disponível apenas para leitura/)).toBeTruthy();
  expect(screen.queryByText("Editar")).toBeNull();
  expect(screen.queryByText("Marcar como concluído")).toBeNull();
});

it("PBI-01.2.1: adiciona e remove um critério de texto do épico", async () => {
  let criterios: unknown[] = [];
  const criterioCriado = { id: "criterio-1", entidade_tipo: "epico", entidade_id: "epic-1", texto: "Critério novo", nome: null, dado: null, quando: null, entao: null, ordem: 1 };

  const request = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url === "/api/v1/epics/epic-1") return response(epicoAtivo);
    if (method === "GET" && url === "/api/v1/features?epico_id=epic-1&limit=100") return response({ items: [], total: 0, limit: 100, offset: 0 });
    if (method === "GET" && url === "/api/v1/criteria?entidade_tipo=epico&entidade_id=epic-1") return response({ items: criterios });
    if (method === "POST" && url === "/api/v1/criteria") { criterios = [criterioCriado]; return response(criterioCriado, 201); }
    if (method === "DELETE" && url === "/api/v1/criteria/criterio-1") { criterios = []; return response(criterioCriado); }
    throw new Error(`Requisição inesperada: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", request);
  render(<Projects pathname={`/projects/project-1/epics/${epicoAtivo.id}`} />);

  await screen.findByText("Especificar o backlog");
  fireEvent.click(screen.getByText("Novo critério"));
  fireEvent.change(screen.getByLabelText("Texto do critério"), { target: { value: "Critério novo" } });
  fireEvent.click(screen.getByText("Adicionar"));

  await screen.findByText("Critério novo");

  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByText("Remover"));
  await waitFor(() => expect(screen.queryByText("Critério novo")).toBeNull());
  expect(confirmSpy).toHaveBeenCalled();
});

it("PBI-01.2.4: reordena cenários de um PBI com botões acessíveis por teclado", async () => {
  const cenarioA = { id: "cenario-a", entidade_tipo: "pbi", entidade_id: "pbi-1", texto: null, nome: "Primeiro", dado: "d", quando: "q", entao: "e", ordem: 1 };
  const cenarioB = { id: "cenario-b", entidade_tipo: "pbi", entidade_id: "pbi-1", texto: null, nome: "Segundo", dado: "d", quando: "q", entao: "e", ordem: 2 };
  const pbi = {
    id: "pbi-1", feature_id: "feature-1", codigo: "PBI-001", titulo: "Cadastrar item",
    historia_como_um: "PO", historia_eu_quero: "algo", historia_para_que: "algo", status: "rascunho",
    criterios_count: 2, feature_titulo: "Feature base", epico_id: "epic-1", epico_titulo: "Épico base", projeto_id: "project-1",
    projeto_status: "ativo",
  };

  const request = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url === "/api/v1/pbis/pbi-1") return response(pbi);
    if (method === "GET" && url === "/api/v1/criteria?entidade_tipo=pbi&entidade_id=pbi-1") return response({ items: [cenarioA, cenarioB] });
    if (method === "GET" && url === "/api/v1/criteria?entidade_tipo=feature&entidade_id=feature-1") return response({ items: [] });
    if (method === "PATCH" && url === "/api/v1/criteria/cenario-b/move") {
      return response({ items: [{ ...cenarioB, ordem: 1 }, { ...cenarioA, ordem: 2 }] });
    }
    throw new Error(`Requisição inesperada: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", request);
  render(<Projects pathname="/projects/project-1/epics/epic-1/features/feature-1/pbis/pbi-1" />);

  await screen.findByText("Primeiro");
  const botoesSubir = screen.getAllByText("▲ Mover para cima");
  fireEvent.click(botoesSubir[1]);

  await waitFor(() => {
    const nomes = screen.getAllByRole("heading", { level: 4 }).map((el) => el.textContent);
    expect(nomes.indexOf("Segundo")).toBeLessThan(nomes.indexOf("Primeiro"));
  });
});
