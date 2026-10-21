import test from "node:test";
import assert from "node:assert/strict";
import { PbiRelationsService, createRelationSchema } from "./pbis.relations.service.js";
import { PbiRelationsRepository, type PbiRelationView } from "./pbis.relations.repository.js";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";

test("S2-15: Relações bidirecionais entre PBIs e prevenção de ciclos", async (t) => {
  const pbiA = "11111111-1111-4111-8111-111111111111";
  const pbiB = "22222222-2222-4222-8222-222222222222";
  const pbiC = "33333333-3333-4333-8333-333333333333";
  const pbiD = "44444444-4444-4444-8444-444444444444";
  const userId = "99999999-9999-4999-8999-999999999999";

  await t.test("valida schema de criação aceitando tipos com underscore ou espaço", () => {
    assert.equal(
      createRelationSchema.parse({ pbi_destino_id: pbiB, tipo_relacao: "depende_de" }).tipo_relacao,
      "depende_de",
    );
    assert.equal(
      createRelationSchema.parse({ pbi_destino_id: pbiB, tipo_relacao: "depende de" }).tipo_relacao,
      "depende_de",
    );
    assert.equal(
      createRelationSchema.parse({ pbi_destino_id: pbiB, tipo_relacao: "similar a" }).tipo_relacao,
      "similar_a",
    );
    assert.equal(
      createRelationSchema.parse({ pbi_destino_id: pbiB, tipo_relacao: "substitui" }).tipo_relacao,
      "substitui",
    );

    assert.throws(
      () => createRelationSchema.parse({ pbi_destino_id: pbiB, tipo_relacao: "invalido" }),
      (err: any) => err.name === "ZodError",
    );
    assert.throws(
      () => createRelationSchema.parse({ pbi_destino_id: "nao-uuid", tipo_relacao: "depende_de" }),
      (err: any) => err.name === "ZodError",
    );
  });

  await t.test("impede relacionar um item consigo mesmo (Cenário 2)", async () => {
    const service = new PbiRelationsService({
      listRelations: async () => [],
      createRelation: async (origem: string, destino: string) => {
        if (origem === destino) {
          throw new ValidationError("Não é possível relacionar um item de trabalho consigo mesmo.");
        }
        return {} as any;
      },
      deleteRelation: async () => {},
    } as any);

    await assert.rejects(
      () => service.create(pbiA, { pbi_destino_id: pbiA, tipo_relacao: "depende_de" }, userId),
      (err: unknown) => err instanceof ValidationError && err.message.includes("consigo mesmo"),
    );
  });

  await t.test("detecção de ciclo em dependências direta (A -> B, B -> A) (Cenário 2)", async () => {
    // Simula grafo com A depende de B
    const edges = new Map<string, string[]>([[pbiA, [pbiB]]]);

    const repo = new PbiRelationsRepository({} as any);
    const mockClient = {
      query: async (sql: string, params: any[]) => {
        // Fallback em memória acionado
        if (sql.includes("pbi_relacao WHERE tipo_relacao = 'depende_de'")) {
          const rows: Array<{ pbi_origem_id: string; pbi_destino_id: string }> = [];
          for (const [orig, dests] of edges.entries()) {
            for (const d of dests) rows.push({ pbi_origem_id: orig, pbi_destino_id: d });
          }
          return { rows };
        }
        throw new Error("Simula fallback do CTE");
      },
    } as any;

    // Tentando fazer B depender de A:
    const checkDirect = await repo.checkDependencyCycle(pbiB, pbiA, mockClient);
    assert.equal(checkDirect.hasCycle, true, "Deve detectar ciclo direto");
    assert.deepEqual(checkDirect.path, [pbiA, pbiB]);

    // Tentando fazer C depender de A (sem ciclo):
    const checkNoCycle = await repo.checkDependencyCycle(pbiC, pbiA, mockClient);
    assert.equal(checkNoCycle.hasCycle, false, "Não deve acusar ciclo quando não há caminho");
  });

  await t.test("detecção de ciclo em dependências transitiva (A -> B -> C -> D, D -> A) (Cenário 2)", async () => {
    // A -> B -> C -> D
    const edges = new Map<string, string[]>([
      [pbiA, [pbiB]],
      [pbiB, [pbiC]],
      [pbiC, [pbiD]],
    ]);

    const repo = new PbiRelationsRepository({} as any);
    const mockClient = {
      query: async (sql: string) => {
        if (sql.includes("pbi_relacao WHERE tipo_relacao = 'depende_de'")) {
          const rows: Array<{ pbi_origem_id: string; pbi_destino_id: string }> = [];
          for (const [orig, dests] of edges.entries()) {
            for (const d of dests) rows.push({ pbi_origem_id: orig, pbi_destino_id: d });
          }
          return { rows };
        }
        throw new Error("Simula fallback do CTE");
      },
    } as any;

    // Tentando fazer D depender de A: fecha o ciclo D -> A -> B -> C -> D
    const checkTransitive = await repo.checkDependencyCycle(pbiD, pbiA, mockClient);
    assert.equal(checkTransitive.hasCycle, true, "Deve detectar ciclo transitivo");
    assert.deepEqual(checkTransitive.path, [pbiA, pbiB, pbiC, pbiD]);
  });

  await t.test("exibição bidirecional nos dois itens (Cenário 1)", async () => {
    // Mock do repositório contendo relação A -> B (depende_de) e A <-> C (similar_a)
    const relationsDb = [
      {
        id: "rel-1",
        pbi_origem_id: pbiA,
        pbi_destino_id: pbiB,
        tipo_relacao: "depende_de" as const,
        created_at: new Date("2026-10-20T10:00:00Z"),
      },
      {
        id: "rel-2",
        pbi_origem_id: pbiA,
        pbi_destino_id: pbiC,
        tipo_relacao: "similar_a" as const,
        created_at: new Date("2026-10-20T11:00:00Z"),
      },
      {
        id: "rel-3",
        pbi_origem_id: pbiA,
        pbi_destino_id: pbiD,
        tipo_relacao: "substitui" as const,
        created_at: new Date("2026-10-20T12:00:00Z"),
      },
    ];

    const pbiInfo: Record<string, any> = {
      [pbiA]: { codigo: "PBI-01.1.1", titulo: "Autenticação", status: "concluido", tipo: "Funcional", prioridade: "Must" },
      [pbiB]: { codigo: "PBI-01.1.2", titulo: "Banco de dados", status: "concluido", tipo: "Funcional", prioridade: "Must" },
      [pbiC]: { codigo: "PBI-01.1.3", titulo: "Login Social", status: "rascunho", tipo: "Funcional", prioridade: "Should" },
      [pbiD]: { codigo: "PBI-01.1.4", titulo: "Auth Legada", status: "arquivado", tipo: "Funcional", prioridade: "Could" },
    };

    const mockPool = {
      query: async (sql: string, params: any[]) => {
        if (sql.includes("FROM pbi b")) {
          // getPbiSummary
          const id = params[0];
          return { rows: [{ id, ...pbiInfo[id], projeto_id: "proj-1", projeto_status: "ativo" }] };
        }
        if (sql.includes("FROM pbi_relacao r")) {
          // listRelations
          const pbiId = params[0];
          const matched = relationsDb.filter(r => r.pbi_origem_id === pbiId || r.pbi_destino_id === pbiId);
          const rows = matched.map(r => {
            const relId = r.pbi_origem_id === pbiId ? r.pbi_destino_id : r.pbi_origem_id;
            return {
              ...r,
              relacionado_id: relId,
              ...pbiInfo[relId],
            };
          });
          return { rows };
        }
        return { rows: [] };
      },
    } as any;

    const repo = new PbiRelationsRepository(mockPool);

    // Consulta pela visão do item A (origem)
    const relsFromA = await repo.listRelations(pbiA);
    assert.equal(relsFromA.length, 3);

    const depFromA = relsFromA.find(r => r.relacionado_id === pbiB);
    assert.equal(depFromA?.rotulo, "Depende de");
    assert.equal(depFromA?.direcao, "saida");
    assert.equal(depFromA?.codigo, "PBI-01.1.2");

    const simFromA = relsFromA.find(r => r.relacionado_id === pbiC);
    assert.equal(simFromA?.rotulo, "Similar a");

    const subFromA = relsFromA.find(r => r.relacionado_id === pbiD);
    assert.equal(subFromA?.rotulo, "Substitui");
    assert.equal(subFromA?.direcao, "saida");

    // Consulta pela visão do item B (destino da dependência)
    const relsFromB = await repo.listRelations(pbiB);
    assert.equal(relsFromB.length, 1);
    const depFromB = relsFromB[0]!;
    assert.equal(depFromB.relacionado_id, pbiA);
    assert.equal(depFromB.rotulo, "É dependência de");
    assert.equal(depFromB.direcao, "entrada");
    assert.equal(depFromB.codigo, "PBI-01.1.1");

    // Consulta pela visão do item C (destino da similaridade - simétrico)
    const relsFromC = await repo.listRelations(pbiC);
    assert.equal(relsFromC.length, 1);
    const simFromC = relsFromC[0]!;
    assert.equal(simFromC.relacionado_id, pbiA);
    assert.equal(simFromC.rotulo, "Similar a");

    // Consulta pela visão do item D (destino da substituição)
    const relsFromD = await repo.listRelations(pbiD);
    assert.equal(relsFromD.length, 1);
    const subFromD = relsFromD[0]!;
    assert.equal(subFromD.relacionado_id, pbiA);
    assert.equal(subFromD.rotulo, "Substituído por");
    assert.equal(subFromD.direcao, "entrada");
  });

  await t.test("rejeita relação duplicada com 409 Conflict", async () => {
    const fakeRepo = {
      createRelation: async () => {
        throw new ConflictError("A relação 'depende_de' já existe entre os itens.");
      },
    } as any;

    const service = new PbiRelationsService(fakeRepo);

    await assert.rejects(
      () => service.create(pbiA, { pbi_destino_id: pbiB, tipo_relacao: "depende_de" }, userId),
      (err: unknown) => err instanceof ConflictError && err.message.includes("já existe"),
    );
  });
});
