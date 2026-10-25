import { apiRequest } from './api_auth';
export type WorkLevel='epico'|'feature'|'pbi';
export interface WorkDefinitions {
  version:number;
  levels:Record<WorkLevel,{dor:string[];dod:string[]}>;
  updated_by:string|null;
  updated_by_name:string|null;
  updated_at:string;
}
export async function getWorkDefinitions(signal:AbortSignal):Promise<WorkDefinitions> {
  return (await apiRequest('/quality/configuration/definitions',{signal})).json();
}
export async function saveWorkDefinitions(config:WorkDefinitions):Promise<WorkDefinitions> {
  const response=await apiRequest('/quality/configuration/definitions',{method:'PUT',body:JSON.stringify({expected_version:config.version,levels:config.levels})});
  const result=await response.json();
  window.dispatchEvent(new Event('work-definitions-updated'));
  return result;
}
