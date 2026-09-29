import { pool } from '../../database/db'; // Ajuste conforme a conexão do seu projeto
import { RepoAnalysisRecord } from './repo-analyses.types';

export class RepoAnalysesRepository {
    async create(data: {
        projetoId: string;
        usuarioId: string;
        repositorioUrl: string;
        runId: string;
    }): Promise<RepoAnalysisRecord> {
        const query = `
      INSERT INTO analise_repositorio (projeto_id, usuario_id, repositorio_url, run_id, status, etapa, etapa_label, progresso)
      VALUES ($1, $2, $3, $4, 'iniciado', 'ollama', 'Iniciando conexão...', 0)
      RETURNING *;
    `;
        const values = [data.projetoId, data.usuarioId, data.repositorioUrl, data.runId];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    async findById(id: string, projetoId: string): Promise<RepoAnalysisRecord | null> {
        const query = `
      SELECT ar.*, u.nome as autor_nome, u.email as autor_email
      FROM analise_repositorio ar
      LEFT JOIN usuario u ON ar.usuario_id = u.id
      WHERE ar.id = $1 AND ar.projeto_id = $2;
    `;
        const result = await pool.query(query, [id, projetoId]);
        return result.rows[0] || null;
    }

    async findByProjectId(projetoId: string): Promise<RepoAnalysisRecord[]> {
        const query = `
      SELECT ar.*, u.nome as autor_nome, u.email as autor_email
      FROM analise_repositorio ar
      LEFT JOIN usuario u ON ar.usuario_id = u.id
      WHERE ar.projeto_id = $1
      ORDER BY ar.created_at DESC;
    `;
        const result = await pool.query(query, [projetoId]);
        return result.rows;
    }

    async updateStatus(
        runId: string,
        statusData: {
            status: string;
            etapa: string;
            etapaLabel: string;
            progresso: number;
            mensagem?: string;
            erro?: string;
            relatorioMarkdown?: string;
            metadados?: any;
        }
    ): Promise<void> {
        const query = `
      UPDATE analise_repositorio
      SET status = $1::varchar,
          etapa = $2::varchar,
          etapa_label = $3::varchar,
          progresso = $4::integer,
          mensagem = $5::text,
          erro = $6::text,
          relatorio_markdown = COALESCE($7::text, relatorio_markdown),
          metadados = COALESCE($8::jsonb, metadados),
          updated_at = NOW(),
          concluido_em = CASE WHEN $1::varchar IN ('concluido', 'falha', 'cancelada') THEN NOW() ELSE concluido_em END
      WHERE run_id = $9::varchar;
    `;
        await pool.query(query, [
            statusData.status,
            statusData.etapa,
            statusData.etapaLabel,
            statusData.progresso,
            statusData.mensagem || null,
            statusData.erro || null,
            statusData.relatorioMarkdown || null,
            statusData.metadados ? JSON.stringify(statusData.metadados) : null,
            runId,
        ]);
    }
}
