import { projectAccessSql } from "../projects/project-access.js";
import { knowledgeSourceSql } from '../../shared/knowledge-source-sql.js';
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

  async listMessages(conversaId: string, usuarioId: string): Promise<ChatMessage[]> {
    const result = await this.pool.query<ChatMessage>(
      `SELECT id, conversa_id, remetente, conteudo, COALESCE(fontes_json, '[]'::jsonb) AS fontes_json, CASE WHEN processing_status='pending' AND created_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes' THEN 'failed' ELSE processing_status END AS processing_status, created_at
       FROM mensagem WHERE conversa_id = $1
       AND EXISTS (SELECT 1 FROM conversa scope WHERE scope.id=mensagem.conversa_id AND scope.usuario_id=$2
         AND ${projectAccessSql('scope.projeto_id','$2')})
       ORDER BY created_at ASC, id ASC`,
      [conversaId,usuarioId],
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

  async retryMessage(conversaId: string, messageId: string, conteudo: string): Promise<string> {
    return withTransaction(this.pool, async client => {
      await client.query("SELECT id FROM conversa WHERE id=$1 FOR UPDATE", [conversaId]);
      await client.query("UPDATE mensagem SET processing_status='failed' WHERE conversa_id=$1 AND processing_status='pending' AND created_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes'", [conversaId]);
      if ((await client.query("SELECT 1 FROM mensagem WHERE conversa_id=$1 AND processing_status='pending'", [conversaId])).rowCount) {
        throw new ConflictError("Aguarde a resposta em andamento nesta conversa.");
      }
      const result = await client.query(
        "UPDATE mensagem SET processing_status='pending', conteudo=$3 WHERE id=$1 AND conversa_id=$2 AND remetente='user' AND processing_status='failed' RETURNING id",
        [messageId, conversaId, conteudo],
      );
      if (!result.rowCount) throw new ConflictError("Esta pergunta não está mais disponível para nova tentativa.");
      await client.query("UPDATE conversa SET updated_at=CURRENT_TIMESTAMP WHERE id=$1", [conversaId]);
      return result.rows[0].id;
    });
  }

  async failMessage(messageId: string): Promise<void> {
    await this.pool.query("UPDATE mensagem SET processing_status='failed' WHERE id=$1 AND processing_status='pending'", [messageId]);
  }

  async searchChunks(projetoId: string, patterns: string[], limit: number): Promise<ChunkMatch[]> {
    if (patterns.length === 0) return [];
    const result = await this.pool.query<ChunkMatch>(
      `SELECT id, entidade_tipo, entidade_id, texto, metadados_json FROM chunk
       WHERE projeto_id = $1 AND texto ILIKE ANY($2::text[])
       AND EXISTS (SELECT 1 FROM projeto p WHERE p.id=chunk.projeto_id AND p.status<>'arquivado')
       AND ${knowledgeSourceSql('chunk')}
       AND (entidade_tipo <> 'analise_repositorio' OR EXISTS (SELECT 1 FROM analise_repositorio reviewed
         WHERE reviewed.id=chunk.entidade_id AND reviewed.projeto_id=chunk.projeto_id
         AND reviewed.aprovacao_hash=encode(sha256(convert_to(reviewed.relatorio_markdown,'UTF8')),'hex')
         AND reviewed.status='concluido' AND reviewed.aprovado_por IS NOT NULL AND reviewed.aprovado_em IS NOT NULL))
       ORDER BY created_at DESC, id LIMIT $3`,
      [projetoId, patterns, limit],
    );
    return result.rows;
  }

  async currentHarnessChunks(projectId: string, ids: string[]) {
    if (!ids.length) return [];
    return (await this.pool.query<{ id: string; texto: string }>(
      `SELECT c.id,c.texto FROM chunk c JOIN projeto p ON p.id=c.projeto_id
       WHERE c.projeto_id=$1 AND c.id=ANY($2::uuid[]) AND p.status<>'arquivado'
         AND ${knowledgeSourceSql('c')}`, [projectId, ids],
    )).rows;
  }

  async currentRagChunks(userId:string,ids:string[]):Promise<Array<{id:string;texto:string;projeto_id:string;entidade_tipo:string;entidade_id:string;metadados_json:Record<string,unknown>|null}>> {
    if(!ids.length)return [];
    const result=await this.pool.query(`SELECT c.id,c.texto,c.projeto_id,c.entidade_tipo,c.entidade_id,c.metadados_json FROM chunk c JOIN projeto p ON p.id=c.projeto_id
      WHERE c.id=ANY($1::uuid[]) AND p.status<>'arquivado' AND ${projectAccessSql('c.projeto_id','$2')}
      AND ${knowledgeSourceSql('c')}
      AND (c.entidade_tipo<>'analise_repositorio' OR EXISTS (SELECT 1 FROM analise_repositorio r
        WHERE r.id=c.entidade_id AND r.projeto_id=c.projeto_id AND r.status='concluido'
        AND r.aprovado_por IS NOT NULL AND r.aprovado_em IS NOT NULL
        AND r.aprovacao_hash=encode(sha256(convert_to(r.relatorio_markdown,'UTF8')),'hex')))`,[ids,userId]);
    return result.rows;
  }
}
