import { useEffect, useRef, useState } from "react";
import { readDocumentText, type DocumentText, type KnowledgeHit } from "../../api/api_knowledge";

export function DocumentTextDialog({ hit, onClose }: { hit: KnowledgeHit; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [offset, setOffset] = useState<number>();
  const [page, setPage] = useState<DocumentText | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); opener?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setError(false);
    void readDocumentText(hit, offset, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).then(data => {
      if (!controller.signal.aborted) setPage(data);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [hit, offset, attempt]);
  useEffect(() => {
    if (!page) return;
    const target = document.getElementById("source-chunk-" + hit.id) || dialog.current?.querySelector<HTMLElement>("[data-excerpt]");
    target?.scrollIntoView?.({ block: "center" });
    target?.focus();
  }, [page, hit.id]);
  return <dialog className="knowledge-document" ref={dialog} aria-labelledby="document-source-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p className="muted">Documento · {hit.project_name}</p><h2 id="document-source-title">{page?.document.name ?? hit.title ?? "Documento de origem"}</h2></div><button type="button" className="btn-garakis secondary" onClick={onClose}>Fechar documento</button></header>
    <p className="muted">Texto indexado do documento, posicionado no trecho encontrado.</p>
    {error ? <div role="alert"><p>O documento não está disponível. Ele pode ter sido removido ou reprocessado.</p><button className="btn-garakis secondary" onClick={() => setAttempt(attempt + 1)}>Tentar novamente</button></div>
      : !page ? <p role="status">Carregando o documento…</p> : <>
      <div className="knowledge-document-text">{page.items.map(item => <section key={item.id} data-excerpt id={"source-chunk-" + item.id} tabIndex={-1} className={item.id === hit.id ? "knowledge-matched-excerpt" : ""}>
        <h3>Trecho {item.index + 1}{item.id === hit.id ? " · Resultado selecionado" : ""}</h3><p>{item.text}</p>
      </section>)}</div>
      <nav aria-label="Páginas do documento"><button className="btn-garakis secondary" disabled={page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - 20))}>Trechos anteriores</button><span>{page.offset + 1}–{page.offset + page.items.length} de {page.total} trechos</span><button className="btn-garakis secondary" disabled={page.next_offset === null} onClick={() => setOffset(page.next_offset!)}>Próximos trechos</button></nav>
    </>}
  </dialog>;
}
