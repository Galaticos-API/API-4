import { ValidationError } from "../../shared/errors.js";

export const CHANGE_JUSTIFICATION_MAX_LENGTH = 2000;

export interface ChangeJustificationPolicy {
  isRequiredForCompletedItems(): Promise<boolean>;
}

export function assertChangeJustification(options: {
  status: string;
  justificativa?: string | null;
  obrigatoriaNaOrganizacao: boolean;
}): void {
  if (options.status === "rascunho") {
    return;
  }

  const texto = options.justificativa?.trim() ?? "";
  if (options.obrigatoriaNaOrganizacao && texto.length === 0) {
    throw new ValidationError("Informe a justificativa da alteração.", {
      campos_faltantes: ["justificativa"],
    });
  }
}
