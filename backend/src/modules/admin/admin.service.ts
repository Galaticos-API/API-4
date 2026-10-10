import { z } from "zod";
import { ValidationError } from "../../shared/errors.js";
import { AdminRepository } from "./admin.repository.js";

const demoSeedSchema = z.object({ projeto_id: z.string().uuid("Selecione um projeto válido para a carga demonstrativa.") }).strict();

export class AdminService {
  constructor(private readonly repository: Pick<AdminRepository, "counts" | "insertDemoChunks"> = new AdminRepository()) {}

  async stats() {
    return { ...await this.repository.counts(), statusSistema: "operacional" };
  }

  async loadDemo(input: unknown, userId: string) {
    const parsed = demoSeedSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("Informe o projeto de destino da carga demonstrativa.", parsed.error.flatten());
    const inseridos = await this.repository.insertDemoChunks(parsed.data.projeto_id, userId);
    return {
      projeto_id: parsed.data.projeto_id, inseridos, status: "sucesso",
      message: inseridos ? "Dados demonstrativos carregados. Nenhuma indexação vetorial foi executada." : "Este projeto já possui a carga demonstrativa. Nenhum trecho foi duplicado.",
    };
  }
}
