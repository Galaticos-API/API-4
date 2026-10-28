import { Pool } from "pg";
import { pool } from "../../database/db.js";
import type { HybridSearchInput, HybridSearchRow } from "./search.types.js";
import { knowledgeSourceSql } from '../../shared/knowledge-source-sql.js';
import { projectAccessSql } from '../projects/project-access.js';
import { env } from '../../config/env.js';
import { SEARCH_CONCEPTS } from './search.concepts.js';

const concepts = JSON.stringify(SEARCH_CONCEPTS);

export class SearchRepository {
  private readonly pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async projectExists(projectId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM projeto WHERE id = $1", [projectId]);
    return (result.rowCount ?? 0) > 0;
  }

  async hybridSearch(input: HybridSearchInput, embedding: number[], minimumSimilarity: number, minimumTextRank = 0.05, projectIds = [input.projectId], userId?: string): Promise<HybridSearchRow[]> {
    const vector = `[${embedding.join(",")}]`;
    const result = await this.pool.query<HybridSearchRow>(
      `WITH scoped_chunks AS (
         SELECT c.id, c.projeto_id, c.entidade_tipo, c.entidade_id, c.texto,
                c.metadados_json, c.embedding, p.nome AS projeto_nome
         FROM chunk c
         JOIN projeto p ON p.id = c.projeto_id
         WHERE c.projeto_id = ANY($1::uuid[])
           AND ($9::uuid IS NULL OR ${projectAccessSql('c.projeto_id', '$9')})
           AND p.status <> 'arquivado'
           AND ${knowledgeSourceSql('c')}
           AND (c.entidade_tipo <> 'analise_repositorio' OR EXISTS (SELECT 1 FROM analise_repositorio reviewed
             WHERE reviewed.id=c.entidade_id AND reviewed.projeto_id=c.projeto_id
             AND reviewed.aprovacao_hash=encode(sha256(convert_to(reviewed.relatorio_markdown,'UTF8')),'hex')
             AND reviewed.status='concluido' AND reviewed.aprovado_por IS NOT NULL AND reviewed.aprovado_em IS NOT NULL))
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
       query_terms AS (
         SELECT tsvector_to_array(to_tsvector('portuguese', $2 || ' ' || COALESCE((
                  SELECT string_agg((ARRAY['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove',
                    'dez','onze','doze','treze','catorze','quinze','dezesseis','dezessete','dezoito','dezenove','vinte'])[matched[1]::integer+1], ' ')
                  FROM regexp_matches($2, '\\m([0-9]{1,2})\\M', 'g') matched
                  WHERE matched[1]::integer <= 20
                ), ''))) AS terms,
                ARRAY(SELECT matched[1] FROM regexp_matches($2, '\\m([A-Z]{3,8})\\M', 'g') matched) AS acronyms,
                (SELECT string_agg(lower(left(token, 1)), '' ORDER BY position)
                 FROM ts_debug('portuguese', $2) WITH ORDINALITY
                   AS words(alias, description, token, dictionaries, dictionary, lexemes, position)
                 WHERE alias IN ('asciiword', 'word') AND cardinality(lexemes) > 0) AS initials
       ),
       concept_aliases AS (
         SELECT ':' || groups.id AS concept,
                regexp_replace(regexp_replace(raw.term, 'qu$', 'c'), 'gu$', 'g') AS term
         FROM jsonb_to_recordset($12::jsonb) AS groups(id text, terms text)
         CROSS JOIN LATERAL unnest(tsvector_to_array(to_tsvector('portuguese', groups.terms))) AS raw(term)
       ),
       query_concepts AS (
         SELECT ARRAY(
           SELECT DISTINCT COALESCE(alias.concept, normalized.term)
           FROM query_terms CROSS JOIN LATERAL unnest(terms) AS raw(term)
           CROSS JOIN LATERAL (SELECT regexp_replace(regexp_replace(raw.term, 'qu$', 'c'), 'gu$', 'g') AS term) normalized
           LEFT JOIN concept_aliases alias ON alias.term = normalized.term
         ) AS terms
       ),
       source_concepts AS (
         SELECT c.id, c.projeto_id, ARRAY(
           SELECT DISTINCT COALESCE(alias.concept, normalized.term)
           FROM unnest(tsvector_to_array(to_tsvector('portuguese', c.texto))) AS raw(term)
           CROSS JOIN LATERAL (SELECT regexp_replace(regexp_replace(raw.term, 'qu$', 'c'), 'gu$', 'g') AS term) normalized
           LEFT JOIN concept_aliases alias ON alias.term = normalized.term
         ) AS terms
         FROM scoped_chunks c
       ),
       concept_frequency AS (
         SELECT projeto_id, term, count(*) AS documents
         FROM source_concepts CROSS JOIN LATERAL unnest(terms) term
         GROUP BY projeto_id, term
       ),
       project_sizes AS (
         SELECT projeto_id, count(*) AS documents FROM scoped_chunks GROUP BY projeto_id
       ),
       partial_signals AS (
         SELECT source.id, count(*) AS matches, bool_or(left(shared.term, 1) = ':') AS synonym_support
         FROM source_concepts source CROSS JOIN query_concepts query
         CROSS JOIN LATERAL unnest(source.terms) AS shared(term)
         JOIN concept_frequency frequency ON frequency.projeto_id = source.projeto_id AND frequency.term = shared.term
         JOIN project_sizes size ON size.projeto_id = source.projeto_id
         WHERE shared.term = ANY(query.terms) AND (size.documents = 1 OR frequency.documents < size.documents)
         GROUP BY source.id
       ),
       search_signals AS (
         SELECT c.*, to_tsvector('portuguese', c.texto) AS search_vector,
                COALESCE(1 - (c.embedding <=> $3::vector), 0) AS similarity,
                (SELECT count(*)::double precision FROM unnest(q.terms) term
                 WHERE term = ANY(tsvector_to_array(to_tsvector('portuguese', c.texto))))
                   / GREATEST(cardinality(q.terms), 1) AS coverage,
                CASE WHEN cardinality(q.acronyms) = 0 THEN FALSE ELSE EXISTS (
                  SELECT 1 FROM regexp_split_to_table(c.texto, '[.;:!?\\n]') sentence
                  CROSS JOIN LATERAL (
                    SELECT string_agg(lower(left(token, 1)), '' ORDER BY position) AS initials
                    FROM ts_debug('portuguese', sentence) WITH ORDINALITY
                      AS words(alias, description, token, dictionaries, dictionary, lexemes, position)
                    WHERE alias IN ('asciiword', 'word') AND cardinality(lexemes) > 0
                  ) phrase
                  CROSS JOIN unnest(q.acronyms) acronym
                  WHERE strpos(phrase.initials, lower(acronym)) > 0
                ) END OR (
                  COALESCE(1 - (c.embedding <=> $3::vector), 0) >= $7 AND EXISTS (
                    SELECT 1 FROM regexp_matches(c.texto, '\\m([A-Z]{2,8})\\M', 'g') abbreviation
                    WHERE strpos(q.initials, lower(abbreviation[1])) > 0
                  )
                ) AS acronym_match,
                COALESCE(partial.matches, 0) >= 2 AND
                  COALESCE(1 - (c.embedding <=> $3::vector), 0) >=
                    CASE WHEN partial.synonym_support THEN $14::double precision ELSE $13::double precision END AS partial_match
         FROM scoped_chunks c CROSS JOIN query_terms q
         LEFT JOIN partial_signals partial ON partial.id = c.id
       ),
       exact_identifier AS (
         SELECT EXISTS (
           SELECT 1 FROM scoped_chunks
           WHERE COALESCE(metadados_json->>'source_locator', '') <> ''
             AND lower(metadados_json->>'source_locator') = lower(btrim($2))
         ) OR upper(btrim($2)) ~ '^[A-Z]{2,8}-[0-9]{1,6}$' AS is_identifier_query
       ),
       eligible_signals AS (
         SELECT c.* FROM search_signals c
         WHERE (SELECT is_identifier_query FROM exact_identifier)
            OR c.search_vector @@ websearch_to_tsquery('portuguese', $2)
            OR c.similarity >= $11
            OR c.partial_match
            OR 0.6 * GREATEST(c.similarity, 0) + 0.4 * GREATEST(c.coverage, c.acronym_match::integer * 0.75) >= $10
            OR NOT EXISTS (
              SELECT 1 FROM search_signals signal
              WHERE (signal.similarity >= $7 OR signal.acronym_match OR signal.partial_match
                     OR (signal.search_vector @@ websearch_to_tsquery('portuguese', $2)
                         AND ts_rank_cd(signal.search_vector, websearch_to_tsquery('portuguese', $2)) >= $8))
                AND (signal.coverage > 0 OR signal.acronym_match OR signal.partial_match)
            )
       ),
       lexical AS (
         SELECT id, row_number() OVER (ORDER BY rank DESC, id) AS position
         FROM (
           SELECT id,
                  CASE WHEN metadata_locator_match THEN 10.0
                       WHEN acronym_match OR partial_match THEN 1.0
                       ELSE ts_rank_cd(search_vector, websearch_to_tsquery('portuguese', $2)) END AS rank
           FROM eligible_signals
           CROSS JOIN LATERAL (
             SELECT COALESCE(metadados_json->>'source_locator', '') <> ''
                      AND lower(metadados_json->>'source_locator') = lower(btrim($2)) AS metadata_locator_match
           ) signals
           WHERE metadata_locator_match
              OR (acronym_match AND NOT (SELECT is_identifier_query FROM exact_identifier))
              OR (partial_match AND NOT (SELECT is_identifier_query FROM exact_identifier))
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
           FROM eligible_signals
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
              COALESCE(doc.nome, dec.titulo, e.titulo, f.titulo, b.titulo, ar.repositorio_url) AS title,
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
                WHEN 'analise_repositorio' THEN '/projects/' || c.projeto_id::text || '#repo-analyzer=' || c.entidade_id::text
                ELSE NULL
              END AS source_url,
              fused.relevance_score
       FROM fused
       JOIN eligible_signals c ON c.id = fused.id
       LEFT JOIN documento doc ON c.entidade_tipo = 'documento' AND doc.id = c.entidade_id
       LEFT JOIN decisao dec ON c.entidade_tipo = 'decisao' AND dec.id = c.entidade_id
       LEFT JOIN epico e ON c.entidade_tipo = 'epico' AND e.id = c.entidade_id
       LEFT JOIN feature f ON c.entidade_tipo = 'feature' AND f.id = c.entidade_id
       LEFT JOIN pbi b ON c.entidade_tipo = 'pbi' AND b.id = c.entidade_id
       LEFT JOIN analise_repositorio ar ON c.entidade_tipo = 'analise_repositorio' AND ar.id = c.entidade_id
       LEFT JOIN feature source_pbi_feature ON c.entidade_tipo = 'pbi' AND source_pbi_feature.id = b.feature_id
       LEFT JOIN feature source_decision_feature ON c.entidade_tipo = 'decisao' AND dec.entidade_tipo = 'feature' AND source_decision_feature.id = dec.entidade_id
       LEFT JOIN pbi source_decision_pbi ON c.entidade_tipo = 'decisao' AND dec.entidade_tipo = 'pbi' AND source_decision_pbi.id = dec.entidade_id
       LEFT JOIN feature source_decision_pbi_feature ON source_decision_pbi_feature.id = source_decision_pbi.feature_id
       ORDER BY fused.relevance_score DESC, c.id
       LIMIT $6`,
      [projectIds, input.query, vector, input.technologyId ?? null, input.level ?? null, input.limit, minimumSimilarity, minimumTextRank, userId ?? null, env.SEARCH_MIN_HYBRID_SCORE, env.SEARCH_STRONG_VECTOR_SIMILARITY, concepts, env.SEARCH_MIN_PARTIAL_SIMILARITY, env.SEARCH_MIN_CONCEPT_SIMILARITY],
    );
    return result.rows;
  }

  async ragSearch(projectIds: string[], embedding: number[], limit = 5, minimumSimilarity = 0.40): Promise<HybridSearchRow[]> {
    const vector = `[${embedding.join(",")}]`;
    const result = await this.pool.query<HybridSearchRow>(
      `WITH scoped_chunks AS (
         SELECT c.id, c.projeto_id, c.entidade_tipo, c.entidade_id, c.texto,
                c.metadados_json, c.embedding, p.nome AS projeto_nome,
                COALESCE(1 - (c.embedding <=> $2::vector), 0) AS similarity
         FROM chunk c
         JOIN projeto p ON p.id = c.projeto_id
         WHERE c.projeto_id = ANY($1::uuid[])
           AND p.status <> 'arquivado'
           AND ${knowledgeSourceSql('c')}
           AND c.embedding IS NOT NULL
           AND (c.entidade_tipo <> 'analise_repositorio' OR EXISTS (SELECT 1 FROM analise_repositorio reviewed
             WHERE reviewed.id=c.entidade_id AND reviewed.projeto_id=c.projeto_id
             AND reviewed.aprovacao_hash=encode(sha256(convert_to(reviewed.relatorio_markdown,'UTF8')),'hex')
             AND reviewed.status='concluido' AND reviewed.aprovado_por IS NOT NULL AND reviewed.aprovado_em IS NOT NULL))
       )
       SELECT c.id, c.projeto_id AS project_id, c.projeto_nome AS project_name,
              c.entidade_tipo AS entity_type, c.entidade_id AS entity_id,
              COALESCE(doc.nome, dec.titulo, e.titulo, f.titulo, b.titulo, ar.repositorio_url) AS title,
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
                WHEN 'analise_repositorio' THEN '/projects/' || c.projeto_id::text || '#repo-analyzer=' || c.entidade_id::text
                ELSE NULL
              END AS source_url,
              c.similarity AS relevance_score
       FROM scoped_chunks c
       LEFT JOIN documento doc ON c.entidade_tipo = 'documento' AND doc.id = c.entidade_id
       LEFT JOIN decisao dec ON c.entidade_tipo = 'decisao' AND dec.id = c.entidade_id
       LEFT JOIN epico e ON c.entidade_tipo = 'epico' AND e.id = c.entidade_id
       LEFT JOIN feature f ON c.entidade_tipo = 'feature' AND f.id = c.entidade_id
       LEFT JOIN pbi b ON c.entidade_tipo = 'pbi' AND b.id = c.entidade_id
       LEFT JOIN analise_repositorio ar ON c.entidade_tipo = 'analise_repositorio' AND ar.id = c.entidade_id
       LEFT JOIN feature source_pbi_feature ON c.entidade_tipo = 'pbi' AND source_pbi_feature.id = b.feature_id
       LEFT JOIN feature source_decision_feature ON c.entidade_tipo = 'decisao' AND dec.entidade_tipo = 'feature' AND source_decision_feature.id = dec.entidade_id
       LEFT JOIN pbi source_decision_pbi ON c.entidade_tipo = 'decisao' AND dec.entidade_tipo = 'pbi' AND source_decision_pbi.id = dec.entidade_id
       LEFT JOIN feature source_decision_pbi_feature ON source_decision_pbi_feature.id = source_decision_pbi.feature_id
       WHERE c.similarity >= $3
       ORDER BY c.similarity DESC, c.id
       LIMIT $4`,
      [projectIds, vector, minimumSimilarity, limit],
    );
    return result.rows;
  }
}
