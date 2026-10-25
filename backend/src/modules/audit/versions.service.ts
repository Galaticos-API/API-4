import { Pool } from 'pg';
import { isDeepStrictEqual } from 'node:util';
import { pool } from '../../database/db.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { ProjectAccess, projectAccessSql } from '../projects/project-access.js';
import type { EntityType } from '../quality/quality.types.js';

export interface VersionFilters {
  limit: number; before?: number; autor_id?: string; desde?: string; ate?: string;
}
export interface ItemVersion {
  id: string; versao: number; autor_id: string | null; autor_nome: string | null;
  acao: string; justificativa: string | null; created_at: string;
  snapshot_json: Record<string, unknown>;
}
export function compareSnapshots(before: Record<string, unknown>, after: Record<string, unknown>) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(campo =>
    isDeepStrictEqual(before[campo] ?? null, after[campo] ?? null)
      ? [] : [{ campo, anterior: before[campo] ?? null, novo: after[campo] ?? null }]);
}
export class VersionsService {
  constructor(private readonly db: Pool = pool) {}
  async list(user: string, kind: EntityType, id: string, filter: VersionFilters) {
    await new ProjectAccess(this.db).assertEntity(user, kind, id);
    const result = await this.db.query<Omit<ItemVersion, 'snapshot_json'>>(`SELECT id,versao,autor_id,autor_nome,acao,justificativa,created_at
      FROM item_versao v WHERE entidade_tipo=$1 AND entidade_id=$2
      AND ${projectAccessSql('v.projeto_id','$8')}
      AND ($3::integer IS NULL OR versao<$3) AND ($4::uuid IS NULL OR autor_id=$4)
      AND ($5::timestamptz IS NULL OR created_at >= $5) AND ($6::timestamptz IS NULL OR created_at <= $6)
      ORDER BY versao DESC LIMIT $7`, [kind,id,filter.before ?? null,filter.autor_id ?? null,filter.desde ?? null,filter.ate ?? null,filter.limit+1,user]);
    const items = result.rows.slice(0,filter.limit);
    return { items, next_before: result.rows.length>filter.limit ? items.at(-1)!.versao : null };
  }
  async compare(user: string, kind: EntityType, id: string, from: number, to: number) {
    await new ProjectAccess(this.db).assertEntity(user, kind, id);
    if (from === to) throw new ValidationError('Selecione duas versões diferentes.');
    const result = await this.db.query<ItemVersion>(`SELECT id,versao,autor_id,autor_nome,acao,justificativa,created_at,snapshot_json
      FROM item_versao v WHERE entidade_tipo=$1 AND entidade_id=$2 AND versao=ANY($3::integer[])
      AND ${projectAccessSql('v.projeto_id','$4')}`,[kind,id,[from,to],user]);
    const before = result.rows.find(row=>row.versao===from), after = result.rows.find(row=>row.versao===to);
    if (!before || !after) throw new NotFoundError('Versão não encontrada para este item.');
    return { anterior: before, nova: after, campos: compareSnapshots(before.snapshot_json,after.snapshot_json) };
  }
}
