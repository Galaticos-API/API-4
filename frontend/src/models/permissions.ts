export type UserRole = "admin" | "po" | "dev";

export const USER_ROLES: UserRole[] = ["admin", "po", "dev"];

/**
 * PBI-06.2.1 cenário 2: o perfil dev consulta itens de trabalho sem editar.
 * O backend aplica a mesma regra (requireRole("admin", "po")) e responde 403.
 */
export function canEditWorkItems(role: string | null | undefined): boolean {
  return role === "admin" || role === "po";
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  po: "Product Owner",
  dev: "Desenvolvedor (somente leitura)",
};
