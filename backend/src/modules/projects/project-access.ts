import type { Pool } from "pg";
import { pool } from "../../database/db.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";

// Arguments are SQL expressions controlled by repositories, never request input.
export function projectAccessSql(project: string, user: string): string {
  return `EXISTS (SELECT 1 FROM usuario access_user WHERE access_user.id=${user} AND
    (access_user.role IN ('admin','po') OR EXISTS (
      SELECT 1 FROM desenvolvedor access_dev JOIN alocacao access_allocation ON access_allocation.desenvolvedor_id=access_dev.id
      WHERE access_dev.usuario_id=access_user.id AND access_allocation.projeto_id=${project}
        AND access_allocation.data_inicio<=CURRENT_TIMESTAMP
        AND (access_allocation.data_fim IS NULL OR access_allocation.data_fim>CURRENT_TIMESTAMP))))`;
}
const entities: Record<string, string> = {
  projeto: "SELECT id AS projeto_id FROM projeto WHERE id=$1",
  epico: "SELECT projeto_id FROM epico WHERE id=$1",
  feature: "SELECT e.projeto_id FROM feature f JOIN epico e ON e.id=f.epico_id WHERE f.id=$1",
  pbi: "SELECT e.projeto_id FROM pbi b JOIN feature f ON f.id=b.feature_id JOIN epico e ON e.id=f.epico_id WHERE b.id=$1",
};
export class ProjectAccess {
  constructor(private readonly db: Pick<Pool,"query"> = pool) {}
  async assertEntity(userId: string, kind: string, id: string): Promise<void> {
    validateUuid(id,"ID da entidade");
    if (kind === "criterio") {
      const row = (await this.db.query("SELECT entidade_tipo,entidade_id FROM criterio_aceitacao WHERE id=$1",[id])).rows[0];
      if (!row) throw new NotFoundError("Item não encontrado.");
      return this.assertEntity(userId,row.entidade_tipo,row.entidade_id);
    }
    if (!Object.hasOwn(entities,kind)) throw new ValidationError("Tipo de entidade inválido.");
    const result = await this.db.query(`SELECT scope.projeto_id FROM (${entities[kind]}) scope WHERE ${projectAccessSql("scope.projeto_id","$2")}`,[id,userId]);
    if (!result.rowCount) throw new NotFoundError("Item não encontrado.");
  }
}
