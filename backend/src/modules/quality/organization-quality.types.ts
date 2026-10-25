import { z } from 'zod';
import { validDatabaseText } from '../../shared/text-validation.js';
import { TERMOS_VAGOS_PADRAO } from './quality.rules.js';

export const organizationChecksSchema = z.object({
  campos_obrigatorios: z.boolean(), criterios_aceitacao: z.boolean(), termos_vagos: z.boolean(),
}).strict();
export const vagueTermSchema = z.string().trim().min(1).max(80)
  .refine(validDatabaseText, 'Use texto Unicode válido, sem caractere nulo.')
  .refine(term=>!/[\r\n\u2028\u2029]/u.test(term),'Cada termo deve ocupar uma única linha.')
  .transform(term=>term.normalize('NFC'));
export const organizationConfigurationSchema = z.object({
  expected_version: z.number().int().positive().max(2147483647),
  levels: z.object({
    epico: organizationChecksSchema,
    feature: organizationChecksSchema,
    pbi: z.object({ titulo_infinitivo:z.boolean(), historia_completa:z.boolean(), cenario_estruturado:z.boolean(), termos_vagos:z.boolean(), prototipo_vinculado:z.boolean() }).strict(),
  }).strict(),
  vague_terms: z.array(vagueTermSchema).max(100),
  exigir_justificativa_item_concluido: z.boolean(),
}).strict().refine(input=>new Set(input.vague_terms.map(term=>term.toLocaleLowerCase('pt-BR'))).size===input.vague_terms.length, 'Não repita termos vagos.');
export type OrganizationConfigurationInput = z.infer<typeof organizationConfigurationSchema>;
export interface OrganizationConfiguration extends Omit<OrganizationConfigurationInput,'expected_version'> {
  version: number; updated_at: string; updated_by: { id: string | null; nome: string } | null;
}
export const DEFAULT_LEVEL_CHECKS = {
  epico: {campos_obrigatorios:true,criterios_aceitacao:true,termos_vagos:true},
  feature: {campos_obrigatorios:true,criterios_aceitacao:false,termos_vagos:true},
  pbi: {titulo_infinitivo:true,historia_completa:true,cenario_estruturado:true,termos_vagos:true,prototipo_vinculado:true},
};
interface RawOrganizationConfiguration {
  levels?: {epico?:Partial<OrganizationConfiguration['levels']['epico']>;feature?:Partial<OrganizationConfiguration['levels']['feature']>};
  checks?:Partial<OrganizationConfiguration['levels']['pbi']>;
  vague_terms?:string[]; exigir_justificativa_item_concluido?:boolean;
}
export function effectiveConfiguration(raw: RawOrganizationConfiguration, version: number, updated_at: Date | string, updated_by: OrganizationConfiguration['updated_by']): OrganizationConfiguration {
  return {
    version, updated_at:new Date(updated_at).toISOString(), updated_by,
    levels: {
      epico:{...DEFAULT_LEVEL_CHECKS.epico,...raw.levels?.epico},
      feature:{...DEFAULT_LEVEL_CHECKS.feature,...raw.levels?.feature},
      pbi:{...DEFAULT_LEVEL_CHECKS.pbi,...raw.checks},
    },
    vague_terms:raw.vague_terms ?? [...TERMOS_VAGOS_PADRAO],
    exigir_justificativa_item_concluido:raw.exigir_justificativa_item_concluido ?? true,
  };
}
