import { projectAccessSql } from "../projects/project-access.js";
import { withTransaction } from "../../database/transaction.js";
import { ConflictError } from "../../shared/errors.js";
import { Pool } from "pg";
import { pool } from "../../database/db.js";
import type { ChatMessage, ChatSource, ChunkMatch, Conversation } from "./chat.types.js";

export class ChatRepository {
  private readonly pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async listConversations(usuarioId: string): Promise<Conversation[]> {
    const result = await this.pool.query<Conversation>(
      `SELECT c.id, c.usuario_id, c.projeto_id, c.titulo, c.created_at, c.updated_at, p.nome AS projeto_nome
       FROM conversa c
       LEFT JOIN projeto p ON p.id = c.projeto_id
       WHERE c.usuario_id = $1
       ORDER BY c.updated_at DESC, c.id DESC`,
      [usuarioId],
    );
    return result.rows;
  }

  async projectExists(projetoId: string, usuarioId: string): Promise<boolean> {
    const result = await this.pool.query(`SELECT p.id FROM projeto p WHERE p.id=$1 AND ${projectAccessSql("p.id","$2")}`, [projetoId, usuarioId]);
    return (result.rowCount ?? 0) > 0;
  }

  async accessibleProjects(usuarioId: string): Promise<Array<{ id: string; nome: string }>> {
    const result = await this.pool.query<{ id: string; nome: string }>(
      `SELECT p.id,p.nome FROM projeto p WHERE ${projectAccessSql("p.id","$1")} ORDER BY p.nome,p.id`, [usuarioId]);
    return result.rows;
  }

  async createConversation(usuarioId: string, projetoId: string | null, titulo: string): Promise<Conversation> {
    const result = await this.pool.query<Conversation>(
      `INSERT INTO conversa (usuario_id, projeto_id, titulo) VALUES ($1, $2, $3)
       RETURNING id, usuario_id, projeto_id, titulo, created_at, updated_at`,
      [usuarioId, projetoId, titulo],
    );
    return result.rows[0];
  }

  async findOwnedConversation(conversaId: string, usuarioId: string): Promise<Conversation | null> {
    const result = await this.pool.query<Conversation>(
      `SELECT c.id, c.usuario_id, c.projeto_id, c.titulo, c.created_at, c.updated_at, p.nome AS projeto_nome
       FROM conversa c LEFT JOIN projeto p ON p.id = c.projeto_id
       WHERE c.id = $1 AND c.usuario_id = $2`,
      [conversaId, usuarioId],
    );
    return result.rows[0] ?? null;
  }

  async listMessages(conversaId: string): Promise<ChatMessage[]> {
    const result = await this.pool.query<ChatMessage>(
      `SELECT id, conversa_id, remetente, conteudo, COALESCE(fontes_json, '[]'::jsonb) AS fontes_json, CASE WHEN processing_status='pending' AND created_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes' THEN 'failed' ELSE processing_status END AS processing_status, created_at
       FROM mensagem WHERE conversa_id = $1 ORDER BY created_at ASC, id ASC`,
      [conversaId],
    );
    return result.rows;
  }

  async addMessage(conversaId: string, remetente: "user" | "assistant", conteudo: string, fontes: ChatSource[] = []): Promise<string> {
    return withTransaction(this.pool, async client => {
      await client.query("SELECT id FROM conversa WHERE id=$1 FOR UPDATE", [conversaId]);
      await client.query("UPDATE mensagem SET processing_status='failed' WHERE conversa_id=$1 AND processing_status='pending' AND created_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes'", [conversaId]);
      if (remetente === "user" && (await client.query("SELECT 1 FROM mensagem WHERE conversa_id=$1 AND processing_status='pending'", [conversaId])).rowCount) throw new ConflictError("Aguarde a resposta em andamento nesta conversa.");
      const result = await client.query<{ id: string }>("INSERT INTO mensagem (conversa_id,remetente,conteudo,fontes_json,processing_status) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id", [conversaId, remetente, conteudo, JSON.stringify(fontes), remetente === "user" ? "pending" : "completed"]);
      await client.query("UPDATE conversa SET updated_at=CURRENT_TIMESTAMP WHERE id=$1", [conversaId]);
      return result.rows[0].id;
    });
  }

  async finishMessage(conversaId: string, messageId: string, conteudo: string, fontes: ChatSource[]): Promise<void> {
    await withTransaction(this.pool, async client => {
      await client.query("SELECT id FROM conversa WHERE id=$1 FOR UPDATE", [conversaId]);
      const result = await client.query("UPDATE mensagem SET processing_status='completed' WHERE id=$1 AND conversa_id=$2 AND processing_status='pending' RETURNING id", [messageId, conversaId]);
      if (!result.rowCount) throw new ConflictError("A pergunta não está mais em processamento.");
      await client.query("INSERT INTO mensagem(conversa_id,remetente,conteudo,fontes_json) VALUES ($1,'assistant',$2,$3::jsonb)", [conversaId, conteudo, JSON.stringify(fontes)]);
      await client.query("UPDATE conversa SET updated_at=CURRENT_TIMESTAMP WHERE id=$1", [conversaId]);
    });
  }

  async failMessage(messageId: string): Promise<void> {
    await this.pool.query("UPDATE mensagem SET processing_status='failed' WHERE id=$1 AND processing_status='pending'", [messageId]);
  }

  async searchChunks(projetoId: string, patterns: string[], limit: number): Promise<ChunkMatch[]> {
    if (patterns.length === 0) return [];
    const result = await this.pool.query<ChunkMatch>(
      `SELECT id, entidade_tipo, entidade_id, texto FROM chunk
       WHERE projeto_id = $1 AND texto ILIKE ANY($2::text[])
       ORDER BY created_at DESC, id LIMIT $3`,
      [projetoId, patterns, limit],
    );
    return result.rows;
  }
}
