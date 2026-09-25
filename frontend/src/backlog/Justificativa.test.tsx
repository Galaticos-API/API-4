// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ItemHistoryView } from "../views/backlog/ItemHistoryView";
import { EpicDetail } from "../views/backlog/EpicsView";
import { FeatureDetail } from "../views/backlog/FeaturesView";
import { CriteriaEditor } from "../views/backlog/CriteriaView";

const epicConcluido = {
  id: "epic-c1",
  projeto_id: "project-1",
  titulo: "Épico Concluído",
  descricao: "Descrição",
  objetivo: "Objetivo",
  escopo_macro: "Escopo",
  resultado_esperado: "Resultado",
  status: "concluido" as const,
  prioridade: "Must" as const,
  features_count: 0,
  criterios_count: 1,
  projeto_status: "ativo",
  archived_at: null,
};

const featureConcluida = {
  id: "feat-c1",
  epico_id: "epic-c1",
  projeto_id: "project-1",
  epico_titulo: "Épico Concluído",
  titulo: "Feature Concluída",
  descricao: "Descrição",
  objetivo: "Objetivo",
  status: "concluido" as const,
  prioridade: "Must" as const,
  pbis_count: 0,
  criterios_count: 1,
  projeto_status: "ativo",
  archived_at: null,
};

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url.includes("/history")) {
      return reply({
        items: [
          {
            id: "hist-1",
            usuario_id: "user-1",
            usuario_nome: "Maria PO",
            entidade_tipo: "epico",
            entidade_id: "epic-c1",
            acao: "ATUALIZAR_EPICO",
            justificativa: "Ajuste na regra de negócio solicitado pelo cliente",
            dados_json: {
              alteracoes: { titulo: "Título atualizado" },
              anterior: { titulo: "Título anterior" },
              novo: { titulo: "Título atualizado" },
            },
            created_at: new Date().toISOString(),
          },
        ],
      });
    }
    if (url.includes("/criteria")) return reply({ items: [] });
    if (url.includes("/quality")) return reply({ checks: {}, vague_terms: [], exigir_justificativa_item_concluido: true });
    if (url.includes("/epics/epic-c1")) return reply(epicConcluido);
    if (url.includes("/features/feat-c1")) return reply(featureConcluida);
    return reply({});
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("ItemHistoryView renderiza histórico com autor, data e justificativa", async () => {
  render(<ItemHistoryView entidadeTipo="epico" entidadeId="epic-c1" />);
  expect(await screen.findByText("Maria PO")).toBeTruthy();
  expect(screen.getByText(/Ajuste na regra de negócio/i)).toBeTruthy();
  expect(screen.getByText(/Título anterior → Título atualizado/)).toBeTruthy();
});

it("ItemHistoryView diferencia falha de histórico vazio e permite tentar novamente", async () => {
  const request = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(reply({ items: [
      {
        id: "hist-retry",
        usuario_id: "user-1",
        usuario_nome: "Maria PO",
        entidade_tipo: "epico",
        entidade_id: "epic-c1",
        acao: "ATUALIZAR_EPICO",
        justificativa: "Correção após retry",
        dados_json: {},
        created_at: new Date().toISOString(),
      },
    ] }));
  vi.stubGlobal("fetch", request);

  render(<ItemHistoryView entidadeTipo="epico" entidadeId="epic-c1" />);
  expect(await screen.findByText(/Não foi possível carregar o histórico/)).toBeTruthy();
  expect(screen.queryByText(/Nenhum registro de alteração/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Maria PO")).toBeTruthy();
  expect(screen.queryByText(/Nenhum registro de alteração/)).toBeNull();
});

it("ItemHistoryView carrega páginas seguintes sem duplicar eventos", async () => {
  const first = {
    id: "hist-page-1", usuario_id: null, usuario_nome: "Ana", entidade_tipo: "epico",
    entidade_id: "epic-c1", acao: "ATUALIZAR_EPICO", justificativa: null,
    dados_json: {}, created_at: new Date().toISOString(),
  };
  const second = { ...first, id: "hist-page-2", usuario_nome: "Bruno" };
  const request = vi.fn((url: string) => url.includes("cursor=")
    ? reply({ items: [first, second], next_cursor: null })
    : reply({ items: [first], next_cursor: "cursor-next" }));
  vi.stubGlobal("fetch", request);

  render(<ItemHistoryView entidadeTipo="epico" entidadeId="epic-c1" />);
  expect(await screen.findByText("Ana")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Carregar mais registros" }));
  expect(await screen.findByText("Bruno")).toBeTruthy();
  expect(screen.getAllByText("Ana")).toHaveLength(1);
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining("cursor=cursor-next"),
    expect.any(Object),
  );
});

it("EpicDetail exige justificativa ao alterar épico concluído", async () => {
  render(<EpicDetail projectId="project-1" epicId="epic-c1" canEdit={true} />);

  const editBtn = await screen.findByText("Editar");
  fireEvent.click(editBtn);

  expect(screen.getByLabelText(/Justificativa da alteração/i)).toBeTruthy();

  const saveBtn = screen.getByText("Salvar alterações");
  fireEvent.click(saveBtn);

  expect(await screen.findByText("A justificativa é obrigatória ao alterar um item concluído.")).toBeTruthy();
});

it("FeatureDetail exige justificativa ao alterar feature concluída", async () => {
  render(<FeatureDetail projectId="project-1" epicoId="epic-c1" featureId="feat-c1" canEdit={true} />);

  const editBtn = await screen.findByText("Editar");
  fireEvent.click(editBtn);

  expect(screen.getByLabelText(/Justificativa da alteração/i)).toBeTruthy();

  const saveBtn = screen.getByText("Salvar alterações");
  fireEvent.click(saveBtn);

  expect(await screen.findByText("A justificativa é obrigatória ao alterar um item concluído.")).toBeTruthy();
});

it("EpicDetail respeita política organizacional que desativa justificativa", async () => {
  const request = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/quality")) {
      return reply({
        rule_version: "pbi-quality-v4",
        checks: {
          titulo_infinitivo: true,
          historia_completa: true,
          cenario_estruturado: true,
          termos_vagos: true,
          prototipo_vinculado: true,
        },
        vague_terms: [],
        exigir_justificativa_item_concluido: false,
      });
    }
    if (url.includes("/epics/epic-c1") && init?.method === "PATCH") {
      return reply({ ...epicConcluido, titulo: "Épico editado" });
    }
    if (url.includes("/epics/epic-c1")) return reply(epicConcluido);
    if (url.includes("/criteria")) return reply({ items: [] });
    if (url.includes("/history")) return reply({ items: [], next_cursor: null });
    return reply({});
  });
  vi.stubGlobal("fetch", request);

  render(<EpicDetail projectId="project-1" epicId="epic-c1" canEdit />);
  fireEvent.click(await screen.findByText("Editar"));
  await waitFor(() => expect(screen.queryByLabelText(/Justificativa da alteração/)).toBeNull());
  fireEvent.click(screen.getByText("Salvar alterações"));
  await waitFor(() => expect(request).toHaveBeenCalledWith(
    expect.stringContaining("/epics/epic-c1"),
    expect.objectContaining({ method: "PATCH" }),
  ));
  const updateCall = request.mock.calls.find(([url, init]) => url.includes("/epics/epic-c1") && init?.method === "PATCH");
  expect(JSON.parse(String(updateCall?.[1]?.body))).not.toHaveProperty("justificativa");
});

it("Critérios de item concluído exigem e enviam justificativa ao criar", async () => {
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return reply({
        id: "criterion-1",
        entidade_tipo: "epico",
        entidade_id: "epic-c1",
        texto: "Cenário aceito",
        nome: null,
        dado: null,
        quando: null,
        entao: null,
        ordem: 1,
      }, 201);
    }
    return reply({ items: [] });
  });
  vi.stubGlobal("fetch", request);

  render(
    <CriteriaEditor
      entidadeTipo="epico"
      entidadeId="epic-c1"
      canEdit
      titulo="Critérios do épico"
      itemConcluido
      justificativaObrigatoria
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Novo critério" }));
  fireEvent.change(screen.getByLabelText("Texto do critério"), { target: { value: "Novo critério" } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(await screen.findByText(/A justificativa é obrigatória para alterar critérios/)).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);

  fireEvent.change(screen.getByLabelText(/Justificativa para alterar critérios/), { target: { value: "Mudança aprovada pelo PO" } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({
    justificativa: "Mudança aprovada pelo PO",
  });
});
