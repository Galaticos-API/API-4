import { ChatRepository } from "./chat.repository.js";
import type { AssistantClient } from "./chat.service.js";
import type { ChatMessage, ChatSource, ChunkMatch, Conversation } from "./chat.types.js";

export const ANA = "b0000000-0000-4000-8000-000000000001";
export const BRUNO = "b0000000-0000-4000-8000-000000000002";
export const PROJECT_A = "a0000000-0000-4000-8000-000000000001";
export const PROJECT_B = "a0000000-0000-4000-8000-000000000002";

export class FakeChatRepository extends ChatRepository {
  public conversations: Conversation[] = [];
  public messages: ChatMessage[] = [];
  public chunks: Array<ChunkMatch & { projeto_id: string }> = [];
  public searches: Array<{ projetoId: string | null; patterns: string[] }> = [];
  private sequence = 0;

  constructor() {
    super();
  }

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  async listConversations(usuarioId: string): Promise<Conversation[]> {
    return this.conversations.filter((item) => item.usuario_id === usuarioId);
  }

  async projectExists(projetoId: string): Promise<boolean> {
    return projetoId === PROJECT_A || projetoId === PROJECT_B;
  }

  async createConversation(usuarioId: string, projetoId: string | null, titulo: string): Promise<Conversation> {
    const now = new Date().toISOString();
    const created: Conversation = { id: this.id("c"), usuario_id: usuarioId, projeto_id: projetoId, titulo, created_at: now, updated_at: now };
    this.conversations.push(created);
    return created;
  }

  async findOwnedConversation(conversaId: string, usuarioId: string): Promise<Conversation | null> {
    return this.conversations.find((item) => item.id === conversaId && item.usuario_id === usuarioId) ?? null;
  }

  async listMessages(conversaId: string): Promise<ChatMessage[]> {
    return this.messages.filter((item) => item.conversa_id === conversaId);
  }

  async addMessage(conversaId: string, remetente: "user" | "assistant", conteudo: string, fontes: ChatSource[] = []): Promise<void> {
    this.messages.push({ id: this.id("d"), conversa_id: conversaId, remetente, conteudo, fontes_json: fontes, created_at: new Date().toISOString() });
  }

  async searchChunks(projetoId: string | null, patterns: string[], limit: number): Promise<ChunkMatch[]> {
    this.searches.push({ projetoId, patterns });
    if (patterns.length === 0) return [];
    const needles = patterns.map((pattern) => pattern.replaceAll("%", "").toLowerCase());
    return this.chunks
      .filter((chunk) => (projetoId === null || chunk.projeto_id === projetoId) && needles.some((needle) => chunk.texto.toLowerCase().includes(needle)))
      .slice(0, limit);
  }
}

export class FakeAssistant implements AssistantClient {
  public calls: Array<{ pergunta: string; projetoId?: string }> = [];
  public available = true;
  public answer = { resposta: "Resposta do assistente", fontes: [{ id: "s1", titulo: "Decisão 1", tipo: "decisao" }] };

  async ask(pergunta: string, projetoId?: string) {
    this.calls.push({ pergunta, projetoId });
    if (!this.available) throw new Error("indisponível");
    return this.answer;
  }
}
