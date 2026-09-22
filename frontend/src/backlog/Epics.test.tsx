import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EpicDetail, EpicForm, EpicList } from "./Epics";
import { FeatureList } from "./Features";

const epic = { id: "epic-1", projeto_id: "project-1", titulo: "Organizar requisitos", status: "rascunho",
  descricao: "d", objetivo: "o", escopo_macro: "e", resultado_esperado: "r", criterios_count: 1 };
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lista canônica mostra carregamento e vazio", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response({ items: [], total: 0 })));
  render(<EpicList projetoId="project-1" canCreate />);
  expect(screen.getByRole("status")).toHaveTextContent("Carregando épicos");
  await screen.findByText("Nenhum épico cadastrado");
});

it("lista canônica permite recuperar erro de rede", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementation(() => response({ items: [epic], total: 1 }));
  vi.stubGlobal("fetch", request);
  render(<EpicList projetoId="project-1" canCreate />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Tentar novamente"));
  await screen.findByText(epic.titulo);
});

it("formulário recusa título vazio antes da chamada", () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  render(<EpicForm projetoId="project-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Criar épico" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Informe o título");
  expect(request).not.toHaveBeenCalled();
});

it("detalhe canônico conclui quando a API aceita os campos e critérios", async () => {
  vi.stubGlobal("fetch", vi.fn((_url, init) => response(init?.method === "PATCH" ? { ...epic, status: "concluido" } : epic)));
  render(<EpicDetail projectId="project-1" epicId={epic.id} canEdit />);
  fireEvent.click(await screen.findByText("Marcar como concluído"));
  await screen.findByText("concluido");
  expect(screen.queryByText("Marcar como concluído")).toBeNull();
});

it("perfil de leitura não vê criação nem conclusão", async () => {
  vi.stubGlobal("fetch", vi.fn((url) => response(String(url).includes("?") ? { items: [epic], total: 1 } : epic)));
  render(<><EpicList projetoId="project-1" canCreate={false} /><EpicDetail projectId="project-1" epicId={epic.id} canEdit={false} /></>);
  await screen.findByText("Critérios de aceitação registrados");
  expect(screen.queryByText("Novo épico")).toBeNull();
  expect(screen.queryByText("Marcar como concluído")).toBeNull();
});

it("estado legado permanece visível sem ação de conclusão", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response({ ...epic, status: "arquivado" })));
  render(<EpicDetail projectId="project-1" epicId={epic.id} canEdit />);
  await screen.findByText("arquivado");
  expect(screen.queryByText("Marcar como concluído")).toBeNull();
});

it.each(["ativo", "arquivado"])("épico %s aplica permissões também aos critérios e filhos", async (status) => {
  vi.stubGlobal("fetch", vi.fn((url) => response(String(url).includes("?") ? { items: [], total: 0 } : { ...epic, status })));
  render(<EpicDetail projectId="project-1" epicId={epic.id} canEdit>
    <FeatureList projectId="project-1" epicoId={epic.id} canCreate />
  </EpicDetail>);
  await screen.findByText("Nenhuma feature cadastrada");
  for (const label of ["Editar", "Marcar como concluído", "Arquivar item", "Nova feature"]) {
    if (status === "ativo") expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    else expect(screen.queryByRole("button", { name: label })).toBeNull();
  }
  if (status === "ativo") {
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument();
  }
});
