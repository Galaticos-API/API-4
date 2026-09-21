import type { Pbi } from "../pbis/pbis.types.js";

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

export interface PbiQualityRuleConfiguration {
  /** Version of the effective checklist; clients can distinguish changed rule sets. */
  rule_version: string;
  /** Enabled checks carry item-specific applicability logic; inapplicable checks are omitted from score. */
  checks: Array<{ check_id: PbiQualityCheck; isApplicable: (pbi: Pbi) => boolean }>;
}

export interface QualityRuleConfigurationProvider {
  getCurrentPbiConfiguration(): Promise<PbiQualityRuleConfiguration>;
}

export interface QualityReport {
  entity_type: EntityType;
  entity_id: string;
  rule_version: string;
  checks: QualityCheckResult[];
  score_completude: number | null;
}

export interface CompletudeCalculation {
  applicable_checks: number;
  passed_checks: number;
  score: number | null;
}
