import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DevelopersView } from "./DevelopersView";
import { ApiError } from "../../api/api_auth";
import {
  createDeveloperProfile,
  getDeveloperProfile,
  listDevelopersOverview,
  listLinkableUsers,
  updateDeveloperProfile,
} from "../../api/api_developers";

vi.mock("../../api/api_developers", () => ({
  listDevelopersOverview: vi.fn(),
  listLinkableUsers: vi.fn(),
  getDeveloperProfile: vi.fn(),
  createDeveloperProfile: vi.fn(),
  updateDeveloperProfile: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/developers");
});

const baseOverview = {
  desenvolvedores: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      nome: "Dev Rafael Matesco",
      senioridade: "Senior",
      bio: "Engenheiro de Software com foco em Node.js e PostgreSQL.",
      usuario_id: "10000000-0000-4000-8000-000000000003",
      usuario_nome: "Dev Rafael Matesco",
      role: "dev" as const,
      competencias_count: 2,
      alocacoes_count: 1,
      created_at: "2026-09-10T12:00:00.000Z",
      updated_at: "2026-09-10T12:00:00.000Z",
    },
  ],
  tecnologias: [{ id: "tech-1", nome: "TypeScript", categoria: "backend" }],
  competencias: [],
};

it("S3-08 / PBI-05.1.1: cadastra perfil profissional e vincula usuário da plataforma", async () => {
  vi.mocked(listDevelopersOverview).mockResolvedValue(structuredClone(baseOverview));
  vi.mocked(listLinkableUsers).mockResolvedValue([
    {
      id: "10000000-0000-4000-8000-000000000004",
      nome: "Gabriel Lasaro",
      role: "dev",
      perfil_id: null,
    },
  ]);
  vi.mocked(createDeveloperProfile).mockResolvedValue({
    id: "30000000-0000-4000-8000-000000000002",
    nome: "Gabriel Lasaro",
    senioridade: "Pleno",
    bio: "Especialista em frontend React e acessibilidade.",
    usuario_id: "10000000-0000-4000-8000-000000000004",
    usuario_nome: "Gabriel Lasaro",
    role: "dev",
    competencias_count: 0,
    alocacoes_count: 0,
    created_at: "2026-11-17T12:00:00.000Z",
    updated_at: "2026-11-17T12:00:00.000Z",
  });

  render(<DevelopersView pathname="/developers" canManage={true} />);

  await screen.findByText("Dev Rafael Matesco");
  fireEvent.click(screen.getByRole("button", { name: "Novo perfil profissional" }));

  fireEvent.change(screen.getByLabelText("Vincular a usuário da plataforma (opcional)"), {
    target: { value: "10000000-0000-4000-8000-000000000004" },
  });
  fireEvent.change(screen.getByLabelText("Resumo profissional"), {
    target: { value: "Especialista em frontend React e acessibilidade." },
  });

  fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));

  await screen.findByText(/Perfil profissional de "Gabriel Lasaro" criado com sucesso/);
  expect(createDeveloperProfile).toHaveBeenCalledWith({
    nome: "Gabriel Lasaro",
    senioridade: "Pleno",
    bio: "Especialista em frontend React e acessibilidade.",
    usuario_id: "10000000-0000-4000-8000-000000000004",
  });
});

it("S3-08 / PBI-05.1.1 (Cenário 3): indica perfil existente ao tentar duplicar vínculo de usuário", async () => {
  vi.mocked(listDevelopersOverview).mockResolvedValue(structuredClone(baseOverview));
  vi.mocked(listLinkableUsers).mockResolvedValue([
    {
      id: "10000000-0000-4000-8000-000000000003",
      nome: "Dev Rafael Matesco",
      role: "dev",
      perfil_id: "30000000-0000-4000-8000-000000000001",
    },
  ]);

  vi.mocked(createDeveloperProfile).mockRejectedValue(
    new ApiError(409, {
      error: "Já existe um perfil profissional vinculado a este usuário.",
      code: "DEVELOPER_PROFILE_EXISTS",
      details: {
        existing_profile: {
          id: "30000000-0000-4000-8000-000000000001",
          nome: "Dev Rafael Matesco",
          senioridade: "Senior",
        },
      },
    }),
  );

  render(<DevelopersView pathname="/developers" canManage={true} />);
  await screen.findByText("Dev Rafael Matesco");

  fireEvent.click(screen.getByRole("button", { name: "Novo perfil profissional" }));
  fireEvent.change(screen.getByLabelText("Vincular a usuário da plataforma (opcional)"), {
    target: { value: "10000000-0000-4000-8000-000000000003" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro" }));

  await screen.findByText("Já existe um perfil profissional vinculado a este usuário.");
  const openExistingBtn = screen.getByRole("button", { name: "Abrir perfil existente" });
  expect(openExistingBtn).toBeInTheDocument();

  fireEvent.click(openExistingBtn);
  expect(window.location.pathname).toBe("/developers/30000000-0000-4000-8000-000000000001");
});

it("S3-08 / PBI-05.1.4: exibe perfil consolidado (competências, alocações, histórico) e navega para o projeto", async () => {
  vi.mocked(listDevelopersOverview).mockResolvedValue(structuredClone(baseOverview));
  vi.mocked(getDeveloperProfile).mockResolvedValue({
    id: "30000000-0000-4000-8000-000000000001",
    nome: "Dev Rafael Matesco",
    senioridade: "Senior",
    bio: "Engenheiro de Software com foco em Node.js e PostgreSQL.",
    usuario_id: "10000000-0000-4000-8000-000000000003",
    usuario_nome: "Dev Rafael Matesco",
    role: "dev",
    created_at: "2026-09-10T12:00:00.000Z",
    updated_at: "2026-09-10T12:00:00.000Z",
    competencias: [
      {
        id: "comp-1",
        desenvolvedor_id: "30000000-0000-4000-8000-000000000001",
        tecnologia_id: "tech-1",
        nivel: "especialista",
        evidencia: "Implementação da suíte de backend e barramento de eventos",
        tecnologia_nome: "TypeScript",
        tecnologia_categoria: "backend",
      },
    ],
    alocacoes: [
      {
        id: "aloc-1",
        desenvolvedor_id: "30000000-0000-4000-8000-000000000001",
        projeto_id: "40000000-0000-4000-8000-000000000001",
        projeto_nome: "Plataforma Sinapse",
        projeto_status: "ativo",
        papel: "Tech Lead Backend",
        data_inicio: "2026-09-01T00:00:00.000Z",
        data_fim: null,
        em_andamento: true,
      },
    ],
    historico_consolidado: [
      {
        projeto_id: "40000000-0000-4000-8000-000000000001",
        projeto_nome: "Plataforma Sinapse",
        projeto_descricao: "Memória institucional inteligente da fábrica de software.",
        projeto_status: "ativo",
        papeis: ["Tech Lead Backend"],
        primeira_alocacao: "2026-09-01T00:00:00.000Z",
        ultima_alocacao: null,
        em_andamento: true,
        tecnologias: [{ id: "tech-1", nome: "TypeScript", categoria: "backend" }],
      },
    ],
  });
  vi.mocked(updateDeveloperProfile).mockResolvedValue(baseOverview.desenvolvedores[0]);

  render(
    <DevelopersView
      pathname="/developers/30000000-0000-4000-8000-000000000001"
      canManage={false}
    />,
  );

  await screen.findByText(/Evidência: Implementação da suíte de backend/);
  expect(screen.getByText("Competências Técnicas (1)")).toBeInTheDocument();
  expect(screen.getByText("Alocações em Projetos (1)")).toBeInTheDocument();
  expect(screen.getByText("Histórico Consolidado de Atuação (1)")).toBeInTheDocument();

  // Cenário 2 do PBI-05.1.4: navegar para o projeto a partir da alocação
  fireEvent.click(screen.getByRole("button", { name: "Abrir projeto" }));
  expect(window.location.pathname).toBe("/projects/40000000-0000-4000-8000-000000000001");
});
