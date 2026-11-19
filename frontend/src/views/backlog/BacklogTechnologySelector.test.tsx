import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BacklogTechnologySelector } from "./BacklogTechnologySelector";
import { listTechnologies } from "../../api/api_backlog";

vi.mock("../../api/api_backlog", () => ({ listTechnologies: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("filtra o vocabulário pela digitação ignorando variações e mantém as selecionadas visíveis", async () => {
  vi.mocked(listTechnologies).mockResolvedValue([
    { id: "node", nome: "Node.js" },
    { id: "react", nome: "React" },
    { id: "pg", nome: "PostgreSQL" },
  ]);
  render(<BacklogTechnologySelector value={["pg"]} onChange={() => undefined} />);
  await screen.findByText("Node.js");

  fireEvent.change(screen.getByLabelText("Filtrar tecnologias"), { target: { value: "nodejs" } });
  expect(screen.getByText("Node.js")).toBeTruthy();
  expect(screen.queryByText("React")).toBeNull();
  expect(screen.getByText("PostgreSQL")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Filtrar tecnologias"), { target: { value: "kotlin" } });
  expect(screen.getByText(/Nenhuma tecnologia do vocabulário corresponde/)).toBeTruthy();
});
