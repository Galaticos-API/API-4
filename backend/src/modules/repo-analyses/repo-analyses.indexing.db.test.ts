import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validateTarget } from '../../database/seed-lib.js';
import { ReportIndexingRepository } from './repo-analyses.indexing.repository.js';
import { SearchRepository } from '../search/search.repository.js';

test('S2-23 PostgreSQL: fila atomica, idempotencia, revisao, recuperacao, fencing, arquivo e isolamento', { skip: !process.env.INDEX_TEST_DATABASE_URL }, async () => {
    const db = new Pool({ connectionString: validateTarget(process.env.INDEX_TEST_DATABASE_URL, 'test') });
    const repository = new ReportIndexingRepository(db);
    const [project, other, user, analysis] = Array.from({ length: 4 }, () => randomUUID());
    const vector = Array(1024).fill(0.1);
    const chunk = { chunk_index: 0, text: 'Arquitetura PostgreSQL do relatorio', embedding: vector, metadata: { run_id: analysis } };
    const count = async () => Number((await db.query('SELECT count(*) AS n FROM chunk WHERE entidade_id=$1', [analysis])).rows[0].n);
    const record = async () => (await db.query('SELECT * FROM analise_repositorio WHERE id=$1', [analysis])).rows[0];
    try {
        await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1,'QA S223','QA','ativo'),($2,'QA Outro','QA','ativo')", [project, other]);
        await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'QA',$2,'test','po')", [user, user + '@test.local']);
        await db.query("INSERT INTO analise_repositorio(id,projeto_id,usuario_id,repositorio_url,run_id,status) VALUES ($1,$2,$3,'https://github.com/test/repo',$4,'em_execucao')", [analysis, project, user, 'run-' + analysis]);
        await db.query("UPDATE analise_repositorio SET status='concluido',relatorio_markdown='Versao 1' WHERE id=$1", [analysis]);
        assert.equal((await record()).indexacao_status, 'pendente');
        let claim = (await repository.claimPendingIndexing())!; assert.equal(claim.id, analysis);
        await repository.completeIndexing(claim, [chunk]); assert.equal(await count(), 1);
        const transaction = await db.connect();
        try {
            await transaction.query('BEGIN');
            await transaction.query("UPDATE analise_repositorio SET relatorio_markdown='Nao deve persistir' WHERE id=$1", [analysis]);
            await transaction.query('ROLLBACK');
        } finally { transaction.release(); }
        assert.equal((await record()).relatorio_markdown, 'Versao 1');
        assert.equal((await record()).indexacao_status, 'indexado');
        assert.equal(await count(), 1);
        await db.query('UPDATE analise_repositorio SET relatorio_markdown=NULL WHERE id=$1', [analysis]);
        assert.equal(await count(), 0);
        assert.equal((await record()).indexacao_status, 'nao_aplicavel');
        await db.query("UPDATE analise_repositorio SET relatorio_markdown='Versao 1' WHERE id=$1", [analysis]);
        claim = (await repository.claimPendingIndexing())!;
        await repository.completeIndexing(claim, [chunk]);
        assert.equal(await count(), 1);
        await repository.retryIndexing(analysis, project);
        claim = (await repository.claimPendingIndexing())!;
        await repository.retryIndexing(analysis, project);
        assert.equal((await record()).indexacao_lease_id, claim.indexacao_lease_id);
        await repository.completeIndexing(claim, [chunk]); assert.equal(await count(), 1);
        const search = new SearchRepository(db);
        const query = { projectId: project, query: 'Arquitetura', limit: 10 };
        const hits = await search.hybridSearch(query, vector, 0, 0);
        assert.equal(hits.length, 1); assert.equal(hits[0].source_url, `/projects/${project}#repo-analyzer=${analysis}`);
        assert.equal((await search.hybridSearch({ ...query, projectId: other }, vector, 0, 0)).length, 0);
        await repository.retryIndexing(analysis, other); assert.equal((await record()).indexacao_status, 'indexado');
        await repository.retryIndexing(analysis, project); claim = (await repository.claimPendingIndexing())!;
        await db.query("UPDATE analise_repositorio SET relatorio_markdown='Versao 2' WHERE id=$1", [analysis]);
        assert.equal(await count(), 0); assert.equal((await record()).indexacao_status, 'pendente');
        await repository.completeIndexing(claim, [chunk]); assert.equal(await count(), 0);
        claim = (await repository.claimPendingIndexing())!;
        await db.query("UPDATE analise_repositorio SET indexacao_bloqueado_ate=NOW()-INTERVAL '1 second' WHERE id=$1", [analysis]);
        await repository.completeIndexing(claim, [chunk]); assert.equal(await count(), 0);
        claim = (await repository.claimPendingIndexing())!;
        await repository.failIndexing(claim, 'TIMEOUT');
        assert.equal(await repository.claimPendingIndexing(), null);
        await db.query("UPDATE analise_repositorio SET indexacao_tentativas=4,indexacao_bloqueado_ate=NULL WHERE id=$1", [analysis]);
        claim = (await repository.claimPendingIndexing())!; await repository.failIndexing(claim, 'TIMEOUT');
        assert.equal((await record()).indexacao_status, 'falha');
        await repository.retryIndexing(analysis, project); claim = (await repository.claimPendingIndexing())!;
        await repository.completeIndexing(claim, [chunk]); assert.equal(await count(), 1);
        await repository.retryIndexing(analysis, project); claim = (await repository.claimPendingIndexing())!;
        await db.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [project]);
        assert.equal(await count(), 0);
        await repository.completeIndexing(claim, [chunk]); assert.equal(await count(), 0);
        await assert.rejects(repository.retryIndexing(analysis, project));
        assert.equal(await repository.claimPendingIndexing(), null);
    } finally {
        await db.query('DELETE FROM projeto WHERE id=ANY($1::uuid[])', [[project, other]]);
        await db.query('DELETE FROM usuario WHERE id=$1', [user]);
        await db.end();
    }
});
