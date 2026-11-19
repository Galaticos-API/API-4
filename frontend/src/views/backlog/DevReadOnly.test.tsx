import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EpicDetail } from "./EpicsView";
import { canEditWorkItems } from "../../models/permissions";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const epic = {
  id: "epic-1", projeto_id: "project-1", titulo: "Gerenciar acesso", descricao: "Controle de perfis",
  objetivo: "Permitir governança", escopo_macro: "Perfis", resultado_esperado: "Acesso correto",
  prioridade: "Should", status: "rascunho", tecnologias: [], tecnologias_ids: [],
  created_at: "2026-09-01T12:00:00.000Z", updated_at: "2026-09-01T12:00:00.000Z",
};

function stubApi() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = new URL(url, "http://localhost").pathname;
    const body = path === "/api/v1/epics/epic-1" ? epic : { items: [], total: 0, limit: 50, offset: 0 };
    return new Response(JSON.stringify(body), { status: 200 });
  }));
}

it("S3-13 / PBI-06.2.1 cenário 2: somente admin e PO editam itens de trabalho", () => {
  expect(canEditWorkItems("admin")).toBe(true);
  expect(canEditWorkItems("po")).toBe(true);
  expect(canEditWorkItems("dev")).toBe(false);
  expect(canEditWorkItems(undefined)).toBe(false);
});

it("S3-13 / PBI-06.2.1 cenário 2: desenvolvedor visualiza o épico sem controles de edição", async () => {
  stubApi();
  render(<EpicDetail projectId="project-1" epicId="epic-1" canEdit={canEditWorkItems("dev")} />);
  expect(await screen.findByRole("heading", { name: /Gerenciar acesso/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Marcar como concluído" })).toBeNull();
});

it("S3-13: o mesmo épico exibe edição para PO, garantindo que o teste de leitura não é vazio", async () => {
  stubApi();
  render(<EpicDetail projectId="project-1" epicId="epic-1" canEdit={canEditWorkItems("po")} />);
  expect(await screen.findByRole("button", { name: "Editar" })).toBeInTheDocument();
});
