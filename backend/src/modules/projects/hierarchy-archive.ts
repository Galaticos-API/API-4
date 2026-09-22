import { type RequestHandler } from "express";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../../database/db.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { ArchiveConflict } from "./archive.types.js";
import { auditService } from "../audit/audit.service.js";

type Kind = "epico" | "feature" | "pbi";
const scope = {
  epico: { epico: "id = $1", feature: "epico_id = $1", pbi: "feature_id IN (SELECT id FROM feature WHERE epico_id = $1)" },
  feature: { feature: "id = $1", pbi: "feature_id = $1" },
  pbi: { pbi: "id = $1" },
} as const;
const count = z.number().int().nonnegative();
export const hierarchyArchiveSchema = z.object({
  confirmado: z.literal(true),
  impacto: z.object({ epicos: count, features: count, pbis: count }).strict(),
  justificativa: z.string().trim().max(2000).optional(),
});

// The same lock order is used by archive and ordinary hierarchy writers.
export async function lockHierarchy(client: PoolClient) {
  await client.query("LOCK TABLE projeto, epico, feature, pbi IN SHARE ROW EXCLUSIVE MODE");
}

export async function assertWritable(client: PoolClient, kind: Kind | "projeto", id: string) {
  const queries = {
    projeto: "SELECT status = 'arquivado' AS archived FROM projeto WHERE id = $1",
    epico: "SELECT e.status = 'arquivado' OR p.status = 'arquivado' AS archived FROM epico e JOIN projeto p ON p.id=e.projeto_id WHERE e.id=$1",
    feature: "SELECT f.status = 'arquivado' OR e.status = 'arquivado' OR p.status = 'arquivado' AS archived FROM feature f JOIN epico e ON e.id=f.epico_id JOIN projeto p ON p.id=e.projeto_id WHERE f.id=$1",
    pbi: "SELECT b.status = 'arquivado' OR f.status = 'arquivado' OR e.status = 'arquivado' OR p.status = 'arquivado' AS archived FROM pbi b JOIN feature f ON f.id=b.feature_id JOIN epico e ON e.id=f.epico_id JOIN projeto p ON p.id=e.projeto_id WHERE b.id=$1",
  };
  const row = (await client.query(queries[kind], [id])).rows[0];
  if (!row) throw new NotFoundError();
  if (row.archived) throw new ArchiveConflict("Item ou ancestral arquivado está disponível apenas para leitura.");
}

export class HierarchyArchiveRepository {
  constructor(private readonly db: Pool = pool) {}
  async impact(kind: Kind, id: string, db: Pool | PoolClient = this.db) {
    if (!(await db.query(`SELECT id FROM ${kind} WHERE id=$1`, [id])).rowCount) throw new NotFoundError();
    const result = { epicos: 0, features: 0, pbis: 0 };
    for (const [table, where] of Object.entries(scope[kind])) {
      const key = table === "epico" ? "epicos" : table === "feature" ? "features" : "pbis";
      result[key] = (await db.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE ${where} AND status != 'arquivado'`, [id])).rows[0].total;
    }
    return result;
  }
  async archive(kind: Kind, id: string, input: z.infer<typeof hierarchyArchiveSchema>, userId?: string) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      const root = (await client.query(`SELECT * FROM ${kind} WHERE id=$1`, [id])).rows[0];
      if (!root) throw new NotFoundError();
      if (root.status === "arquivado") { await client.query("COMMIT"); return root; }
      await assertWritable(client, kind, id);
      const impact = await this.impact(kind, id, client);
      if ((Object.keys(impact) as (keyof typeof impact)[]).some(key => impact[key] !== input.impacto[key])) {
        throw new ArchiveConflict("A quantidade de itens mudou. Consulte a prévia e confirme novamente.");
      }
      for (const [table, where] of Object.entries(scope[kind])) {
        await client.query(`UPDATE ${table} SET status='arquivado', archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE ${where} AND status != 'arquivado'`, [id]);
      }
      await auditService.record({ usuario_id: userId ?? null, entidade_tipo: kind, entidade_id: id,
        acao: `ARQUIVAR_${kind.toUpperCase()}`, justificativa: input.justificativa ?? null,
        dados_json: { status_anterior: root.status, status_novo: "arquivado", impacto: impact } }, client);
      const updated = (await client.query(`SELECT * FROM ${kind} WHERE id=$1`, [id])).rows[0];
      await client.query("COMMIT");
      return updated;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}

export function archiveHandlers(kind: Kind) {
  const repository = new HierarchyArchiveRepository();
  const impact: RequestHandler = async (req, res, next) => {
    try { const id = String(req.params.id); validateUuid(id, "ID"); res.json(await repository.impact(kind, id)); }
    catch (error) { next(error); }
  };
  const archive: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id); validateUuid(id, "ID");
      const parsed = hierarchyArchiveSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Confirme o arquivamento com a prévia de impacto válida.");
      res.json(await repository.archive(kind, id, parsed.data, req.auth?.id));
    } catch (error) { next(error); }
  };
  return { impact, archive };
}
