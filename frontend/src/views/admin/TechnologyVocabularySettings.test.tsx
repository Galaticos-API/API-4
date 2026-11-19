import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TechnologyVocabularySettings } from "./TechnologyVocabularySettings";
import {
  TechnologyExistsError,
  TechnologyInUseError,
  createTechnology,
  listVocabulary,
  removeTechnology,
  type Technology,
} from "../../api/api_technologies";
import { normalizeTechnologyName } from "../../models/technologies";

vi.mock("../../api/api_technologies", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/api_technologies")>();
  return { ...original, listVocabulary: vi.fn(), createTechnology: vi.fn(), removeTechnology: vi.fn() };
});

afterEach(() => { cleanup(); vi.resetAllMocks(); });

const node: Technology = { id: "t-node", nome: "Node.js", categoria: "backend", uso: { competencias: 2, itens: 1, total: 3 } };
const react: Technology = { id: "t-react", nome: "React", categoria: "frontend", uso: { competencias: 0, itens: 0, total: 0 } };

it("normaliza variações de escrita como o banco", () => {
  expect(normalizeTechnologyName("NodeJS")).toBe(normalizeTechnologyName("Node.js"));
  expect(normalizeTechnologyName("C#")).not.toBe(normalizeTechnologyName("C++"));
});

it("avisa ao digitar uma variação e aponta o registro existente quando o servidor recusa", async () => {
  vi.mocked(listVocabulary).mockResolvedValue([node, react]);
  vi.mocked(createTechnology).mockRejectedValue(new TechnologyExistsError(node, 'Já existe a tecnologia "Node.js".'));
  render(<TechnologyVocabularySettings />);
  await screen.findByText("Node.js");

  fireEvent.change(screen.getByLabelText("Nome da tecnologia"), { target: { value: "NodeJS" } });
  expect(screen.getByRole("note").textContent).toContain('Já existe "Node.js"');

  fireEvent.click(screen.getByRole("button", { name: "Incluir tecnologia" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Node.js");
  fireEvent.click(screen.getByRole("button", { name: "Mostrar na lista" }));
  expect((screen.getByLabelText("Filtrar vocabulário") as HTMLInputElement).value).toBe("Node.js");
  expect(screen.queryByText("React")).toBeNull();
});

it("inclui tecnologia nova com categoria", async () => {
  vi.mocked(listVocabulary).mockResolvedValue([node]);
  const kafka: Technology = { id: "t-kafka", nome: "Kafka", categoria: "backend", uso: { competencias: 0, itens: 0, total: 0 } };
  vi.mocked(createTechnology).mockResolvedValue(kafka);
  render(<TechnologyVocabularySettings />);
  await screen.findByText("Node.js");
  fireEvent.change(screen.getByLabelText("Nome da tecnologia"), { target: { value: " Kafka " } });
  fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "backend" } });
  fireEvent.click(screen.getByRole("button", { name: "Incluir tecnologia" }));
  expect(await screen.findByText("Kafka")).toBeTruthy();
  expect(createTechnology).toHaveBeenCalledWith({ nome: "Kafka", categoria: "backend" });
});

it("exige confirmação explícita com a quantidade informada pelo servidor antes de remover", async () => {
  vi.mocked(listVocabulary).mockResolvedValue([node]);
  vi.mocked(removeTechnology)
    .mockRejectedValueOnce(new TechnologyInUseError({ competencias: 2, itens: 2, total: 4 }, "A tecnologia possui 4 associação(ões)."))
    .mockResolvedValueOnce({ competencias: 2, itens: 2, total: 4 });
  render(<TechnologyVocabularySettings />);
  await screen.findByText("Node.js");

  fireEvent.click(screen.getByRole("button", { name: "Remover Node.js" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog.textContent).toContain("4 associação");
  expect(removeTechnology).toHaveBeenLastCalledWith("t-node", undefined);

  fireEvent.click(within(dialog).getByRole("button", { name: "Remover mesmo assim (4)" }));
  expect((await screen.findByRole("status")).textContent).toContain("removida com 4");
  expect(removeTechnology).toHaveBeenLastCalledWith("t-node", 4);
  expect(screen.queryByText("Node.js")).toBeNull();
});
