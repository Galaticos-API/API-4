import type { Pool, PoolClient } from 'pg';
import { pool } from '../../database/db.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { QualityConfigurationRepository } from './quality.configuration.repository.js';
import { identificarTermosVagos, validarTituloInfinitivo, validarHistoria, validarCenario } from './quality.rules.js';
import { effectiveConfiguration } from './organization-quality.types.js';
import type { EntityType } from './quality.types.js';

export async function evaluateOrganizationQuality(kind: EntityType, id: string, executor: Pool | PoolClient = pool, lock = false) {
  const config=await new QualityConfigurationRepository().getOrganizationConfiguration(executor,lock);
  const entity=(await executor.query(`SELECT * FROM ${kind} WHERE id=$1`,[id])).rows[0];
  if(!entity) throw new NotFoundError('Item não encontrado.');
  const criteria=(await executor.query('SELECT * FROM criterio_aceitacao WHERE entidade_tipo=$1 AND entidade_id=$2 ORDER BY ordem,id',[kind,id])).rows;
  const required=kind==='epico' ? ['descricao','objetivo','escopo_macro','resultado_esperado'] : ['descricao','objetivo'];
  const text=[entity.titulo,entity.descricao,entity.objetivo,entity.escopo_macro,entity.resultado_esperado,
    entity.historia_como_um,entity.historia_eu_quero,entity.historia_para_que,entity.regras_observacoes,
    ...criteria.flatMap(row=>[row.texto,row.nome,row.dado,row.quando,row.entao])].filter(value=>typeof value==='string').join('\n');
  const vague=identificarTermosVagos(text,config.vague_terms);
  let prototype=false;
  if(kind==='pbi' && entity.requer_interface) prototype=Boolean((await executor.query('SELECT 1 FROM prototipo WHERE pbi_id=$1 LIMIT 1',[id])).rowCount);
  const results: Record<string,{passed:boolean;blocking:boolean;label:string}> = {
    campos_obrigatorios:{passed:required.every(field=>String(entity[field] ?? '').trim()),blocking:true,label:'Campos obrigatórios do guia'},
    criterios_aceitacao:{passed:criteria.length>0,blocking:kind==='epico',label:'Critérios de aceitação registrados'},
    titulo_infinitivo:{passed:validarTituloInfinitivo(entity.titulo).aprovado,blocking:true,label:'Título com verbo no infinitivo'},
    historia_completa:{passed:kind==='pbi' && validarHistoria({comoUm:entity.historia_como_um,euQuero:entity.historia_eu_quero,paraQue:entity.historia_para_que}).aprovado,blocking:true,label:'História do usuário completa'},
    cenario_estruturado:{passed:criteria.length>0 && criteria.every(row=>validarCenario(row).aprovado),blocking:true,label:'Cenários estruturados'},
    prototipo_vinculado:{passed:prototype,blocking:true,label:'Protótipo associado'},
    termos_vagos:{passed:vague.length===0,blocking:false,label:'Ausência de termos vagos'},
  };
  const checks=Object.entries(config.levels[kind]).filter(([key,enabled])=>enabled && (key!=='prototipo_vinculado' || entity.requer_interface))
    .map(([key])=>({check_id:key,check_name:results[key].label,passed:results[key].passed,is_blocking:results[key].blocking,
      message:key==='termos_vagos' && vague.length ? `Termos encontrados: ${vague.join(', ')}.` : results[key].passed ? 'Verificação atendida.' : 'Verificação pendente.'}));
  const completion=(await executor.query(`SELECT c.*,h.updated_at AS configuration_updated_at,
    h.updated_by AS configuration_updated_by,h.updated_by_name AS configuration_updated_by_name
    FROM quality_completion c LEFT JOIN quality_configuration_history h ON h.version=c.configuration_version
    WHERE c.entidade_tipo=$1 AND c.entidade_id=$2`,[kind,id])).rows[0];
  return {entity_type:kind,entity_id:id,status:entity.status,configuration_version:config.version,
    rule_version:`${kind}-quality-v${config.version}`,checks,
    score_completude:checks.length ? Math.round(checks.filter(check=>check.passed).length/checks.length*100) : null,
    completion:completion ? {configuration_version:completion.configuration_version,evaluated_at:completion.evaluated_at,
      evaluated_by:completion.evaluated_by,previous_criteria:completion.configuration_version!==config.version,
      configuration:completion.configuration_snapshot ? effectiveConfiguration(completion.configuration_snapshot,completion.configuration_version,completion.configuration_updated_at,
        completion.configuration_updated_by || completion.configuration_updated_by_name
          ? {id:completion.configuration_updated_by,nome:completion.configuration_updated_by_name ?? 'Usuário não identificado'} : null) : null}
      : entity.status==='concluido' ? {configuration_version:null,evaluated_at:null,evaluated_by:null,previous_criteria:true,configuration:null} : null};
}

export async function assertOrganizationCompletion(client: PoolClient,kind: 'epico' | 'feature',id: string) {
  const report=await evaluateOrganizationQuality(kind,id,client,true);
  const missing=report.checks.filter(check=>check.is_blocking && !check.passed);
  if(missing.length) throw new ValidationError('Preencha as verificações obrigatórias antes de concluir.',{campos_faltantes:missing.map(check=>check.check_id)});
}
