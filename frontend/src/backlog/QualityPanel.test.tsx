// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { PbiDetail, PbiForm } from "./Pbis";

const response = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status }),
  );

const allChecks = {
  titulo_infinitivo: true,
  historia_completa: true,
  cenario_estruturado: true,
  termos_vagos: true,
  prototipo_vinculado: true,
};

const configuration = {
  rule_version: "test-v1",
  checks: allChecks,
  vague_terms: ["rápido"],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

it("reflete somente as verificações ativas na configuração da organização", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (
        url ===
        "/api/v1/quality/configuration/pbi"
      ) {
        return response({
          ...configuration,
          checks: {
            ...allChecks,
            historia_completa: false,
            cenario_estruturado: false,
            termos_vagos: false,
          },
        });
      }

      throw new Error(
        `Requisição inesperada: ${url}`,
      );
    }),
  );

  render(
    <PbiForm
      projectId="project-1"
      epicoId="epic-1"
      featureId="feature-1"
    />,
  );

  await screen.findByRole("heading", {
    name: "Checklist de qualidade em tempo real",
  });

  expect(
    screen.getByTestId(
      "quality-check-titulo_infinitivo",
    ),
  ).toBeTruthy();

  expect(
    screen.queryByTestId(
      "quality-check-historia_completa",
    ),
  ).toBeNull();

  expect(
    screen.queryByTestId(
      "quality-check-cenario_estruturado",
    ),
  ).toBeNull();

  expect(
    screen.queryByTestId(
      "quality-check-termos_vagos",
    ),
  ).toBeNull();
});

it("atualiza enquanto o usuário digita e navega para os campos reais", async () => {
  Object.defineProperty(
    Element.prototype,
    "scrollIntoView",
    {
      configurable: true,
      value: vi.fn(),
    },
  );

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (
        url ===
        "/api/v1/quality/configuration/pbi"
      ) {
        return response(configuration);
      }

      throw new Error(
        `Requisição inesperada: ${url}`,
      );
    }),
  );

  render(
    <PbiForm
      projectId="project-1"
      epicoId="epic-1"
      featureId="feature-1"
    />,
  );

  const titleCheck =
    await screen.findByTestId(
      "quality-check-titulo_infinitivo",
    );

  expect(
    within(titleCheck).getByLabelText(
      "Reprovado",
    ),
  ).toBeTruthy();

  fireEvent.change(
    screen.getByLabelText(
      "Título (obrigatório, verbo no infinitivo)",
    ),
    {
      target: {
        value: "Cadastrar item",
      },
    },
  );

  expect(
    within(titleCheck).getByLabelText(
      "Aprovado",
    ),
  ).toBeTruthy();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Corrigir História do usuário completa",
    }),
  );

  expect(document.activeElement).toBe(
    screen.getByLabelText(
      "COMO UM (obrigatório)",
    ),
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Corrigir Cenários de aceitação estruturados",
    }),
  );

  expect(document.activeElement).toBe(
    screen.getByRole("region", {
      name: "Cenários de aceitação",
    }),
  );
});

it("mostra erro e permite tentar novamente sem aplicar regras padrão silenciosamente", async () => {
  let attempts = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (
        url !==
        "/api/v1/quality/configuration/pbi"
      ) {
        throw new Error(
          `Requisição inesperada: ${url}`,
        );
      }

      attempts += 1;

      if (attempts === 1) {
        throw new Error("indisponível");
      }

      return response(configuration);
    }),
  );

  render(
    <PbiForm
      projectId="project-1"
      epicoId="epic-1"
      featureId="feature-1"
    />,
  );

  expect(
    await screen.findByText(
      /não será exibido com regras presumidas/i,
    ),
  ).toBeTruthy();

  expect(
    screen.queryByRole("heading", {
      name: "Checklist de qualidade em tempo real",
    }),
  ).toBeNull();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Tentar novamente",
    }),
  );

  expect(
    await screen.findByRole("heading", {
      name: "Checklist de qualidade em tempo real",
    }),
  ).toBeTruthy();
});

it("atualiza o painel do detalhe após adicionar um cenário e também durante a edição", async () => {
  const pbi = {
    id: "pbi-1",
    feature_id: "feature-1",
    codigo: "PBI-001",
    titulo: "Cadastrar item",
    historia_como_um: "PO",
    historia_eu_quero: "cadastrar item",
    historia_para_que: "organizar backlog",
    status: "rascunho",
    requer_interface: false,
    prototipo_vinculado: false,
    criterios_count: 0,
    feature_titulo: "Feature base",
    epico_id: "epic-1",
    epico_titulo: "Épico base",
    projeto_id: "project-1",
    projeto_status: "ativo",
  };

  const scenario = {
    id: "scenario-1",
    entidade_tipo: "pbi",
    entidade_id: "pbi-1",
    texto: null,
    nome: "Cadastrar com sucesso",
    dado: "usuário autenticado",
    quando: "confirmar cadastro",
    entao: "item criado",
    ordem: 1,
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init?: RequestInit,
      ) => {
        const method =
          init?.method ?? "GET";

        if (
          method === "GET" &&
          url === "/api/v1/pbis/pbi-1"
        ) {
          return response(pbi);
        }

        if (
          method === "GET" &&
          url ===
            "/api/v1/quality/configuration/pbi"
        ) {
          return response(configuration);
        }

        if (
          method === "GET" &&
          url ===
            "/api/v1/criteria?entidade_tipo=pbi&entidade_id=pbi-1"
        ) {
          return response({ items: [] });
        }

        if (
          method === "GET" &&
          url ===
            "/api/v1/criteria?entidade_tipo=feature&entidade_id=feature-1"
        ) {
          return response({ items: [] });
        }

        if (
          method === "POST" &&
          url === "/api/v1/criteria"
        ) {
          return response(scenario, 201);
        }

        throw new Error(
          `Requisição inesperada: ${method} ${url}`,
        );
      },
    ),
  );

  render(
    <PbiDetail
      projectId="project-1"
      epicoId="epic-1"
      featureId="feature-1"
      pbiId="pbi-1"
      canEdit
    />,
  );

  const scenarioCheck =
    await screen.findByTestId(
      "quality-check-cenario_estruturado",
    );

  expect(
    within(scenarioCheck).getByLabelText(
      "Reprovado",
    ),
  ).toBeTruthy();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Novo cenário",
    }),
  );

  fireEvent.change(
    screen.getByLabelText(
      "Nome do cenário",
    ),
    {
      target: {
        value: scenario.nome,
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText("DADO"),
    {
      target: {
        value: scenario.dado,
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText("QUANDO"),
    {
      target: {
        value: scenario.quando,
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText("ENTÃO"),
    {
      target: {
        value: scenario.entao,
      },
    },
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Adicionar",
    }),
  );

  await waitFor(() =>
    expect(
      within(scenarioCheck).getByLabelText(
        "Aprovado",
      ),
    ).toBeTruthy(),
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Editar",
    }),
  );

  fireEvent.change(
    screen.getByLabelText("Título"),
    {
      target: {
        value: "Tela de cadastro",
      },
    },
  );

  const titleCheck =
    screen.getByTestId(
      "quality-check-titulo_infinitivo",
    );

  expect(
    within(titleCheck).getByLabelText(
      "Reprovado",
    ),
  ).toBeTruthy();
});

it("salva rascunho mesmo com verificações de qualidade reprovadas", async () => {
  const request = vi.fn(
    async (url: string, init?: RequestInit) => {
      if (
        url ===
        "/api/v1/quality/configuration/pbi"
      ) {
        return response(configuration);
      }

      if (
        url === "/api/v1/pbis" &&
        init?.method === "POST"
      ) {
        return response(
          {
            id: "draft-1",
            feature_id: "feature-1",
            codigo: "PBI-001",
            titulo: "Tela de cadastro",
            historia_como_um: "PO",
            historia_eu_quero: "ver dados",
            historia_para_que:
              "acompanhar trabalho",
            requer_interface: false,
            status: "rascunho",
          },
          201,
        );
      }

      throw new Error(
        `Requisição inesperada: ${url}`,
      );
    },
  );

  vi.stubGlobal("fetch", request);

  render(
    <PbiForm
      projectId="project-1"
      epicoId="epic-1"
      featureId="feature-1"
    />,
  );

  await screen.findByRole("heading", {
    name: "Checklist de qualidade em tempo real",
  });

  fireEvent.change(
    screen.getByLabelText(
      "Título (obrigatório, verbo no infinitivo)",
    ),
    {
      target: {
        value: "Tela de cadastro",
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText(
      "COMO UM (obrigatório)",
    ),
    {
      target: { value: "PO" },
    },
  );

  fireEvent.change(
    screen.getByLabelText(
      "EU QUERO (obrigatório)",
    ),
    {
      target: { value: "ver dados" },
    },
  );

  fireEvent.change(
    screen.getByLabelText(
      "PARA QUE (obrigatório)",
    ),
    {
      target: {
        value: "acompanhar trabalho",
      },
    },
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Criar PBI",
    }),
  );

  await waitFor(() =>
    expect(
      window.location.pathname,
    ).toContain("/pbis/draft-1"),
  );

  expect(
    request.mock.calls.some(
      ([url, init]) =>
        url === "/api/v1/pbis" &&
        init?.method === "POST",
    ),
  ).toBe(true);
});