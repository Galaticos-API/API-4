import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PbiRelationsPanel } from "./PbiRelationsPanel";
import * as apiBacklog from "../../api/api_backlog";
import * as apiBacklogTree from "../../api/api_backlog_tree";

const mockRelations: apiBacklog.PbiRelation[] = [
  {
    id: "rel-1",
    pbi_id: "pbi-source",
    relacionado_id: "pbi-target-1",
    codigo: "PBI-01.1",
    titulo: "Login com OAuth",
    status: "concluido",
    tipo: "Funcional",
    prioridade: "Must",
    tipo_relacao: "depende_de",
    direcao: "saida",
    rotulo: "Depende de",
    created_at: "2026-10-21T10:00:00.000Z",
  },
  {
    id: "rel-2",
    pbi_id: "pbi-source",
    relacionado_id: "pbi-target-2",
    codigo: "PBI-02.1",
    titulo: "Autenticação em 2 Fatores",
    status: "rascunho",
    tipo: "Funcional",
    prioridade: "Should",
    tipo_relacao: "depende_de",
    direcao: "entrada",
    rotulo: "É dependência de",
    created_at: "2026-10-21T10:05:00.000Z",
  },
];

const mockTree: apiBacklogTree.ProjectBacklogTree = {
  project: { id: "proj-1", nome: "Projeto Sinapse", status: "ativo" },
  technologies: [],
  epics: [
    {
      id: "epic-1",
      titulo: "Autenticação",
      status: "ativo",
      tecnologias: [],
      features: [
        {
          id: "feat-1",
          titulo: "Login",
          status: "ativo",
          tecnologias: [],
          pbis: [
            { id: "pbi-source", codigo: "PBI-00.1", titulo: "PBI Atual", status: "rascunho", tecnologias: [] },
            { id: "pbi-target-1", codigo: "PBI-01.1", titulo: "Login com OAuth", status: "concluido", tecnologias: [] },
            { id: "pbi-target-3", codigo: "PBI-03.1", titulo: "Recuperação de Senha", status: "rascunho", tecnologias: [] },
          ],
        },
      ],
    },
  ],
};

describe("PbiRelationsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renderiza lista vazia quando não há relações", async () => {
    vi.spyOn(apiBacklog, "getPbiRelations").mockResolvedValue([]);
    vi.spyOn(apiBacklogTree, "getProjectBacklogTree").mockResolvedValue(mockTree);

    render(
      <PbiRelationsPanel
        pbiId="pbi-source"
        projectId="proj-1"
        canEdit={true}
        readOnly={false}
      />
    );

    expect(await screen.findByText("Nenhuma relação registrada")).toBeInTheDocument();
  });

  it("renderiza relações existentes com rótulos e badges corretos", async () => {
    vi.spyOn(apiBacklog, "getPbiRelations").mockResolvedValue(mockRelations);
    vi.spyOn(apiBacklogTree, "getProjectBacklogTree").mockResolvedValue(mockTree);

    render(
      <PbiRelationsPanel
        pbiId="pbi-source"
        projectId="proj-1"
        canEdit={true}
        readOnly={false}
      />
    );

    expect(await screen.findByText("Depende de")).toBeInTheDocument();
    expect(screen.getByText("É dependência de")).toBeInTheDocument();
    expect(screen.getByText("Login com OAuth")).toBeInTheDocument();
    expect(screen.getByText("Autenticação em 2 Fatores")).toBeInTheDocument();
  });

  it("filtra o PBI atual dos candidatos no dropdown", async () => {
    vi.spyOn(apiBacklog, "getPbiRelations").mockResolvedValue([]);
    vi.spyOn(apiBacklogTree, "getProjectBacklogTree").mockResolvedValue(mockTree);

    render(
      <PbiRelationsPanel
        pbiId="pbi-source"
        projectId="proj-1"
        canEdit={true}
        readOnly={false}
      />
    );

    await screen.findByLabelText("PBI Relacionado");
    const options = screen.getAllByRole("option");
    const optionTexts = options.map((opt) => opt.textContent);

    expect(optionTexts).toContain("[PBI-01.1] Login com OAuth");
    expect(optionTexts).toContain("[PBI-03.1] Recuperação de Senha");
    expect(optionTexts).not.toContain("[PBI-00.1] PBI Atual");
  });

  it("cria uma nova relação com sucesso", async () => {
    vi.spyOn(apiBacklog, "getPbiRelations").mockResolvedValueOnce([]).mockResolvedValueOnce([mockRelations[0]]);
    vi.spyOn(apiBacklogTree, "getProjectBacklogTree").mockResolvedValue(mockTree);
    const createSpy = vi.spyOn(apiBacklog, "createPbiRelation").mockResolvedValue(mockRelations[0]);

    render(
      <PbiRelationsPanel
        pbiId="pbi-source"
        projectId="proj-1"
        canEdit={true}
        readOnly={false}
      />
    );

    await screen.findByLabelText("PBI Relacionado");
    fireEvent.change(screen.getByLabelText("PBI Relacionado"), {
      target: { value: "pbi-target-1" },
    });

    const submitBtn = screen.getByRole("button", { name: "Adicionar relação" });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith("pbi-source", "pbi-target-1", "depende_de");
    });
    expect(await screen.findByText("Relação criada com sucesso.")).toBeInTheDocument();
  });

  it("exibe alerta quando backend rejeita por ciclo de dependência", async () => {
    vi.spyOn(apiBacklog, "getPbiRelations").mockResolvedValue([]);
    vi.spyOn(apiBacklogTree, "getProjectBacklogTree").mockResolvedValue(mockTree);
    vi.spyOn(apiBacklog, "createPbiRelation").mockRejectedValue(
      new Error("Ciclo de dependência detectado: o item de destino já depende direta ou indiretamente deste PBI.")
    );

    render(
      <PbiRelationsPanel
        pbiId="pbi-source"
        projectId="proj-1"
        canEdit={true}
        readOnly={false}
      />
    );

    await screen.findByLabelText("PBI Relacionado");
    fireEvent.change(screen.getByLabelText("PBI Relacionado"), {
      target: { value: "pbi-target-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Adicionar relação" }));

    expect(
      await screen.findByText(/Ciclo de dependência detectado/)
    ).toBeInTheDocument();
  });

  it("remove uma relação com sucesso", async () => {
    vi.spyOn(apiBacklog, "getPbiRelations").mockResolvedValueOnce([mockRelations[0]]).mockResolvedValueOnce([]);
    vi.spyOn(apiBacklogTree, "getProjectBacklogTree").mockResolvedValue(mockTree);
    const deleteSpy = vi.spyOn(apiBacklog, "deletePbiRelation").mockResolvedValue();

    render(
      <PbiRelationsPanel
        pbiId="pbi-source"
        projectId="proj-1"
        canEdit={true}
        readOnly={false}
      />
    );

    const deleteBtn = await screen.findByRole("button", { name: /Remover relação com PBI-01.1/ });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith("pbi-source", "rel-1");
    });
    expect(await screen.findByText("Relação removida com sucesso.")).toBeInTheDocument();
  });

  it("bloqueia edição e exibe aviso em modo somente leitura", async () => {
    vi.spyOn(apiBacklog, "getPbiRelations").mockResolvedValue(mockRelations);
    vi.spyOn(apiBacklogTree, "getProjectBacklogTree").mockResolvedValue(mockTree);

    render(
      <PbiRelationsPanel
        pbiId="pbi-source"
        projectId="proj-1"
        canEdit={false}
        readOnly={true}
      />
    );

    expect(
      await screen.findByText(/Item ou projeto arquivado: as relações estão disponíveis apenas para consulta/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar relação" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remover/ })).toBeNull();
  });
});
