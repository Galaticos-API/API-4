import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validateTarget } from '../../database/seed-lib';
import { RepoAnalysesRepository } from './repo-analyses.repository';
import { ProjectArchiveRepository } from '../projects/projects.archive';

test('solicitação idempotente, lease exclusiva e bloqueio com arquivamento', { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, 'test') });
  const user = randomUUID(), project = randomUUID(), other = randomUUID(), concurrent = randomUUID();
  try {
    await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES($1,'Teste',$2,'hash','po')", [user, user+'@test.local']);
    for (const id of [project, other, concurrent]) await db.query("INSERT INTO projeto(id,nome,cliente) VALUES($1::uuid,$1::text,'Teste')",[id]);
    const repository = new RepoAnalysesRepository(db);
    const input = { projetoId: project, usuarioId: user, repositorioUrl: 'https://github.com/acme/repo', runId: randomUUID(), requestKey: randomUUID(), profile: 'quick' };
    const [a,b] = await Promise.all([repository.create(input),repository.create(input)]);
    assert.equal(a.id,b.id); assert.equal(a.dispatch_pending,true);
    await assert.rejects(repository.create({...input, requestKey: randomUUID()}), /já possui/);
    await assert.rejects(new ProjectArchiveRepository(db).archive(project), /cancele/);
    const leases = await Promise.all([repository.claimDispatch(), repository.claimDispatch()]);
    const own = leases.filter(row=>row?.id === a.id);
    assert.equal(own.length,1);
    await repository.finishDispatch({...own[0]!, dispatch_lease:randomUUID()});
    assert.equal((await repository.findById(a.id,project))!.dispatch_pending,true);
    await repository.finishDispatch(own[0]!);
    assert.equal((await repository.findById(a.id,project))!.dispatch_pending,false);
    await db.query("UPDATE analise_repositorio SET status='pausada' WHERE id=$1",[a.id]);
    const resumed = await repository.queueResume(a.id, project);
    assert.equal(resumed?.resume_requested,true);
    assert.equal(resumed?.dispatch_pending,true);
    const stale = { status: 'falha', etapa: 'error', etapaLabel: 'Resposta antiga', progresso: 0 };
    await repository.updateStatus(a.run_id, stale, a.revision ?? 0);
    assert.equal((await repository.findById(a.id,project))?.status,'iniciado');
    // Even after dispatch finishes, an earlier HTTP response cannot overwrite the resumed run.
    await db.query('UPDATE analise_repositorio SET dispatch_pending=FALSE WHERE id=$1',[a.id]);
    await repository.updateStatus(a.run_id, stale, a.revision ?? 0);
    assert.equal((await repository.findById(a.id,project))?.status,'iniciado');
    const fresh = (await repository.findById(a.id,project))!;
    await repository.updateStatus(a.run_id, { ...stale, status: 'em_execucao' }, fresh.revision!);
    assert.equal((await repository.findById(a.id,project))?.status,'em_execucao');
    await db.query('UPDATE analise_repositorio SET dispatch_pending=TRUE WHERE id=$1',[a.id]);
    await assert.rejects(new ProjectArchiveRepository(db).archive(project), /cancele/);
    const cancelling = await repository.cancelPending(a.id,project);
    assert.equal(cancelling?.status,'cancelando');
    assert.equal(cancelling?.dispatch_pending,true);
    await new ProjectArchiveRepository(db).archive(other);
    await assert.rejects(repository.create({...input,projetoId:other,requestKey:randomUUID()}), /arquivado/);
    const race = await Promise.allSettled([
      repository.create({...input,projetoId:concurrent,requestKey:randomUUID(),runId:randomUUID()}),
      new ProjectArchiveRepository(db).archive(concurrent),
    ]);
    assert.equal(race.filter(result=>result.status==='fulfilled').length,1);
    const rows = await repository.findByProjectId(concurrent);
    const status = (await db.query('SELECT status FROM projeto WHERE id=$1',[concurrent])).rows[0].status;
    assert.equal(rows.length, status==='arquivado' ? 0 : 1);
    if (rows.length) {
      const cancelled = await repository.cancelPending(rows[0].id,concurrent);
      assert.equal(cancelled?.status,'cancelada');
      assert.equal(cancelled?.dispatch_pending,false);
      await new ProjectArchiveRepository(db).archive(concurrent);
    }
  } finally {
    await db.query('DELETE FROM projeto WHERE id=ANY($1::uuid[])',[[project,other,concurrent]]);
    await db.query('DELETE FROM usuario WHERE id=$1',[user]); await db.end();
  }
});
