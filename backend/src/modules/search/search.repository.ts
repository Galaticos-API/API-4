import { projectAccessSql } from "../projects/project-access.js";
import type { Pool } from "pg";
import { pool } from "../../database/db.js";

import type { SearchFilter, SearchItem, SearchResult } from "./search.types.js";

export class SearchRepository {
  constructor(private readonly db: Pick<Pool, "query"> = pool) {}

  async search({ query, projectId, userId }: SearchFilter): Promise<SearchResult> {
    const conditions: string[] = [projectAccessSql("c.projeto_id", "$1")];
    const params: string[] = [userId];
    if (query) {
      params.push("%" + query.replace(/[\\%_]/g, "\\$&") + "%");
      conditions.push("c.texto ILIKE $" + params.length);
    }
    if (projectId) {
      params.push(projectId);
      conditions.push("c.projeto_id = $" + params.length);
    }
    const result = await this.db.query<SearchItem>(
      "SELECT c.id, c.projeto_id, c.entidade_tipo, c.entidade_id, c.texto, " +
      "c.metadados_json, c.created_at, p.nome AS projeto_nome " +
      "FROM chunk c JOIN projeto p ON c.projeto_id = p.id " +
      (conditions.length ? "WHERE " + conditions.join(" AND ") : "") +
      " ORDER BY c.created_at DESC LIMIT 50", params,
    );
    return { items: result.rows, total: result.rowCount };
  }
}
