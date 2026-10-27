import { ApiError } from "../../api/api_auth";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_QUESTION_LENGTH,
  askQuestion,
  deleteConversation,
  deleteMessage,
  describeChatError,
  listConversations,
  listMessages,
  renameConversation,
  type ChatProgressStage,
  type ChatConversation,
  type ChatMessage,
  type ChatOrigin,
} from "../../api/api_chat";
import { listChatProjects } from "../../api/api_chat";
import { ArrowUp, Check, CircleAlert, Copy, LoaderCircle, Mic, MicOff, Sparkles, Trash2 } from "lucide-react";
import { ORIGIN_BADGE, SUGGESTED_PROMPTS, formatClockWithSeconds, formatRelative, remainingCharacters } from "../../models/chat";
import { Alert, Badge, Button } from "../common/ui";
import { Markdown } from "../common/Markdown";
import { MessageContextMenu, type MessageContextAction } from "./MessageContextMenu";
import "../../assets/styles/chat.css";

interface ProjectOption {
  id: string;
  nome: string;
}

interface ThreadMessage extends ChatMessage {
  failed?: boolean;
}

interface SpeechResultLike {
  isFinal: boolean;
  0?: { transcript: string };
}

interface SpeechResultEventLike {
  results: ArrayLike<SpeechResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

type LoadState = "idle" | "loading" | "error";

const THINKING_MESSAGES: Record<ChatProgressStage, string> = {
  searching: "Buscando evidências no acervo do projeto",
  synthesizing: "Preparando resposta com os trechos encontrados",
  validating: "Validando evidências e fontes",
};

function ThinkingIndicator({ stage }: { stage: ChatProgressStage }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const message = THINKING_MESSAGES[stage];

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="chat-typing" role="status" aria-label="O assistente está preparando uma resposta">
      <span className="chat-typing-dots" aria-hidden="true">
        <i /><i /><i />
      </span>
      <span key={stage} className="chat-typing-message" aria-live="polite" aria-atomic="true">
        {message}
      </span>
      {elapsedSeconds >= 5 && <span className="chat-typing-elapsed" aria-hidden="true">· {elapsedSeconds}s</span>}
    </div>
  );
}

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
  const [progressByKey, setProgressByKey] = useState<Partial<Record<string, ChatProgressStage>>>({});
  const [sendError, setSendError] = useState("");
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceError, setVoiceError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteConversationId, setConfirmDeleteConversationId] = useState<string | null>(null);
  const [confirmDeleteConversationSource, setConfirmDeleteConversationSource] = useState<"sidebar" | "header" | null>(null);
  const [conversationCopyStatus, setConversationCopyStatus] = useState("");
  const [renameConversationId, setRenameConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [confirmDeleteMessageId, setConfirmDeleteMessageId] = useState<string | null>(null);
  const messagesViewport = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const focusComposerAfterSend = useRef<number | null>(null);
  const speechRecognition = useRef<SpeechRecognitionLike | null>(null);
  const speechBaseDraft = useRef("");
  const mobileSidebarTrigger = useRef<HTMLButtonElement>(null);
  const mobileSidebarClose = useRef<HTMLButtonElement>(null);
  const mobileSidebarPanel = useRef<HTMLElement>(null);
  const conversationActionTriggers = useRef(new Map<string, HTMLButtonElement>());
  const renameDialogRef = useRef<HTMLDivElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const renameReturnFocus = useRef<HTMLElement | null>(null);
  const renamingRef = useRef(false);
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
    return () => {
      mounted.current = false;
      if (speechRecognition.current) {
        speechRecognition.current.onresult = null;
        speechRecognition.current.onerror = null;
        speechRecognition.current.onend = null;
        try { speechRecognition.current.abort(); } catch { /* Best effort during unmount. */ }
        speechRecognition.current = null;
      }
    };
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

  useEffect(() => {
    if (!renameConversationId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => renameInput.current?.focus());
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!renamingRef.current) setRenameConversationId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = renameDialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeyDown, true);
      const target = renameReturnFocus.current;
      if (target?.isConnected) requestAnimationFrame(() => target.focus());
    };
  }, [renameConversationId]);

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

  useEffect(() => {
    if (sending || focusComposerAfterSend.current === null) return;
    const focusRevision = focusComposerAfterSend.current;
    focusComposerAfterSend.current = null;
    if (focusRevision === conversationRevision.current) composer.current?.focus({ preventScroll: true });
  }, [sending, sendKey]);

  useEffect(() => {
    const input = composer.current;
    if (!input) return;
    input.style.height = "auto";
    const maxHeight = 180;
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;
  const scopeName = projects.find((project) => project.id === scopeId)?.nome ?? activeConversation?.projeto_nome ?? null;
  const scopeLocked = Boolean(activeId);

  const startNewConversation = () => {
    cancelVoiceCapture();
    focusComposerAfterSend.current = null;
    conversationRevision.current += 1;
    messagesRequest.current += 1;
    setActiveId(null);
    setMessages([]);
    setSendError("");
    setConfirmDeleteMessageId(null);
    setConfirmDeleteConversationId(null);
    setConfirmDeleteConversationSource(null);
    setDraft("");
    composer.current?.focus();
  };

  const openConversation = (conversation: ChatConversation) => {
    if (conversation.id === activeId) return;
    cancelVoiceCapture();
    focusComposerAfterSend.current = null;
    conversationRevision.current += 1;
    messagesRequest.current += 1;
    setMessages([]);
    setDraft("");
    setSendError("");
    setConfirmDeleteMessageId(null);
    setConfirmDeleteConversationId(null);
    setConfirmDeleteConversationSource(null);
    setActiveId(conversation.id);
    setScopeId(conversation.projeto_id ?? "");
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (deletingId) return;
    setDeletingId(conversationId);
    setSendError("");
    try {
      await deleteConversation(conversationId);
      if (!mounted.current) return;
      setConversations((current) => current.filter((c) => c.id !== conversationId));
      setConfirmDeleteConversationId(null);
      setConfirmDeleteConversationSource(null);
      if (activeId === conversationId) {
        startNewConversation();
      } else {
        window.setTimeout(() => {
          const remainingConversation = conversations.find((item) => item.id !== conversationId);
          if (remainingConversation) conversationActionTriggers.current.get(`sidebar:${remainingConversation.id}`)?.focus();
          else document.querySelector<HTMLButtonElement>(".chat-new-conversation")?.focus();
        }, 0);
      }
    } catch (error) {
      if (!mounted.current) return;
      setSendError(describeChatError(error));
    } finally {
      if (mounted.current) setDeletingId(null);
    }
  };

  const copyConversationTitle = async (conversation: ChatConversation) => {
    try {
      await navigator.clipboard.writeText(conversation.titulo);
      setConversationCopyStatus(`Título da conversa “${conversation.titulo}” copiado.`);
    } catch {
      setConversationCopyStatus("Não foi possível copiar o título da conversa.");
    }
    window.setTimeout(() => setConversationCopyStatus(""), 2500);
  };

  const requestRenameConversation = (conversation: ChatConversation, source: "sidebar" | "header") => {
    if (renaming) return;
    renameReturnFocus.current = conversationActionTriggers.current.get(`${source}:${conversation.id}`) ?? null;
    setRenameDraft(conversation.titulo);
    setRenameError("");
    setRenameConversationId(conversation.id);
  };

  const saveConversationRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renameConversationId || renamingRef.current) return;
    const titulo = renameDraft.trim();
    if (!titulo) {
      setRenameError("O título não pode ficar vazio.");
      renameInput.current?.focus();
      return;
    }
    if ([...titulo].length > 120) {
      setRenameError("Use no máximo 120 caracteres.");
      renameInput.current?.focus();
      return;
    }
    const previousTitle = conversations.find((item) => item.id === renameConversationId)?.titulo;
    if (titulo === previousTitle) {
      setRenameConversationId(null);
      return;
    }

    renamingRef.current = true;
    setRenaming(true);
    setRenameError("");
    try {
      const updated = await renameConversation(renameConversationId, titulo);
      if (!mounted.current) return;
      setConversations((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setConversationCopyStatus(`Conversa renomeada para “${updated.titulo}”.`);
      window.setTimeout(() => setConversationCopyStatus(""), 2500);
      setRenameConversationId(null);
    } catch (error) {
      if (mounted.current) setRenameError(describeChatError(error));
    } finally {
      renamingRef.current = false;
      if (mounted.current) setRenaming(false);
    }
  };

  const requestDeleteConversation = (conversationId: string, source: "sidebar" | "header" = "sidebar") => {
    if (!deletingId) {
      setConfirmDeleteConversationId(conversationId);
      setConfirmDeleteConversationSource(source);
    }
  };

  const restoreConversationActionFocus = (conversationId: string, source: "sidebar" | "header" = "sidebar") => {
    setConfirmDeleteConversationId(null);
    setConfirmDeleteConversationSource(null);
    requestAnimationFrame(() => conversationActionTriggers.current.get(`${source}:${conversationId}`)?.focus());
  };

  const handleDeleteMessage = async (message: ThreadMessage) => {
    const conversationId = activeId;
    if (!conversationId || sending || deletingMessageId) return;
    setDeletingMessageId(message.id);
    setSendError("");
    try {
      await deleteMessage(conversationId, message.id);
      if (!mounted.current || selectedConversation.current !== conversationId) return;
      setMessages(current => current.filter(item => item.id !== message.id));
      setConfirmDeleteMessageId(null);
      setCopiedId(current => current === message.id ? null : current);
      setCopyFailedId(current => current === message.id ? null : current);
      void loadConversations(false);
    } catch (error) {
      if (mounted.current && selectedConversation.current === conversationId) setSendError(describeChatError(error));
    } finally {
      if (mounted.current) setDeletingMessageId(null);
    }
  };

  const requestDeleteMessage = (message: ThreadMessage) => {
    if (!sending && !deletingMessageId) setConfirmDeleteMessageId(message.id);
  };

  const cancelVoiceCapture = useCallback((message = "") => {
    const recognition = speechRecognition.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* Best effort when replacing dictated text. */ }
      speechRecognition.current = null;
    }
    setVoiceRecording(false);
    setVoiceError(false);
    setVoiceMessage(message);
  }, []);

  const send = useCallback(async (text: string, retryId?: string) => {
    const question = text.trim();
    if (!question || sendLocks.current.has(sendKey) || !scopeId || messagesState==='loading') return;
    sendLocks.current.add(sendKey);
    const revision = conversationRevision.current;
    if (document.activeElement === composer.current || document.activeElement === submitButton.current) {
      focusComposerAfterSend.current = revision;
    }
    if (speechRecognition.current) cancelVoiceCapture();
    setPendingKeys(current => [...current, sendKey]);
    setProgressByKey(current => ({ ...current, [sendKey]: "searching" }));
    setSendError("");
    const pendingId = retryId ?? `local-${Date.now()}`;
    setMessages((current) => retryId
      ? current.map((item) => (item.id === retryId ? { ...item, failed: false } : item))
      : [...current, { id: pendingId, remetente: "user", conteudo: question, fontes: [], created_at: new Date().toISOString() }]);
    setDraft(current=>!retryId||current.trim()===question?'':current);
    try {
      const answer = await askQuestion({ pergunta: question, conversaId: activeId, projetoId: activeId ? null : scopeId, mensagemId: retryId }, undefined, (stage) => {
        if (mounted.current) setProgressByKey(current => ({ ...current, [sendKey]: stage }));
      });
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
      if (mounted.current) {
        setPendingKeys(current => current.filter(key => key !== sendKey));
        setProgressByKey(current => { const next = { ...current }; delete next[sendKey]; return next; });
      }
    }
  }, [activeId, scopeId, sendKey, loadConversations, loadMessages, messagesState, cancelVoiceCapture]);

  const copy = async (message: ThreadMessage) => {
    try {
      await navigator.clipboard.writeText(message.conteudo);
      setCopiedId(message.id);
      setCopyFailedId(null);
      window.setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 2000);
    } catch {
      setCopiedId(null);
      setCopyFailedId(message.id);
      window.setTimeout(() => setCopyFailedId((current) => (current === message.id ? null : current)), 3000);
    }
  };

  const remaining = remainingCharacters(draft, MAX_QUESTION_LENGTH);
  const canSend = Boolean(scopeId) && draft.trim().length > 0 && remaining >= 0 && !sending && messagesState!=='loading';
  const speechSupported = typeof window !== "undefined" && Boolean((window as SpeechRecognitionWindow).SpeechRecognition ?? (window as SpeechRecognitionWindow).webkitSpeechRecognition);
  const lastMessage = messages[messages.length - 1];
  const failedMessage = lastMessage?.remetente === 'user' && lastMessage.failed ? lastMessage : undefined;

  const editDraft = (value: string) => {
    if (!activeId && conversationRevision.current === 0) conversationRevision.current += 1;
    setDraft(value);
  };

  const handleDraftInput = (value: string) => {
    if (speechRecognition.current) cancelVoiceCapture();
    setVoiceMessage("");
    editDraft(value);
  };

  const toggleVoiceInput = () => {
    if (speechRecognition.current) {
      setVoiceMessage("Concluindo a transcrição…");
      try {
        speechRecognition.current.stop();
      } catch {
        speechRecognition.current = null;
        setVoiceRecording(false);
        setVoiceError(true);
        setVoiceMessage("Não foi possível concluir a transcrição. Tente novamente.");
      }
      return;
    }

    const browser = window as SpeechRecognitionWindow;
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError(false);
      setVoiceMessage("Ditado por voz indisponível neste navegador.");
      return;
    }

    try {
      const recognition = new Recognition();
      speechBaseDraft.current = draft.trim();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;
      setVoiceError(false);
      recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let index = 0; index < event.results.length; index++) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript.trim();
          if (!transcript) continue;
          if (result.isFinal) finalTranscript += `${finalTranscript ? " " : ""}${transcript}`;
          else interimTranscript += `${interimTranscript ? " " : ""}${transcript}`;
        }
        editDraft([speechBaseDraft.current, finalTranscript, interimTranscript].filter(Boolean).join(" "));
      };
      recognition.onerror = (event) => {
        recognition.onresult = null;
        recognition.onend = null;
        if (speechRecognition.current === recognition) speechRecognition.current = null;
        setVoiceRecording(false);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setVoiceError(true);
          setVoiceMessage("Permita o acesso ao microfone nas configurações do navegador para ditar.");
        } else if (event.error === "no-speech") {
          setVoiceError(false);
          setVoiceMessage("Não detectei fala. Toque no microfone para tentar novamente.");
        } else if (event.error === "audio-capture") {
          setVoiceError(true);
          setVoiceMessage("Não foi possível acessar o microfone. Confira se ele está conectado e permitido para localhost:5173.");
        } else if (event.error === "network") {
          setVoiceError(true);
          setVoiceMessage("O navegador não conseguiu acessar o serviço de transcrição. Verifique a conexão e os bloqueios de privacidade; tente novamente ou use Chrome/Edge.");
        } else if (event.error === "language-not-supported") {
          setVoiceError(true);
          setVoiceMessage("O navegador não oferece transcrição em português neste dispositivo.");
        } else {
          setVoiceError(true);
          setVoiceMessage("Não foi possível transcrever a fala. Tente novamente.");
        }
      };
      recognition.onend = () => {
        if (speechRecognition.current !== recognition) return;
        setVoiceRecording(false);
        setVoiceMessage((current) => current.startsWith("Ouvindo") || current.startsWith("Concluindo") ? "" : current);
        speechRecognition.current = null;
      };
      speechRecognition.current = recognition;
      recognition.start();
      setVoiceMessage("Ouvindo… fale com naturalidade. Toque no microfone para concluir.");
      setVoiceRecording(true);
    } catch {
      speechRecognition.current = null;
      setVoiceRecording(false);
      setVoiceError(true);
      setVoiceMessage("Não foi possível iniciar o microfone. Verifique a permissão do navegador.");
    }
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
          <Button className="chat-new-conversation" onClick={startNewConversation}>Nova conversa</Button>

          <div className="ds-field">
            <label className="ds-label" htmlFor="chat-scope">Escopo da consulta</label>
            <select
              id="chat-scope"
              className="ds-input"
              value={scopeId}
              disabled={scopeLocked}
              onChange={(event) => { cancelVoiceCapture(); conversationRevision.current += 1; setMessages([]); setSendError(""); setScopeId(event.target.value); }}
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
                  <MessageContextMenu
                    ariaLabel={`Ações da conversa ${conversation.titulo}`}
                    triggerLabel={`Ações da conversa: ${conversation.titulo}`}
                    wrapperClassName="chat-conversation-context-wrapper"
                    allowContextMenuOnButtons
                    onTriggerRef={(node) => node ? conversationActionTriggers.current.set(`sidebar:${conversation.id}`, node) : conversationActionTriggers.current.delete(`sidebar:${conversation.id}`)}
                    actions={[
                      { id: "rename", label: "Renomear conversa", onSelect: () => requestRenameConversation(conversation, "sidebar"), disabled: deletingId !== null || renaming },
                      { id: "copy-title", label: "Copiar título", onSelect: () => void copyConversationTitle(conversation) },
                      { id: "delete", label: "Excluir conversa", onSelect: () => requestDeleteConversation(conversation.id, "sidebar"), disabled: deletingId !== null, destructive: true },
                    ]}
                  >
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
                  </MessageContextMenu>
                  {confirmDeleteConversationId === conversation.id && confirmDeleteConversationSource === "sidebar" && (
                    <div className="chat-conversation-confirm" role="group" aria-label={`Confirmar exclusão de ${conversation.titulo}`} onKeyDown={(event) => { if (event.key === "Escape") restoreConversationActionFocus(conversation.id, "sidebar"); }}>
                      <span>Excluir “{conversation.titulo}” e todas as mensagens desta conversa permanentemente?</span>
                      <div className="chat-conversation-confirm-actions">
                        <Button variant="ghost" size="sm" autoFocus ref={(node) => { if (node) requestAnimationFrame(() => node.focus()); }} disabled={deletingId === conversation.id} onClick={() => restoreConversationActionFocus(conversation.id, "sidebar")}>Cancelar</Button>
                        <Button variant="danger" size="sm" disabled={deletingId === conversation.id} onClick={() => void handleDeleteConversation(conversation.id)}>{deletingId === conversation.id ? "Excluindo…" : "Excluir"}</Button>
                      </div>
                    </div>
                  )}
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
            {activeConversation ? (
              <MessageContextMenu
                ariaLabel={`Ações da conversa ${activeConversation.titulo}`}
                triggerLabel={`Ações da conversa: ${activeConversation.titulo}`}
                wrapperClassName="chat-conversation-title-context"
                allowContextMenuOnButtons
                onTriggerRef={(node) => node ? conversationActionTriggers.current.set(`header:${activeConversation.id}`, node) : conversationActionTriggers.current.delete(`header:${activeConversation.id}`)}
                actions={[
                  { id: "rename", label: "Renomear conversa", onSelect: () => requestRenameConversation(activeConversation, "header"), disabled: deletingId !== null || renaming },
                  { id: "copy-title", label: "Copiar título", onSelect: () => void copyConversationTitle(activeConversation) },
                  { id: "delete", label: "Excluir conversa", onSelect: () => requestDeleteConversation(activeConversation.id, "header"), disabled: deletingId !== null, destructive: true },
                ]}
              >
                <h2 className="chat-thread-title" title={activeConversation.titulo}>{activeConversation.titulo}</h2>
              </MessageContextMenu>
            ) : <h2 className="chat-thread-title" title="Nova conversa">Nova conversa</h2>}
            <div className="chat-thread-actions">
              <Badge tone={scopeName ? "brand" : "info"}>{scopeName ?? "Todos os projetos"}</Badge>
              {activeId && (
                <Button
                  variant="danger"
                  size="sm"
                  className="chat-conversation-delete-trigger"
                  disabled={deletingId === activeId}
                  onClick={() => requestDeleteConversation(activeId, "header")}
                  aria-label={deletingId === activeId ? "Excluindo conversa" : "Excluir esta conversa"}
                  title="Excluir esta conversa"
                >
                  {deletingId === activeId ? <LoaderCircle aria-hidden="true" className="chat-icon-spin" /> : <Trash2 aria-hidden="true" />}
                </Button>
              )}
              {activeId && confirmDeleteConversationId === activeId && confirmDeleteConversationSource === "header" && (
                <div className="chat-conversation-confirm" role="group" aria-label={`Confirmar exclusão de ${activeConversation?.titulo ?? "conversa"}`} onKeyDown={(event) => { if (event.key === "Escape") restoreConversationActionFocus(activeId, "header"); }}>
                  <span>Excluir “{activeConversation?.titulo ?? "esta conversa"}” e todas as mensagens permanentemente?</span>
                  <div className="chat-conversation-confirm-actions">
                    <Button variant="ghost" size="sm" autoFocus ref={(node) => { if (node) requestAnimationFrame(() => node.focus()); }} disabled={deletingId === activeId} onClick={() => restoreConversationActionFocus(activeId, "header")}>Cancelar</Button>
                    <Button variant="danger" size="sm" disabled={deletingId === activeId} onClick={() => void handleDeleteConversation(activeId)}>{deletingId === activeId ? "Excluindo…" : "Excluir"}</Button>
                  </div>
                </div>
              )}
            </div>
            {conversationCopyStatus && <span className="sr-only" role="status" aria-live="polite">{conversationCopyStatus}</span>}
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
              <MessageBubble
                key={message.id}
                message={message}
                copied={copiedId === message.id}
                copyFailed={copyFailedId === message.id}
                deleting={deletingMessageId === message.id}
                deleteDisabled={sending || deletingMessageId !== null}
                onCopy={() => void copy(message)}
                confirmingDelete={confirmDeleteMessageId === message.id}
                onRequestDelete={() => requestDeleteMessage(message)}
                onCancelDelete={() => setConfirmDeleteMessageId(null)}
                onDelete={() => void handleDeleteMessage(message)}
                failureText={failedMessage?.id === message.id ? sendError || "A consulta anterior não foi concluída." : ""}
                onRetry={() => void send(message.conteudo, message.id)}
              />
            ))}

            {sending && <ThinkingIndicator stage={progressByKey[sendKey] ?? "searching"} />}
          </div>

          <div className="chat-prompt-bar" role="group" aria-label="Perguntas sugeridas">
            <span className="chat-prompt-label"><Sparkles size={14} aria-hidden="true" /> Sugestões</span>
            <div className="chat-prompt-list">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="chat-prompt-chip"
                  type="button"
                  aria-label={`Usar pergunta sugerida: ${prompt}`}
                  disabled={sending || messagesState === "loading"}
                  onClick={() => { if (speechRecognition.current) cancelVoiceCapture(); editDraft(prompt); composer.current?.focus(); }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); if (canSend) void send(draft); }}>
            {sendError && !failedMessage && (
              <Alert tone="danger" role="alert" title="Não foi possível concluir">
                {sendError}
              </Alert>
            )}
            <label className="sr-only" htmlFor="chat-question">Sua pergunta</label>
            <div className={`chat-composer-field${remaining < 0 ? " is-invalid" : ""}${voiceRecording ? " is-recording" : ""}`}>
              <textarea
                id="chat-question"
                ref={composer}
                className="chat-composer-textarea"
                rows={1}
                placeholder="Escreva sua mensagem…"
                value={draft}
                disabled={sending}
                aria-describedby="chat-composer-help chat-composer-counter"
                aria-invalid={remaining < 0}
                onChange={(event) => handleDraftInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (canSend) void send(draft);
                  }
                }}
              />
              <div className="chat-composer-toolbar">
                <span id="chat-composer-counter" className={`chat-char-count${remaining < 0 ? " is-invalid" : ""}`} aria-live="off">
                  {draft.length}/{MAX_QUESTION_LENGTH}
                </span>
                <div className="chat-composer-actions">
                  <Button
                    variant="ghost"
                    className={`chat-voice-button${voiceRecording ? " is-recording" : ""}`}
                    type="button"
                    aria-label={voiceRecording ? "Parar ditado por voz" : speechSupported ? "Iniciar ditado por voz" : "Ditado por voz indisponível"}
                    aria-describedby="chat-voice-description"
                    aria-pressed={voiceRecording}
                    title={speechSupported ? voiceRecording ? "Concluir ditado" : "Ditar por voz em português" : "Ditado por voz não suportado neste navegador"}
                    disabled={sending}
                    onClick={toggleVoiceInput}
                  >
                    {voiceRecording ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
                  </Button>
                  <Button ref={submitButton} variant="ghost" className={`chat-send-button${draft.trim() && remaining >= 0 ? " has-message" : ""}`} type="submit" disabled={!canSend} aria-label="Enviar" title={sending ? "Consultando…" : "Enviar mensagem"}>
                    {sending ? <LoaderCircle className="chat-send-spinner" size={18} aria-hidden="true" /> : <ArrowUp size={19} aria-hidden="true" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="chat-composer-meta">
              <span id="chat-composer-help" className={`chat-composer-help${remaining < 0 ? " is-invalid" : ""}${voiceMessage ? " is-voice-active" : ""}${voiceError ? " is-voice-error" : ""}`}>
                {voiceMessage ? <span role="status" aria-live="polite">{voiceMessage}</span> : remaining < 0 ? `Reduza ${-remaining} caractere(s) para enviar.` : !scopeId ? "Selecione um projeto para habilitar o envio." : "Enter envia · Shift+Enter quebra a linha"}
              </span>
              <span className="chat-composer-disclaimer">A IA pode errar; confira as fontes citadas.</span>
            </div>
            <span id="chat-voice-description" className="sr-only">Ditado em português. O navegador pode enviar o áudio ao serviço de reconhecimento de fala configurado por ele.</span>
          </form>
        </section>
      </div>
      {renameConversationId && (
        <div className="chat-rename-backdrop">
          <section ref={renameDialogRef} className="chat-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-rename-title" aria-describedby="chat-rename-description">
            <form onSubmit={(event) => void saveConversationRename(event)}>
              <h2 id="chat-rename-title">Renomear conversa</h2>
              <p id="chat-rename-description">Escolha um título claro para encontrar esta conversa depois.</p>
              <label htmlFor="chat-rename-input">Título da conversa</label>
              <input
                ref={renameInput}
                id="chat-rename-input"
                type="text"
                value={renameDraft}
                aria-invalid={Boolean(renameError)}
                aria-describedby={renameError ? "chat-rename-count chat-rename-error" : "chat-rename-count"}
                onChange={(event) => { setRenameDraft(event.target.value); setRenameError(""); }}
                disabled={renaming}
              />
              <div id="chat-rename-count" className="chat-rename-count">{[...renameDraft.trim()].length}/120</div>
              {renameError && <p id="chat-rename-error" className="chat-rename-error" role="alert">{renameError}</p>}
              <div className="chat-rename-actions">
                <Button type="button" variant="ghost" disabled={renaming} onClick={() => setRenameConversationId(null)}>Cancelar</Button>
                <Button type="submit" disabled={renaming || !renameDraft.trim() || [...renameDraft.trim()].length > 120}>
                  {renaming ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, copied, copyFailed, deleting, deleteDisabled, confirmingDelete, onCopy, onRequestDelete, onCancelDelete, onDelete, failureText, onRetry }: {
  message: ThreadMessage;
  copied: boolean;
  copyFailed: boolean;
  deleting: boolean;
  deleteDisabled: boolean;
  confirmingDelete: boolean;
  onCopy: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  failureText: string;
  onRetry: () => void;
}) {
  const isUser = message.remetente === "user";
  const originBadge = message.origem ? ORIGIN_BADGE[message.origem as ChatOrigin] : null;
  const sourcesRef = useRef<HTMLDetailsElement>(null);
  const hasSources = message.fontes.length > 0;
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const actions: MessageContextAction[] = [
    { id: "copy", label: isUser ? "Copiar pergunta" : "Copiar resposta", onSelect: onCopy },
    ...(hasSources && !sourcesOpen ? [{
      id: "sources",
      label: "Ver fontes e evidências",
      onSelect: () => {
        const details = sourcesRef.current;
        if (!details) return;
        details.open = true;
        setSourcesOpen(true);
        details.scrollIntoView?.({ behavior: "smooth", block: "center" });
        details.querySelector("summary")?.focus();
      },
    }] : []),
    ...(failureText ? [{ id: "retry", label: "Tentar novamente", onSelect: onRetry, disabled: deleteDisabled }] : []),
    {
      id: "delete",
      label: isUser ? "Apagar pergunta" : "Apagar resposta",
      onSelect: onRequestDelete,
      disabled: deleteDisabled || deleting,
      destructive: true,
    },
  ];
  return (
    <MessageContextMenu ariaLabel={`Ações da mensagem de ${isUser ? "Você" : "Assistente Sinapse"}`} actions={actions}>
    <article className={`chat-message chat-message--${isUser ? "user" : "assistant"}${message.failed ? " is-failed" : ""}`} aria-label={isUser ? "Você" : "Assistente Sinapse"}>
      <header className="chat-message-header">
        <b>{isUser ? "Você" : "Assistente Sinapse"}</b>
        <time dateTime={message.created_at ?? undefined} title={formatClockWithSeconds(message.created_at)}>{formatClockWithSeconds(message.created_at)}</time>
        {originBadge && <Badge tone="warning">{originBadge}</Badge>}
      </header>
      {message.failed && <p className="chat-message-failed" role="note">Não enviada</p>}
      {isUser ? <p className="chat-message-text">{message.conteudo}</p> : <Markdown source={message.conteudo} className="chat-message-body" />}
      {failureText && (
        <div className="chat-message-error" role="alert">
          <span>{failureText}</span>
          <Button variant="secondary" size="sm" disabled={deleteDisabled} onClick={onRetry}>Tentar novamente</Button>
        </div>
      )}
      {message.fontes.length > 0 && (
        <details ref={sourcesRef} className="chat-sources" onToggle={(event) => setSourcesOpen(event.currentTarget.open)}>
          <summary>Fontes e evidências <span>{message.fontes.length}</span></summary>
          <ul>
            {message.fontes.map((source) => (
              <li key={source.id}>
                <Badge>{source.tipo}</Badge>
                {source.url ? <a href={source.url}>{source.titulo}</a> : <span>{source.titulo}</span>}
                {source.projeto_nome && <span className="chat-source-project">{source.projeto_nome}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!isUser && message.origem === "sem_resultado" && <p className="chat-sources-empty">Nenhuma evidência correspondente encontrada no acervo.</p>}
      {confirmingDelete && (
        <div className="chat-delete-confirm" role="group" aria-label="Confirmar exclusão da mensagem">
          <span>
            Apagar somente esta mensagem? A outra mensagem da conversa continuará no histórico.
            {isUser && message.failed && " A pergunta será removida e não poderá ser tentada novamente."}
          </span>
          <div>
            <Button variant="ghost" size="sm" disabled={deleting} onClick={onCancelDelete}>Cancelar</Button>
            <Button variant="danger" size="sm" disabled={deleting} onClick={onDelete}>{deleting ? "Apagando…" : "Apagar"}</Button>
          </div>
        </div>
      )}
      {!isUser && <Button
        variant="ghost"
        size="sm"
        className={`chat-message-copy${copied ? " is-copied" : ""}`}
        aria-label={copyFailed ? "Não foi possível copiar a resposta" : copied ? "Resposta copiada" : "Copiar resposta"}
        title={copyFailed ? "Não foi possível copiar" : copied ? "Copiado" : "Copiar resposta"}
        onClick={onCopy}
      >
        {copyFailed ? <CircleAlert aria-hidden="true" /> : copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>}
      <span className="sr-only" role="status" aria-live="polite">{copyFailed ? "Não foi possível copiar a mensagem." : copied ? "Mensagem copiada." : ""}</span>
    </article>
    </MessageContextMenu>
  );
}
