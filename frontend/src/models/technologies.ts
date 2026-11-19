/** Mesma regra de normalização do banco (migration 029), usada para filtrar na tela. */
export function normalizeTechnologyName(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9+#]/g, "");
}
