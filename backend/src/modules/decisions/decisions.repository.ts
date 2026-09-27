import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { auditService } from "../audit/audit.service.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";
import type { ChainNode, CreateDecisionInput, DecisionEntityType, DecisionRow } from "./decisions.types.js";

const CHAIN_QUERIES: Record<DecisionEntityType, string> = {
  projeto: `SELECT p.id AS projeto_id, p.nome AS projeto_titulo, NULL::uuid AS epico_id, NULL::text AS epico_titulo,
                   NULL::uuid AS feature_id, NULL::text AS feature_titulo, NULL::uuid AS pbi_id, NULL::text AS pbi_titulo, NULL::text AS pbi_codigo
            FROM projeto p WHERE p.id = $1`,
  epico: `SELECT p.id AS projeto_id, p.nome AS projeto_titulo, e.id AS epico_id, e.titulo AS epico_titulo,
                 NULL::uuid AS feature_id, NULL::text AS feature_titulo, NULL::uuid AS pbi_id, NULL::text AS pbi_titulo, NULL::text AS pbi_codigo
          FROM epico e JOIN projeto p ON p.id = e.projeto_id WHERE e.id = $1`,
  feature: `SELECT p.id AS projeto_id, p.nome AS projeto_titulo, e.id AS epico_id, e.titulo AS epico_titulo,
                   f.id AS feature_id, f.titulo AS feature_titulo, NULL::uuid AS pbi_id, NULL::text AS pbi_titulo, NULL::text AS pbi_codigo
            FROM feature f JOIN epico e ON e.id = f.epico_id JOIN projeto p ON p.id = e.projeto_id WHERE f.id = $1`,
  pbi: `SELECT p.id AS projeto_id, p.nome AS projeto_titulo, e.id AS epico_id, e.titulo AS epico_titulo,
               f.id AS feature_id, f.titulo AS feature_titulo, b.id AS pbi_id, b.titulo AS pbi_titulo, b.codigo AS pbi_codigo
        FROM pbi b JOIN feature f ON f.id = b.feature_id JOIN epico e ON e.id = f.epico_id JOIN projeto p ON p.id = e.projeto_id WHERE b.id = $1`,
};

interface ChainRow {
  projeto_id: string;
  projeto_titulo: string;
  epico_id: string | null;
  epico_titulo: string | null;
  feature_id: string | null;
  feature_titulo: string | null;
  pbi_id: string | null;
  pbi_titulo: string | null;
  pbi_codigo: string | null;
}

const DECISION_COLUMNS = `d.id, d.entidade_tipo, d.entidade_id, d.titulo, d.contexto, d.decisao, d.justificativa, d.alternativas,
  d.autor_id, u.nome AS autor_nome, d.created_at::text AS created_at`;

export class DecisionsRepository {
  private readonly pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async resolveChain(tipo: DecisionEntityType, id: string): Promise<ChainNode[] | null> {
    const result = await this.pool.query<ChainRow>(CHAIN_QUERIES[tipo], [id]);
    const row = result.rows[0];
    if (!row) return null;
    const chain: ChainNode[] = [{ tipo: "projeto", id: row.projeto_id, titulo: row.projeto_titulo, codigo: null }];
    if (row.epico_id && row.epico_titulo !== null) chain.push({ tipo: "epico", id: row.epico_id, titulo: row.epico_titulo, codigo: null });
    if (row.feature_id && row.feature_titulo !== null) chain.push({ tipo: "feature", id: row.feature_id, titulo: row.feature_titulo, codigo: null });
    if (row.pbi_id && row.pbi_titulo !== null) chain.push({ tipo: "pbi", id: row.pbi_id, titulo: row.pbi_titulo, codigo: row.pbi_codigo });
    return chain;
  }

  async listForChain(chain: ChainNode[]): Promise<DecisionRow[]> {
    const result = await this.pool.query<DecisionRow>(
      `SELECT ${DECISION_COLUMNS}
       FROM decisao d
       LEFT JOIN usuario u ON u.id = d.autor_id
       WHERE (d.entidade_tipo, d.entidade_id) IN (SELECT t, i::uuid FROM unnest($1::text[], $2::text[]) AS pair(t, i))
       ORDER BY d.created_at ASC, d.id ASC`,
      [chain.map((node) => node.tipo), chain.map((node) => node.id)],
    );
    return result.rows;
  }

  async create(input: CreateDecisionInput): Promise<DecisionRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, input.entidadeTipo, input.entidadeId);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO decisao (entidade_tipo, entidade_id, titulo, contexto, decisao, justificativa, alternativas, autor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [input.entidadeTipo, input.entidadeId, input.titulo, input.contexto, input.decisao, input.justificativa, input.alternativas, input.usuarioId],
      );
      const id = inserted.rows[0].id;
      await auditService.record({
        usuario_id: input.usuarioId,
        entidade_tipo: input.entidadeTipo,
        entidade_id: input.entidadeId,
        acao: "REGISTRAR_DECISAO",
        dados_json: { decisao_id: id, titulo: input.titulo },
      }, client);
      const created = await client.query<DecisionRow>(
        `SELECT ${DECISION_COLUMNS} FROM decisao d LEFT JOIN usuario u ON u.id = d.autor_id WHERE d.id = $1`,
        [id],
      );
      await client.query("COMMIT");
      return created.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
