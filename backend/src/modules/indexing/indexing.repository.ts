import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { ConflictError, NotFoundError } from "../../shared/errors.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";

export interface IndexEvent {
  projeto_id: string;
  entidade_tipo: "epico" | "feature" | "pbi" | "decisao";
  entidade_id: string;
  evento_id: string;
  versao: number;
  operacao: "indexar" | "remover";
  payload: Record<string, unknown>;
  lease_id: string;
}

export interface PreparedEntity {
  content: string;
  embedding: number[];
}

export class IndexingRepository {
  constructor(private readonly db: Pool = pool) {}

  async claim(projectId?: string): Promise<IndexEvent | null> {
    await this.db.query(
      `UPDATE indice_evento SET status='falha',erro_codigo='ATTEMPTS_EXHAUSTED',
        lease_id=NULL,bloqueado_ate=NULL,updated_at=CURRENT_TIMESTAMP
       WHERE status='processando' AND bloqueado_ate<=CURRENT_TIMESTAMP AND tentativas>=5
         AND ($1::uuid IS NULL OR projeto_id=$1)`,
      [projectId ?? null],
    );
    const result = await this.db.query<IndexEvent>(
      `WITH picked AS (
        SELECT projeto_id,entidade_tipo,entidade_id FROM indice_evento
        WHERE status<>'processado' AND tentativas<5 AND proxima_tentativa<=CURRENT_TIMESTAMP
          AND (bloqueado_ate IS NULL OR bloqueado_ate<=CURRENT_TIMESTAMP)
          AND ($2::uuid IS NULL OR projeto_id=$2)
        ORDER BY proxima_tentativa,evento_id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE indice_evento ev SET status='processando',tentativas=tentativas+1,
        lease_id=$1,bloqueado_ate=CURRENT_TIMESTAMP+INTERVAL '3 minutes',updated_at=CURRENT_TIMESTAMP
      FROM picked WHERE ev.projeto_id=picked.projeto_id
        AND ev.entidade_tipo=picked.entidade_tipo AND ev.entidade_id=picked.entidade_id
      RETURNING ev.*`,
      [randomUUID(), projectId ?? null],
    );
    return result.rows[0] ?? null;
  }

  async finish(event: IndexEvent, prepared?: PreparedEntity): Promise<void> {
    await withTransaction(this.db, async client => {
      await lockHierarchy(client, "projeto", event.projeto_id);
      const current = await client.query(
        `SELECT 1 FROM indice_evento WHERE projeto_id=$1 AND entidade_tipo=$2 AND entidade_id=$3
          AND evento_id=$4 AND lease_id=$5 AND status='processando'
          AND bloqueado_ate>clock_timestamp() FOR UPDATE`,
        [event.projeto_id, event.entidade_tipo, event.entidade_id, event.evento_id, event.lease_id],
      );
      if (!current.rowCount) return;

      const source = await client.query(
        `SELECT elegivel,payload FROM indice_origem
         WHERE projeto_id=$1 AND entidade_tipo=$2 AND entidade_id=$3`,
        [event.projeto_id, event.entidade_tipo, event.entidade_id],
      );
      if (event.operacao === "indexar" && source.rows[0]?.elegivel) {
        // Compara o snapshot mesmo se um escritor externo não publicou o evento.
        if (JSON.stringify(source.rows[0].payload) !== JSON.stringify(event.payload)) {
          await client.query("SELECT sincronizar_indice_projeto($1)", [event.projeto_id]);
          return;
        }
        if (!prepared) throw new Error("Conteúdo preparado ausente.");
        await client.query(
          "DELETE FROM chunk WHERE projeto_id=$1 AND entidade_tipo=$2 AND entidade_id=$3",
          [event.projeto_id, event.entidade_tipo, event.entidade_id],
        );
        await client.query(
          `INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,embedding,metadados_json)
           VALUES(md5($1::uuid::text||':'||$2::text||':'||$3::uuid::text)::uuid,$1::uuid,$2::text,$3::uuid,$4,$5::vector,$6::jsonb)`,
          [event.projeto_id, event.entidade_tipo, event.entidade_id, prepared.content,
            JSON.stringify(prepared.embedding), JSON.stringify({
              ...event.payload, event_id: event.evento_id, version: event.versao, chunk_index: 0,
            })],
        );
      } else {
        await client.query(
          "DELETE FROM chunk WHERE projeto_id=$1 AND entidade_tipo=$2 AND entidade_id=$3",
          [event.projeto_id, event.entidade_tipo, event.entidade_id],
        );
      }
      await client.query(
        `UPDATE indice_evento SET status='processado',lease_id=NULL,bloqueado_ate=NULL,
          erro_codigo=NULL,updated_at=CURRENT_TIMESTAMP WHERE evento_id=$1 AND lease_id=$2`,
        [event.evento_id, event.lease_id],
      );
    });
  }

  async fail(event: IndexEvent, code: string): Promise<void> {
    await this.db.query(
      `UPDATE indice_evento SET status='falha',erro_codigo=$3,lease_id=NULL,bloqueado_ate=NULL,
        proxima_tentativa=CURRENT_TIMESTAMP+make_interval(secs=>LEAST(3600,15*power(2,tentativas))::int),
        updated_at=CURRENT_TIMESTAMP WHERE evento_id=$1 AND lease_id=$2 AND projeto_id=$4`,
      [event.evento_id, event.lease_id, code, event.projeto_id],
    );
  }

  async list(projectId: string) {
    const result = await this.db.query(
      `SELECT evento_id,projeto_id,entidade_tipo,entidade_id,versao,operacao,status,
        tentativas,proxima_tentativa,erro_codigo,updated_at FROM indice_evento
       WHERE projeto_id=$1 ORDER BY updated_at DESC,evento_id LIMIT 100`,
      [projectId],
    );
    return { items: result.rows };
  }

  async retry(projectId: string, eventId: string): Promise<void> {
    await withTransaction(this.db, async client => {
      await lockHierarchy(client, "projeto", projectId);
      await assertWritable(client, "projeto", projectId);
      const result = await client.query(
        "SELECT status,(bloqueado_ate>clock_timestamp()) AS reserva_ativa FROM indice_evento WHERE projeto_id=$1 AND evento_id=$2 FOR UPDATE",
        [projectId, eventId],
      );
      const event = result.rows[0];
      if (!event) throw new NotFoundError("Evento não encontrado.");
      if (event.status === "pendente") return;
      if (event.reserva_ativa) {
        throw new ConflictError("Evento em processamento.");
      }
      await client.query(
        `UPDATE indice_evento SET status='pendente',tentativas=0,lease_id=NULL,bloqueado_ate=NULL,
          erro_codigo=NULL,proxima_tentativa=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
         WHERE projeto_id=$1 AND evento_id=$2`,
        [projectId, eventId],
      );
    });
  }
}
