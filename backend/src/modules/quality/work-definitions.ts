import { z } from 'zod';
import { pool } from '../../database/db.js';
import { withTransaction } from '../../database/transaction.js';
import { ConflictError } from '../../shared/errors.js';
import { auditService } from '../audit/audit.service.js';

const conditions=z.array(z.string().trim().min(1).max(500)
  .refine(value=>!/[\u0000\uD800-\uDFFF]/u.test(value),'Use texto Unicode válido, sem caractere nulo.')
  .refine(value=>!/[\r\n\u2028\u2029]/u.test(value),'Cada condição deve ocupar uma única linha.')).max(50)
  .refine(items=>new Set(items.map(item=>item.normalize('NFC').toLocaleLowerCase('pt-BR'))).size===items.length,'Não repita condições na mesma definição.');
const definition=z.object({dor:conditions,dod:conditions}).strict();
export const workDefinitionsSchema=z.object({
  expected_version:z.number().int().positive().max(2147483646),
  levels:z.object({epico:definition,feature:definition,pbi:definition}).strict(),
}).strict();

export async function getWorkDefinitions() {
  const result=await pool.query('SELECT version,levels,updated_by,updated_by_name,updated_at FROM work_definitions WHERE id=TRUE');
  return result.rows[0];
}

export async function saveWorkDefinitions(input:z.infer<typeof workDefinitionsSchema>,userId:string) {
  return withTransaction(pool,async client=>{
    const before=(await client.query('SELECT * FROM work_definitions WHERE id=TRUE FOR UPDATE')).rows[0];
    if(before.version!==input.expected_version)throw new ConflictError('As definições mudaram. Recarregue antes de salvar.');
    const result=await client.query(`UPDATE work_definitions SET levels=$1::jsonb,version=version+1,
      updated_by=$2,updated_by_name=(SELECT nome FROM usuario WHERE id=$2),updated_at=clock_timestamp()
      WHERE id=TRUE RETURNING version,levels,updated_by,updated_by_name,updated_at`,[JSON.stringify(input.levels),userId]);
    await auditService.record({usuario_id:userId,entidade_tipo:'work_definitions',
      entidade_id:'00000000-0000-4000-8000-000000000020',acao:'ATUALIZAR_DOR_DOD',
      dados_json:{before:before.levels,after:input.levels,version:result.rows[0].version}},client);
    return result.rows[0];
  });
}
