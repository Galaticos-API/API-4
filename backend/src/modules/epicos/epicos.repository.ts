import type { Pool } from "pg";
import { pool } from "../../database/db.js";
import type { CreateEpicDto, Epic, UpdateEpicDto } from "./epicos.types.js";

function mapEpicRow(row: any): Epic {
  return {
    id: row.id,
    projeto_id: row.projeto_id,
    titulo: row.titulo,
    descricao: row.descricao ?? null,
    objetivo: row.objetivo ?? null,
    escopo_macro: row.escopo_macro ?? null,
    resultado_esperado: row.resultado_esperado ?? null,
    status: row.status ?? "rascunho",
    prioridade: row.prioridade ?? "Must",
    priorizacao: row.prioridade ?? "Must",
    created_at: row.created_at?.toISOString ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at?.toISOString ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export class EpicosRepository {
  constructor(private readonly db: Pool = pool) {}

  async listByProject(projectId: string): Promise<Epic[]> {
    const result = await this.db.query(
      `
        SELECT *
        FROM epico
        WHERE projeto_id = $1
        ORDER BY created_at DESC
      `,
      [projectId],
    );
    return result.rows.map(mapEpicRow);
  }

  async findById(id: string): Promise<Epic | null> {
    const result = await this.db.query(`SELECT * FROM epico WHERE id = $1`, [id]);
    return result.rows[0] ? mapEpicRow(result.rows[0]) : null;
  }

  async create(data: CreateEpicDto): Promise<Epic> {
    const result = await this.db.query(
      `
        INSERT INTO epico (
          projeto_id,
          titulo,
          descricao,
          objetivo,
          escopo_macro,
          resultado_esperado,
          status,
          prioridade
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        data.projeto_id,
        data.titulo.trim(),
        data.descricao?.trim() ?? null,
        data.objetivo?.trim() ?? null,
        data.escopo_macro?.trim() ?? null,
        data.resultado_esperado?.trim() ?? null,
        data.status ?? "rascunho",
        data.prioridade ?? "Must",
      ],
    );
    return mapEpicRow(result.rows[0]);
  }

  async update(id: string, data: UpdateEpicDto): Promise<Epic | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (data.titulo !== undefined) {
      fields.push(`titulo = $${index}`);
      values.push(data.titulo.trim());
      index += 1;
    }
    if (data.descricao !== undefined) {
      fields.push(`descricao = $${index}`);
      values.push(data.descricao?.trim() ?? null);
      index += 1;
    }
    if (data.objetivo !== undefined) {
      fields.push(`objetivo = $${index}`);
      values.push(data.objetivo?.trim() ?? null);
      index += 1;
    }
    if (data.escopo_macro !== undefined) {
      fields.push(`escopo_macro = $${index}`);
      values.push(data.escopo_macro?.trim() ?? null);
      index += 1;
    }
    if (data.resultado_esperado !== undefined) {
      fields.push(`resultado_esperado = $${index}`);
      values.push(data.resultado_esperado?.trim() ?? null);
      index += 1;
    }
    if (data.status !== undefined) {
      fields.push(`status = $${index}`);
      values.push(data.status);
      index += 1;
    }
    if (data.prioridade !== undefined) {
      fields.push(`prioridade = $${index}`);
      values.push(data.prioridade);
      index += 1;
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await this.db.query(
      `UPDATE epico SET ${fields.join(", ")} WHERE id = $${index} RETURNING *`,
      values,
    );
    return result.rows[0] ? mapEpicRow(result.rows[0]) : null;
  }
}

export const epicosRepository = new EpicosRepository();
