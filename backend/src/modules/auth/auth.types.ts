import { z } from "zod";

export const USER_ROLES = ["admin", "po", "dev"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const loginSchema = z.object({
  email: z
    .string({ required_error: "O e-mail é obrigatório." })
    .trim()
    .email("E-mail inválido.")
    .transform((value) => value.toLowerCase()),

  password: z
    .string({ required_error: "A senha é obrigatória." })
    .min(1, "A senha é obrigatória."),
});

export type LoginDTO = z.infer<typeof loginSchema>;

export interface UserRecord {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  role: UserRole;
  ativo: boolean;
  tentativas_login: number;
  bloqueado_ate: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AuthenticatedUser {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
}

export interface SessionRecord {
  id: string;
  usuario_id: string;
  token_hash: string;
  created_at: Date | string;
  ultima_atividade_em: Date | string;
  revogada_em: Date | string | null;
}

export interface SessionWithUser extends SessionRecord {
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
}