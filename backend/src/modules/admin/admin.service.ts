import { z } from "zod";
import { validateTextFields } from '../../shared/text-validation.js';
import { ValidationError, validateUuid } from "../../shared/errors.js";
import { AdminRepository, type PurgeProjectResult } from "./admin.repository.js";

const demoSeedSchema = z.object({ projeto_id: z.string().uuid("Selecione um projeto válido para a carga demonstrativa.") }).strict();

const purgeProjectSchema = z
  .object({
    confirmacao_nome: z.string().trim().min(1, "Informe o nome do projeto para confirmar o expurgo.").optional(),
    nome_confirmacao: z.string().trim().min(1, "Informe o nome do projeto para confirmar o expurgo.").optional(),
    justificativa: z.string().trim().max(2000).optional(),
  })
  .refine((data) => !!(data.confirmacao_nome || data.nome_confirmacao), {
    message: "Informe o nome do projeto para confirmar o expurgo.",
    path: ["confirmacao_nome"],
  }).superRefine(validateTextFields);

export class AdminService {
  constructor(
    private readonly repository: Pick<AdminRepository, "counts" | "insertDemoChunks"> &
      Partial<Pick<AdminRepository, "purgeProjectContext">> = new AdminRepository(),
  ) {}

  async stats() {

    return { ...(await this.repository.counts()), statusSistema: "operacional" };
  }

  async loadDemo(input: unknown, userId: string) {
    const parsed = demoSeedSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("Informe o projeto de destino da carga demonstrativa.", parsed.error.flatten());
    const inseridos = await this.repository.insertDemoChunks(parsed.data.projeto_id, userId);
    return {
      projeto_id: parsed.data.projeto_id,
      inseridos,
      status: "sucesso",
      message: inseridos
        ? "Dados demonstrativos carregados. Nenhuma indexação vetorial foi executada."
        : "Este projeto já possui a carga demonstrativa. Nenhum trecho foi duplicado.",
    };
  }

  async purgeProject(projectId: string, input: unknown, userId: string): Promise<PurgeProjectResult> {
    validateUuid(projectId, "ID do projeto");

    const parsed = purgeProjectSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError(issue?.message ?? "Informe o nome do projeto para confirmar o expurgo.", parsed.error.flatten());
    }

    const confirmacaoNome = (parsed.data.confirmacao_nome || parsed.data.nome_confirmacao)!;
    if (!this.repository.purgeProjectContext) {
      throw new Error("purgeProjectContext não configurado.");
    }
    return await this.repository.purgeProjectContext(projectId, confirmacaoNome, userId, parsed.data.justificativa);
  }
}


