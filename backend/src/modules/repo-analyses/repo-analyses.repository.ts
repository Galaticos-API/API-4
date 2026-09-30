import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { pool } from '../../database/db';
import { withTransaction } from '../../database/transaction';
import { assertWritable, lockHierarchy } from '../projects/hierarchy-archive';
import { AppError, ConflictError } from '../../shared/errors';
import { RepoAnalysisRecord } from './repo-analyses.types';

export class RepoAnalysesRepository {
    constructor(private readonly db: Pool = pool) {}

    async create(data: { projetoId: string; usuarioId: string; repositorioUrl: string;
        runId: string; requestKey: string; profile: string }): Promise<RepoAnalysisRecord> {
        return withTransaction(this.db, async client => {
            // Serialize a user's quota check, then use the same project lock as archive.
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [data.usuarioId]);
            await lockHierarchy(client, 'projeto', data.projetoId);
            const existing = (await client.query(
                'SELECT * FROM analise_repositorio WHERE projeto_id=$1 AND usuario_id=$2 AND request_key=$3',
                [data.projetoId, data.usuarioId, data.requestKey])).rows[0];
            if (existing) {
                if (existing.repositorio_url !== data.repositorioUrl || existing.perfil !== data.profile)
                    throw new ConflictError('Chave de solicitação já utilizada com outro conteúdo.');
                return existing;
            }
            await assertWritable(client, 'projeto', data.projetoId);
            const active = await client.query(
                "SELECT projeto_id FROM analise_repositorio WHERE (usuario_id=$1 OR projeto_id=$2) AND status NOT IN ('concluido','falha','cancelada')",
                [data.usuarioId, data.projetoId]);
            if (active.rows.some(row => row.projeto_id === data.projetoId))
                throw new ConflictError('Este projeto já possui uma análise ativa. Conclua ou cancele antes de iniciar outra.');
            if (active.rowCount! >= 3) throw new AppError('Limite de três análises ativas por usuário.', 429, 'ANALYSIS_LIMIT');
            return (await client.query(
                `INSERT INTO analise_repositorio
                 (projeto_id, usuario_id, repositorio_url, run_id, request_key, perfil, dispatch_pending, status, etapa, etapa_label, progresso)
                 VALUES ($1,$2,$3,$4,$5,$6,TRUE,'iniciado','queued','Na fila',0) RETURNING *`,
                [data.projetoId, data.usuarioId, data.repositorioUrl, data.runId, data.requestKey, data.profile])).rows[0];
        });
    }

    async claimDispatch(): Promise<RepoAnalysisRecord | null> {
        const result = await this.db.query(`UPDATE analise_repositorio SET dispatch_lease=$1,
            dispatch_after=NOW()+INTERVAL '60 seconds', dispatch_attempts=dispatch_attempts+1
            WHERE id=(SELECT id FROM analise_repositorio WHERE dispatch_pending AND dispatch_after<=NOW()
                ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [randomUUID()]);
        return result.rows[0] ?? null;
    }

    async cancelPending(id: string, projetoId: string): Promise<RepoAnalysisRecord | null> {
        return (await this.db.query(`UPDATE analise_repositorio SET cancel_requested=TRUE,
            status=CASE WHEN dispatch_attempts=0 THEN 'cancelada' ELSE 'cancelando' END,
            dispatch_pending=dispatch_attempts>0, updated_at=NOW()
            WHERE id=$1 AND projeto_id=$2 AND dispatch_pending RETURNING *`, [id, projetoId])).rows[0] ?? null;
    }

    async queueResume(id: string, projetoId: string): Promise<RepoAnalysisRecord | null> {
        const record = await this.findById(id, projetoId);
        if (!record) return null;
        return withTransaction(this.db, async client => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [record.usuario_id]);
            await lockHierarchy(client, 'projeto', projetoId);
            await assertWritable(client, 'projeto', projetoId);
            const current = (await client.query('SELECT * FROM analise_repositorio WHERE id=$1 FOR UPDATE', [id])).rows[0];
            if (current.resume_requested) return current;
            if (current.status !== 'pausada' && !(current.status === 'falha' && current.metadados?.can_resume))
                throw new ConflictError('A análise não possui progresso retomável.');
            const active = await client.query("SELECT projeto_id FROM analise_repositorio WHERE id<>$3 AND (usuario_id=$1 OR projeto_id=$2) AND status NOT IN ('concluido','falha','cancelada')", [record.usuario_id, projetoId, id]);
            if (active.rows.some(row => row.projeto_id === projetoId) || active.rowCount! >= 3)
                throw new ConflictError('Limite de análises ativas atingido.');
            return (await client.query(`UPDATE analise_repositorio SET resume_requested=TRUE, cancel_requested=FALSE,
                dispatch_pending=TRUE, dispatch_after=NOW(), status='iniciado', concluido_em=NULL, erro=NULL WHERE id=$1 RETURNING *`, [id])).rows[0];
        });
    }

    async finishDispatch(record: RepoAnalysisRecord, error?: string, permanent = false, cancelled = false): Promise<void> {
        await this.db.query(`UPDATE analise_repositorio SET dispatch_pending=$3 OR (cancel_requested AND NOT $6 AND NOT $4),
            dispatch_lease=NULL, dispatch_after=NOW()+make_interval(secs => LEAST(300, dispatch_attempts*10)),
            resume_requested=CASE WHEN $3 THEN resume_requested ELSE FALSE END,
            status=CASE WHEN $4 THEN 'falha' ELSE status END,
            etapa_label=CASE WHEN $4 THEN 'Falha ao iniciar' ELSE etapa_label END,
            erro=$5, updated_at=NOW()
            WHERE id=$1 AND dispatch_lease=$2`,
            [record.id, record.dispatch_lease, Boolean(error) && !permanent, permanent, error ?? null, cancelled]);
    }

    async findSyncable(): Promise<RepoAnalysisRecord[]> {
        return (await this.db.query(`SELECT * FROM analise_repositorio WHERE NOT dispatch_pending AND
            (status IN ('iniciado','em_execucao','pausando','cancelando') OR
            (status='concluido' AND relatorio_markdown IS NULL)) ORDER BY updated_at LIMIT 20`)).rows;
    }

    async findById(id: string, projetoId: string): Promise<RepoAnalysisRecord | null> {
        const query = `
      SELECT ar.*, u.nome as autor_nome, u.email as autor_email
      FROM analise_repositorio ar
      LEFT JOIN usuario u ON ar.usuario_id = u.id
      WHERE ar.id = $1 AND ar.projeto_id = $2;
    `;
        const result = await this.db.query(query, [id, projetoId]);
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
        const result = await this.db.query(query, [projetoId]);
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
          concluido_em = CASE WHEN $1::varchar IN ('concluido', 'falha', 'cancelada') THEN COALESCE(concluido_em, NOW()) ELSE concluido_em END
      WHERE run_id = $9::varchar;
    `;
        await this.db.query(query, [
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
