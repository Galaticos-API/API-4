import { expect,it } from 'vitest';
import { evaluatePbiRealtime } from './qualityEngine';

const fields={titulo:'Validar acesso',historia_como_um:'usuário',historia_eu_quero:'consultar',historia_para_que:'validar dados',requer_interface:false};
const policy={checks:{termos_vagos:true},vague_terms:['especialissimo']};
it('verifica termos vagos nas regras e observações do PBI',()=>{
  const data={...fields,regras_observacoes:'Fluxo especialissimo'};
  const report=evaluatePbiRealtime(data,[],policy);
  expect(report.checks[0].passed).toBe(false);expect(report.score_completude).toBe(0);
  expect(report.checks[0].target_field_id).toBe('regras_observacoes');
});
it('verifica termos vagos no nome do cenário',()=>{
  const report=evaluatePbiRealtime(fields,[{id:'c1',nome:'Fluxo especialissimo',dado:'um usuário',quando:'consultar',entao:'retornar dados'}],policy);
  expect(report.checks[0].passed).toBe(false);expect(report.score_completude).toBe(0);
});
it('não inventa um termo composto juntando o nome e o texto do cenário',()=>{
  const config={checks:{termos_vagos:true},vague_terms:['muito rápido']};
  const scenario={id:'c1',nome:'muito',dado:'rápido',quando:'consultar',entao:'retornar dados'};
  expect(evaluatePbiRealtime(fields,[scenario],config).checks[0].passed).toBe(true);
  expect(evaluatePbiRealtime(fields,[{...scenario,dado:'muito rápido'}],config).checks[0].passed).toBe(false);
});
