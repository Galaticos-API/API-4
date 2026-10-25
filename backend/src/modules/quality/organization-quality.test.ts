import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveConfiguration, organizationConfigurationSchema } from './organization-quality.types.js';
import { identificarTermosVagos } from './quality.rules.js';

test('S2-19: padrão por nível e compatibilidade com configuração legada de PBI',()=>{
  const current=effectiveConfiguration({},1,'2026-10-25T12:00:00Z',null);
  assert.equal(current.levels.epico.campos_obrigatorios,true);
  assert.equal(current.levels.feature.campos_obrigatorios,true);
  assert.equal(current.levels.feature.criterios_aceitacao,false);
  const legacy=effectiveConfiguration({checks:{titulo_infinitivo:false}},2,current.updated_at,null);
  assert.equal(legacy.levels.pbi.titulo_infinitivo,false);assert.equal(legacy.levels.epico.campos_obrigatorios,true);
});
test('S2-19: schemas recusam checks de outro nível e termos duplicados',()=>{
  const current=effectiveConfiguration({},1,'2026-10-25T12:00:00Z',null);
  const body={expected_version:1,levels:current.levels,vague_terms:[],exigir_justificativa_item_concluido:true};
  assert.equal(organizationConfigurationSchema.safeParse(body).success,true);
  assert.equal(organizationConfigurationSchema.safeParse({...body,levels:{...body.levels,epico:{...body.levels.epico,historia_completa:true}}}).success,false);
  assert.equal(organizationConfigurationSchema.safeParse({...body,vague_terms:['Ágil','ágil']}).success,false);
  assert.equal(organizationConfigurationSchema.safeParse({...body,vague_terms:['ágil','a\u0301gil']}).success,false);
});
test('S2-19: dicionário reconhece acentos e frases sem casar partes de palavras ou regex',()=>{
  assert.deepEqual(identificarTermosVagos('ÁGIL e ótimo, muito rápido.',['ágil','ótimo','muito rápido']),['ágil','ótimo','muito rápido']);
  assert.deepEqual(identificarTermosVagos('facilidade e agilizar',['fácil','ágil']),[]);
  assert.deepEqual(identificarTermosVagos('literal a+b e nada de aab',['a+b']),['a+b']);
});
