import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { auditService } from "../audit/audit.service.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";

export type PbiRelationType = "depende_de" | "similar_a" | "substitui";

export interface PbiRelationView {
  id: string;
  pbi_id: string;
  relacionado_id: string;
  codigo: string;
  titulo: string;
  status: string;
  tipo: string;
  prioridade: string;
  tipo_relacao: PbiRelationType;
  direcao: "saida" | "entrada";
  rotulo: string;
  created_at: string;
}

export interface PbiContextSummary {
  id: string;
  codigo: string;
  titulo: string;
  status: string;
  projeto_id: string;
  projeto_status: string;
}

export class PbiRelationsRepository {
  constructor(private readonly db: Pool = pool) {}

  async getPbiSummary(pbiId: string, client?: Pool | PoolClient): Promise<PbiContextSummary | null> {
    const conn = client ?? this.db;
    const res = await conn.query<PbiContextSummary>(
      `SELECT
        b.id,
        b.codigo,
        b.titulo,
        b.status,
        e.projeto_id,
        p.status AS projeto_status
      FROM pbi b
      JOIN feature f ON f.id = b.feature_id
      JOIN epico e ON e.id = f.epico_id
      JOIN projeto p ON p.id = e.projeto_id
      WHERE b.id = $1`,
      [pbiId],
    );
    return res.rows[0] ?? null;
  }

  async listRelations(pbiId: string): Promise<PbiRelationView[]> {
    const pbi = await this.getPbiSummary(pbiId);
    if (!pbi) throw new NotFoundError("PBI não encontrado.");

    const res = await this.db.query<{
      id: string;
      pbi_origem_id: string;
      pbi_destino_id: string;
      tipo_relacao: PbiRelationType;
      created_at: Date;
      relacionado_id: string;
      codigo: string;
      titulo: string;
      status: string;
      tipo: string;
      prioridade: string;
    }>(
      `SELECT
        r.id,
        r.pbi_origem_id,
        r.pbi_destino_id,
        r.tipo_relacao,
        r.created_at,
        CASE WHEN r.pbi_origem_id = $1 THEN r.pbi_destino_id ELSE r.pbi_origem_id END AS relacionado_id,
        p.codigo,
        p.titulo,
        p.status,
        p.tipo,
        p.prioridade
      FROM pbi_relacao r
      JOIN pbi p ON p.id = (CASE WHEN r.pbi_origem_id = $1 THEN r.pbi_destino_id ELSE r.pbi_origem_id END)
      WHERE r.pbi_origem_id = $1 OR r.pbi_destino_id = $1
      ORDER BY r.created_at DESC`,
      [pbiId],
    );

    return res.rows.map((row) => {
      const isSaida = row.pbi_origem_id === pbiId;
      let rotulo: string;

      if (row.tipo_relacao === "depende_de") {
        rotulo = isSaida ? "Depende de" : "É dependência de";
      } else if (row.tipo_relacao === "substitui") {
        rotulo = isSaida ? "Substitui" : "Substituído por";
      } else {
        rotulo = "Similar a";
      }

      return {
        id: row.id,
        pbi_id: pbiId,
        relacionado_id: row.relacionado_id,
        codigo: row.codigo,
        titulo: row.titulo,
        status: row.status,
        tipo: row.tipo,
        prioridade: row.prioridade,
        tipo_relacao: row.tipo_relacao,
        direcao: isSaida ? "saida" : "entrada",
        rotulo,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    });
  }

  async checkDependencyCycle(
    origemId: string,
    destinoId: string,
    client: PoolClient,
  ): Promise<{ hasCycle: boolean; path: string[] }> {
    // Procura se destinoId já depende de origemId (direta ou transitivamente)
    try {
      const cteRes = await client.query<{ path: string[] }>(
        `WITH RECURSIVE dep_path AS (
          SELECT
            pbi_origem_id,
            pbi_destino_id,
            ARRAY[pbi_origem_id::text, pbi_destino_id::text] AS path,
            1 AS depth
          FROM pbi_relacao
          WHERE pbi_origem_id = $1 AND tipo_relacao = 'depende_de'

          UNION ALL

          SELECT
            r.pbi_origem_id,
            r.pbi_destino_id,
            dp.path || r.pbi_destino_id::text,
            dp.depth + 1
          FROM pbi_relacao r
          JOIN dep_path dp ON r.pbi_origem_id = dp.pbi_destino_id::uuid
          WHERE r.tipo_relacao = 'depende_de'
            AND NOT (r.pbi_destino_id::text = ANY(dp.path))
            AND dp.depth < 50
        )
        SELECT path FROM dep_path WHERE pbi_destino_id = $2 LIMIT 1`,
        [destinoId, origemId],
      );

      if (cteRes.rows.length > 0 && cteRes.rows[0]?.path) {
        return { hasCycle: true, path: cteRes.rows[0].path };
      }
    } catch {
      // Fallback em memória (caso execução em ambiente de teste com mock)
      const allDeps = await client.query<{ pbi_origem_id: string; pbi_destino_id: string }>(
        "SELECT pbi_origem_id, pbi_destino_id FROM pbi_relacao WHERE tipo_relacao = 'depende_de'",
      );
      const adj = new Map<string, string[]>();
      for (const row of allDeps.rows) {
        const list = adj.get(row.pbi_origem_id) ?? [];
        list.push(row.pbi_destino_id);
        adj.set(row.pbi_origem_id, list);
      }

      const queue: string[][] = [[destinoId]];
      const visited = new Set<string>([destinoId]);

      while (queue.length > 0) {
        const currPath = queue.shift()!;
        const last = currPath[currPath.length - 1]!;
        const neighbors = adj.get(last) ?? [];

        for (const neighbor of neighbors) {
          if (neighbor === origemId) {
            return { hasCycle: true, path: [...currPath, neighbor] };
          }
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push([...currPath, neighbor]);
          }
        }
      }
    }

    return { hasCycle: false, path: [] };
  }

  async createRelation(
    origemId: string,
    destinoId: string,
    tipo: PbiRelationType,
    userId: string,
  ): Promise<PbiRelationView> {
    if (origemId === destinoId) {
      throw new ValidationError("Não é possível relacionar um item de trabalho consigo mesmo.");
    }

    return withTransaction(this.db, async (client) => {
      // Valida existência e busca detalhes dos dois PBIs
      const [origem, destino] = await Promise.all([
        this.getPbiSummary(origemId, client),
        this.getPbiSummary(destinoId, client),
      ]);

      if (!origem) throw new NotFoundError("PBI de origem não encontrado.");
      if (!destino) throw new NotFoundError("PBI de destino não encontrado.");

      // Trava e valida gravabilidade nos projetos envolvidos
      await lockHierarchy(client, "projeto", origem.projeto_id);
      await assertWritable(client, "projeto", origem.projeto_id);
      if (destino.projeto_id !== origem.projeto_id) {
        await lockHierarchy(client, "projeto", destino.projeto_id);
        await assertWritable(client, "projeto", destino.projeto_id);
      }

      // 1. Verificação de duplicidade existente
      const existingSame = await client.query(
        `SELECT id, tipo_relacao FROM pbi_relacao
         WHERE (pbi_origem_id = $1 AND pbi_destino_id = $2)
            OR (pbi_origem_id = $2 AND pbi_destino_id = $1)`,
        [origemId, destinoId],
      );

      for (const row of existingSame.rows) {
        if (row.tipo_relacao === tipo) {
          if (tipo === "similar_a") {
            throw new ConflictError(`Os itens ${origem.codigo} e ${destino.codigo} já estão relacionados como similares.`);
          }
          if (row.pbi_origem_id === origemId && row.pbi_destino_id === destinoId) {
            throw new ConflictError(`A relação '${tipo}' já existe entre ${origem.codigo} e ${destino.codigo}.`);
          }
        }
        if (tipo === "substitui" && row.tipo_relacao === "substitui") {
          throw new ConflictError(
            `Conflito: o item ${destino.codigo} já está registrado como substituto de ${origem.codigo}.`,
          );
        }
      }

      // 2. Prevenção de Ciclos em Dependências
      if (tipo === "depende_de") {
        const cycleCheck = await this.checkDependencyCycle(origemId, destinoId, client);
        if (cycleCheck.hasCycle) {
          // Busca os códigos para mensagem amigável
          const codeMap = new Map<string, string>();
          codeMap.set(origemId, origem.codigo);
          codeMap.set(destinoId, destino.codigo);

          const idsToFetch = cycleCheck.path.filter((id) => !codeMap.has(id));
          if (idsToFetch.length > 0) {
            const pbisRes = await client.query<{ id: string; codigo: string }>(
              "SELECT id, codigo FROM pbi WHERE id = ANY($1::uuid[])",
              [idsToFetch],
            );
            for (const r of pbisRes.rows) codeMap.set(r.id, r.codigo);
          }

          const pathFormatted = cycleCheck.path.map((id) => codeMap.get(id) ?? id).join(" -> ");
          throw new ValidationError(
            `Ciclo de dependência detectado: o item ${destino.codigo} já depende de ${origem.codigo} (${pathFormatted}). Não é permitido criar dependências circulares.`,
          );
        }
      }

      // 3. Inserção no banco
      const insertRes = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO pbi_relacao (pbi_origem_id, pbi_destino_id, tipo_relacao)
         VALUES ($1, $2, $3)
         RETURNING id, created_at`,
        [origemId, destinoId, tipo],
      );

      const relationId = insertRes.rows[0]!.id;
      const createdAt = insertRes.rows[0]!.created_at;

      // 4. Registro de Auditoria
      await auditService.record(
        {
          usuario_id: userId,
          entidade_tipo: "pbi",
          entidade_id: origemId,
          acao: "CRIAR_RELACAO_PBI",
          dados_json: {
            relacao_id: relationId,
            pbi_origem_id: origemId,
            pbi_origem_codigo: origem.codigo,
            pbi_destino_id: destinoId,
            pbi_destino_codigo: destino.codigo,
            tipo_relacao: tipo,
          },
        },
        client,
      );

      let rotulo: string;
      if (tipo === "depende_de") rotulo = "Depende de";
      else if (tipo === "substitui") rotulo = "Substitui";
      else rotulo = "Similar a";

      return {
        id: relationId,
        pbi_id: origemId,
        relacionado_id: destinoId,
        codigo: destino.codigo,
        titulo: destino.titulo,
        status: destino.status,
        tipo: destino.status,
        prioridade: "Must",
        tipo_relacao: tipo,
        direcao: "saida",
        rotulo,
        created_at: createdAt.toISOString(),
      };
    });
  }

  async deleteRelation(pbiId: string, relationId: string, userId: string): Promise<void> {
    await withTransaction(this.db, async (client) => {
      const relRes = await client.query<{
        id: string;
        pbi_origem_id: string;
        pbi_destino_id: string;
        tipo_relacao: string;
      }>(
        "SELECT id, pbi_origem_id, pbi_destino_id, tipo_relacao FROM pbi_relacao WHERE id = $1 FOR UPDATE",
        [relationId],
      );
      const relation = relRes.rows[0];
      if (!relation) throw new NotFoundError("Relação não encontrada.");

      if (relation.pbi_origem_id !== pbiId && relation.pbi_destino_id !== pbiId) {
        throw new NotFoundError("Relação não pertence ao PBI informado.");
      }

      const pbi = await this.getPbiSummary(pbiId, client);
      if (pbi) {
        await lockHierarchy(client, "projeto", pbi.projeto_id);
        await assertWritable(client, "projeto", pbi.projeto_id);
      }

      await client.query("DELETE FROM pbi_relacao WHERE id = $1", [relationId]);

      await auditService.record(
        {
          usuario_id: userId,
          entidade_tipo: "pbi",
          entidade_id: pbiId,
          acao: "REMOVER_RELACAO_PBI",
          dados_json: {
            relacao_id: relationId,
            pbi_origem_id: relation.pbi_origem_id,
            pbi_destino_id: relation.pbi_destino_id,
            tipo_relacao: relation.tipo_relacao,
          },
        },
        client,
      );
    });
  }
}

export const pbiRelationsRepository = new PbiRelationsRepository();
