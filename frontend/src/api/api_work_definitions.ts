import { apiRequest } from './api_auth';
export type WorkLevel='epico'|'feature'|'pbi';
export interface WorkDefinitions {
  version:number;
  levels:Record<WorkLevel,{dor:string[];dod:string[]}>;
  updated_by:string|null;
  updated_by_name:string|null;
  updated_at:string;
}
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
function parseDefinitions(data:unknown):WorkDefinitions {
  if(!record(data)||typeof data.version!=='number'||!Number.isInteger(data.version)||data.version<1||data.version>2147483647
    ||!record(data.levels)||typeof data.updated_at!=='string'||!Number.isFinite(Date.parse(data.updated_at))
    ||(data.updated_by!==null&&typeof data.updated_by!=='string')
    ||(data.updated_by_name!==null&&typeof data.updated_by_name!=='string'))throw new Error('Definições inválidas');
  for(const level of ['epico','feature','pbi']) {
    const definition=data.levels[level];
    if(!record(definition))throw new Error('Nível de definição inválido');
    for(const kind of ['dor','dod']) {
      const conditions=definition[kind];
      if(!Array.isArray(conditions)||conditions.length>50
        ||conditions.some(condition=>typeof condition!=='string'||!condition.trim()||condition.length>500||/[\u0000\r\n\u2028\u2029\uD800-\uDFFF]/u.test(condition)))throw new Error('Condições inválidas');
    }
  }
  return data as unknown as WorkDefinitions;
}
export async function getWorkDefinitions(signal:AbortSignal):Promise<WorkDefinitions> {
  return parseDefinitions(await (await apiRequest('/quality/configuration/definitions',{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])})).json());
}
export async function saveWorkDefinitions(config:WorkDefinitions):Promise<WorkDefinitions> {
  const response=await apiRequest('/quality/configuration/definitions',{method:'PUT',body:JSON.stringify({expected_version:config.version,levels:config.levels})});
  const result=parseDefinitions(await response.json());
  window.dispatchEvent(new Event('work-definitions-updated'));
  return result;
}
