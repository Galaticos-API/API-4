export const CAMPO_LABELS: Record<string, string> = {
  descricao: "Descrição",
  objetivo: "Objetivo",
  escopo_macro: "Escopo macro",
  resultado_esperado: "Resultado esperado",
  criterios_aceitacao: "Critérios de aceitação",
  cenarios_aceitacao: "Cenários de aceitação (DADO/QUANDO/ENTÃO)",
  titulo_infinitivo: "Título (deve começar com verbo no infinitivo, ex.: Cadastrar, Consultar)",
};

export function descreverCamposFaltantes(campos: string[]): string {
  return campos.map((campo) => CAMPO_LABELS[campo] ?? campo).join(", ");
}
