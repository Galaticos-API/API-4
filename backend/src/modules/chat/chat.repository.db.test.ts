import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService, searchPatterns, type AssistantClient } from "./chat.service.js";
import { NotFoundError } from "../../shared/errors.js";

class Offline implements AssistantClient {
  async ask(): Promise<never> {
    throw new Error("offline");
  }
}

test("chat: posse da conversa e busca textual isolada por projeto no PostgreSQL", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const repository = new ChatRepository(pool);
  const service = new ChatService(repository, new Offline());
  const [ana, bruno, projectA, projectB, chunkA, chunkB] = Array.from({ length: 6 }, () => randomUUID());
  try {
    await pool.query("INSERT INTO usuario (id,nome,email,senha_hash,role) VALUES ($1,'Ana','ana-chat@chat.test','h','po'),($2,'Bruno','bruno-chat@chat.test','h','po')", [ana, bruno]);
    await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'T','ativo'),($2::uuid,$2::text,'T','ativo')", [projectA, projectB]);
    await pool.query("INSERT INTO chunk (id,projeto_id,entidade_tipo,entidade_id,texto) VALUES ($1,$2,'documento',$3,'O arquivamento preserva o histórico do projeto A'),($4,$5,'documento',$6,'Arquivamento confidencial do projeto B')", [chunkA, projectA, randomUUID(), chunkB, projectB, randomUUID()]);

    const found = await repository.searchChunks(projectA, searchPatterns("Como funciona o arquivamento?"), 5);
    assert.deepEqual(found.map((item) => item.id), [chunkA]);
    const unscoped = await repository.searchChunks(null, searchPatterns("arquivamento"), 5);
    assert.deepEqual(unscoped.map((item) => item.id).sort(), [chunkA, chunkB].sort());
    assert.deepEqual(await repository.searchChunks(projectA, searchPatterns("inexistente"), 5), []);
    assert.deepEqual(await repository.searchChunks(projectA, [], 5), []);

    const result = await service.query(ana, { pergunta: "Como funciona o arquivamento?", projetoId: projectA });
    assert.equal(result.origem, "busca_textual");
    assert.ok(!result.resposta.includes("confidencial"));

    await assert.rejects(service.listMessages(bruno, result.conversa_id), NotFoundError);
    await assert.rejects(service.query(bruno, { pergunta: "invasão", conversaId: result.conversa_id }), NotFoundError);
    const messages = await service.listMessages(ana, result.conversa_id);
    assert.deepEqual(messages.map((item) => item.remetente), ["user", "assistant"]);
    assert.equal((await service.listConversations(bruno)).length, 0);
    assert.equal((await service.listConversations(ana))[0].projeto_nome, projectA);
  } finally {
    await pool.query("DELETE FROM conversa WHERE usuario_id = ANY($1::uuid[])", [[ana, bruno]]);
    await pool.query("DELETE FROM chunk WHERE id = ANY($1::uuid[])", [[chunkA, chunkB]]);
    await pool.query("DELETE FROM projeto WHERE id = ANY($1::uuid[])", [[projectA, projectB]]);
    await pool.query("DELETE FROM usuario WHERE id = ANY($1::uuid[])", [[ana, bruno]]);
    await pool.end();
  }
});
