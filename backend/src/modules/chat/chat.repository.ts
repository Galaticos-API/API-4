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

  async projectExists(projetoId: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM projeto WHERE id = $1", [projetoId]);
    return (result.rowCount ?? 0) > 0;
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
      `SELECT id, conversa_id, remetente, conteudo, COALESCE(fontes_json, '[]'::jsonb) AS fontes_json, created_at
       FROM mensagem WHERE conversa_id = $1 ORDER BY created_at ASC, id ASC`,
      [conversaId],
    );
    return result.rows;
  }

  async addMessage(conversaId: string, remetente: "user" | "assistant", conteudo: string, fontes: ChatSource[] = []): Promise<void> {
    await this.pool.query(
      "INSERT INTO mensagem (conversa_id, remetente, conteudo, fontes_json) VALUES ($1, $2, $3, $4::jsonb)",
      [conversaId, remetente, conteudo, JSON.stringify(fontes)],
    );
    await this.pool.query("UPDATE conversa SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [conversaId]);
  }

  async searchChunks(projetoId: string | null, patterns: string[], limit: number): Promise<ChunkMatch[]> {
    if (patterns.length === 0) return [];
    const result = await this.pool.query<ChunkMatch>(
      `SELECT id, entidade_tipo, entidade_id, texto FROM chunk
       WHERE ($1::uuid IS NULL OR projeto_id = $1) AND texto ILIKE ANY($2::text[])
       ORDER BY created_at DESC, id LIMIT $3`,
      [projetoId, patterns, limit],
    );
    return result.rows;
  }
}
