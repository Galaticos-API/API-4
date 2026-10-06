import type { PoolClient } from "pg";

// S2-13: proveniência por campo. "human-authored" é o padrão implícito de
// qualquer campo ausente do mapa — nunca precisa ser escrito explicitamente
// por uma edição manual comum, apenas quando uma sugestão de IA é resolvida.
export type ProvenanceValue = "human-authored" | "ai-accepted" | "ai-edited";

export type SuggestibleEntityType = "epico" | "feature" | "pbi";

export const SUGGESTIBLE_ENTITY_TYPES: readonly SuggestibleEntityType[] = ["epico", "feature", "pbi"];

// Somente campos de texto livre do guia de especificação aceitam sugestão;
// enums (status, prioridade, tipo), listas (tecnologias_ids) e campos
// derivados (score, contadores) ficam fora do ciclo de sugestão da IA.
export const SUGGESTIBLE_FIELDS: Record<SuggestibleEntityType, readonly string[]> = {
  epico: ["titulo", "descricao", "objetivo", "escopo_macro", "resultado_esperado"],
  feature: ["titulo", "descricao", "objetivo"],
  pbi: ["titulo", "historia_como_um", "historia_eu_quero", "historia_para_que", "regras_observacoes"],
};

const MAX_FIELD_LENGTH: Record<string, number> = {
  titulo: 255,
};
const DEFAULT_MAX_LENGTH = 5000;

export function maxLengthFor(field: string): number {
  return MAX_FIELD_LENGTH[field] ?? DEFAULT_MAX_LENGTH;
}

export function isSuggestibleField(kind: SuggestibleEntityType, field: string): boolean {
  return SUGGESTIBLE_FIELDS[kind].includes(field);
}

/**
 * Marks the given fields as human-authored on the entity's provenance map.
 * Called from the ordinary update() of epics/features/pbis, inside the same
 * transaction, right after the field values themselves are written — a plain
 * edit by a person always overrides any earlier AI provenance for that field.
 * Fields outside the suggestible allow-list (status, prioridade, etc.) are
 * silently ignored: provenance only tracks free-text specification fields.
 */
export async function markFieldsHumanAuthored(
  client: PoolClient,
  kind: SuggestibleEntityType,
  id: string,
  fields: readonly string[],
): Promise<void> {
  const relevant = fields.filter((field) => isSuggestibleField(kind, field));
  if (relevant.length === 0) return;
  const patch: Record<string, ProvenanceValue> = Object.fromEntries(relevant.map((field) => [field, "human-authored"]));
  await client.query(
    `UPDATE ${kind} SET provenance_json = COALESCE(provenance_json, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [id, JSON.stringify(patch)],
  );
}
