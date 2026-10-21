import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CopilotPanel } from "./CopilotPanel";
import { CriteriaEditor, type ScenarioDraftHandler } from "./CriteriaView";
import type { Criterion } from "../../api/api_backlog";

const story = {
  titulo: "Aprovar pedido",
  historia_como_um: "gestor",
  historia_eu_quero: "aprovar pedidos com o perfil de administrador",
  historia_para_que: "liberar a entrega",
  requer_interface: false,
};
const principal = {
  nome: "Aprovar pedido com permissão",
  tipo: "caminho_principal",
  dado: "que o gestor tem o perfil de administrador",
  quando: "ele aprova um pedido pendente",
  entao: "o pedido passa a constar como aprovado",
};
const naoAutorizado = {
  nome: "Recusar aprovação sem permissão",
  tipo: "acesso_nao_autorizado",
  dado: "que o usuário não tem o perfil de administrador",
  quando: "ele tenta aprovar um pedido",
  entao: "o sistema recusa a ação e o pedido permanece inalterado",
};
const answer = {
  mode: "levantamento",
  operation: "cenarios",
  level: "pbi",
  version: 0,
  schema_version: 1,
  result: { scenarios: [principal, naoAutorizado], questions: [] },
};
const saved: Criterion = {
  id: "c1",
  entidade_tipo: "pbi",
  entidade_id: "b1",
  texto: null,
  nome: principal.nome,
  dado: principal.dado,
  quando: principal.quando,
  entao: principal.entao,
} as Criterion;
const json = (data: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(data), { status }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("PBI-03.1.3: modo de cenários só aparece quando a sugestão pode ir para o editor", () => {
  const { rerender } = render(
    <CopilotPanel projectId="p1" level="pbi" values={story} criteria={[]} />,
  );
  expect(screen.queryByLabelText("Sugerir cenários")).toBeNull();
  rerender(
    <CopilotPanel
      projectId="p1"
      level="pbi"
      values={story}
      criteria={[]}
      onUseScenario={() => true}
    />,
  );
  expect(screen.getByLabelText("Sugerir cenários")).toBeTruthy();
});

it("PBI-03.1.3: sugere cenários DADO/QUANDO/ENTÃO com caminho principal e acesso não autorizado", async () => {
  const fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    json(answer),
  );
  vi.stubGlobal("fetch", fetch);
  const used = vi.fn(() => true);
  render(
    <CopilotPanel
      projectId="p1"
      level="pbi"
      values={story}
      criteria={[saved]}
      onUseScenario={used}
    />,
  );
  fireEvent.click(screen.getByLabelText("Sugerir cenários"));
  fireEvent.click(screen.getByRole("button", { name: "Sugerir cenários" }));
  const list = await screen.findByRole("complementary", {
    name: "Cenários sugeridos",
  });
  const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    mode: "levantamento",
    operation: "cenarios",
    level: "pbi",
  });
  expect(body.fields.historia_eu_quero).toBe(story.historia_eu_quero);
  expect(JSON.parse(body.fields.texto_livre).criterios_salvos).toHaveLength(1);
  expect(list.textContent).toContain("Caminho principal");
  expect(list.textContent).toContain("Acesso não autorizado");
  expect(list.textContent).toContain(naoAutorizado.entao);
  fireEvent.click(
    screen.getByRole("button", {
      name: `Usar o cenário ${naoAutorizado.nome} no editor de cenários`,
    }),
  );
  expect(used).toHaveBeenCalledWith(naoAutorizado);
  expect(screen.getByText(/copiado para o editor de cenários/)).toBeTruthy();
});

it("PBI-03.1.3: história incompleta pede o preenchimento sem consultar a IA", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(
    <CopilotPanel
      projectId="p1"
      level="pbi"
      values={{ ...story, historia_como_um: "", historia_para_que: " " }}
      criteria={[]}
      onUseScenario={() => true}
    />,
  );
  fireEvent.click(screen.getByLabelText("Sugerir cenários"));
  expect(
    screen.getByText(/Falta preencher: COMO UM, PARA QUE/),
  ).toBeTruthy();
  const button = screen.getByRole("button", { name: "Sugerir cenários" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(fetch).not.toHaveBeenCalled();
});

it("PBI-03.1.3: recusa do backend por história incompleta é explicada sem perder a edição", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      json(
        {
          error: "Complete a história",
          code: "HISTORIA_INCOMPLETA",
          details: { campos: ["historia_eu_quero"] },
        },
        400,
      ),
    ),
  );
  render(
    <CopilotPanel
      projectId="p1"
      level="pbi"
      values={story}
      criteria={[]}
      onUseScenario={() => true}
    />,
  );
  fireEvent.click(screen.getByLabelText("Sugerir cenários"));
  fireEvent.click(screen.getByRole("button", { name: "Sugerir cenários" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("falta EU QUERO");
  expect(alert.textContent).toContain("Sua edição foi preservada");
});

it("salvar um cenário sugerido mantém as demais sugestões; formulário em edição não é sobrescrito", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json(answer)));
  const { rerender } = render(
    <CopilotPanel
      projectId="p1"
      level="pbi"
      values={story}
      criteria={[]}
      onUseScenario={() => false}
    />,
  );
  fireEvent.click(screen.getByLabelText("Sugerir cenários"));
  fireEvent.click(screen.getByRole("button", { name: "Sugerir cenários" }));
  await screen.findByRole("complementary", { name: "Cenários sugeridos" });
  fireEvent.click(
    screen.getByRole("button", {
      name: `Usar o cenário ${principal.nome} no editor de cenários`,
    }),
  );
  expect(screen.getByText(/Há um cenário em edição no formulário/)).toBeTruthy();
  rerender(
    <CopilotPanel
      projectId="p1"
      level="pbi"
      values={story}
      criteria={[saved]}
      onUseScenario={() => false}
    />,
  );
  expect(
    screen.getByRole("complementary", { name: "Cenários sugeridos" }),
  ).toBeTruthy();
});

it("editor de cenários recebe a sugestão para revisão e não sobrescreve edição em andamento", async () => {
  vi.stubGlobal("fetch", vi.fn(() => json({ items: [] })));
  const ref = createRef<ScenarioDraftHandler | null>() as {
    current: ScenarioDraftHandler | null;
  };
  render(
    <CriteriaEditor
      entidadeTipo="pbi"
      entidadeId="b1"
      canEdit
      titulo="Cenários do PBI"
      scenarioDraftRef={ref}
    />,
  );
  await waitFor(() => expect(ref.current).toBeTypeOf("function"));
  const draft = {
    nome: principal.nome,
    dado: principal.dado,
    quando: principal.quando,
    entao: principal.entao,
  };
  let applied = false;
  act(() => {
    applied = ref.current!(draft);
  });
  expect(applied).toBe(true);
  expect((screen.getByLabelText(/Nome/) as HTMLInputElement).value).toBe(
    draft.nome,
  );
  expect(
    (document.getElementById("cenario-entao") as HTMLTextAreaElement).value,
  ).toBe(draft.entao);
  act(() => {
    applied = ref.current!({ ...draft, nome: "Outro cenário" });
  });
  expect(applied).toBe(false);
  expect((screen.getByLabelText(/Nome/) as HTMLInputElement).value).toBe(
    draft.nome,
  );
});
