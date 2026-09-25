export interface AuditChangeDescription {
  field: string;
  label: string;
  before?: string;
  after?: string;
}

const FIELD_LABELS: Record<string, string> = {
  titulo: "Título",
  descricao: "Descrição",
  objetivo: "Objetivo",
  escopo_macro: "Escopo macro",
  resultado_esperado: "Resultado esperado",
  prioridade: "Prioridade",
  historia_como_um: "COMO UM",
  historia_eu_quero: "EU QUERO",
  historia_para_que: "PARA QUE",
  regras_observacoes: "Regras e observações",
  tipo: "Tipo",
  requer_interface: "Exige interface ou protótipo",
  status: "Status",
  status_anterior: "Status anterior",
  status_novo: "Status novo",
  nome: "Nome do cenário",
  texto: "Texto do critério",
  dado: "DADO",
  quando: "QUANDO",
  entao: "ENTÃO",
  ordem: "Ordem",
  ordem_anterior: "Ordem anterior",
  ordem_novo: "Nova ordem",
  direcao: "Direção",
};

function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function displayValue(value: unknown): string | null {
  if (value === null) return "Não informado";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** Converts known audit fields to readable labels; never renders arbitrary JSON. */
export function describeAuditChanges(
  data: Record<string, unknown> | null | undefined,
): AuditChangeDescription[] {
  const payload = toRecord(data);
  if (!payload) return [];

  const changes = toRecord(payload.alteracoes)
    ?? toRecord(payload.pbi_snapshot)
    ?? payload;
  const before = toRecord(payload.anterior) ?? {};
  const after = { ...changes, ...(toRecord(payload.novo) ?? {}) };
  const fields = Object.keys(changes).filter((field) => field !== "justificativa");

  return fields.flatMap((field) => {
    const label = FIELD_LABELS[field];
    if (!label) return [];

    const nextValue = displayValue(after[field]);
    const previousValue = displayValue(before[field]);
    if (nextValue === null && previousValue === null) return [];

    return [{
      field,
      label,
      ...(previousValue !== null ? { before: previousValue } : {}),
      ...(nextValue !== null ? { after: nextValue } : {}),
    }];
  });
}
