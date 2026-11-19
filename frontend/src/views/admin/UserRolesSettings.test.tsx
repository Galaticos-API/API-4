import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { UserRolesSettings } from "./UserRolesSettings";
import { changeUserRole, listUserRoles, type PlatformUserRole } from "../../api/api_admin_users";
import { ApiError } from "../../api/api_auth";
import { AuthContext, type AuthContextType } from "../../viewmodels/useAuthViewModel";

vi.mock("../../api/api_admin_users", () => ({ listUserRoles: vi.fn(), changeUserRole: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });

const restoreSession = vi.fn(async () => {});
const authValue: AuthContextType = {
  session: { status: "authenticated", user: { id: "ana", name: "Ana Admin", email: "ana@sinapse.local", role: "admin" } },
  notice: "", restore: restoreSession,
  login: async () => {}, register: async () => {}, logout: async () => {},
};
function renderSettings() {
  return render(<AuthContext.Provider value={authValue}><UserRolesSettings /></AuthContext.Provider>);
}

const user = (id: string, nome: string, role: PlatformUserRole["role"], extra: Partial<PlatformUserRole> = {}): PlatformUserRole => ({
  id, nome, email: `${id}@sinapse.local`, role, ativo: true, created_at: "2026-09-01T12:00:00.000Z",
  papel_alterado_em: null, papel_alterado_por: null, papel_alterado_por_nome: null, ...extra,
});
const ana = user("ana", "Ana Admin", "admin");
const davi = user("davi", "Davi Dev", "dev");

it("S3-13 / PBI-06.2.1 cenário 1: atribui perfil e informa que vale no próximo acesso com autor registrado", async () => {
  vi.mocked(listUserRoles).mockResolvedValue([ana, davi]);
  vi.mocked(changeUserRole).mockResolvedValue({
    usuario: { ...davi, role: "po", papel_alterado_em: "2026-11-19T12:00:00.000Z", papel_alterado_por: "ana", papel_alterado_por_nome: "Ana Admin" },
    papel_anterior: "dev",
    alterado: true,
    message: "Perfil atualizado. As novas permissões valem a partir do próximo acesso do usuário.",
  });
  renderSettings();
  const row = await screen.findByRole("listitem", { name: "Davi Dev" });
  const save = within(row).getByRole("button", { name: "Salvar perfil de Davi Dev" });
  expect(save).toBeDisabled();
  fireEvent.change(within(row).getByLabelText("Perfil de Davi Dev"), { target: { value: "po" } });
  fireEvent.click(save);
  await screen.findByText(/valem a partir do próximo acesso/);
  expect(changeUserRole).toHaveBeenCalledWith("davi", "po");
  expect(within(row).getByLabelText("Perfil de Davi Dev")).toHaveValue("po");
  expect(within(row).getByText(/Última alteração por Ana Admin/)).toBeInTheDocument();
});

it("S3-13 / PBI-06.2.1 cenário 3: impede alterar o único administrador ativo", async () => {
  vi.mocked(listUserRoles).mockResolvedValue([ana, davi, user("bia", "Bia Admin", "admin", { ativo: false })]);
  renderSettings();
  const row = await screen.findByRole("listitem", { name: "Ana Admin" });
  expect(within(row).getByLabelText("Perfil de Ana Admin")).toBeDisabled();
  expect(within(row).getByRole("button", { name: "Salvar perfil de Ana Admin" })).toBeDisabled();
  expect(within(row).getByText(/Único administrador ativo/)).toBeInTheDocument();
});

it("S3-13: exibe a mensagem 409 do backend e restaura o perfil quando outro pedido rebaixou o admin antes", async () => {
  const bia = user("bia", "Bia Admin", "admin");
  vi.mocked(listUserRoles).mockResolvedValue([ana, bia]);
  const message = "Não é possível alterar o perfil do único administrador ativo. Defina outro administrador antes de alterar este perfil.";
  vi.mocked(changeUserRole).mockRejectedValue(new ApiError(409, { error: message, code: "LAST_ADMIN" }));
  renderSettings();
  const row = await screen.findByRole("listitem", { name: "Bia Admin" });
  fireEvent.change(within(row).getByLabelText("Perfil de Bia Admin"), { target: { value: "dev" } });
  fireEvent.click(within(row).getByRole("button", { name: "Salvar perfil de Bia Admin" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(within(row).getByLabelText("Perfil de Bia Admin")).toHaveValue("admin");
});

it("S3-13: atualiza a sessão após o administrador alterar o próprio perfil", async () => {
  const bia = user("bia", "Bia Admin", "admin");
  vi.mocked(listUserRoles).mockResolvedValue([ana, bia]);
  vi.mocked(changeUserRole).mockResolvedValue({
    usuario: { ...ana, role: "dev" }, papel_anterior: "admin", alterado: true,
    message: "Perfil atualizado. As novas permissões valem a partir do próximo acesso do usuário.",
  });
  renderSettings();
  const row = await screen.findByRole("listitem", { name: "Ana Admin" });
  fireEvent.change(within(row).getByLabelText("Perfil de Ana Admin"), { target: { value: "dev" } });
  fireEvent.click(within(row).getByRole("button", { name: "Salvar perfil de Ana Admin" }));
  await screen.findByText(/Perfil atualizado/);
  expect(restoreSession).toHaveBeenCalledTimes(1);
});

it("S3-13: permite tentar novamente quando a lista falha", async () => {
  vi.mocked(listUserRoles).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([ana]);
  renderSettings();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Recarregar usuários" }));
  await screen.findByRole("listitem", { name: "Ana Admin" });
  expect(screen.queryByRole("alert")).toBeNull();
});
