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
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const version=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>0&&value<=2147483647;
const instant=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const querySignal=(signal:AbortSignal)=>AbortSignal.any([signal,AbortSignal.timeout(15000)]);
const checksByLevel={epico:['campos_obrigatorios','criterios_aceitacao','termos_vagos'],
  feature:['campos_obrigatorios','criterios_aceitacao','termos_vagos'],
  pbi:['titulo_infinitivo','historia_completa','cenario_estruturado','termos_vagos','prototipo_vinculado']};

function parseConfiguration(data:unknown):OrganizationConfiguration {
  if(!record(data)||!version(data.version)||!instant(data.updated_at)||!record(data.levels)
    ||typeof data.exigir_justificativa_item_concluido!=='boolean'||!Array.isArray(data.vague_terms)
    ||!data.vague_terms.every(term=>typeof term==='string'))throw new Error('Configuração de qualidade inválida');
  for(const [level,checks] of Object.entries(checksByLevel)) {
    const values=data.levels[level];
    if(!record(values)||checks.some(check=>typeof values[check]!=='boolean')
      ||Object.keys(values).some(check=>!checks.includes(check)))throw new Error('Verificações de qualidade inválidas');
  }
  const author=data.updated_by;
  if(author!==null&&(!record(author)||(author.id!==null&&typeof author.id!=='string')||typeof author.nome!=='string'))throw new Error('Autoria da configuração inválida');
  return data as unknown as OrganizationConfiguration;
}

function parseReport(data:unknown,kind:Level,id:string):OrganizationQualityReport {
  if(!record(data)||data.entity_type!==kind||typeof data.entity_id!=='string'||data.entity_id.toLowerCase()!==id.toLowerCase()
    ||typeof data.status!=='string'||!version(data.configuration_version)||typeof data.rule_version!=='string'
    ||!Array.isArray(data.checks)||data.checks.some(check=>!record(check)||typeof check.check_id!=='string'
      ||typeof check.check_name!=='string'||typeof check.message!=='string'||typeof check.passed!=='boolean'||typeof check.is_blocking!=='boolean')
    ||(data.score_completude!==null&&(typeof data.score_completude!=='number'||!Number.isFinite(data.score_completude)||data.score_completude<0||data.score_completude>100)))throw new Error('Avaliação de qualidade inválida');
  const completion=data.completion;
  if(completion!==null) {
    if(!record(completion)||(completion.configuration_version!==null&&!version(completion.configuration_version))
      ||(completion.evaluated_at!==null&&!instant(completion.evaluated_at))||typeof completion.previous_criteria!=='boolean')throw new Error('Registro de conclusão inválido');
    if(completion.configuration!==null)parseConfiguration(completion.configuration);
  }
  return data as unknown as OrganizationQualityReport;
}
export async function getOrganizationConfiguration(signal:AbortSignal):Promise<OrganizationConfiguration> {
  return parseConfiguration(await (await apiRequest('/quality/configuration/organization',{signal:querySignal(signal)})).json());
}
export async function saveOrganizationConfiguration(config:OrganizationConfiguration,terms:string[]):Promise<OrganizationConfiguration> {
  const response=await apiRequest('/quality/configuration/organization',{method:'PUT',body:JSON.stringify({
    expected_version:config.version,levels:config.levels,vague_terms:terms,
    exigir_justificativa_item_concluido:config.exigir_justificativa_item_concluido,
  })});
  const saved=parseConfiguration(await response.json());
  window.dispatchEvent(new Event('organization-quality-updated'));
  return saved;
}
export async function getOrganizationQuality(kind:Level,id:string,signal:AbortSignal):Promise<OrganizationQualityReport> {
  return parseReport(await (await apiRequest(`/quality/items/${kind}/${encodeURIComponent(id)}`,{signal:querySignal(signal)})).json(),kind,id);
}
export async function getQualityHistory(signal:AbortSignal,before?:number):Promise<{items:OrganizationConfiguration[];next_before:number|null}> {
  const data:unknown=await (await apiRequest('/quality/configuration/history?limit=25'+(before?`&before=${before}`:''),{signal:querySignal(signal)})).json();
  if(!record(data)||!Array.isArray(data.items)||(data.next_before!==null&&!version(data.next_before)))throw new Error('Histórico da configuração inválido');
  return {items:data.items.map(parseConfiguration),next_before:data.next_before};
}
