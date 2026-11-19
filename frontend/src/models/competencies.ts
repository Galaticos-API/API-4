export const COMPETENCY_LEVELS = [
  { value: "iniciante", label: "Iniciante" },
  { value: "intermediario", label: "Intermediário" },
  { value: "avancado", label: "Avançado" },
  { value: "especialista", label: "Especialista" },
] as const;

export type CompetencyLevel = (typeof COMPETENCY_LEVELS)[number]["value"];

export function competencyLevelLabel(value: string | null | undefined): string {
  return COMPETENCY_LEVELS.find((level) => level.value === value)?.label ?? value ?? "Sem nível";
}
