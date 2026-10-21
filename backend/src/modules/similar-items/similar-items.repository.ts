import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { auditService } from "../audit/audit.service.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";
import { projectAccessSql } from "../projects/project-access.js";
import { SUGGESTIBLE_FIELDS, maxLengthFor } from "../provenance/provenance.js";
import { SuggestionsRepository } from "../suggestions/suggestions.repository.js";
import type { SuggestionRow } from "../suggestions/suggestions.types.js";
import {
  SIMILAR_RELATION_TYPE,
  similarOriginLabel,
  type FindSimilarInput,
  type ReuseInput,
  type ReuseRelation,
  type ReuseResult,
  type SimilarEntityType,
  type SimilarItemRow,
} from "./similar-items.types.js";

const CANDIDATE_POOL = 100;
const SNIPPET_LENGTH = 240;
const ORIGIN_SQL: Record<SimilarEntityType, string> = {
  epico: `SELECT to_jsonb(o) AS dados, o.projeto_id,
            (o.status = 'arquivado' OR p.status = 'arquivado') AS arquivado
          FROM epico o JOIN projeto p ON p.id = o.projeto_id WHERE o.id = $1`,
  feature: `SELECT to_jsonb(o) AS dados, e.projeto_id,
              (o.status = 'arquivado' OR e.status = 'arquivado' OR p.status = 'arquivado') AS arquivado
            FROM feature o JOIN epico e ON e.id = o.epico_id JOIN projeto p ON p.id = e.projeto_id WHERE o.id = $1`,
  pbi: `SELECT to_jsonb(o) AS dados, e.projeto_id,
          (o.status = 'arquivado' OR f.status = 'arquivado' OR e.status = 'arquivado' OR p.status = 'arquivado') AS arquivado
        FROM pbi o JOIN feature f ON f.id = o.feature_id JOIN epico e ON e.id = f.epico_id
        JOIN projeto p ON p.id = e.projeto_id WHERE o.id = $1`,
};

export class SimilarItemsRepository {
  private readonly pool: Pool;
  private readonly suggestions: SuggestionsRepository;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
    this.suggestions = new SuggestionsRepository(this.pool);
  }

  async projectExists(projectId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM projeto WHERE id = $1", [projectId]);
    return (result.rowCount ?? 0) > 0;
  }

  async findSimilar(input: FindSimilarInput): Promise<SimilarItemRow[]> {
    const vector = `[${input.vector.join(",")}]`;
    const result = await this.pool.query<SimilarItemRow>(
      `WITH candidatos AS (
         SELECT c.entidade_id, c.projeto_id, c.texto, 1 - (c.embedding <=> $1::vector) AS similaridade
         FROM chunk c
         WHERE c.entidade_tipo = $2::text
           AND c.embedding IS NOT NULL
           AND ($3::uuid IS NULL OR c.entidade_id <> $3::uuid)
           AND ${projectAccessSql("c.projeto_id", "$4")}
         ORDER BY c.embedding <=> $1::vector, c.id
         LIMIT ${CANDIDATE_POOL}
       ), melhores AS (
         SELECT DISTINCT ON (entidade_id) entidade_id, projeto_id, texto, similaridade
         FROM candidatos
         WHERE similaridade >= $5
         ORDER BY entidade_id, similaridade DESC
       )
       SELECT $2::text AS tipo, m.entidade_id AS id, b.codigo,
              COALESCE(e.titulo, f.titulo, b.titulo) AS titulo,
              COALESCE(e.status, f.status, b.status) AS status,
              m.similaridade::float8 AS similaridade,
              left(m.texto, ${SNIPPET_LENGTH}) AS trecho,
              m.projeto_id, p.nome AS projeto_nome,
              ep.id AS epico_id, ep.titulo AS epico_titulo,
              ft.id AS feature_id, ft.titulo AS feature_titulo,
              EXISTS (
                SELECT 1 FROM reaproveitamento_item r
                WHERE $3::uuid IS NOT NULL AND r.destino_tipo = $2::text AND r.destino_id = $3::uuid
                  AND r.origem_tipo = $2::text AND r.origem_id = m.entidade_id
              ) AS ja_aproveitado
       FROM melhores m
       JOIN projeto p ON p.id = m.projeto_id
       LEFT JOIN epico e ON $2::text = 'epico' AND e.id = m.entidade_id
       LEFT JOIN feature f ON $2::text = 'feature' AND f.id = m.entidade_id
       LEFT JOIN pbi b ON $2::text = 'pbi' AND b.id = m.entidade_id
       LEFT JOIN feature bf ON bf.id = b.feature_id
       LEFT JOIN feature ft ON ft.id = COALESCE(f.id, bf.id)
       LEFT JOIN epico ep ON ep.id = COALESCE(e.id, f.epico_id, bf.epico_id)
       WHERE p.status <> 'arquivado'
         AND COALESCE(e.status, f.status, b.status) IS NOT NULL
         AND COALESCE(e.status, f.status, b.status) <> 'arquivado'
         AND (ep.id IS NULL OR ep.status <> 'arquivado')
         AND (ft.id IS NULL OR ft.status <> 'arquivado')
       ORDER BY m.similaridade DESC, m.entidade_id
       LIMIT $6`,
      [vector, input.tipo, input.excluirId, input.usuarioId, input.minimoSimilaridade, input.limite],
    );
    return result.rows;
  }

  async reuse(input: ReuseInput): Promise<ReuseResult> {
    const client = await this.pool.connect();
    let relation: ReuseRelation;
    const suggestionIds: string[] = [];
    try {
      await client.query("BEGIN");
      await lockHierarchy(client, input.tipo, input.destinoId);
      await assertWritable(client, input.tipo, input.destinoId);

      const target = await client.query<{ projeto_id: string }>(ORIGIN_SQL[input.tipo], [input.destinoId]);
      if (!target.rows[0]) throw new NotFoundError();

      const origin = await client.query<{ dados: Record<string, unknown>; projeto_id: string; arquivado: boolean }>(
        `SELECT scope.* FROM (${ORIGIN_SQL[input.tipo]}) scope WHERE ${projectAccessSql("scope.projeto_id", "$2")}`,
        [input.origemId, input.usuarioId],
      );
      if (!origin.rows[0]) throw new NotFoundError("Item de origem não encontrado.");
      if (origin.rows[0].arquivado) throw new ConflictError("O item de origem está arquivado e não pode ser aproveitado.");

      const wanted = input.campos ?? [...SUGGESTIBLE_FIELDS[input.tipo]];
      const copied: Array<{ campo: string; valor: string }> = [];
      for (const campo of wanted) {
        const raw = origin.rows[0].dados[campo];
        const valor = typeof raw === "string" ? raw.trim() : "";
        if (valor && valor.length <= maxLengthFor(campo)) copied.push({ campo, valor });
      }
      if (copied.length === 0) {
        throw new ValidationError("O item de origem não possui conteúdo aproveitável nos campos selecionados.");
      }

      const origem = similarOriginLabel(input.tipo, input.origemId);
      for (const { campo, valor } of copied) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO sugestao_ia (entidade_tipo, entidade_id, campo, valor_sugerido, origem, criado_por)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (entidade_tipo, entidade_id, campo) WHERE status = 'pendente'
           DO UPDATE SET valor_sugerido = EXCLUDED.valor_sugerido, origem = EXCLUDED.origem,
             criado_por = EXCLUDED.criado_por, updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [input.tipo, input.destinoId, campo, valor, origem, input.usuarioId],
        );
        suggestionIds.push(inserted.rows[0].id);
      }

      const campos = copied.map((item) => item.campo);
      const saved = await client.query<ReuseRelation>(
        `INSERT INTO reaproveitamento_item
           (tipo_relacao, destino_tipo, destino_id, destino_projeto_id, origem_tipo, origem_id, origem_projeto_id, campos, criado_por)
         VALUES ($1, $2, $3, $4, $2, $5, $6, $7::text[], $8)
         ON CONFLICT (destino_tipo, destino_id, origem_tipo, origem_id, tipo_relacao)
         DO UPDATE SET
           campos = ARRAY(SELECT DISTINCT unnest(reaproveitamento_item.campos || EXCLUDED.campos) ORDER BY 1),
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, tipo_relacao, destino_tipo, destino_id, destino_projeto_id, origem_tipo, origem_id,
                   origem_projeto_id, campos, criado_por, created_at::text AS created_at, updated_at::text AS updated_at`,
        [SIMILAR_RELATION_TYPE, input.tipo, input.destinoId, target.rows[0].projeto_id, input.origemId, origin.rows[0].projeto_id, campos, input.usuarioId],
      );
      relation = saved.rows[0];

      await auditService.record({
        usuario_id: input.usuarioId,
        entidade_tipo: input.tipo,
        entidade_id: input.destinoId,
        acao: "APROVEITAR_ITEM_SIMILAR",
        dados_json: {
          origem_tipo: input.tipo,
          origem_id: input.origemId,
          origem_projeto_id: origin.rows[0].projeto_id,
          campos,
          sugestoes_ids: suggestionIds,
        },
      }, client);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const sugestoes: SuggestionRow[] = [];
    for (const id of suggestionIds) {
      const row = await this.suggestions.findOne(input.tipo, input.destinoId, id);
      if (row) sugestoes.push(row);
    }
    return { relacao: relation, sugestoes };
  }
}
