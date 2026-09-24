// @vitest-environment jsdom

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  BacklogBreadcrumb,
} from "../views/backlog/BacklogBreadcrumb";

import {
  BacklogTreeView,
  filterBacklogTree,
} from "../views/backlog/BacklogTreeView";

import type {
  ProjectBacklogTree,
} from "../api/api_backlog_tree";

const tree: ProjectBacklogTree = {
  project: {
    id: "project-1",
    nome: "Sinapse",
    status: "ativo",
  },

  technologies: [
    {
      id: "react",
      nome: "React",
    },
    {
      id: "node",
      nome: "Node.js",
    },
  ],

  epics: [
    {
      id: "epic-1",
      titulo: "Organizar requisitos",
      status: "ativo",
      tecnologias: [],

      features: [
        {
          id: "feature-1",
          titulo:
            "Navegação do backlog",
          status: "concluido",

          tecnologias: [
            {
              id: "react",
              nome: "React",
            },
          ],

          pbis: [
            {
              id: "pbi-1",
              codigo: "PBI-01.4.1",
              titulo:
                "Expandir árvore",
              status: "rascunho",

              tecnologias: [
                {
                  id: "react",
                  nome: "React",
                },
              ],
            },
          ],
        },

        {
          id: "feature-2",
          titulo: "API antiga",
          status: "arquivado",

          tecnologias: [
            {
              id: "node",
              nome: "Node.js",
            },
          ],

          pbis: [],
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();

  window.sessionStorage.clear();

  window.history.replaceState(
    null,
    "",
    "/",
  );
});

function mockTree(
  value: ProjectBacklogTree = tree,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) => {
        if (
          url
          === "/api/v1/projects/project-1/backlog-tree"
        ) {
          return new Response(
            JSON.stringify(value),
            {
              status: 200,
            },
          );
        }

        throw new Error(
          `Requisição inesperada: ${url}`,
        );
      },
    ),
  );
}

describe(
  "S1-16 — árvore e filtros do backlog",
  () => {
    it(
      "expande progressivamente épico e feature até o PBI",
      async () => {
        mockTree();

        render(
          <BacklogTreeView
            projectId="project-1"
            canCreate
          />,
        );

        await screen.findByText(
          "Organizar requisitos",
        );

        expect(
          screen.queryByText(
            "Navegação do backlog",
          ),
        ).toBeNull();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Expandir épico Organizar requisitos",
            },
          ),
        );

        expect(
          screen.getByText(
            "Navegação do backlog",
          ),
        ).toBeTruthy();

        expect(
          screen.queryByText(
            /Expandir árvore/,
          ),
        ).toBeNull();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name:
                "Expandir feature Navegação do backlog",
            },
          ),
        );

        expect(
          screen.getByText(
            /PBI-01\.4\.1 — Expandir árvore/,
          ),
        ).toBeTruthy();
      },
    );

    it(
      "combina status e tecnologia, preserva ancestrais e persiste na sessão",
      async () => {
        mockTree();

        const view = render(
          <BacklogTreeView
            projectId="project-1"
            canCreate
          />,
        );

        await screen.findByText(
          "Organizar requisitos",
        );

        fireEvent.change(
          screen.getByLabelText(
            "Status",
          ),
          {
            target: {
              value: "rascunho",
            },
          },
        );

        fireEvent.change(
          screen.getByLabelText(
            "Tecnologia",
          ),
          {
            target: {
              value: "react",
            },
          },
        );

        expect(
          screen.getByText(
            "2 filtros ativos",
          ),
        ).toBeTruthy();

        expect(
          screen.getByText(
            "Organizar requisitos",
          ),
        ).toBeTruthy();

        expect(
          screen.getByText(
            "Navegação do backlog",
          ),
        ).toBeTruthy();

        expect(
          screen.getByText(
            /PBI-01\.4\.1 — Expandir árvore/,
          ),
        ).toBeTruthy();

        expect(
          screen.queryByText(
            "API antiga",
          ),
        ).toBeNull();

        expect(
          JSON.parse(
            window.sessionStorage
              .getItem(
                "sinapse.backlog.filters.project-1",
              )!,
          ),
        ).toEqual({
          status: "rascunho",
          technologyId: "react",
        });

        view.unmount();

        render(
          <BacklogTreeView
            projectId="project-1"
            canCreate
          />,
        );

        await screen.findByText(
          "2 filtros ativos",
        );

        expect(
          (
            screen.getByLabelText(
              "Status",
            ) as HTMLSelectElement
          ).value,
        ).toBe("rascunho");

        expect(
          (
            screen.getByLabelText(
              "Tecnologia",
            ) as HTMLSelectElement
          ).value,
        ).toBe("react");
      },
    );

    it(
      "oferece limpar filtros quando a combinação não tem resultado",
      async () => {
        mockTree();

        render(
          <BacklogTreeView
            projectId="project-1"
            canCreate
          />,
        );

        await screen.findByText(
          "Organizar requisitos",
        );

        fireEvent.change(
          screen.getByLabelText(
            "Status",
          ),
          {
            target: {
              value: "concluido",
            },
          },
        );

        fireEvent.change(
          screen.getByLabelText(
            "Tecnologia",
          ),
          {
            target: {
              value: "node",
            },
          },
        );

        expect(
          screen.getByText(
            "Nenhum item corresponde aos filtros",
          ),
        ).toBeTruthy();

        fireEvent.click(
          screen.getAllByRole(
            "button",
            {
              name:
                "Limpar filtros",
            },
          )[0],
        );

        expect(
          screen.getByText(
            "0 filtros ativos",
          ),
        ).toBeTruthy();

        expect(
          screen.getByText(
            "Organizar requisitos",
          ),
        ).toBeTruthy();
      },
    );

    it(
      "orienta a criação do primeiro épico em projeto vazio",
      async () => {
        mockTree({
          ...tree,
          epics: [],
          technologies: [],
        });

        render(
          <BacklogTreeView
            projectId="project-1"
            canCreate
          />,
        );

        expect(
          await screen.findByText(
            "Este projeto ainda não possui épicos",
          ),
        ).toBeTruthy();

        expect(
          screen.getByRole(
            "button",
            {
              name:
                "Criar primeiro épico",
            },
          ),
        ).toBeTruthy();
      },
    );

    it(
      "mantém apenas correspondências e seus ancestrais na função de filtragem",
      () => {
        const filtered =
          filterBacklogTree(
            tree,
            {
              status: "rascunho",
              technologyId:
                "react",
            },
          );

        expect(
          filtered.epics,
        ).toHaveLength(1);

        expect(
          filtered.epics[0]
            .features,
        ).toHaveLength(1);

        expect(
          filtered.epics[0]
            .features[0]
            .pbis,
        ).toHaveLength(1);
      },
    );
  },
);

it(
  "S1-16 — breadcrumb apresenta o caminho e navega pelos ancestrais",
  async () => {
    const onNavigate = vi.fn();

    render(
      <BacklogBreadcrumb
        segments={[
          {
            label: "Projeto",
            path:
              "/projects/project-1#backlog",
          },
          {
            label: "Épico",
            path:
              "/projects/project-1/epics/epic-1",
          },
          {
            label: "Feature",
            path:
              "/projects/project-1/epics/epic-1/features/feature-1",
          },
          {
            label:
              "PBI-01.4.1",
            path:
              "/projects/project-1/epics/epic-1/features/feature-1/pbis/pbi-1",
          },
        ]}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(
      screen.getByRole(
        "button",
        {
          name: "Projeto",
        },
      ),
    );

    fireEvent.click(
      screen.getByRole(
        "button",
        {
          name: "Feature",
        },
      ),
    );

    const current =
      screen.getByRole(
        "button",
        {
          name: "PBI-01.4.1",
        },
      );

    fireEvent.click(current);

    await waitFor(() =>
      expect(
        onNavigate,
      ).toHaveBeenCalledTimes(3),
    );

    expect(
      onNavigate,
    ).toHaveBeenLastCalledWith(
      "/projects/project-1/epics/epic-1/features/feature-1/pbis/pbi-1",
    );

    expect(
      current.getAttribute(
        "aria-current",
      ),
    ).toBe("page");
  },
);