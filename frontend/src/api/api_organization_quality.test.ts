import {afterEach,expect,it,vi} from 'vitest';
import {getOrganizationConfiguration,getOrganizationQuality,getQualityHistory,saveOrganizationConfiguration,type OrganizationConfiguration} from './api_organization_quality';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();});
const config:OrganizationConfiguration={version:1,updated_at:'2026-10-25T12:00:00Z',updated_by:null,vague_terms:[],exigir_justificativa_item_concluido:true,
  levels:{epico:{campos_obrigatorios:true,criterios_aceitacao:true,termos_vagos:true},feature:{campos_obrigatorios:true,criterios_aceitacao:false,termos_vagos:true},pbi:{titulo_infinitivo:true,historia_completa:true,cenario_estruturado:true,termos_vagos:true,prototipo_vinculado:true}}};
const reads=[(signal:AbortSignal)=>getOrganizationConfiguration(signal),(signal:AbortSignal)=>getQualityHistory(signal),(signal:AbortSignal)=>getOrganizationQuality('pbi','item',signal)];
it.each([0,1,2])('encerra consulta de qualidade sem resposta: %s',async index=>{
  vi.useFakeTimers();
  vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;});
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(new DOMException('Tempo excedido','AbortError')),{once:true});
  })));
  let outcome='aguardando';void reads[index](new AbortController().signal).then(()=>{outcome='sucesso';},()=>{outcome='falha';});
  await vi.advanceTimersByTimeAsync(16000);expect(outcome).toBe('falha');
});
it.each([0,1,2])('rejeita dados incompatíveis antes de renderizar qualidade: %s',async index=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(index===0?{...config,levels:{}}:index===1?{items:{},next_before:null}:{checks:{}}))));
  await expect(reads[index](new AbortController().signal)).rejects.toThrow();
});
it('não anuncia atualização quando o salvamento retorna configuração inválida',async()=>{
  const dispatch=vi.spyOn(window,'dispatchEvent');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({version:2}))));
  await expect(saveOrganizationConfiguration(config,[])).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled();
});
it('preserva configuração válida, autoria removida e paginação do histórico',async()=>{
  const saved={...config,version:2,updated_by:{id:null,nome:'Administradora anterior'}};
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({items:[saved,config],next_before:1}))));
  expect(await getQualityHistory(new AbortController().signal)).toEqual({items:[saved,config],next_before:1});
});
it.each([null,{configuration_version:1,evaluated_at:'2026-10-25T12:00:00Z',previous_criteria:true,configuration:config},
  {configuration_version:null,evaluated_at:null,previous_criteria:true,configuration:null}])('aceita avaliação válida sem checks e preserva os critérios históricos: %j',async completion=>{
  const report={entity_type:'pbi',entity_id:'item',status:'concluido',configuration_version:2,rule_version:'pbi-quality-v2',checks:[],score_completude:null,completion};
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(report))));
  expect(await getOrganizationQuality('pbi','item',new AbortController().signal)).toEqual(report);
});
it('anuncia a atualização somente depois de validar o salvamento',async()=>{
  const dispatch=vi.spyOn(window,'dispatchEvent');
  const saved={...config,version:2,vague_terms:['ágil']};
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(saved))));
  expect(await saveOrganizationConfiguration(config,['ágil'])).toEqual(saved);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({type:'organization-quality-updated'}));
});
