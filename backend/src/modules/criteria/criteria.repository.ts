import { lockHierarchy, assertWritable } from "../projects/hierarchy-archive.js";
import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { CreateCriterionDTO, Criterion, CriterionEntityType } from "./criteria.types.js";
import { auditService } from "../audit/audit.service.js";
import { ValidationError } from "../../shared/errors.js";
import {
  assertJustificationForCompletedItem,
  normalizeJustification,
} from "../quality/completed-item-policy.js";

const ENTITY_TABLE: Record<CriterionEntityType, string> = {
  epico: "epico",
  feature: "feature",
  pbi: "pbi",
};

export class CriteriaRepository {
  private pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async entityExists(tipo: CriterionEntityType, id: string): Promise<boolean> {
    const table = ENTITY_TABLE[tipo];
    const result = await this.pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async entityIsWritable(tipo: CriterionEntityType, id: string): Promise<boolean> {
    const queries: Record<CriterionEntityType, string> = {
      epico: `
        SELECT (p.status != 'arquivado' AND e.status != 'arquivado') AS writable
        FROM epico e JOIN projeto p ON p.id = e.projeto_id WHERE e.id = $1
      `,
      feature: `
        SELECT (p.status != 'arquivado' AND e.status != 'arquivado' AND f.status != 'arquivado') AS writable
        FROM feature f JOIN epico e ON e.id = f.epico_id JOIN projeto p ON p.id = e.projeto_id WHERE f.id = $1
      `,
      pbi: `
        SELECT (p.status != 'arquivado' AND e.status != 'arquivado' AND f.status != 'arquivado' AND pb.status != 'arquivado') AS writable
        FROM pbi pb JOIN feature f ON f.id = pb.feature_id JOIN epico e ON e.id = f.epico_id JOIN projeto p ON p.id = e.projeto_id
        WHERE pb.id = $1
      `,
    };

    const result = await this.pool.query<{ writable: boolean }>(queries[tipo], [id]);
    return result.rows[0]?.writable ?? false;
  }

  private async entityIsWritableInTransaction(client: PoolClient, tipo: CriterionEntityType, id: string): Promise<boolean> {
    const queries: Record<CriterionEntityType, string> = {
      epico: `
        SELECT (p.status != 'arquivado' AND e.status != 'arquivado') AS writable
        FROM epico e JOIN projeto p ON p.id = e.projeto_id WHERE e.id = $1
      `,
      feature: `
        SELECT (p.status != 'arquivado' AND e.status != 'arquivado' AND f.status != 'arquivado') AS writable
        FROM feature f JOIN epico e ON e.id = f.epico_id JOIN projeto p ON p.id = e.projeto_id WHERE f.id = $1
      `,
      pbi: `
        SELECT (p.status != 'arquivado' AND e.status != 'arquivado' AND f.status != 'arquivado' AND pb.status != 'arquivado') AS writable
        FROM pbi pb JOIN feature f ON f.id = pb.feature_id JOIN epico e ON e.id = f.epico_id JOIN projeto p ON p.id = e.projeto_id
        WHERE pb.id = $1
      `,
    };
    const result = await client.query<{ writable: boolean }>(queries[tipo], [id]);
    return result.rows[0]?.writable ?? false;
  }

  private async removalBreaksCompletionInTransaction(client: PoolClient, tipo: CriterionEntityType, entidadeId: string): Promise<boolean> {
    if (tipo === "feature") return false;
    const table = ENTITY_TABLE[tipo];
    const result = await client.query<{ concluido: boolean; total: number }>(
      `SELECT (e.status = 'concluido') AS concluido,
              (SELECT COUNT(*)::int FROM criterio_aceitacao c WHERE c.entidade_tipo = $2 AND c.entidade_id = e.id) AS total
       FROM ${table} e WHERE e.id = $1`,
      [entidadeId, tipo],
    );
    const row = result.rows[0];
    return Boolean(row?.concluido) && (row?.total ?? 0) <= 1;
  }

  async removalBreaksCompletion(tipo: CriterionEntityType, entidadeId: string): Promise<boolean> {
    if (tipo === "feature") return false;

    const table = ENTITY_TABLE[tipo];
    const result = await this.pool.query<{ concluido: boolean; total: number }>(
      `SELECT (e.status = 'concluido') AS concluido,
              (SELECT COUNT(*)::int FROM criterio_aceitacao c WHERE c.entidade_tipo = $2 AND c.entidade_id = e.id) AS total
       FROM ${table} e WHERE e.id = $1`,
      [entidadeId, tipo],
    );
    const row = result.rows[0];
    return Boolean(row?.concluido) && (row?.total ?? 0) <= 1;
  }

  // Serializa toda escrita para a mesma entidade dentro da transação, evitando deadlock
  // entre movimentos concorrentes em direções opostas (dois SELECT ... FOR UPDATE em ordens
  // diferentes causariam espera circular). O lock é liberado automaticamente no COMMIT/ROLLBACK.
  private async lockEntity(client: PoolClient, tipo: CriterionEntityType, entidadeId: string): Promise<void> {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${tipo}:${entidadeId}`]);
    await assertWritable(client, tipo, entidadeId);
  }

  async findById(id: string): Promise<Criterion | null> {
    const result = await this.pool.query<Criterion>(`SELECT * FROM criterio_aceitacao WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async listByEntity(tipo: CriterionEntityType, entidadeId: string): Promise<Criterion[]> {
    const result = await this.pool.query<Criterion>(
      `SELECT * FROM criterio_aceitacao WHERE entidade_tipo = $1 AND entidade_id = $2 ORDER BY ordem ASC`,
      [tipo, entidadeId],
    );
    return result.rows;
  }

  async listByEntities(tipo: CriterionEntityType, entidadeIds: string[]): Promise<Criterion[]> {
    if (entidadeIds.length === 0) return [];
    const result = await this.pool.query<Criterion>(
      `SELECT * FROM criterio_aceitacao WHERE entidade_tipo = $1 AND entidade_id = ANY($2::uuid[]) ORDER BY entidade_id, ordem ASC`,
      [tipo, entidadeIds],
    );
    return result.rows;
  }

  async countByEntity(tipo: CriterionEntityType, entidadeId: string): Promise<number> {
    const result = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM criterio_aceitacao WHERE entidade_tipo = $1 AND entidade_id = $2`,
      [tipo, entidadeId],
    );
    return result.rows[0]?.total ?? 0;
  }

  async create(dto: CreateCriterionDTO, usuarioId?: string | null): Promise<Criterion> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await this.lockEntity(client, dto.entidade_tipo, dto.entidade_id);
      await assertJustificationForCompletedItem(
        client,
        dto.entidade_tipo,
        dto.entidade_id,
        dto.justificativa,
      );

      const ordemResult = await client.query<{ proxima_ordem: number }>(
        `SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima_ordem FROM criterio_aceitacao WHERE entidade_tipo = $1 AND entidade_id = $2`,
        [dto.entidade_tipo, dto.entidade_id],
      );
      const ordem = ordemResult.rows[0]?.proxima_ordem ?? 1;

      const isScenario = dto.entidade_tipo === "pbi";
      const insertQuery = `
        INSERT INTO criterio_aceitacao (entidade_tipo, entidade_id, texto, nome, dado, quando, entao, ordem)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const values = [
        dto.entidade_tipo,
        dto.entidade_id,
        isScenario ? null : dto.texto,
        isScenario ? dto.nome : null,
        isScenario ? dto.dado : null,
        isScenario ? dto.quando : null,
        isScenario ? dto.entao : null,
        ordem,
      ];

      const result = await client.query<Criterion>(insertQuery, values);
      const created = result.rows[0];

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: dto.entidade_tipo,
          entidade_id: dto.entidade_id,
          acao: "ADICIONAR_CRITERIO",
          justificativa: normalizeJustification(dto.justificativa),
          dados_json: { criterio_id: created.id, ordem: created.ordem, nome: created.nome, texto: created.texto },
        },
        client,
      );

      await client.query("COMMIT");
      return created;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(
    id: string,
    usuarioId?: string | null,
    justificativa?: string | null,
  ): Promise<Criterion | null> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);

      const peek = await client.query<Criterion>(`SELECT entidade_tipo, entidade_id FROM criterio_aceitacao WHERE id = $1`, [id]);
      if (!peek.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      await this.lockEntity(client, peek.rows[0].entidade_tipo, peek.rows[0].entidade_id);

      const existing = await client.query<Criterion>(`SELECT * FROM criterio_aceitacao WHERE id = $1`, [id]);
      const removed = existing.rows[0];
      if (!removed) {
        await client.query("ROLLBACK");
        return null;
      }

      // The service-level checks provide fast feedback, but only these checks are
      // authoritative: concurrent deletions must re-evaluate state after the entity lock.
      if (!(await this.entityIsWritableInTransaction(client, removed.entidade_tipo, removed.entidade_id))) {
        throw new ValidationError("Não é possível alterar critérios de uma entidade arquivada.");
      }
      await assertJustificationForCompletedItem(
        client,
        removed.entidade_tipo,
        removed.entidade_id,
        justificativa,
      );
      if (await this.removalBreaksCompletionInTransaction(client, removed.entidade_tipo, removed.entidade_id)) {
        throw new ValidationError("Não é possível remover o último critério de uma entidade já concluída. Reabra o item antes de remover.");
      }

      await client.query(`DELETE FROM criterio_aceitacao WHERE id = $1`, [id]);

      await client.query(
        `UPDATE criterio_aceitacao SET ordem = ordem - 1 WHERE entidade_tipo = $1 AND entidade_id = $2 AND ordem > $3`,
        [removed.entidade_tipo, removed.entidade_id, removed.ordem],
      );

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: removed.entidade_tipo,
          entidade_id: removed.entidade_id,
          acao: "REMOVER_CRITERIO",
          justificativa: normalizeJustification(justificativa),
          dados_json: { criterio_id: removed.id, ordem: removed.ordem, nome: removed.nome, texto: removed.texto },
        },
        client,
      );

      await client.query("COMMIT");
      return removed;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async move(
    id: string,
    direction: "up" | "down",
    usuarioId?: string | null,
    justificativa?: string | null,
  ): Promise<Criterion[] | null> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);

      const peek = await client.query<Criterion>(`SELECT entidade_tipo, entidade_id FROM criterio_aceitacao WHERE id = $1`, [id]);
      if (!peek.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      await this.lockEntity(client, peek.rows[0].entidade_tipo, peek.rows[0].entidade_id);

      const currentResult = await client.query<Criterion>(`SELECT * FROM criterio_aceitacao WHERE id = $1`, [id]);
      const current = currentResult.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return null;
      }

      const comparator = direction === "up" ? "<" : ">";
      const ordemVizinho = direction === "up" ? "DESC" : "ASC";
      const siblingResult = await client.query<Criterion>(
        `SELECT * FROM criterio_aceitacao
         WHERE entidade_tipo = $1 AND entidade_id = $2 AND ordem ${comparator} $3
         ORDER BY ordem ${ordemVizinho} LIMIT 1`,
        [current.entidade_tipo, current.entidade_id, current.ordem],
      );
      const sibling = siblingResult.rows[0];
      if (!sibling) {
        // Já está no limite da lista: operação idempotente, sem alteração.
        const listaSemAlteracao = await client.query<Criterion>(
          `SELECT * FROM criterio_aceitacao WHERE entidade_tipo = $1 AND entidade_id = $2 ORDER BY ordem ASC`,
          [current.entidade_tipo, current.entidade_id],
        );
        await client.query("COMMIT");
        return listaSemAlteracao.rows;
      }

      await assertJustificationForCompletedItem(
        client,
        current.entidade_tipo,
        current.entidade_id,
        justificativa,
      );

      // Passa por uma ordem sentinela negativa para não colidir com o índice único durante a troca.
      await client.query(`UPDATE criterio_aceitacao SET ordem = -1 WHERE id = $1`, [current.id]);
      await client.query(`UPDATE criterio_aceitacao SET ordem = $1 WHERE id = $2`, [current.ordem, sibling.id]);
      await client.query(`UPDATE criterio_aceitacao SET ordem = $1 WHERE id = $2`, [sibling.ordem, current.id]);

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: current.entidade_tipo,
          entidade_id: current.entidade_id,
          acao: "REORDENAR_CRITERIO",
          justificativa: normalizeJustification(justificativa),
          dados_json: { criterio_id: current.id, direcao: direction, ordem_anterior: current.ordem, ordem_novo: sibling.ordem },
        },
        client,
      );

      const listaAtualizada = await client.query<Criterion>(
        `SELECT * FROM criterio_aceitacao WHERE entidade_tipo = $1 AND entidade_id = $2 ORDER BY ordem ASC`,
        [current.entidade_tipo, current.entidade_id],
      );

      await client.query("COMMIT");
      return listaAtualizada.rows;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const criteriaRepository = new CriteriaRepository();
