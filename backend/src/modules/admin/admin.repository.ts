import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import { auditService } from "../audit/audit.service.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";

export interface AdminCounts {
  projetos: number;
  epicos: number;
  features: number;
  pbis: number;
  documentos: number;
  chunksIndexados: number;
}

export interface PurgeProjectResult {
  projeto_id: string;
  projeto_nome: string;
  chunks_removidos: number;
  eventos_removidos: number;
  status: "sucesso";
  message: string;
}

export class AdminRepository {
  constructor(private readonly db: Pool = pool) { }

  async counts(): Promise<AdminCounts> {
    const { rows } = await this.db.query<AdminCounts>(
      `SELECT
        (SELECT COUNT(*)::int FROM projeto) AS projetos,
        (SELECT COUNT(*)::int FROM epico) AS epicos,
        (SELECT COUNT(*)::int FROM feature) AS features,
        (SELECT COUNT(*)::int FROM pbi) AS pbis,
        (SELECT COUNT(*)::int FROM documento) AS documentos,
        (SELECT COUNT(*)::int FROM chunk WHERE embedding IS NOT NULL) AS "chunksIndexados"`,
    );
    return rows[0];
  }

  async insertDemoChunks(projectId: string, userId: string): Promise<number> {
    return withTransaction(this.db, async (client) => {

      await lockHierarchy(client, "projeto", projectId);
      await assertWritable(client, "projeto", projectId);
      const result = await client.query(
        `INSERT INTO chunk (id, projeto_id, entidade_tipo, entidade_id, texto, metadados_json)
         SELECT md5($1::text || ':sinapse-demo-v1:' || demo.key)::uuid,
                $1::uuid, 'demonstracao', md5($1::text || ':sinapse-demo-v1:' || demo.key)::uuid,
                demo.texto, jsonb_build_object('fonte', 'sinapse-demo-v1', 'demonstracao', true, 'chave', demo.key)
         FROM (VALUES
           ('arquitetura', 'Exemplo demonstrativo: uma base de requisitos pode organizar projetos, épicos, features e PBIs.'),
           ('decisao', 'Exemplo demonstrativo: registre o contexto, as alternativas e a justificativa de cada decisão técnica.')
         ) AS demo(key, texto)
         ON CONFLICT (id) DO NOTHING`,
        [projectId],
      );
      const inserted = result.rowCount ?? 0;
      if (inserted > 0) await auditService.record({
        usuario_id: userId, entidade_tipo: "projeto", entidade_id: projectId,
        acao: "CARREGAR_DEMONSTRACAO", dados_json: { versao: "sinapse-demo-v1", inseridos: inserted },
      }, client);

      return inserted;

    });
  }

  async purgeProjectContext(
    projectId: string,
    confirmacaoNome: string,
    userId: string,
    justificativa?: string,
  ): Promise<PurgeProjectResult> {
    return withTransaction(this.db, async (client) => {
      await lockHierarchy(client, "projeto", projectId);

      const projectRes = await client.query<{ id: string; nome: string }>(
        "SELECT id, nome FROM projeto WHERE id = $1 FOR UPDATE",
        [projectId],
      );
      const project = projectRes.rows[0];
      if (!project) throw new NotFoundError("Projeto não encontrado.");

      if (confirmacaoNome.trim() !== project.nome.trim()) {
        throw new ValidationError("O nome informado não confere com o nome do projeto.");
      }

      const countRes = await client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM chunk WHERE projeto_id = $1",
        [projectId],
      );
      const chunksRemovidos = countRes.rows[0]?.count ?? 0;

      await client.query("DELETE FROM chunk WHERE projeto_id = $1", [projectId]);

      const eventsCountRes = await client.query(
        "DELETE FROM indice_evento WHERE projeto_id = $1",
        [projectId],
      );
      const eventosRemovidos = eventsCountRes.rowCount ?? 0;

      await auditService.record({
        usuario_id: userId,
        entidade_tipo: "projeto",
        entidade_id: projectId,
        acao: "EXPURGAR_CONTEXTO",
        justificativa: justificativa ?? null,
        dados_json: {
          projeto_nome: project.nome,
          chunks_removidos: chunksRemovidos,
          eventos_removidos: eventosRemovidos,
        },
      }, client);

      return {
        projeto_id: projectId,
        projeto_nome: project.nome,
        chunks_removidos: chunksRemovidos,
        eventos_removidos: eventosRemovidos,
        status: "sucesso",
        message: "Contexto indexado do projeto expurgado com sucesso.",
      };
    });
  }
}

