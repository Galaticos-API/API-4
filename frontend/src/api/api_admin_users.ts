import { apiRequest } from "./api_auth";
import type { UserRole } from "../models/permissions";

export interface PlatformUserRole {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  created_at: string;
  papel_alterado_em: string | null;
  papel_alterado_por: string | null;
  papel_alterado_por_nome: string | null;
}

export interface ChangeUserRoleResult {
  usuario: PlatformUserRole;
  papel_anterior: UserRole;
  alterado: boolean;
  message: string;
}

export async function listUserRoles(signal?: AbortSignal): Promise<PlatformUserRole[]> {
  const response = await apiRequest("/admin/users", { signal });
  const data = (await response.json()) as { usuarios?: PlatformUserRole[] };
  if (!Array.isArray(data.usuarios)) throw new Error("Resposta inválida da lista de usuários.");
  return data.usuarios;
}

export async function changeUserRole(id: string, role: UserRole, justificativa?: string): Promise<ChangeUserRoleResult> {
  const response = await apiRequest(`/admin/users/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    body: JSON.stringify(justificativa ? { role, justificativa } : { role }),
  });
  return (await response.json()) as ChangeUserRoleResult;
}
