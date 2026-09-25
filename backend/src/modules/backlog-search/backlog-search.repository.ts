import { Pool } from "pg";
import { pool } from "../../database/db.js";
import type { BacklogSearchFilters, BacklogSearchRow } from "./backlog-search.types.js";

const ACCENTED = "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ";
const PLAIN = "AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn";

const norm = (expression: string) => `lower(translate(${expression}, '${ACCENTED}', '${PLAIN}'))`;

export class BacklogSearchRepository {
  private readonly pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async search(projetoId: string, patterns: string[], filters: BacklogSearchFilters, limit: number): Promise<BacklogSearchRow[]> {
    const result = await this.pool.query<BacklogSearchRow>(
      `WITH items AS (
         SELECT 'epico'::text AS tipo, e.id, e.titulo,
                concat_ws(E'\\n', e.descricao, e.objetivo, e.escopo_macro, e.resultado_esperado) AS descricao,
                e.status, NULL::text AS codigo, e.id AS epico_id, e.titulo AS epico_titulo,
                NULL::uuid AS feature_id, NULL::text AS feature_titulo, e.created_at, 1 AS nivel
         FROM epico e WHERE e.projeto_id = $1
         UNION ALL
         SELECT 'feature', f.id, f.titulo, concat_ws(E'\\n', f.descricao, f.objetivo),
                f.status, NULL, e.id, e.titulo, f.id, f.titulo, f.created_at, 2
         FROM feature f JOIN epico e ON e.id = f.epico_id WHERE e.projeto_id = $1
         UNION ALL
         SELECT 'pbi', p.id, p.titulo,
                concat_ws(E'\\n', p.historia_como_um, p.historia_eu_quero, p.historia_para_que, p.regras_observacoes),
                p.status, p.codigo, e.id, e.titulo, f.id, f.titulo, p.created_at, 3
         FROM pbi p JOIN feature f ON f.id = p.feature_id JOIN epico e ON e.id = f.epico_id WHERE e.projeto_id = $1
       ), matched AS (
         SELECT i.*,
                ${norm("concat_ws(' ', i.titulo, i.codigo)")} LIKE ALL ($2::text[]) AS titulo_match
         FROM items i
         WHERE ${norm("concat_ws(' ', i.titulo, i.codigo, i.descricao)")} LIKE ALL ($2::text[])
           AND ($3::text IS NULL OR i.status = $3)
           AND ($4::uuid IS NULL OR EXISTS (
                 SELECT 1 FROM entidade_tecnologia et
                 WHERE et.entidade_id = i.id AND et.entidade_tipo = i.tipo AND et.tecnologia_id = $4))
       )
       SELECT m.tipo, m.id, m.titulo, m.descricao, m.status, m.codigo, m.epico_id, m.epico_titulo,
              m.feature_id, m.feature_titulo, m.titulo_match,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome) ORDER BY t.nome)
                FROM entidade_tecnologia et JOIN tecnologia t ON t.id = et.tecnologia_id
                WHERE et.entidade_id = m.id AND et.entidade_tipo = m.tipo
              ), '[]'::jsonb) AS tecnologias,
              COUNT(*) OVER () AS total
       FROM matched m
       ORDER BY m.titulo_match DESC, m.nivel, m.created_at, m.id
       LIMIT $5`,
      [projetoId, patterns, filters.status ?? null, filters.tecnologiaId ?? null, limit],
    );
    return result.rows;
  }
}
