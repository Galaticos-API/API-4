// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Projects as ProjectsPage } from "../projects/Projects";
import { parseBacklogRoute } from "./navigation";

const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const Projects = ({ pathname }: { pathname: string }) => <ProjectsPage pathname={pathname} canCreate />;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

const epic = {
  id: "epic-1", projeto_id: "project-1", titulo: "Especificar o backlog", descricao: null, objetivo: null,
  escopo_macro: null, resultado_esperado: null, prioridade: "Must", status: "rascunho", features_count: 0, criterios_count: 0,
};

it("reconhece as rotas aninhadas do backlog e rejeita caminhos fora do padrão", () => {
  expect(parseBacklogRoute("/projects/p1/epics/new")).toEqual({ screen: "epic-new", projectId: "p1" });
  expect(parseBacklogRoute("/projects/p1/epics/e1")).toEqual({ screen: "epic-detail", projectId: "p1", epicId: "e1" });
  expect(parseBacklogRoute("/projects/p1/epics/e1/features/new")).toEqual({ screen: "feature-new", projectId: "p1", epicId: "e1" });
  expect(parseBacklogRoute("/projects/p1/epics/e1/features/f1")).toEqual({ screen: "feature-detail", projectId: "p1", epicId: "e1", featureId: "f1" });
  expect(parseBacklogRoute("/projects/p1/epics/e1/features/f1/pbis/new")).toEqual({ screen: "pbi-new", projectId: "p1", epicId: "e1", featureId: "f1" });
  expect(parseBacklogRoute("/projects/p1/epics/e1/features/f1/pbis/b1")).toEqual({ screen: "pbi-detail", projectId: "p1", epicId: "e1", featureId: "f1", pbiId: "b1" });
  expect(parseBacklogRoute("/projects/p1")).toBeNull();
  expect(parseBacklogRoute("/projects")).toBeNull();
});

it("PBI-01.1.2 Cenário 1: cria épico e navega ao seu detalhe", async () => {
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/v1/epics" && init?.method === "POST") return response(epic, 201);
    throw new Error(`Requisição inesperada: ${url}`);
  });
  vi.stubGlobal("fetch", request);
  render(<Projects pathname="/projects/project-1/epics/new" />);

  fireEvent.change(screen.getByLabelText("Título (obrigatório)"), { target: { value: "Especificar o backlog" } });
  fireEvent.click(screen.getByText("Criar épico", { selector: "button" }));

  await waitFor(() => expect(window.location.pathname).toBe("/projects/project-1/epics/epic-1"));
  const body = JSON.parse(request.mock.calls[0][1]?.body as string);
  expect(body.projeto_id).toBe("project-1");
  expect(body.titulo).toBe("Especificar o backlog");
});

it("PBI-01.1.2 Cenário 3: mostra os campos faltantes quando a conclusão é recusada", async () => {
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `/api/v1/epics/${epic.id}` && init?.method === undefined) return response(epic);
    if (url === `/api/v1/epics/${epic.id}/complete` && init?.method === "PATCH") {
      return response({ error: "Não é possível concluir o épico.", code: "VALIDATION_ERROR", details: { campos_faltantes: ["escopo_macro", "criterios_aceitacao"] } }, 400);
    }
    if (url === `/api/v1/features?epico_id=${epic.id}&limit=100`) return response({ items: [], total: 0, limit: 100, offset: 0 });
    throw new Error(`Requisição inesperada: ${url}`);
  });
  vi.stubGlobal("fetch", request);
  render(<Projects pathname={`/projects/project-1/epics/${epic.id}`} />);

  await screen.findByText("Especificar o backlog");
  fireEvent.click(screen.getByText("Marcar como concluído"));

  await screen.findByText(/Escopo macro, Critérios de aceitação/);
});

it("PBI-01.1.3 Cenário 2: exibe o épico de origem ao abrir a feature", async () => {
  const feature = {
    id: "feature-1", epico_id: epic.id, titulo: "Estruturação dos itens", descricao: "d", objetivo: "o",
    prioridade: "Must", status: "rascunho", pbis_count: 0, criterios_count: 0, epico_titulo: "Especificar o backlog", projeto_id: "project-1",
  };
  const request = vi.fn(async (url: string) => {
    if (url === `/api/v1/features/${feature.id}`) return response(feature);
    if (url.startsWith("/api/v1/pbis?feature_id=")) return response({ items: [], total: 0, limit: 100, offset: 0 });
    throw new Error(`Requisição inesperada: ${url}`);
  });
  vi.stubGlobal("fetch", request);
  render(<Projects pathname={`/projects/project-1/epics/${epic.id}/features/${feature.id}`} />);

  expect(await screen.findByText("Épico: Especificar o backlog")).toBeTruthy();
  expect(screen.getByText("Estruturação dos itens")).toBeTruthy();
});

it("PBI-01.1.4 Cenário 2: apresenta os três blocos da história como campos distintos", async () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<Projects pathname="/projects/project-1/epics/epic-1/features/feature-1/pbis/new" />);

  expect(screen.getByLabelText("COMO UM (obrigatório)")).toBeTruthy();
  expect(screen.getByLabelText("EU QUERO (obrigatório)")).toBeTruthy();
  expect(screen.getByLabelText("PARA QUE (obrigatório)")).toBeTruthy();
});
