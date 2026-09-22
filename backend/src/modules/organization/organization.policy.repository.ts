import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { auditService } from "../audit/audit.service.js";
import { ChangeJustificationPolicy } from "../audit/change-justification.js";
import { OrganizationPolicy, OrganizationPolicyInput } from "./organization.policy.types.js";

export const ORGANIZATION_POLICY_ID = "00000000-0000-4000-8000-000000000002";

type PolicyRow = {
  id: string;
  justificativa_alteracao_obrigatoria: boolean;
  updated_at: Date | string;
  updated_by: string | null;
  updated_by_name: string | null;
};

export class OrganizationPolicyRepository implements ChangeJustificationPolicy {
  constructor(private readonly db: Pool = pool) {}

  async isRequiredForCompletedItems(): Promise<boolean> {
    const policy = await this.get();
    return policy.justificativa_alteracao_obrigatoria;
  }

  async get(): Promise<OrganizationPolicy> {
    const result = await this.db.query<PolicyRow>(`
      SELECT p.id, p.justificativa_alteracao_obrigatoria, p.updated_at, p.updated_by,
             u.nome AS updated_by_name
      FROM organization_policy p
      LEFT JOIN usuario u ON u.id = p.updated_by
      WHERE p.id = $1
    `, [ORGANIZATION_POLICY_ID]);
    const row = result.rows[0];
    if (!row) throw new Error("Política organizacional não encontrada. Aplique as migrations do banco.");
    return this.toRecord(row);
  }

  async update(input: OrganizationPolicyInput, usuarioId: string): Promise<OrganizationPolicy> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const beforeResult = await client.query<PolicyRow>(`
        SELECT p.id, p.justificativa_alteracao_obrigatoria, p.updated_at, p.updated_by,
               u.nome AS updated_by_name
        FROM organization_policy p
        LEFT JOIN usuario u ON u.id = p.updated_by
        WHERE p.id = $1
        FOR UPDATE OF p
      `, [ORGANIZATION_POLICY_ID]);
      const before = beforeResult.rows[0];
      if (!before) throw new Error("Política organizacional não encontrada. Aplique as migrations do banco.");

      const updatedResult = await client.query<PolicyRow>(`
        UPDATE organization_policy
        SET justificativa_alteracao_obrigatoria = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, justificativa_alteracao_obrigatoria, updated_at, updated_by, NULL::text AS updated_by_name
      `, [ORGANIZATION_POLICY_ID, input.justificativa_alteracao_obrigatoria, usuarioId]);
      const after = updatedResult.rows[0];
      await auditService.record({
        usuario_id: usuarioId,
        entidade_tipo: "organization_policy",
        entidade_id: ORGANIZATION_POLICY_ID,
        acao: "ATUALIZAR_POLITICA",
        dados_json: {
          actor_id: usuarioId,
          before: { justificativa_alteracao_obrigatoria: before.justificativa_alteracao_obrigatoria },
          after: { justificativa_alteracao_obrigatoria: input.justificativa_alteracao_obrigatoria },
        },
      }, client);
      const userResult = await client.query<{ id: string; nome: string }>("SELECT id, nome FROM usuario WHERE id = $1", [usuarioId]);
      await client.query("COMMIT");
      return this.toRecord({ ...after, updated_by_name: userResult.rows[0]?.nome ?? null });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private toRecord(row: PolicyRow): OrganizationPolicy {
    return {
      justificativa_alteracao_obrigatoria: row.justificativa_alteracao_obrigatoria,
      updated_at: new Date(row.updated_at).toISOString(),
      updated_by: row.updated_by && row.updated_by_name ? { id: row.updated_by, nome: row.updated_by_name } : null,
    };
  }
}

export const organizationPolicyRepository = new OrganizationPolicyRepository();
