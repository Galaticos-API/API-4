import test from 'node:test';
import assert from 'node:assert/strict';
import { workDefinitionsSchema } from './work-definitions.js';
const body={expected_version:1,levels:{epico:{dor:[],dod:[]},feature:{dor:[],dod:[]},pbi:{dor:['História compreensível'],dod:['Testes revisados']}}};
test('DoR/DoD preserva níveis distintos, permite remover condições e normaliza espaços',()=>{
  assert.ok(workDefinitionsSchema.safeParse(body).success);
  const parsed=workDefinitionsSchema.parse({...body,levels:{...body.levels,pbi:{dor:['  Revisar critérios  '],dod:[]}}});
  assert.deepEqual(parsed.levels.pbi,{dor:['Revisar critérios'],dod:[]});
  assert.deepEqual(parsed.levels.epico,{dor:[],dod:[]});
});
test('DoR/DoD rejeita condições duplicadas, excessivas, vazias e campos desconhecidos',()=>{
  for(const dor of [[''],['Revisar','revisar'],['a'.repeat(501)],Array.from({length:51},(_,i)=>'Condição '+i)]) {
    assert.equal(workDefinitionsSchema.safeParse({...body,levels:{...body.levels,pbi:{dor,dod:[]}}}).success,false);
  }
  assert.equal(workDefinitionsSchema.safeParse({...body,unknown:true}).success,false);
  assert.equal(workDefinitionsSchema.safeParse({...body,expected_version:0}).success,false);
});
test('uma condição não pode conter quebras de linha que mudariam sua estrutura no editor',()=>{
  for(const separator of ['\n','\r','\r\n','\u2028','\u2029']) {
    assert.equal(workDefinitionsSchema.safeParse({...body,levels:{...body.levels,pbi:{dor:['Revisar requisitos'+separator+'Validar evidências'],dod:[]}}}).success,false);
  }
});
test('DoR/DoD recusa texto incompatível com JSONB e preserva emojis válidos',()=>{
  for(const invalid of ['\u0000','\uD800','\uDC00']) {
    assert.equal(workDefinitionsSchema.safeParse({...body,levels:{...body.levels,pbi:{dor:['Revisar '+invalid+' critérios'],dod:[]}}}).success,false);
  }
  assert.ok(workDefinitionsSchema.safeParse({...body,levels:{...body.levels,pbi:{dor:['Revisar critérios ✅ 😀'],dod:[]}}}).success);
});
