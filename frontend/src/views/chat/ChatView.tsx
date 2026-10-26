import { ApiError } from "../../api/api_auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_QUESTION_LENGTH,
  askQuestion,
  deleteConversation,
  describeChatError,
  listConversations,
  listMessages,
  type ChatConversation,
  type ChatMessage,
  type ChatOrigin,
} from "../../api/api_chat";
import { listChatProjects } from "../../api/api_chat";
import { ORIGIN_BADGE, SUGGESTED_PROMPTS, formatClock, formatRelative, remainingCharacters } from "../../models/chat";
import { Alert, Badge, Button } from "../common/ui";
import { Markdown } from "../common/Markdown";
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationsState, setConversationsState] = useState<LoadState>("loading");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsState, setProjectsState] = useState<LoadState>('loading');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [messagesState, setMessagesState] = useState<LoadState>("idle");
  const [draft, setDraft] = useState("");
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [sendError, setSendError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const messagesViewport = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const mobileSidebarTrigger = useRef<HTMLButtonElement>(null);
  const mobileSidebarClose = useRef<HTMLButtonElement>(null);
  const mobileSidebarPanel = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const messagesRequest = useRef(0);
  const conversationsRequest = useRef(0);
  const projectsRequest = useRef(0);
  const sendLocks = useRef(new Set<string>());
  const skipReload = useRef<string | null>(null);
  const conversationRevision = useRef(0);
  const selectedConversation = useRef(activeId);
  selectedConversation.current = activeId;
  const sendKey = activeId ?? `draft-${conversationRevision.current}`;
  const sending = pendingKeys.includes(sendKey);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileSidebarClose.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = mobileSidebarPanel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), a[href], textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      mobileSidebarTrigger.current?.focus();
    };
  }, [mobileSidebarOpen]);

  const loadConversations = useCallback(async (selectFirst: boolean) => {
    const request = ++conversationsRequest.current;
    const revision=conversationRevision.current;
    setConversationsState("loading");
    try {
      const items = await listConversations();
      if (!mounted.current || request !== conversationsRequest.current) return;
      setConversations(items);
      setConversationsState("idle");
      if (selectFirst && items.length > 0 && revision===0 && revision===conversationRevision.current) {
        setActiveId((current) => current ?? items[0].id);
        setScopeId((current) => current || items[0].projeto_id || "");
      }
    } catch {
      if (mounted.current && request === conversationsRequest.current) setConversationsState("error");
    }
  }, []);

  const loadProjects = useCallback(async (signal?: AbortSignal) => {
    const request = ++projectsRequest.current;
    setProjectsState('loading');
    try {
      const timeout = AbortSignal.timeout(15000);
      const page = await listChatProjects(signal ? AbortSignal.any([signal, timeout]) : timeout);
      if (!mounted.current || request !== projectsRequest.current) return;
      setProjects(page.map(project => ({ id: project.id, nome: project.nome })));
      setProjectsState('idle');
    } catch {
      if (mounted.current && request === projectsRequest.current) setProjectsState('error');
    }
  }, []);

  useEffect(() => {
    void loadConversations(true);
    const controller = new AbortController();
    void loadProjects(controller.signal);
    return () => controller.abort();
  }, [loadConversations, loadProjects]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const request = ++messagesRequest.current;
    setMessagesState("loading");
    try {
      const items = await listMessages(conversationId);
      if (!mounted.current || request !== messagesRequest.current) return;
      const supersededFailures = new Set(items.flatMap((item, index) => {
        if (item.remetente !== "user" || !item.failed) return [];
        const laterRetryIndex = items.findIndex((candidate, candidateIndex) => candidateIndex > index
          && candidate.remetente === "user" && !candidate.failed && candidate.conteudo === item.conteudo);
        const answered = laterRetryIndex >= 0 && items.slice(laterRetryIndex + 1).some((candidate) => candidate.remetente === "assistant");
        return answered ? [item.id] : [];
      }));
      setMessages(items.filter((item) => !supersededFailures.has(item.id)));
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
    const viewport = messagesViewport.current;
    viewport?.scrollTo?.({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;
  const scopeName = projects.find((project) => project.id === scopeId)?.nome ?? activeConversation?.projeto_nome ?? null;
  const scopeLocked = Boolean(activeId);

  const startNewConversation = () => {
    conversationRevision.current += 1;
    messagesRequest.current += 1;
    setActiveId(null);
    setMessages([]);
    setSendError("");
    setDraft("");
    composer.current?.focus();
  };

  const openConversation = (conversation: ChatConversation) => {
    if (conversation.id === activeId) return;
    conversationRevision.current += 1;
    messagesRequest.current += 1;
    setMessages([]);
    setDraft("");
    setSendError("");
    setActiveId(conversation.id);
    setScopeId(conversation.projeto_id ?? "");
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (deletingId) return;
    const confirmed = window.confirm("Tem certeza que deseja excluir esta conversa? Todas as mensagens serão removidas permanentemente.");
    if (!confirmed) return;

    setDeletingId(conversationId);
    try {
      await deleteConversation(conversationId);
      if (!mounted.current) return;
      setConversations((current) => current.filter((c) => c.id !== conversationId));
      if (activeId === conversationId) {
        startNewConversation();
      }
    } catch (error) {
      if (!mounted.current) return;
      setSendError(describeChatError(error));
    } finally {
      if (mounted.current) setDeletingId(null);
    }
  };

  const send = useCallback(async (text: string, retryId?: string) => {
    const question = text.trim();
    if (!question || sendLocks.current.has(sendKey) || !scopeId || messagesState==='loading') return;
    sendLocks.current.add(sendKey);
    const revision = conversationRevision.current;
    setPendingKeys(current => [...current, sendKey]);
    setSendError("");
    const pendingId = retryId ?? `local-${Date.now()}`;
    setMessages((current) => retryId
      ? current.map((item) => (item.id === retryId ? { ...item, failed: false } : item))
      : [...current, { id: pendingId, remetente: "user", conteudo: question, fontes: [], created_at: new Date().toISOString() }]);
    setDraft(current=>!retryId||current.trim()===question?'':current);
    try {
      const answer = await askQuestion({ pergunta: question, conversaId: activeId, projetoId: activeId ? null : scopeId, mensagemId: retryId });
      if (!mounted.current) return;
      void loadConversations(false);
      if (revision !== conversationRevision.current) {
        if (selectedConversation.current === answer.conversa_id) void loadMessages(answer.conversa_id);
        return;
      }
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, remetente: "assistant", conteudo: answer.resposta, fontes: answer.fontes, created_at: new Date().toISOString(), origem: answer.origem },
      ]);
      if (!activeId) {
        skipReload.current = answer.conversa_id;
        setActiveId(answer.conversa_id);
      }
    } catch (error) {
      if (!mounted.current) return;
      if (revision !== conversationRevision.current) {
        if (activeId && selectedConversation.current === activeId) void loadMessages(activeId);
        return;
      }
      setMessages((current) => current.map((item) => (item.id === pendingId ? { ...item, failed: true } : item)));
      setDraft(current=>current||question);
      if (error instanceof ApiError && error.details && typeof error.details === "object" && "details" in error.details) {
        const detail = error.details.details as { conversa_id?: string };
        if (detail?.conversa_id) { setActiveId(detail.conversa_id); void loadMessages(detail.conversa_id); void loadConversations(false); }
      }
      setSendError(describeChatError(error));
    } finally {
      sendLocks.current.delete(sendKey);
      if (mounted.current) setPendingKeys(current => current.filter(key => key !== sendKey));
    }
  }, [activeId, scopeId, sendKey, loadConversations, loadMessages,messagesState]);

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
  const canSend = Boolean(scopeId) && draft.trim().length > 0 && remaining >= 0 && !sending && messagesState!=='loading';
  const lastMessage = messages[messages.length - 1];
  const failedMessage = lastMessage?.remetente === 'user' && lastMessage.failed ? lastMessage : undefined;

  const editDraft = (value: string) => {
    if (!activeId && conversationRevision.current === 0) conversationRevision.current += 1;
    setDraft(value);
  };

  return (
    <div className="chat-page">
      {mobileSidebarOpen && <button className="chat-sidebar-backdrop" type="button" aria-label="Fechar navegação de conversas" onClick={() => setMobileSidebarOpen(false)} />}
      <div className={`chatx-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <aside ref={mobileSidebarPanel} id="chat-sidebar" className={`chat-sidebar${mobileSidebarOpen ? " mobile-open" : ""}`} aria-label="Conversas" role={mobileSidebarOpen ? "dialog" : undefined} aria-modal={mobileSidebarOpen || undefined} aria-labelledby="chat-sidebar-title">
          <div className="chat-sidebar-heading" id="chat-sidebar-title">
            <span>Conversas</span>
            <button ref={mobileSidebarClose} className="chat-sidebar-close" type="button" aria-label="Fechar conversas" onClick={() => setMobileSidebarOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <Button onClick={startNewConversation}>Nova conversa</Button>

          <div className="ds-field">
            <label className="ds-label" htmlFor="chat-scope">Escopo da consulta</label>
            <select
              id="chat-scope"
              className="ds-input"
              value={scopeId}
              disabled={scopeLocked}
              onChange={(event) => { conversationRevision.current += 1; setMessages([]); setSendError(""); setScopeId(event.target.value); }}
              aria-describedby="chat-scope-help"
            >
              <option value="">Selecione um projeto</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.nome}</option>)}
            </select>
            <span id="chat-scope-help" className="ds-help">
              {scopeLocked ? "O escopo é definido ao iniciar a conversa. Crie uma nova para mudar." : "Escolha o projeto que o assistente deve consultar."}
            </span>
            {projectsState === 'loading' && <span className="ds-help" role="status">Carregando projetos…</span>}
            {projectsState === 'error' && (
              <Alert tone="danger" role="alert">
                Não foi possível carregar os projetos.{' '}
                <Button variant="secondary" size="sm" onClick={() => void loadProjects()}>Recarregar projetos</Button>
              </Alert>
            )}
            {projectsState === 'idle' && projects.length === 0 && <span className="ds-help">Nenhum projeto disponível para consulta.</span>}
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
                <li key={conversation.id} className="chat-conversation-item">
                  <button
                    type="button"
                    className="chat-conversation"
                    aria-current={conversation.id === activeId}
                    onClick={() => { openConversation(conversation); setMobileSidebarOpen(false); }}
                  >
                    <span className="chat-conversation-title">{conversation.titulo}</span>
                    <span className="chat-conversation-meta">
                      {conversation.projeto_nome ?? "Todos os projetos"} · {formatRelative(conversation.updated_at)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="chat-conversation-delete"
                    title={`Excluir conversa "${conversation.titulo}"`}
                    aria-label={`Excluir conversa`}
                    disabled={deletingId === conversation.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteConversation(conversation.id);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <section className="chat-thread" aria-label="Conversa atual">
          <div className="chat-thread-header">
            <button className="chat-sidebar-control chat-sidebar-control--desktop" type="button" aria-label={sidebarCollapsed ? "Expandir navegação de conversas" : "Recolher navegação de conversas"} aria-expanded={!sidebarCollapsed} aria-controls="chat-sidebar" onClick={() => setSidebarCollapsed(value => !value)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
            </button>
            <button ref={mobileSidebarTrigger} className="chat-sidebar-control chat-sidebar-control--mobile" type="button" aria-label="Abrir navegação de conversas" aria-expanded={mobileSidebarOpen} aria-controls="chat-sidebar" onClick={() => setMobileSidebarOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="chat-thread-title" title={activeConversation?.titulo ?? "Nova conversa"}>{activeConversation?.titulo ?? "Nova conversa"}</h2>
            <div className="chat-thread-actions">
              <Badge tone={scopeName ? "brand" : "info"}>{scopeName ?? "Todos os projetos"}</Badge>
              {activeId && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deletingId === activeId}
                  onClick={() => void handleDeleteConversation(activeId)}
                  title="Excluir esta conversa"
                >
                  {deletingId === activeId ? "Excluindo…" : "Excluir conversa"}
                </Button>
              )}
            </div>
          </div>

          <div ref={messagesViewport} className="chat-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mensagens da conversa" tabIndex={0}>
            {messagesState === "loading" && <p className="help" role="status">Carregando mensagens…</p>}
            {messagesState === "error" && activeId && (
              <Alert tone="danger" role="alert">
                Não foi possível carregar as mensagens desta conversa.{" "}
                <Button variant="secondary" size="sm" disabled={sending} onClick={() => void loadMessages(activeId)}>Tentar novamente</Button>
              </Alert>
            )}

            {messagesState === "idle" && messages.length === 0 && (
              <div className="chatx-welcome">
                <h3>Como posso ajudar?</h3>
                <p>Faça uma pergunta sobre {scopeName ? `o projeto ${scopeName}` : "os seus projetos"} ou escolha uma sugestão abaixo.</p>
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} copied={copiedId === message.id} onCopy={() => void copy(message)} />
            ))}

            {sending && <div className="chat-typing" role="status">Consultando o acervo<span aria-hidden="true">…</span></div>}
          </div>

          {(sendError || failedMessage) && (
            <Alert tone="danger" role="alert" title="Não foi possível concluir">
              {sendError || 'A última pergunta não foi concluída. Tente novamente.'}{" "}
              {failedMessage && <Button variant="secondary" size="sm" disabled={sending||messagesState==='loading'} onClick={() => void send(failedMessage.conteudo, failedMessage.id)}>Tentar novamente</Button>}
            </Alert>
          )}

          <div className="chat-prompt-bar" role="group" aria-label="Perguntas sugeridas">
            <span className="chat-prompt-label">Sugestões</span>
            <div className="chat-prompt-list">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="chat-prompt-chip"
                  type="button"
                  aria-label={`Usar pergunta sugerida: ${prompt}`}
                  disabled={sending || messagesState === "loading"}
                  onClick={() => { editDraft(prompt); composer.current?.focus(); }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

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
              onChange={(event) => editDraft(event.target.value)}
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
              <li key={source.id}><Badge>{source.tipo}</Badge> {source.url?<a href={source.url}>{source.titulo}</a>:source.titulo}{source.projeto_nome?` · ${source.projeto_nome}`:''}</li>
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
