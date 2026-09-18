import { z } from "zod";

export const ENTITY_TYPES = ["epico", "feature", "pbi"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const PBI_QUALITY_CHECKS = [
  "titulo_infinitivo",
  "historia_completa",
  "cenario_estruturado",
  "termos_vagos",
] as const;

export type PbiQualityCheck = (typeof PBI_QUALITY_CHECKS)[number];

export interface QualityCheckResult {
  check_id: string;
  check_name: string;
  passed: boolean;
  message: string;
  applicable: boolean;
}

export interface QualityReport {
  entity_type: EntityType;
  entity_id: string;
  checks: QualityCheckResult[];
  score_completude: number | null;
}

export interface CompletudeCalculation {
  applicable_checks: number;
  passed_checks: number;
  score: number | null;
}
