import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { IndexingRepository, type IndexEvent } from "./indexing.repository.js";

type Kind = "projeto" | "epico" | "feature" | "pbi" | "decisao";
interface Source { id: string; kind: Kind; parent?: string; status: string; title: string }
function random(seed: number) {
  let state = seed;
  return (max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 0x100000000 * max); };
}

test("S2-03: sequências combinadas mantêm o índice equivalente às origens", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
  timeout: 180000,
}, async t => {
  const firstSeed = Number(process.env.INDEX_FIRST_SEED ?? 1);
  for (let seed = firstSeed; seed < firstSeed + 8; seed++) {
    await t.test("sequência " + seed + ": 80 operações", async () => {
      const db = new Pool({ connectionString: validateTarget(process.env.INDEX_TEST_DATABASE_URL, "test") });
      const repository = new IndexingRepository(db);
      const sources = new Map<string, Source>();
      const projects: string[] = [];
      const flights: IndexEvent[] = [];
      const pick = random(seed);
      const vector = Array(1024).fill(0.1);
      const technology = randomUUID();
      const links = new Set<string>();
      const criteria = new Map<string, string[]>();
      let technologyName = "Tecnologia " + technology;
      function all(kind?: Kind) { return [...sources.values()].filter(s => !kind || s.kind === kind); }
      function choose<T>(values: T[]) { return values[pick(values.length)]; }
      function ancestry(source: Source): Source[] {
        const chain = [source];
        let cursor = source;
        while (cursor.parent) {
          const parent = sources.get(cursor.parent);
          if (!parent) return [];
          chain.push(parent);
          cursor = parent;
        }
        return cursor.kind === "projeto" ? chain : [];
      }
      function scope(source: Source) {
        const chain = ancestry(source);
        const active = chain.length > 0 && chain.every(s => s.status !== "arquivado");
        return {
          project: chain.at(-1)?.id,
          eligible: active && (source.kind === "decisao" || source.status === "concluido"),
          level: source.kind === "decisao" ? sources.get(source.parent!)?.kind : source.kind,
        };
      }
      function prepare(event: IndexEvent) {
        return { content: String(event.payload.title) + " " + String(event.payload.description), embedding: vector };
      }
      async function claimLocal() {
        for (const project of projects) {
          const event = await repository.claim(project);
          if (event) return event;
        }
        return null;
      }
      async function settle() {
        for (const flight of flights.splice(0)) await repository.finish(flight, prepare(flight));
        // Simula recuperação após interrupção sem alterar a versão da origem.
        await db.query("UPDATE indice_evento SET bloqueado_ate=clock_timestamp()-INTERVAL '1 second' WHERE projeto_id=ANY($1::uuid[]) AND status='processando'", [projects]);
        await db.query("UPDATE indice_evento SET proxima_tentativa=clock_timestamp(),tentativas=0 WHERE projeto_id=ANY($1::uuid[]) AND status='falha'", [projects]);
        for (let i = 0; i < 100; i++) {
          const event = await claimLocal();
          if (!event) return;
          await repository.finish(event, prepare(event));
        }
        assert.fail("A fila não esvaziou.");
      }
      async function invariant(drained = false) {
        const rows = (await db.query("SELECT entidade_id,entidade_tipo,projeto_id,metadados_json,vector_dims(embedding) AS dimensions FROM chunk WHERE projeto_id=ANY($1::uuid[])", [projects])).rows;
        const seen = new Set<string>();
        for (const row of rows) {
          const source = sources.get(row.entidade_id);
          assert.ok(source, "Origem excluída não pode continuar indexada.");
          const expected = scope(source);
          assert.ok(expected.eligible, "Origem em rascunho/arquivada não pode estar indexada.");
          assert.equal(row.projeto_id, expected.project);
          assert.equal(row.metadados_json.project_id, expected.project);
          assert.equal(row.metadados_json.level, expected.level);
          assert.equal(row.metadados_json.title, source.title);
          assert.equal(row.metadados_json.status, source.kind === "decisao" ? sources.get(source.parent!)!.status : source.status);
          assert.equal(row.metadados_json.entity_id, source.id);
          assert.deepEqual(row.metadados_json.ancestor_ids, ancestry(source).filter(s => s.kind !== "decisao").map(s => s.id).reverse());
          const technologySource = source.kind === "decisao" ? source.parent! : source.id;
          assert.deepEqual(row.metadados_json.acceptanceCriteria, criteria.get(technologySource) ?? []);
          assert.deepEqual(row.metadados_json.tecnologias_ids, links.has(technologySource) ? [technology] : []);
          if (links.has(technologySource)) assert.equal(row.metadados_json.technologies[0].nome, technologyName);
          assert.equal(row.dimensions, 1024);
          const key = row.projeto_id + ":" + row.entidade_tipo + ":" + row.entidade_id;
          assert.ok(!seen.has(key), "Origem duplicada.");
          seen.add(key);
        }
        if (drained) {
          const expected = all().filter(s => s.kind !== "projeto" && scope(s).eligible).length;
          assert.equal(rows.length, expected, "Toda origem elegível deve estar indexada após esvaziar a fila.");
        }
      }
      async function create(kind: Kind, parent?: string) {
        const id = randomUUID(), title = "Sintético " + id;
        const source: Source = { id, kind, parent, title, status: kind === "projeto" ? "ativo" : "concluido" };
        if (kind === "projeto") {
          projects.push(id);
          await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1,$2,'Estado','ativo')", [id, title]);
        } else if (kind === "epico") {
          await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$2,$3,'concluido')", [id, parent, title]);
        } else if (kind === "feature") {
          await db.query("INSERT INTO feature(id,epico_id,titulo,status) VALUES($1,$2,$3,'concluido')", [id, parent, title]);
        } else if (kind === "pbi") {
          await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,status) VALUES($1::uuid,$2,$1::text,$3,'PO','consultar','reutilizar','concluido')", [id, parent, title]);
        } else {
          await db.query("INSERT INTO decisao(id,entidade_tipo,entidade_id,titulo,contexto,decisao,justificativa) VALUES($1,$2,$3,$4,'Contexto','Usar fila','Recuperação')", [id, sources.get(parent!)!.kind, parent, title]);
        }
        sources.set(id, source);
        return source;
      }
      try {
        for (let i = 0; i < 2; i++) {
          const project = await create("projeto");
          const epic = await create("epico", project.id);
          const feature = await create("feature", epic.id);
          const pbi = await create("pbi", feature.id);
          await create("decisao", project.id);
          await create("decisao", feature.id);
          await create("decisao", pbi.id);
        }
        await db.query("INSERT INTO tecnologia(id,nome) VALUES($1,$2)", [technology, technologyName]);
        await settle(); await invariant(true);
        for (let step = 0; step < 80; step++) {
          const operation = pick(14);
          const source = choose(all());
          if (operation === 0 && source.kind !== "decisao") {
            source.status = choose(source.kind === "projeto" ? ["ativo", "arquivado"] : ["rascunho", "concluido", "arquivado"]);
            await db.query("UPDATE " + source.kind + " SET status=$1 WHERE id=$2", [source.status, source.id]);
          } else if (operation === 1 && source.kind !== "projeto") {
            source.title = "Revisão " + seed + "-" + step;
            await db.query("UPDATE " + source.kind + " SET titulo=$1 WHERE id=$2", [source.title, source.id]);
          } else if (operation === 2 && source.kind !== "projeto") {
            if (source.kind === "decisao") {
              const parent = choose(all().filter(s => s.kind !== "decisao"));
              await db.query("UPDATE decisao SET entidade_tipo=$1,entidade_id=$2 WHERE id=$3", [parent.kind, parent.id, source.id]);
              source.parent = parent.id;
            } else {
              const parentKind = { epico: "projeto", feature: "epico", pbi: "feature" }[source.kind] as Kind;
              const column = { epico: "projeto_id", feature: "epico_id", pbi: "feature_id" }[source.kind];
              const parent = choose(all(parentKind));
              await db.query("UPDATE " + source.kind + " SET " + column + "=$1 WHERE id=$2", [parent.id, source.id]);
              source.parent = parent.id;
            }
          } else if (operation === 3) {
            const client = await db.connect();
            try {
              await client.query("BEGIN");
              await client.query("UPDATE " + source.kind + " SET " + (source.kind === "projeto" ? "nome" : "titulo") + "='Rollback' WHERE id=$1", [source.id]);
              await client.query("ROLLBACK");
            } finally { client.release(); }
          } else if (operation === 4) {
            const event = await claimLocal();
            if (event) flights.push(event);
          } else if (operation === 5 && flights.length) {
            const flight = flights.splice(pick(flights.length), 1)[0];
            await repository.finish(flight, prepare(flight));
            await repository.finish(flight, prepare(flight));
          } else if (operation === 6 && flights.length) {
            const flight = flights.splice(pick(flights.length), 1)[0];
            await repository.fail(flight, "SERVICE_UNAVAILABLE");
          } else if (operation === 7 && source.kind !== "decisao") {
            if (links.has(source.id)) {
              await db.query("DELETE FROM entidade_tecnologia WHERE entidade_tipo=$1 AND entidade_id=$2", [source.kind, source.id]);
              links.delete(source.id);
            } else {
              await db.query("INSERT INTO entidade_tecnologia(entidade_tipo,entidade_id,tecnologia_id) VALUES($1,$2,$3)", [source.kind, source.id, technology]);
              links.add(source.id);
            }
          } else if (operation === 8) {
            technologyName = "Stack " + technology + "-" + step;
            await db.query("UPDATE tecnologia SET nome=$1 WHERE id=$2", [technologyName, technology]);
          } else if (operation === 9) {
            const decision = choose(all("decisao"));
            if (decision) {
              await db.query("DELETE FROM decisao WHERE id=$1", [decision.id]);
              sources.delete(decision.id);
            } else await create("decisao", choose(all("pbi")).id);
          } else if (operation === 10 && flights.length) {
            const flight = choose(flights);
            await db.query("UPDATE indice_evento SET bloqueado_ate=clock_timestamp()-INTERVAL '1 second' WHERE evento_id=$1 AND lease_id=$2", [flight.evento_id, flight.lease_id]);
          } else if (operation === 12) {
            const pbi = choose(all("pbi"));
            if (pbi) {
              await db.query("INSERT INTO criterio_aceitacao(entidade_tipo,entidade_id,nome,dado,quando,entao,ordem) VALUES('pbi',$1,$2,'Acervo','Consultar','Encontrar origem',$3)", [pbi.id, "Cenário " + seed + "-" + step, step + 1]);
              criteria.set(pbi.id, [...(criteria.get(pbi.id) ?? []), "Cenário " + seed + "-" + step + " Acervo Consultar Encontrar origem"]);
            }
          } else if (operation === 13) {
            await db.query("DELETE FROM tecnologia WHERE id=$1", [technology]);
            links.clear();
            await db.query("INSERT INTO tecnologia(id,nome) VALUES($1,$2)", [technology, technologyName]);
          } else if (operation === 11) {
            const candidate = (await db.query("SELECT projeto_id,evento_id FROM indice_evento WHERE projeto_id=ANY($1::uuid[]) AND status='processado' ORDER BY evento_id LIMIT 1", [projects])).rows[0];
            if (candidate && sources.get(candidate.projeto_id)?.status !== "arquivado") {
              await repository.retry(candidate.projeto_id, candidate.evento_id);
              await repository.retry(candidate.projeto_id, candidate.evento_id);
            }
          }
          await invariant();
          if (step % 10 === 9) { await settle(); await invariant(true); }
        }
        await settle(); await invariant(true);
      } finally {
        await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [projects]);
        await db.query("DELETE FROM tecnologia WHERE id=$1", [technology]);
        await db.end();
      }
    });
  }
});
