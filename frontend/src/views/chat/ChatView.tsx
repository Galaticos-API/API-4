import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_QUESTION_LENGTH,
  askQuestion,
  describeChatError,
  listConversations,
  listMessages,
  type ChatConversation,
  type ChatMessage,
  type ChatOrigin,
} from "../../api/api_chat";
import { listProjects } from "../../api/api_projects";
import { ORIGIN_BADGE, SUGGESTED_PROMPTS, formatClock, formatRelative, remainingCharacters } from "../../models/chat";
import { Alert, Badge, Button } from "../common/ui";
import { Markdown } from "../common/Markdown";
import "../../assets/styles/garakis-prototype.css";
import "../../assets/styles/chat.css";

interface ProjectOption {
  id: string;
  nome: string;
}

interface ThreadMessage extends ChatMessage {
  failed?: boolean;
}

type LoadState = "idle" | "loading" | "error";

export function ChatView() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationsState, setConversationsState] = useState<LoadState>("loading");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [messagesState, setMessagesState] = useState<LoadState>("idle");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const messagesRequest = useRef(0);
  const sendLock = useRef(false);
  const skipReload = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadConversations = useCallback(async (selectFirst: boolean) => {
    setConversationsState("loading");
    try {
      const items = await listConversations();
      if (!mounted.current) return;
      setConversations(items);
      setConversationsState("idle");
      if (selectFirst && items.length > 0) {
        setActiveId((current) => current ?? items[0].id);
        setScopeId((current) => current || items[0].projeto_id || "");
      }
    } catch {
      if (mounted.current) setConversationsState("error");
    }
  }, []);

  useEffect(() => {
    void loadConversations(true);
    const controller = new AbortController();
    void listProjects(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
      .then((page) => { if (mounted.current) setProjects(page.projects.map((project) => ({ id: project.id, nome: project.nome }))); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [loadConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const request = ++messagesRequest.current;
    setMessagesState("loading");
    try {
      const items = await listMessages(conversationId);
      if (!mounted.current || request !== messagesRequest.current) return;
      setMessages(items);
      setMessagesState("idle");
    } catch {
      if (!mounted.current || request !== messagesRequest.current) return;
      setMessages([]);
      setMessagesState("error");
    }
  }, []);

  useEffect(() => {
    if (!activeId) {
      messagesRequest.current += 1;
      setMessagesState("idle");
      return;
    }
    if (skipReload.current === activeId) {
      skipReload.current = null;
      return;
    }
    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;
  const scopeName = projects.find((project) => project.id === scopeId)?.nome ?? activeConversation?.projeto_nome ?? null;
  const scopeLocked = Boolean(activeId);

  const startNewConversation = () => {
    setActiveId(null);
    setMessages([]);
    setSendError("");
    setDraft("");
    composer.current?.focus();
  };

  const openConversation = (conversation: ChatConversation) => {
    setSendError("");
    setActiveId(conversation.id);
    setScopeId(conversation.projeto_id ?? "");
  };

  const send = useCallback(async (text: string, retryId?: string) => {
    const question = text.trim();
    if (!question || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    setSendError("");
    const pendingId = retryId ?? `local-${Date.now()}`;
    setMessages((current) => retryId
      ? current.map((item) => (item.id === retryId ? { ...item, failed: false } : item))
      : [...current, { id: pendingId, remetente: "user", conteudo: question, fontes: [], created_at: new Date().toISOString() }]);
    if (!retryId) setDraft("");
    try {
      const answer = await askQuestion({ pergunta: question, conversaId: activeId, projetoId: activeId ? null : scopeId });
      if (!mounted.current) return;
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, remetente: "assistant", conteudo: answer.resposta, fontes: answer.fontes, created_at: new Date().toISOString(), origem: answer.origem },
      ]);
      if (!activeId) {
        skipReload.current = answer.conversa_id;
        setActiveId(answer.conversa_id);
      }
      void loadConversations(false);
    } catch (error) {
      if (!mounted.current) return;
      setMessages((current) => current.map((item) => (item.id === pendingId ? { ...item, failed: true } : item)));
      setSendError(describeChatError(error));
    } finally {
      sendLock.current = false;
      if (mounted.current) setSending(false);
    }
  }, [activeId, scopeId, loadConversations]);

  const copy = async (message: ThreadMessage) => {
    try {
      await navigator.clipboard.writeText(message.conteudo);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  const remaining = remainingCharacters(draft, MAX_QUESTION_LENGTH);
  const canSend = draft.trim().length > 0 && remaining >= 0 && !sending;
  const failedMessage = messages.find((item) => item.failed);

  return (
    <div className="page-container chat-page">
      <header className="head-section">
        <div>
          <div className="eyebrow">COPILOTO DO PROJETO</div>
          <h1>Assistente Sinapse</h1>
          <p className="muted">Pergunte sobre requisitos, decisões e documentos. As respostas citam as fontes do acervo e devem ser conferidas por uma pessoa.</p>
        </div>
      </header>

      <div className="chatx-layout">
        <aside className="card-garakis chat-sidebar" aria-label="Conversas">
          <Button onClick={startNewConversation}>Nova conversa</Button>

          <div className="ds-field">
            <label className="ds-label" htmlFor="chat-scope">Escopo da consulta</label>
            <select
              id="chat-scope"
              className="ds-input"
              value={scopeId}
              disabled={scopeLocked}
              onChange={(event) => setScopeId(event.target.value)}
              aria-describedby="chat-scope-help"
            >
              <option value="">Todos os projetos</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.nome}</option>)}
            </select>
            <span id="chat-scope-help" className="ds-help">
              {scopeLocked ? "O escopo é definido ao iniciar a conversa. Crie uma nova para mudar." : "Escolha o projeto que o assistente deve consultar."}
            </span>
          </div>

          <nav className="chat-conversations" aria-label="Histórico de conversas">
            {conversationsState === "loading" && <p className="help" role="status">Carregando conversas…</p>}
            {conversationsState === "error" && (
              <Alert tone="danger" role="alert">
                Não foi possível carregar as conversas.{" "}
                <Button variant="secondary" size="sm" onClick={() => void loadConversations(activeId === null)}>Tentar novamente</Button>
              </Alert>
            )}
            {conversationsState === "idle" && conversations.length === 0 && <p className="help">Nenhuma conversa ainda. Faça sua primeira pergunta.</p>}
            <ul>
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className="chat-conversation"
                    aria-current={conversation.id === activeId}
                    onClick={() => openConversation(conversation)}
                  >
                    <span className="chat-conversation-title">{conversation.titulo}</span>
                    <span className="chat-conversation-meta">
                      {conversation.projeto_nome ?? "Todos os projetos"} · {formatRelative(conversation.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <section className="card-garakis chat-thread" aria-label="Conversa atual">
          <div className="chat-thread-header">
            <h2>{activeConversation?.titulo ?? "Nova conversa"}</h2>
            <Badge tone={scopeName ? "brand" : "info"}>{scopeName ?? "Todos os projetos"}</Badge>
          </div>

          <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mensagens da conversa" tabIndex={0}>
            {messagesState === "loading" && <p className="help" role="status">Carregando mensagens…</p>}
            {messagesState === "error" && activeId && (
              <Alert tone="danger" role="alert">
                Não foi possível carregar as mensagens desta conversa.{" "}
                <Button variant="secondary" size="sm" onClick={() => void loadMessages(activeId)}>Tentar novamente</Button>
              </Alert>
            )}

            {messagesState === "idle" && messages.length === 0 && (
              <div className="chatx-welcome">
                <h3>Como posso ajudar?</h3>
                <p>Faça uma pergunta sobre {scopeName ? `o projeto ${scopeName}` : "os seus projetos"} ou comece por uma sugestão.</p>
                <div className="chat-suggestions">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => { setDraft(prompt); composer.current?.focus(); }}>{prompt}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} copied={copiedId === message.id} onCopy={() => void copy(message)} />
            ))}

            {sending && <div className="chat-typing" role="status">Consultando o acervo<span aria-hidden="true">…</span></div>}
            <div ref={bottom} />
          </div>

          {sendError && (
            <Alert tone="danger" role="alert" title="Não foi possível concluir">
              {sendError}{" "}
              {failedMessage && <Button variant="secondary" size="sm" disabled={sending} onClick={() => void send(failedMessage.conteudo, failedMessage.id)}>Tentar novamente</Button>}
            </Alert>
          )}

          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); if (canSend) void send(draft); }}>
            <label className="sr-only" htmlFor="chat-question">Sua pergunta</label>
            <textarea
              id="chat-question"
              ref={composer}
              className="ds-textarea"
              rows={3}
              placeholder="Escreva sua pergunta… (Enter envia, Shift+Enter quebra a linha)"
              value={draft}
              disabled={sending}
              aria-describedby="chat-composer-help"
              aria-invalid={remaining < 0}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (canSend) void send(draft);
                }
              }}
            />
            <div className="chat-composer-footer">
              <span id="chat-composer-help" className={`ds-help${remaining < 0 ? " ds-help--error" : ""}`}>
                {remaining < 0 ? `Reduza ${-remaining} caractere(s).` : `${draft.length}/${MAX_QUESTION_LENGTH} · Respostas de IA podem conter erros; confira as fontes.`}
              </span>
              <Button type="submit" disabled={!canSend}>{sending ? "Enviando…" : "Enviar"}</Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function MessageBubble({ message, copied, onCopy }: { message: ThreadMessage; copied: boolean; onCopy: () => void }) {
  const isUser = message.remetente === "user";
  const originBadge = message.origem ? ORIGIN_BADGE[message.origem as ChatOrigin] : null;
  return (
    <article className={`chat-message chat-message--${isUser ? "user" : "assistant"}${message.failed ? " is-failed" : ""}`} aria-label={isUser ? "Você" : "Assistente Sinapse"}>
      <header>
        <b>{isUser ? "Você" : "Assistente Sinapse"}</b>
        <time dateTime={message.created_at ?? undefined}>{formatClock(message.created_at)}</time>
        {originBadge && <Badge tone="warning">{originBadge}</Badge>}
      </header>
      {message.failed && <p className="chat-message-failed" role="note">Não enviada</p>}
      {isUser ? <p className="chat-message-text">{message.conteudo}</p> : <Markdown source={message.conteudo} className="chat-message-body" />}
      {message.fontes.length > 0 && (
        <details className="chat-sources">
          <summary>Fontes citadas ({message.fontes.length})</summary>
          <ul>
            {message.fontes.map((source) => (
              <li key={source.id}><Badge>{source.tipo}</Badge> {source.titulo}</li>
            ))}
          </ul>
        </details>
      )}
      {!isUser && (
        <div className="chat-message-actions">
          <Button variant="ghost" size="sm" onClick={onCopy}>{copied ? "Copiado" : "Copiar resposta"}</Button>
        </div>
      )}
    </article>
  );
}
