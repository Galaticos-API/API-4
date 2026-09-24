import React, { useState, useEffect, useRef } from "react";
import { apiRequest } from "../../api/api_auth";
import "../../assets/styles/garakis-prototype.css";

interface Message {
  id: string;
  remetente: "user" | "assistant";
  conteudo: string;
  fontes_json?: Array<{ id: string; titulo: string; tipo: string }>;
  created_at?: string;
}

interface Conversation {
  id: string;
  titulo: string;
  projeto_id?: string;
  projeto_nome?: string;
  updated_at: string;
}

interface ProjectOption {
  id: string;
  nome: string;
}

export const ChatView: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carrega a lista de projetos do backend
  useEffect(() => {
    apiRequest("/projects")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.items)) {
          setProjects(data.items.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome })));
        }
      })
      .catch(() => {});
  }, []);

  // Carrega a lista de conversas do banco de dados
  const loadConversations = async () => {
    try {
      const res = await apiRequest("/chat/conversations");
      const data = await res.json();
      const list: Conversation[] = data.items || [];
      setConversations(list);
      if (list.length > 0 && !activeConversationId) {
        setActiveConversationId(list[0].id);
      }
    } catch {}
  };

  useEffect(() => {
    void loadConversations();
  }, []);

  // Carrega as mensagens da conversa selecionada
  useEffect(() => {
    if (!activeConversationId) return;

    apiRequest(`/chat/conversations/${activeConversationId}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data.items || []))
      .catch(() => setMessages([]));
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");
    setLoading(true);

    // Adiciona temporariamente a mensagem do usuário na tela
    const tempUserMsg: Message = { id: `temp-${Date.now()}`, remetente: "user", conteudo: userText };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await apiRequest("/chat/query", {
        method: "POST",
        body: JSON.stringify({
          conversa_id: activeConversationId || undefined,
          projeto_id: selectedProjectId || undefined,
          pergunta: userText,
        }),
      });

      const data = await res.json();

      if (!activeConversationId && data.conversa_id) {
        setActiveConversationId(data.conversa_id);
        void loadConversations();
      }

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        remetente: "assistant",
        conteudo: data.resposta || "Informação não encontrada no acervo do projeto.",
        fontes_json: data.fontes,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        remetente: "assistant",
        conteudo: "Não foi possível comunicar com o assistente. Verifique a conexão com o servidor.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewConversation = async () => {
    try {
      const res = await apiRequest("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({
          titulo: "Nova conversa com Sinapse",
          projeto_id: selectedProjectId || undefined,
        }),
      });
      const newConv = await res.json();
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages([]);
    } catch {}
  };

  return (
    <div className="page-container" style={{ paddingBottom: "20px" }}>
      <div className="head-section">
        <div>
          <div className="eyebrow">COPILOTO INTELIGENTE</div>
          <h1>Assistente Sinapse (RAG Local)</h1>
          <p className="muted">
            Tire dúvidas sobre decisões do projeto, arquitetura e requisitos baseando-se estritamente no acervo do projeto.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "20px", marginTop: "16px", minHeight: "600px" }}>
        {/* Sidebar de Conversas */}
        <aside className="card-garakis" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
          <button className="btn-garakis primary" onClick={handleNewConversation} style={{ width: "100%" }}>
            + Nova Conversa
          </button>

          <div className="field-garakis" style={{ margin: 0 }}>
            <label htmlFor="chat-project-filter" style={{ fontSize: "0.8rem" }}>Projeto Ativo</label>
            <select
              id="chat-project-filter"
              className="input-garakis"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ fontSize: "0.85rem" }}
            >
              <option value="">Todos os Projetos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: 0 }} />

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`btn-garakis ghost ${activeConversationId === conv.id ? "active" : ""}`}
                style={{
                  textAlign: "left",
                  justifyContent: "flex-start",
                  padding: "10px 12px",
                  background: activeConversationId === conv.id ? "rgba(249, 115, 22, 0.15)" : "transparent",
                  borderColor: activeConversationId === conv.id ? "var(--orange)" : "transparent",
                  color: "#fff",
                }}
              >
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", fontSize: "0.88rem" }}>
                  {conv.titulo}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Área Central da Conversa */}
        <main className="card-garakis" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "20px" }}>
          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "8px", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "480px" }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", margin: "auto", color: "var(--muted)", maxWidth: "400px" }}>
                <h3>Pergunte ao Sinapse</h3>
                <p style={{ fontSize: "0.9rem" }}>
                  Tire dúvidas sobre requisitos, regras de negócio ou decisões de arquitetura vinculadas aos projetos.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.remetente === "user" ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    background: msg.remetente === "user" ? "var(--orange)" : "rgba(255, 255, 255, 0.05)",
                    border: msg.remetente === "user" ? "none" : "1px solid var(--line)",
                    borderRadius: "12px",
                    padding: "14px 18px",
                    color: "#fff",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "4px", color: msg.remetente === "user" ? "#fff" : "var(--orange)" }}>
                    {msg.remetente === "user" ? "Você" : "Assistente Sinapse"}
                  </div>
                  <div style={{ fontSize: "0.95rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {msg.conteudo}
                  </div>

                  {msg.fontes_json && msg.fontes_json.length > 0 && (
                    <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: "0.78rem" }}>
                      Fontes citadas: {msg.fontes_json.map((f) => f.titulo || f.id).join(", ")}
                    </div>
                  )}
                </div>
              ))
            )}
            {loading && (
              <div style={{ alignSelf: "flex-start", background: "rgba(255, 255, 255, 0.05)", padding: "12px 18px", borderRadius: "12px", color: "var(--muted)", fontSize: "0.9rem" }}>
                Sinapse está consultando a base de conhecimento RAG...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Campo de Entrada (Composer Box) */}
          <div className="composer-box" style={{ marginTop: "16px" }}>
            <textarea
              className="input-garakis"
              rows={2}
              placeholder="Digite sua dúvida sobre o projeto... (pressione Enter para enviar)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              disabled={loading}
              style={{ resize: "none" }}
            />
            <button className="btn-garakis primary" onClick={() => void handleSendMessage()} disabled={loading || !input.trim()}>
              Enviar
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};
