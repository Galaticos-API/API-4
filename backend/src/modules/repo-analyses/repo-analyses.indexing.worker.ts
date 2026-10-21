import axios from 'axios';
import { env } from '../../config/env.js';
import { serviceHeaders } from '../../shared/service-auth.js';
import {
    ReportIndexingRepository,
    type PendingReportIndexing,
    type ReportChunk,
} from './repo-analyses.indexing.repository.js';

/**
 * Validates and normalizes chunks returned by the AI service.
 * Enforces 1024-dimension non-zero vectors and scope consistency.
 */
function validateReportChunks(
    data: unknown,
    analysis: PendingReportIndexing,
): ReportChunk[] {
    if (!data || typeof data !== 'object') throw new Error('INVALID_RESPONSE');
    const body = data as Record<string, unknown>;
    const chunks = body.chunks;
    if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('EMPTY_CHUNKS');
    }
    if (chunks.length > 500) throw new Error('TOO_MANY_CHUNKS');

    return chunks.map((raw: unknown, index: number) => {
        if (typeof raw !== 'object' || raw === null) throw new Error('INVALID_CHUNK');
        const chunk = raw as Record<string, unknown>;
        if (
            chunk.chunk_index !== index ||
            typeof chunk.text !== 'string' ||
            !chunk.text.trim()
        ) {
            throw new Error('INVALID_CHUNK');
        }
        if (
            !Array.isArray(chunk.embedding) ||
            chunk.embedding.length !== 1024 ||
            chunk.embedding.some(
                (v) => typeof v !== 'number' || !Number.isFinite(v),
            ) ||
            chunk.embedding.every((v) => v === 0)
        ) {
            throw new Error('INVALID_EMBEDDING');
        }
        return {
            chunk_index: index,
            text: chunk.text,
            embedding: chunk.embedding as number[],
            metadata: {
                project_id: analysis.projeto_id,
                source_type: 'analise_repositorio',
                analysis_id: analysis.id,
                run_id: analysis.run_id,
                repositorio_url: analysis.repositorio_url,
                perfil: analysis.perfil,
                chunk_index: index,
            },
        };
    });
}

/**
 * Classifies the error for logging/diagnostics.
 */
function indexingErrorCode(error: unknown): string {
    if (error instanceof Error) {
        if (['INVALID_RESPONSE', 'EMPTY_CHUNKS', 'TOO_MANY_CHUNKS', 'INVALID_CHUNK', 'INVALID_EMBEDDING'].includes(error.message)) {
            return error.message;
        }
    }
    if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'TIMEOUT';
        return error.response ? 'SERVICE_HTTP_ERROR' : 'SERVICE_UNAVAILABLE';
    }
    return 'PROCESSING_ERROR';
}

export class ReportIndexingWorker {
    constructor(
        private readonly repository: ReportIndexingRepository = new ReportIndexingRepository(),
        private readonly aiServiceUrl: string = env.AI_SERVICE_URL,
    ) {}

    /**
     * Processes one pending report: sends the Markdown to the AI service for
     * chunking + embedding, then persists the resulting chunks atomically.
     */
    async tick(): Promise<void> {
        const analysis = await this.repository.claimPendingIndexing();
        if (!analysis) return;

        try {
            const { data } = await axios.post(
                `${this.aiServiceUrl.replace(/\/$/, '')}/ingest/document`,
                {
                    document_id: analysis.id,
                    text_content: analysis.relatorio_markdown,
                    project_id: analysis.projeto_id,
                    metadata: {
                        source_type: 'analise_repositorio',
                        run_id: analysis.run_id,
                        repositorio_url: analysis.repositorio_url,
                        perfil: analysis.perfil,
                    },
                },
                {
                    headers: serviceHeaders(),
                    timeout: 300_000,
                    maxContentLength: 8 * 1024 * 1024,
                },
            );

            const chunks = validateReportChunks(data, analysis);
            await this.repository.completeIndexing(analysis, chunks);
            console.log(
                `[ReportIndexing] Relatório da análise ${analysis.id} indexado com ${chunks.length} trecho(s).`,
            );
        } catch (error) {
            const code = indexingErrorCode(error);
            const message =
                error instanceof Error ? error.message : 'Erro desconhecido';
            console.warn(
                `[ReportIndexing] Falha ao indexar relatório da análise ${analysis.id}: ${code} — ${message}`,
            );
            await this.repository.failIndexing(
                analysis,
                `${code}: ${message}`.slice(0, 500),
            );
        }
    }
}

/**
 * Starts a background worker that periodically indexes completed
 * RepoAnalyzer reports into the project vector acervo.
 */
export function startReportIndexingWorker(
    worker = new ReportIndexingWorker(),
): () => void {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await worker.tick();
        } catch {
            console.warn(
                '[ReportIndexing] Falha no worker; a solicitação durável será retomada.',
            );
        } finally {
            running = false;
        }
    };
    const timer = setInterval(() => void tick(), 20_000);
    timer.unref();
    void tick();
    return () => clearInterval(timer);
}
