import type { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { AppError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { auditService } from "../audit/audit.service.js";
import type { DeveloperAllocation } from "./developers.types.js";

/** Datas de calendário (AAAA-MM-DD) interpretadas no fuso da fábrica. */
export const ALLOCATION_TIME_ZONE = "America/Sao_Paulo";

export interface AllocationInput {
  projeto_id: string;
  papel: string;
  data_inicio: string;
  data_fim: string | null;
}

export type AllocationUpdate = Partial<Omit<AllocationInput, "projeto_id">>;

export class AllocationOverlapError extends AppError {
  constructor(existing: DeveloperAllocation) {
    super(
      `Já existe alocação deste profissional em ${existing.projeto_nome} que se sobrepõe ao período informado. ` +
        "Ajuste o período ou edite a alocação existente.",
      409,
      "ALLOCATION_OVERLAP",
      { existente: existing },
    );
    this.name = "AllocationOverlapError";
  }
}

// Início à 00:00 e fim às 23:59:59.999 do dia informado: o último dia ainda conta como alocado.
const START_SQL = (param: string) => `((${param})::date::timestamp AT TIME ZONE '${ALLOCATION_TIME_ZONE}')`;
const END_SQL = (param: string) =>
  `(((${param})::date + 1)::timestamp AT TIME ZONE '${ALLOCATION_TIME_ZONE}' - interval '1 millisecond')`;

const SELECT_ALLOCATION = `
  SELECT a.id, a.desenvolvedor_id, a.projeto_id, p.nome AS projeto_nome, p.status AS projeto_status,
         a.papel, a.data_inicio, a.data_fim,
         (a.data_fim IS NULL OR a.data_fim > CURRENT_TIMESTAMP) AS em_andamento
  FROM alocacao a
  JOIN projeto p ON p.id = a.projeto_id
`;

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function toAllocation(row: Record<string, unknown>): DeveloperAllocation {
  return {
    id: String(row.id),
    desenvolvedor_id: String(row.desenvolvedor_id),
    projeto_id: String(row.projeto_id),
    projeto_nome: String(row.projeto_nome),
    projeto_status: String(row.projeto_status),
    papel: (row.papel as string | null) ?? null,
    data_inicio: toIso(row.data_inicio),
    data_fim: row.data_fim ? toIso(row.data_fim) : null,
    em_andamento: Boolean(row.em_andamento),
  };
}

async function lockDeveloper(client: PoolClient, developerId: string): Promise<{ usuario_id: string | null }> {
  const { rows } = await client.query<{ usuario_id: string | null }>(
    "SELECT usuario_id FROM desenvolvedor WHERE id = $1 FOR UPDATE",
    [developerId],
  );
  if (!rows[0]) throw new NotFoundError("Perfil profissional não encontrado.");
  return rows[0];
}

async function findAllocation(client: PoolClient, developerId: string, allocationId: string): Promise<DeveloperAllocation> {
  const { rows } = await client.query(`${SELECT_ALLOCATION} WHERE a.id = $1 AND a.desenvolvedor_id = $2`, [
    allocationId,
    developerId,
  ]);
  if (!rows[0]) throw new NotFoundError("Alocação não encontrada neste perfil.");
  return toAllocation(rows[0]);
}

/** Calendário de São Paulo (AAAA-MM-DD) de um instante gravado. */
function calendarDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ALLOCATION_TIME_ZONE }).format(new Date(iso));
}

async function assertNoOverlap(
  client: PoolClient,
  developerId: string,
  projectId: string,
  start: string,
  end: string | null,
  ignoreId: string | null,
): Promise<void> {
  const { rows } = await client.query(
    `${SELECT_ALLOCATION}
     WHERE a.desenvolvedor_id = $1 AND a.projeto_id = $2
       AND ($5::uuid IS NULL OR a.id <> $5::uuid)
       AND a.data_inicio <= COALESCE(${END_SQL("$4::text")}, 'infinity'::timestamptz)
       AND COALESCE(a.data_fim, 'infinity'::timestamptz) >= ${START_SQL("$3::text")}
     ORDER BY a.data_inicio
     LIMIT 1`,
    [developerId, projectId, start, end, ignoreId],
  );
  if (rows[0]) throw new AllocationOverlapError(toAllocation(rows[0]));
}

export class AllocationsRepository {
  constructor(private readonly db: Pick<Pool, "query" | "connect"> = pool) {}

  async create(developerId: string, input: AllocationInput, actorUserId: string): Promise<DeveloperAllocation> {
    return withTransaction(this.db as Pool, async (client) => {
      const developer = await lockDeveloper(client, developerId);
      const project = await client.query<{ status: string }>("SELECT status FROM projeto WHERE id = $1 FOR SHARE", [
        input.projeto_id,
      ]);
      if (!project.rows[0]) throw new ValidationError("Selecione um projeto existente para a alocação.");
      if (project.rows[0].status === "arquivado") {
        throw new ValidationError("Não é possível alocar em projeto arquivado.");
      }
      await assertNoOverlap(client, developerId, input.projeto_id, input.data_inicio, input.data_fim, null);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO alocacao (desenvolvedor_id, projeto_id, papel, data_inicio, data_fim)
         VALUES ($1, $2, $3, ${START_SQL("$4::text")}, CASE WHEN $5::text IS NULL THEN NULL ELSE ${END_SQL("$5::text")} END)
         RETURNING id`,
        [developerId, input.projeto_id, input.papel, input.data_inicio, input.data_fim],
      );
      const created = await findAllocation(client, developerId, rows[0]!.id);
      await client.query("UPDATE desenvolvedor SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [developerId]);
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "alocacao",
          entidade_id: created.id,
          acao: "REGISTRAR_ALOCACAO",
          dados_json: {
            desenvolvedor_id: developerId,
            projeto_id: created.projeto_id,
            papel: created.papel,
            data_inicio: created.data_inicio,
            data_fim: created.data_fim,
            // Alocação vigente concede ao usuário vinculado acesso ao projeto (projectAccessSql).
            concede_acesso_a_usuario: developer.usuario_id,
          },
        },
        client,
      );
      return created;
    });
  }

  async update(
    developerId: string,
    allocationId: string,
    input: AllocationUpdate,
    actorUserId: string,
  ): Promise<DeveloperAllocation> {
    return withTransaction(this.db as Pool, async (client) => {
      const developer = await lockDeveloper(client, developerId);
      const before = await findAllocation(client, developerId, allocationId);
      const start = input.data_inicio ?? calendarDay(before.data_inicio);
      const end = input.data_fim !== undefined ? input.data_fim : before.data_fim ? calendarDay(before.data_fim) : null;
      if (end !== null && end < start) {
        throw new ValidationError("A data de término não pode ser anterior à data de início.", {
          field: "data_fim",
          data_inicio: start,
          data_fim: end,
        });
      }
      await assertNoOverlap(client, developerId, before.projeto_id, start, end, allocationId);

      await client.query(
        `UPDATE alocacao
         SET papel = COALESCE($3, papel),
             data_inicio = CASE WHEN $6::boolean THEN ${START_SQL("$4::text")} ELSE data_inicio END,
             data_fim = CASE WHEN $5::boolean
               THEN CASE WHEN $7::text IS NULL THEN NULL ELSE ${END_SQL("$7::text")} END
               ELSE data_fim END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND desenvolvedor_id = $2`,
        [allocationId, developerId, input.papel ?? null, start, input.data_fim !== undefined, input.data_inicio !== undefined, input.data_fim ?? null],
      );
      const updated = await findAllocation(client, developerId, allocationId);
      await client.query("UPDATE desenvolvedor SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [developerId]);
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "alocacao",
          entidade_id: allocationId,
          acao: "ATUALIZAR_ALOCACAO",
          dados_json: {
            desenvolvedor_id: developerId,
            projeto_id: updated.projeto_id,
            antes: { papel: before.papel, data_inicio: before.data_inicio, data_fim: before.data_fim },
            depois: { papel: updated.papel, data_inicio: updated.data_inicio, data_fim: updated.data_fim },
            concede_acesso_a_usuario: developer.usuario_id,
          },
        },
        client,
      );
      return updated;
    });
  }

  async remove(developerId: string, allocationId: string, actorUserId: string): Promise<void> {
    await withTransaction(this.db as Pool, async (client) => {
      const developer = await lockDeveloper(client, developerId);
      const removed = await findAllocation(client, developerId, allocationId);
      await client.query("DELETE FROM alocacao WHERE id = $1", [allocationId]);
      await client.query("UPDATE desenvolvedor SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [developerId]);
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "alocacao",
          entidade_id: allocationId,
          acao: "REMOVER_ALOCACAO",
          dados_json: {
            desenvolvedor_id: developerId,
            projeto_id: removed.projeto_id,
            papel: removed.papel,
            data_inicio: removed.data_inicio,
            data_fim: removed.data_fim,
            revoga_acesso_de_usuario: developer.usuario_id,
          },
        },
        client,
      );
    });
  }
}
