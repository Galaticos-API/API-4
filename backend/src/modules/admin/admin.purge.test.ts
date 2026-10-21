import test from "node:test";
import assert from "node:assert/strict";
import { AdminService } from "./admin.service.js";
import { createAdminRouter } from "./admin.routes.js";
import { AdminController } from "./admin.controller.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import type { Request, Response } from "express";

test("S2-05: Expurgo transacional do contexto de um projeto", async (t) => {
  const adminUserId = "11111111-1111-4111-8111-111111111111";
  const targetProjectId = "22222222-2222-4222-8222-222222222222";
  const otherProjectId = "33333333-3333-4333-8333-333333333333";

  await t.test("valida UUID do projeto", async () => {
    const service = new AdminService({
      counts: async () => ({} as any),
      insertDemoChunks: async () => 0,
    });

    await assert.rejects(
      () => service.purgeProject("id-invalido", { confirmacao_nome: "Projeto Alpha" }, adminUserId),
      (err: unknown) => err instanceof ValidationError && err.message.includes("ID do projeto"),
    );
  });

  await t.test("exige digitação do nome para confirmar o expurgo (Cenário 3)", async () => {
    const service = new AdminService({
      counts: async () => ({} as any),
      insertDemoChunks: async () => 0,
    });

    await assert.rejects(
      () => service.purgeProject(targetProjectId, {}, adminUserId),
      (err: unknown) => err instanceof ValidationError,
    );

    await assert.rejects(
      () => service.purgeProject(targetProjectId, { confirmacao_nome: "   " }, adminUserId),
      (err: unknown) => err instanceof ValidationError,
    );
  });

  await t.test("rejeita quando o nome digitado diverge do nome real do projeto", async () => {
    const repoMock = {
      counts: async () => ({} as any),
      insertDemoChunks: async () => 0,
      purgeProjectContext: async () => {
        throw new ValidationError("O nome informado não confere com o nome do projeto.");
      },
    };

    const service = new AdminService(repoMock);

    await assert.rejects(
      () => service.purgeProject(targetProjectId, { confirmacao_nome: "Nome Errado" }, adminUserId),
      (err: unknown) => err instanceof ValidationError && err.message === "O nome informado não confere com o nome do projeto.",
    );
  });

  await t.test("lança NotFoundError quando o projeto não existe", async () => {
    const repoMock = {
      counts: async () => ({} as any),
      insertDemoChunks: async () => 0,
      purgeProjectContext: async () => {
        throw new NotFoundError("Projeto não encontrado.");
      },
    };

    const service = new AdminService(repoMock);

    await assert.rejects(
      () => service.purgeProject(targetProjectId, { confirmacao_nome: "Projeto Inexistente" }, adminUserId),
      (err: unknown) => err instanceof NotFoundError && err.message === "Projeto não encontrado.",
    );
  });

  await t.test("remove o contexto indexado com sucesso e audita (Cenário 1 e 2 - preservação dos demais)", async () => {
    let purgedTargetCalled = false;
    let otherProjectTouched = false;

    // Simulação do repositório garantindo isolamento entre projetos
    const chunksDatabase = new Map<string, Array<{ id: string; texto: string }>>([
      [targetProjectId, [{ id: "c-1", texto: "Chunk do projeto alvo" }, { id: "c-2", texto: "Outro chunk" }]],
      [otherProjectId, [{ id: "c-3", texto: "Chunk do projeto preservado" }]],
    ]);

    const auditLog: Array<{ acao: string; usuario_id: string; entidade_id: string; dados_json: any }> = [];

    const repoMock = {
      counts: async () => ({} as any),
      insertDemoChunks: async () => 0,
      purgeProjectContext: async (projectId: string, confirmacaoNome: string, userId: string, justificativa?: string) => {
        if (projectId !== targetProjectId) {
          otherProjectTouched = true;
        }

        const projectChunks = chunksDatabase.get(projectId) ?? [];
        const count = projectChunks.length;

        // Limpa somente o projeto alvo
        chunksDatabase.delete(projectId);
        purgedTargetCalled = true;

        auditLog.push({
          acao: "EXPURGAR_CONTEXTO",
          usuario_id: userId,
          entidade_id: projectId,
          dados_json: {
            projeto_nome: confirmacaoNome,
            chunks_removidos: count,
            eventos_removidos: 0,
          },
        });

        return {
          projeto_id: projectId,
          projeto_nome: confirmacaoNome,
          chunks_removidos: count,
          eventos_removidos: 0,
          status: "sucesso" as const,
          message: "Contexto indexado do projeto expurgado com sucesso.",
        };
      },
    };

    const service = new AdminService(repoMock);
    const result = await service.purgeProject(
      targetProjectId,
      { confirmacao_nome: "Projeto Alpha", justificativa: "Carga duplicada" },
      adminUserId,
    );

    assert.equal(purgedTargetCalled, true);
    assert.equal(otherProjectTouched, false);
    assert.equal(result.status, "sucesso");
    assert.equal(result.chunks_removidos, 2);

    // Verificação de preservação estrita do outro projeto (Cenário 2)
    assert.equal(chunksDatabase.has(targetProjectId), false, "Projeto alvo deve ter os chunks removidos");
    assert.equal(chunksDatabase.has(otherProjectId), true, "Outro projeto deve permanecer intacto");
    assert.equal(chunksDatabase.get(otherProjectId)?.length, 1);

    // Verificação de auditoria
    assert.equal(auditLog.length, 1);
    assert.equal(auditLog[0]!.acao, "EXPURGAR_CONTEXTO");
    assert.equal(auditLog[0]!.entidade_id, targetProjectId);
    assert.equal(auditLog[0]!.usuario_id, adminUserId);
  });

  await t.test("controller responde com JSON do expurgo", async () => {
    let handled = false;
    const fakeService = {
      stats: async () => ({} as any),
      loadDemo: async () => ({} as any),
      purgeProject: async (id: string, body: any, userId: string) => {
        handled = true;
        return {
          projeto_id: id,
          projeto_nome: "Projeto Beta",
          chunks_removidos: 5,
          eventos_removidos: 2,
          status: "sucesso" as const,
          message: "Contexto indexado do projeto expurgado com sucesso.",
        };
      },
    };

    const controller = new AdminController(fakeService as any, {} as any);

    let jsonResponse: any = null;
    const req = {
      params: { id: targetProjectId },
      body: { confirmacao_nome: "Projeto Beta" },
      auth: { id: adminUserId, role: "admin" },
    } as unknown as Request;

    const res = {
      json: (data: any) => {
        jsonResponse = data;
      },
    } as unknown as Response;

    await controller.purgeProject(req, res, () => {});

    assert.equal(handled, true);
    assert.equal(jsonResponse.status, "sucesso");
    assert.equal(jsonResponse.chunks_removidos, 5);
  });
});
