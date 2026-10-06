import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { auditService } from "../audit/audit.service.js";
import { assertJustificationForCompletedItem } from "../quality/completed-item-policy.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";
import { ConflictError, NotFoundError } from "../../shared/errors.js";
import type { CreateSuggestionInput, ResolveSuggestionInput, SuggestionRow } from "./suggestions.types.js";

const SELECT_COLUMNS = `
  s.id, s.entidade_tipo, s.entidade_id, s.campo, s.valor_sugerido, s.valor_resolvido, s.origem, s.status,
  s.criado_por, criador.nome AS criado_por_nome,
  s.resolvido_por, resolvedor.nome AS resolvido_por_nome,
  s.resolvido_em::text AS resolvido_em, s.created_at::text AS created_at, s.updated_at::text AS updated_at
`;
const FROM_CLAUSE = `
  FROM sugestao_ia s
  LEFT JOIN usuario criador ON criador.id = s.criado_por
  LEFT JOIN usuario resolvedor ON resolvedor.id = s.resolvido_por
`;

export class SuggestionsRepository {
  private readonly pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async entityExists(kind: CreateSuggestionInput["entidadeTipo"], entityId: string): Promise<boolean> {
    const result = await this.pool.query(`SELECT 1 FROM ${kind} WHERE id = $1`, [entityId]);
    return (result.rowCount ?? 0) > 0;
  }

  async listForEntity(kind: CreateSuggestionInput["entidadeTipo"], entityId: string): Promise<SuggestionRow[]> {
    const result = await this.pool.query<SuggestionRow>(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE s.entidade_tipo = $1 AND s.entidade_id = $2 ORDER BY s.status = 'pendente' DESC, s.created_at DESC, s.id`,
      [kind, entityId],
    );
    return result.rows;
  }

  async findOne(kind: CreateSuggestionInput["entidadeTipo"], entityId: string, suggestionId: string): Promise<SuggestionRow | null> {
    const result = await this.pool.query<SuggestionRow>(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE s.id = $1 AND s.entidade_tipo = $2 AND s.entidade_id = $3`,
      [suggestionId, kind, entityId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Idempotent proposal: a repeated run of the same AI pipeline for the same
   * field replaces the still-pending proposal instead of piling up duplicates.
   * Enforced by the partial unique index on (entidade_tipo, entidade_id, campo)
   * WHERE status = 'pendente'; this never touches the business table.
   */
  async create(input: CreateSuggestionInput): Promise<SuggestionRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const exists = await client.query(`SELECT 1 FROM ${input.entidadeTipo} WHERE id = $1`, [input.entidadeId]);
      if (!exists.rowCount) throw new NotFoundError();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO sugestao_ia (entidade_tipo, entidade_id, campo, valor_sugerido, origem, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (entidade_tipo, entidade_id, campo) WHERE status = 'pendente'
         DO UPDATE SET valor_sugerido = EXCLUDED.valor_sugerido, origem = EXCLUDED.origem,
           criado_por = EXCLUDED.criado_por, updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [input.entidadeTipo, input.entidadeId, input.campo, input.valorSugerido, input.origem, input.usuarioId],
      );
      await client.query("COMMIT");
      const created = await this.findOne(input.entidadeTipo, input.entidadeId, inserted.rows[0].id);
      if (!created) throw new NotFoundError();
      return created;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resolves a suggestion into acceptance, edit, or discard. Re-reads the row
   * under FOR UPDATE so concurrent/duplicate resolve calls serialize safely:
   * repeating the exact same resolution is a no-op (idempotent); requesting a
   * different outcome on an already-resolved suggestion raises a conflict
   * instead of silently overwriting history. Only "aceita"/"editada" ever
   * write to the entity table, and only after the usual archive and
   * completed-item-justification guards pass.
   */
  async resolve(input: ResolveSuggestionInput): Promise<SuggestionRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      const current = await client.query<SuggestionRow>(
        `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE s.id = $1 AND s.entidade_tipo = $2 AND s.entidade_id = $3 FOR UPDATE OF s`,
        [input.suggestionId, input.entidadeTipo, input.entidadeId],
      );
      const suggestion = current.rows[0];
      if (!suggestion) throw new NotFoundError("Sugestão não encontrada.");

      if (suggestion.status !== "pendente") {
        const sameOutcome = suggestion.status === input.resolution
          && (input.resolution === "descartada" || suggestion.valor_resolvido === input.valor);
        if (sameOutcome) {
          await client.query("COMMIT");
          return suggestion;
        }
        throw new ConflictError(`Esta sugestão já foi ${suggestion.status === "aceita" ? "aceita" : suggestion.status === "editada" ? "editada" : "descartada"} anteriormente; nenhuma nova ação foi aplicada.`);
      }

      const valorResolvido = input.resolution === "descartada" ? null : input.valor;

      if (input.resolution !== "descartada") {
        await assertWritable(client, input.entidadeTipo, input.entidadeId);
        await assertJustificationForCompletedItem(client, input.entidadeTipo, input.entidadeId, input.justificativa);

        const patch = JSON.stringify({ [suggestion.campo]: input.resolution === "aceita" ? "ai-accepted" : "ai-edited" });
        const updated = await client.query(
          `UPDATE ${input.entidadeTipo} SET ${suggestion.campo} = $1,
             provenance_json = COALESCE(provenance_json, '{}'::jsonb) || $2::jsonb,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 RETURNING *`,
          [valorResolvido, patch, input.entidadeId],
        );

        if (input.entidadeTipo === "pbi") {
          await client.query(
            `INSERT INTO pbi_versao (pbi_id, versao, snapshot_json, justificativa, autor_id, created_at)
             VALUES ($1, (SELECT COALESCE(MAX(versao), 0) + 1 FROM pbi_versao WHERE pbi_id = $1), $2, $3, $4, CURRENT_TIMESTAMP)`,
            [input.entidadeId, JSON.stringify(updated.rows[0]), input.justificativa?.trim() || "", input.usuarioId],
          );
        }

        await auditService.record({
          usuario_id: input.usuarioId,
          entidade_tipo: input.entidadeTipo,
          entidade_id: input.entidadeId,
          acao: input.resolution === "aceita" ? "ACEITAR_SUGESTAO_IA" : "EDITAR_SUGESTAO_IA",
          justificativa: input.justificativa ?? null,
          dados_json: { sugestao_id: suggestion.id, campo: suggestion.campo, valor_sugerido: suggestion.valor_sugerido, valor_aplicado: valorResolvido },
        }, client);
      } else {
        await auditService.record({
          usuario_id: input.usuarioId,
          entidade_tipo: input.entidadeTipo,
          entidade_id: input.entidadeId,
          acao: "DESCARTAR_SUGESTAO_IA",
          dados_json: { sugestao_id: suggestion.id, campo: suggestion.campo, valor_sugerido: suggestion.valor_sugerido },
        }, client);
      }

      await client.query(
        `UPDATE sugestao_ia SET status = $1, valor_resolvido = $2, resolvido_por = $3, resolvido_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [input.resolution, valorResolvido, input.usuarioId, suggestion.id],
      );

      await client.query("COMMIT");
      const refreshed = await this.findOne(input.entidadeTipo, input.entidadeId, suggestion.id);
      if (!refreshed) throw new NotFoundError("Sugestão não encontrada.");
      return refreshed;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
