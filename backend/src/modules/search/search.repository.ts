import { Pool } from "pg";
import { pool } from "../../database/db.js";
import type { HybridSearchInput, HybridSearchRow } from "./search.types.js";

export class SearchRepository {
  private readonly pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async projectExists(projectId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM projeto WHERE id = $1", [projectId]);
    return (result.rowCount ?? 0) > 0;
  }

  async hybridSearch(input: HybridSearchInput, embedding: number[], minimumSimilarity: number, minimumTextRank = 0.05): Promise<HybridSearchRow[]> {
    const vector = `[${embedding.join(",")}]`;
    const result = await this.pool.query<HybridSearchRow>(
      `WITH scoped_chunks AS (
         SELECT c.id, c.projeto_id, c.entidade_tipo, c.entidade_id, c.texto,
                c.metadados_json, c.embedding, p.nome AS projeto_nome
         FROM chunk c
         JOIN projeto p ON p.id = c.projeto_id
         WHERE c.projeto_id = $1
           AND ($4::uuid IS NULL OR EXISTS (
             SELECT 1
             FROM entidade_tecnologia et
             WHERE et.tecnologia_id = $4
               AND (
                 (et.entidade_tipo = c.entidade_tipo AND et.entidade_id = c.entidade_id)
                 OR (c.entidade_tipo = 'decisao' AND EXISTS (
                   SELECT 1 FROM decisao d
                   WHERE d.id = c.entidade_id
                     AND d.entidade_tipo = et.entidade_tipo
                     AND d.entidade_id = et.entidade_id
                 ))
                 OR c.metadados_json->'tecnologias_ids' ? $4::text
               )
           ))
           AND ($5::text IS NULL OR c.entidade_tipo = $5)
       ),
       exact_identifier AS (
         SELECT EXISTS (
           SELECT 1 FROM scoped_chunks
           WHERE COALESCE(metadados_json->>'source_locator', '') <> ''
             AND lower(metadados_json->>'source_locator') = lower(btrim($2))
         ) OR upper(btrim($2)) ~ '^[A-Z]{2,8}-[0-9]{1,6}$' AS is_identifier_query
       ),
       lexical AS (
         SELECT id, row_number() OVER (ORDER BY rank DESC, id) AS position
         FROM (
           SELECT id,
                  CASE WHEN metadata_locator_match THEN 10.0
                       ELSE ts_rank_cd(search_vector, websearch_to_tsquery('portuguese', $2)) END AS rank
           FROM scoped_chunks
           CROSS JOIN LATERAL (
             SELECT to_tsvector('portuguese', texto) AS search_vector,
                    COALESCE(metadados_json->>'source_locator', '') <> ''
                      AND lower(metadados_json->>'source_locator') = lower(btrim($2)) AS metadata_locator_match
           ) signals
           WHERE metadata_locator_match
              OR (NOT (SELECT is_identifier_query FROM exact_identifier)
                  AND search_vector @@ websearch_to_tsquery('portuguese', $2))

           ORDER BY rank DESC, id
           LIMIT $6
         ) candidates
         WHERE rank >= $8 OR rank = 10.0
       ),
       semantic AS (
         SELECT id, row_number() OVER (ORDER BY distance ASC, id) AS position
         FROM (
           SELECT id, embedding <=> $3::vector AS distance
           FROM scoped_chunks
           WHERE embedding IS NOT NULL
             AND NOT (SELECT is_identifier_query FROM exact_identifier)
           ORDER BY embedding <=> $3::vector, id
           LIMIT $6
         ) candidates
         WHERE 1 - distance >= $7
       ),
       fused AS (
         SELECT id, SUM(score)::double precision AS relevance_score
         FROM (
           SELECT id, 1.0 / (60 + position) AS score FROM lexical
           UNION ALL
           SELECT id, 1.0 / (60 + position) AS score FROM semantic
         ) signals
         GROUP BY id
       )
       SELECT c.id, c.projeto_id AS project_id, c.projeto_nome AS project_name,
              c.entidade_tipo AS entity_type, c.entidade_id AS entity_id,
              COALESCE(doc.nome, dec.titulo, e.titulo, f.titulo, b.titulo) AS title,
              c.texto AS text, c.metadados_json AS metadata,
              CASE c.entidade_tipo
                WHEN 'documento' THEN '/projects/' || c.projeto_id::text || '/documents'
                WHEN 'epico' THEN '/projects/' || c.projeto_id::text || '/epics/' || c.entidade_id::text
                WHEN 'feature' THEN '/projects/' || c.projeto_id::text || '/epics/' || f.epico_id::text || '/features/' || c.entidade_id::text
                WHEN 'pbi' THEN '/projects/' || c.projeto_id::text || '/epics/' || source_pbi_feature.epico_id::text
                  || '/features/' || b.feature_id::text || '/pbis/' || c.entidade_id::text
                WHEN 'decisao' THEN CASE dec.entidade_tipo
                  WHEN 'projeto' THEN '/projects/' || c.projeto_id::text
                  WHEN 'epico' THEN '/projects/' || c.projeto_id::text || '/epics/' || dec.entidade_id::text
                  WHEN 'feature' THEN '/projects/' || c.projeto_id::text || '/epics/' || source_decision_feature.epico_id::text
                    || '/features/' || dec.entidade_id::text
                  WHEN 'pbi' THEN '/projects/' || c.projeto_id::text || '/epics/' || source_decision_pbi_feature.epico_id::text
                    || '/features/' || source_decision_pbi.feature_id::text || '/pbis/' || dec.entidade_id::text
                  ELSE NULL
                END
                ELSE NULL
              END AS source_url,
              fused.relevance_score
       FROM fused
       JOIN scoped_chunks c ON c.id = fused.id
       LEFT JOIN documento doc ON c.entidade_tipo = 'documento' AND doc.id = c.entidade_id
       LEFT JOIN decisao dec ON c.entidade_tipo = 'decisao' AND dec.id = c.entidade_id
       LEFT JOIN epico e ON c.entidade_tipo = 'epico' AND e.id = c.entidade_id
       LEFT JOIN feature f ON c.entidade_tipo = 'feature' AND f.id = c.entidade_id
       LEFT JOIN pbi b ON c.entidade_tipo = 'pbi' AND b.id = c.entidade_id
       LEFT JOIN feature source_pbi_feature ON c.entidade_tipo = 'pbi' AND source_pbi_feature.id = b.feature_id
       LEFT JOIN feature source_decision_feature ON c.entidade_tipo = 'decisao' AND dec.entidade_tipo = 'feature' AND source_decision_feature.id = dec.entidade_id
       LEFT JOIN pbi source_decision_pbi ON c.entidade_tipo = 'decisao' AND dec.entidade_tipo = 'pbi' AND source_decision_pbi.id = dec.entidade_id
       LEFT JOIN feature source_decision_pbi_feature ON source_decision_pbi_feature.id = source_decision_pbi.feature_id
       ORDER BY fused.relevance_score DESC, c.id
       LIMIT $6`,
      [input.projectId, input.query, vector, input.technologyId ?? null, input.level ?? null, input.limit, minimumSimilarity, minimumTextRank],
    );
    return result.rows;
  }
}
