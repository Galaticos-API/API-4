import { apiRequest } from './api_auth';
export type Level = 'epico' | 'feature' | 'pbi';
export interface OrganizationConfiguration {
  version:number; levels:Record<Level,Record<string,boolean>>; vague_terms:string[];
  exigir_justificativa_item_concluido:boolean; updated_at:string; updated_by:{id:string|null;nome:string}|null;
}
export interface OrganizationQualityReport {
  entity_type:Level; entity_id:string; status:string; configuration_version:number; rule_version:string;
  checks:Array<{check_id:string;check_name:string;passed:boolean;is_blocking:boolean;message:string}>;
  score_completude:number|null;
  completion:{configuration_version:number|null;evaluated_at:string|null;previous_criteria:boolean;configuration:OrganizationConfiguration|null}|null;
}
export async function getOrganizationConfiguration(signal:AbortSignal):Promise<OrganizationConfiguration> {
  return (await apiRequest('/quality/configuration/organization',{signal})).json();
}
export async function saveOrganizationConfiguration(config:OrganizationConfiguration,terms:string[]):Promise<OrganizationConfiguration> {
  const response=await apiRequest('/quality/configuration/organization',{method:'PUT',body:JSON.stringify({
    expected_version:config.version,levels:config.levels,vague_terms:terms,
    exigir_justificativa_item_concluido:config.exigir_justificativa_item_concluido,
  })});
  const saved=await response.json() as OrganizationConfiguration;
  window.dispatchEvent(new Event('organization-quality-updated'));
  return saved;
}
export async function getOrganizationQuality(kind:Level,id:string,signal:AbortSignal):Promise<OrganizationQualityReport> {
  return (await apiRequest(`/quality/items/${kind}/${encodeURIComponent(id)}`,{signal})).json();
}
export async function getQualityHistory(signal:AbortSignal,before?:number):Promise<{items:OrganizationConfiguration[];next_before:number|null}> {
  return (await apiRequest('/quality/configuration/history?limit=25'+(before?`&before=${before}`:''),{signal})).json();
}
