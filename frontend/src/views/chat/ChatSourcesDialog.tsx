import { useEffect, useRef, useState } from "react";
import { readDocumentText, type DocumentText, type KnowledgeHit } from "../../api/api_knowledge";
import type { ChatSource } from "../../api/api_chat";
import { Markdown } from "../common/Markdown";
import { ExternalLink, FileText, LoaderCircle, RotateCcw, X } from "lucide-react";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function SourceExcerpt({ source }: { source: ChatSource }) {
  const [page, setPage] = useState<DocumentText | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const chunkId = source.chunk_ids?.find(id => UUID_PATTERN.test(id)) ?? (UUID_PATTERN.test(source.id) ? source.id : null);
  const canLoad = source.tipo === "documento" && !!source.projeto_id && UUID_PATTERN.test(source.projeto_id)
    && !!source.entidade_id && UUID_PATTERN.test(source.entidade_id) && !!chunkId;

  useEffect(() => {
    if (!canLoad || !chunkId) return;
    const controller = new AbortController();
    const hit: KnowledgeHit = {
      id: chunkId,
      project_id: source.projeto_id!,
      project_name: source.projeto_nome ?? "Projeto selecionado",
      entity_type: "documento",
      entity_id: source.entidade_id!,
      title: source.titulo,
      text: "",
      metadata: {},
      source_url: source.url ?? null,
      relevance_score: 0,
    };
    setPage(null);
    setFailed(false);
    void readDocumentText(hit, undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt, canLoad, chunkId, source.entidade_id, source.projeto_id, source.projeto_nome, source.titulo, source.url]);

  const markdown = /\.md(?:own)?$/i.test(source.titulo);
  const citedExcerpt = page?.items.find(item => item.id === chunkId);
  const contextExcerpts = page?.items.filter(item => item.id !== chunkId) ?? [];
  return <section className="chat-source-card" aria-label={`Fonte: ${source.titulo}`}>
    <header className="chat-source-card-header"><div className="chat-source-file-icon" aria-hidden="true"><FileText size={20} /></div>
      <div className="chat-source-file-info"><div className="chat-source-meta"><span className="chat-source-type">{source.tipo}</span>{markdown && <span className="chat-source-format">Markdown</span>}</div>
        <h3>{page?.document.name ?? source.titulo}</h3>
        {source.projeto_nome && <p>{source.projeto_nome}</p>}
      </div>
      {source.url && <a className="chat-source-open-link" href={source.url}>Abrir documento <ExternalLink size={14} aria-hidden="true" /></a>}
    </header>
    {failed ? <div role="alert" className="chat-source-status chat-source-error"><span>Não foi possível carregar a evidência deste documento.</span>
      <button type="button" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={14} aria-hidden="true" /> Tentar novamente</button></div>
      : canLoad && !page ? <p role="status" className="chat-source-status"><LoaderCircle className="chat-source-spinner" size={16} aria-hidden="true" />Carregando evidência…</p>
        : page && citedExcerpt ? <div className="chat-source-excerpts">
          <article className="is-matched">
            <h4>Evidência citada</h4>
            {markdown ? <Markdown source={citedExcerpt.text} className="chat-source-markdown" /> : <p className="chat-source-plain">{citedExcerpt.text}</p>}
          </article>
          {contextExcerpts.length > 0 && <details className="chat-source-context">
            <summary><span>Contexto do documento</span><span>{contextExcerpts.length} {contextExcerpts.length === 1 ? "trecho" : "trechos"}</span></summary>
            <div>{contextExcerpts.map(item => <article key={item.id}>
              <h4>Trecho {item.index + 1}</h4>
              {markdown ? <Markdown source={item.text} className="chat-source-markdown" /> : <p className="chat-source-plain">{item.text}</p>}
            </article>)}</div>
          </details>}
        </div>
          : <p className="chat-source-status">O trecho detalhado não está disponível para esta fonte.</p>}
  </section>;
}

export function ChatSourcesDialog({ sources, onClose }: { sources: ChatSource[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); opener?.focus(); };
  }, []);
  return <dialog className="chat-sources-dialog" ref={dialog} aria-labelledby="chat-sources-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <header className="chat-sources-dialog-header"><div className="chat-sources-title-group">
        <span className="chat-sources-heading-icon" aria-hidden="true"><FileText size={18} /></span>
        <div><p>ACERVO DO PROJETO</p><h2 id="chat-sources-title">Fontes e evidências</h2></div>
        <span className="chat-sources-count" aria-label={`${sources.length} fontes`}>{sources.length}</span>
      </div>
      <button type="button" className="chat-sources-close" onClick={onClose} autoFocus aria-label="Fechar fontes"><span>Fechar</span><X size={17} /></button>
    </header>
    <div className="chat-sources-dialog-content">{sources.map(source => <SourceExcerpt key={`${source.projeto_id ?? ""}:${source.tipo}:${source.id}`} source={source} />)}</div>
  </dialog>;
}
