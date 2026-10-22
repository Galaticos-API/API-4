import { createHash } from 'node:crypto';
import { HttpDocumentIngestionClient, type DocumentIngestionClient } from '../documents/document-ingestion.js';
import { AppError } from '../../shared/errors.js';
import { ReportIndexingRepository, type PendingReportIndexing, type ReportChunk } from './repo-analyses.indexing.repository.js';

function reportMetadata(analysis: PendingReportIndexing, text: string, index: number) {
    const meta = analysis.metadados ?? {};
    const paths = Array.isArray(meta.analyzed_paths) ? meta.analyzed_paths : [];
    const cited = paths.filter((path): path is string => typeof path === 'string' && path.length <= 1000 && !path.startsWith('/') && !path.split('/').includes('..') && text.includes(path));
    return {
        project_id: analysis.projeto_id,
        source_type: 'analise_repositorio',
        source_name: analysis.repositorio_url,
        analysis_id: analysis.id,
        run_id: analysis.run_id,
        repositorio_url: analysis.repositorio_url,
        perfil: analysis.perfil,
        source_commit: typeof meta.source_commit === 'string' ? meta.source_commit : null,
        source_ref: typeof meta.source_ref === 'string' ? meta.source_ref : null,
        cited_paths: cited,
        source_locator: `${analysis.run_id}#${index}`,
        report_version: createHash('sha256').update(analysis.relatorio_markdown).digest('hex'),
        provenance: 'ai-accepted',
        reviewed_by: analysis.aprovado_por,
        reviewed_at: analysis.aprovado_em,
        chunk_index: index,
    };
}

export class ReportIndexingWorker {
    constructor(
        private readonly repository = new ReportIndexingRepository(),
        private readonly aiServiceUrl?: string,
        private readonly client: DocumentIngestionClient = new HttpDocumentIngestionClient(aiServiceUrl),
    ) {}

    async tick(): Promise<void> {
        const analysis = await this.repository.claimPendingIndexing();
        if (!analysis) return;
        try {
            const prepared = await this.client.process({
                id: analysis.id,
                projeto_id: analysis.projeto_id,
                nome: `relatorio-${analysis.id}.md`,
            }, Buffer.from(analysis.relatorio_markdown, 'utf8'));
            const chunks: ReportChunk[] = prepared.map((chunk, index) => {
                if (chunk.embedding.every(value => value === 0)) throw new Error('INVALID_EMBEDDING');
                return { ...chunk, metadata: reportMetadata(analysis, chunk.text, index) };
            });
            await this.repository.completeIndexing(analysis, chunks);
        } catch (error) {
            const code = error instanceof AppError ? error.code : 'REPORT_PROCESSING_ERROR';
            await this.repository.failIndexing(analysis, code);
            console.warn(`[ReportIndexing] Falha ao indexar relatório: ${code}`);
        }
    }
}

export function startReportIndexingWorker(worker = new ReportIndexingWorker()): () => void {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try { await worker.tick(); }
        catch { console.warn('[ReportIndexing] Falha no worker; solicitação durável preservada.'); }
        finally { running = false; }
    };
    const timer = setInterval(() => void tick(), 20_000);
    timer.unref();
    void tick();
    return () => clearInterval(timer);
}
