// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ItemHistoryView } from "../views/backlog/ItemHistoryView";
import { EpicDetail } from "../views/backlog/EpicsView";
import { FeatureDetail } from "../views/backlog/FeaturesView";

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
            dados_json: {},
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
