import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeRemovalError,
  describeUploadError,
  formatBytes,
  listDocuments,
  removeDocument,
  retryDocumentProcessing,
  uploadDocument,
  validateSelection,
  type DocumentLimits,
  type ProjectDocument,
} from "../../api/api_documents";
import { navigate } from "../../models/navigation";
import { Alert, Badge, Button, EmptyState } from "../common/ui";
import "../../assets/styles/documents.css";

const STATUS_VIEW = {
  pendente: { label: "Aguardando ingestão", tone: "warning" as const },
  processando: { label: "Processando", tone: "info" as const },
  processado: { label: "Disponível no acervo", tone: "success" as const },
  falha: { label: "Falha no processamento", tone: "danger" as const },
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Data indisponível" : date.toLocaleString("pt-BR");
}

function formatExtensions(limits: DocumentLimits): string {
  return limits.extensoes_permitidas.map((extension) => extension.slice(1).toUpperCase()).join(", ");
}

export function DocumentsView({
  projectId,
  projectName,
  canWrite = false,
  archived = false,
  embedded = false,
}: {
  projectId?: string;
  projectName?: string;
  canWrite?: boolean;
  archived?: boolean;
  embedded?: boolean;
}) {
  const [items, setItems] = useState<ProjectDocument[]>([]);
  const [limits, setLimits] = useState<DocumentLimits | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [selection, setSelection] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [processingError, setProcessingError] = useState("");
  const [removalError, setRemovalError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [target, setTarget] = useState<ProjectDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const uploadLock = useRef(false);
  const removalLock = useRef(false);

  const pageCount = useRef(1);
  const listRequest = useRef<AbortController | null>(null);
  const listGeneration = useRef(0);
  const listBusy = useRef(false);
  const projectEpoch = useRef(0);

  const cancelList = useCallback(() => {
    listRequest.current?.abort();
    listRequest.current = null;
    ++listGeneration.current;
    listBusy.current = false;
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!projectId || listBusy.current) return;
    const controller = new AbortController();
    const generation = ++listGeneration.current;
    listRequest.current = controller;
    listBusy.current = true;
    if (quiet) setRefreshing(true); else setLoading(true);
    setLoadError("");
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      const loaded: ProjectDocument[] = [];
      let cursor: string | null = null;
      let pages = 0;
      let response;
      do {
        response = await listDocuments(projectId, { cursor: cursor ?? undefined, signal });
        if (controller.signal.aborted || generation !== listGeneration.current) return;
        loaded.push(...response.items);
        cursor = response.next_cursor;
        pages++;
      } while (cursor && pages < pageCount.current);
      pageCount.current = pages;
      setItems([...new Map(loaded.map(item => [item.id, item])).values()]);
      setLimits(response.limites);
      setNextCursor(cursor);
    } catch {
      if (!controller.signal.aborted && generation === listGeneration.current) setLoadError("Não foi possível carregar os documentos. Tente novamente.");
    } finally {
      if (generation === listGeneration.current) {
        listBusy.current = false;
        listRequest.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    cancelList();
    ++projectEpoch.current;
    pageCount.current = 1;
    setItems([]);
    setLimits(null);
    setNextCursor(null);
    setLoading(Boolean(projectId));
    setLoadingMore(false);
    setRefreshing(false);
    setLoadError("");
    setMoreError("");
    setTarget(null);
    if (dialog.current?.open) dialog.current.close();
    setSelection(null);
    setUploading(false);
    setRemoving(false);
    setRetryingId(null);
    setNotice("");
    setUploadError("");
    setSelectionError("");
    setProcessingError("");
    setRemovalError("");
    uploadLock.current = false;
    removalLock.current = false;
    if (fileInput.current) fileInput.current.value = '';
    if (projectId) void refresh(false);
    return cancelList;
  }, [projectId, refresh, cancelList]);

  const hasProcessing = items.some((item) => item.status_processamento === "pendente" || item.status_processamento === "processando");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => { void refresh(true); }, 10_000);
    return () => window.clearInterval(timer);
  }, [hasProcessing, refresh]);

  useEffect(() => {
    if (!target || !dialog.current) return;
    if (!dialog.current.open) dialog.current.showModal();
  }, [target]);

  const loadMore = async () => {
    if (!projectId || !nextCursor || listBusy.current) return;
    const controller = new AbortController();
    const generation = ++listGeneration.current;
    listRequest.current = controller;
    listBusy.current = true;
    setLoadingMore(true);
    setMoreError("");
    try {
      const response = await listDocuments(projectId, { cursor: nextCursor, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (controller.signal.aborted || generation !== listGeneration.current) return;
      setItems(current => [...new Map([...current, ...response.items].map(item => [item.id, item])).values()]);
      if (response.items.length) pageCount.current++;
      setNextCursor(response.next_cursor);
    } catch {
      if (!controller.signal.aborted && generation === listGeneration.current) setMoreError("Não foi possível carregar mais documentos.");
    } finally {
      if (generation === listGeneration.current) {
        listBusy.current = false;
        listRequest.current = null;
        setLoadingMore(false);
      }
    }
  };

  const chooseFile = (file?: File) => {
    setNotice("");
    setSelectionError("");
    setUploadError("");
    if (!file) return;
    if (!limits) {
      setSelectionError("Os limites de envio ainda não foram carregados.");
      return;
    }
    const problem = validateSelection(file, limits);
    if (problem) {
      setSelection(null);
      setSelectionError(problem);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setSelection(file);
  };

  const clearSelection = () => {
    setSelection(null);
    setSelectionError("");
    setUploadError("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const submitUpload = async () => {
    if (!projectId || !selection || uploadLock.current || !canWrite || archived) return;
    uploadLock.current = true;
    setUploading(true);
    setUploadError("");
    setNotice("");
    const epoch = projectEpoch.current;
    try {
      const created = await uploadDocument(projectId, selection);
      if (epoch !== projectEpoch.current) return;
      cancelList();
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setNotice(created.armazenamento_pendente
        ? `O documento “${created.nome}” foi recebido. O armazenamento está sendo finalizado e a indexação começará em segundo plano.`
        : `O documento “${created.nome}” foi armazenado e será indexado em segundo plano.`);
      clearSelection();
    } catch (error) {
      if (epoch !== projectEpoch.current) return;
      setUploadError(describeUploadError(error));
    } finally {
      if (epoch === projectEpoch.current) { uploadLock.current = false; setUploading(false); }
    }
  };

  const closeDialog = () => {
    dialog.current?.close();
    setTarget(null);
    setRemovalError("");
  };

  const confirmRemoval = async () => {
    if (!projectId || !target || removalLock.current || !canWrite || archived) return;
    removalLock.current = true;
    setRemoving(true);
    setRemovalError("");
    const epoch = projectEpoch.current;
    try {
      await removeDocument(projectId, target.id);
      if (epoch !== projectEpoch.current) return;
      cancelList();
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setItems((current) => current.filter((item) => item.id !== target.id));
      setNotice(`O documento “${target.nome}” foi removido deste projeto.`);
      closeDialog();
      heading.current?.focus();
    } catch (error) {
      if (epoch !== projectEpoch.current) return;
      setRemovalError(describeRemovalError(error));
    } finally {
      if (epoch === projectEpoch.current) { removalLock.current = false; setRemoving(false); }
    }
  };

  const retryProcessing = async (document: ProjectDocument) => {
    if (!projectId || !canWrite || archived || retryingId) return;
    setRetryingId(document.id);
    setNotice("");
    setProcessingError("");
    const epoch = projectEpoch.current;
    try {
      await retryDocumentProcessing(projectId, document.id);
      if (epoch !== projectEpoch.current) return;
      cancelList();
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setItems((current) => current.map((item) => item.id === document.id
        ? { ...item, status_processamento: "pendente", processamento_erro: null }
        : item));
      setNotice(`O reprocessamento de “${document.nome}” foi agendado.`);
      void refresh(true);
    } catch {
      if (epoch !== projectEpoch.current) return;
      setProcessingError("Não foi possível agendar o reprocessamento. Atualize a lista e tente novamente.");
    } finally {
      if (epoch === projectEpoch.current) setRetryingId(null);
    }
  };

  if (!projectId) {
    return (
      <section className="page-container">
        <EmptyState title="Escolha um projeto" description="Os documentos pertencem a um projeto. Abra um projeto e use a aba Documentos para consultar, enviar ou remover arquivos com o escopo correto.">
          <Button onClick={() => navigate("/projects")}>Ver projetos</Button>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className={`${embedded ? "" : "page-container "}documents-tab`} aria-label={`Documentos do projeto ${projectName ?? ""}`.trim()}>
      <header className={embedded ? "documents-head" : "head-section"}>
        <div>
          {!embedded && <div className="eyebrow">ACERVO TÉCNICO</div>}
          {embedded ? <h2>Documentos do projeto</h2> : <h1>Documentos{projectName ? ` · ${projectName}` : " do projeto"}</h1>}
          <p className="muted">Arquivos vinculados a este projeto e seu estado de processamento.</p>
        </div>
        <Button variant="secondary" disabled={refreshing || loading} aria-busy={refreshing} onClick={() => void refresh(true)}>
          {refreshing ? "Atualizando…" : "Atualizar"}
        </Button>
      </header>

      {archived && <Alert tone="warning">Projeto arquivado: os documentos ficam disponíveis somente para consulta.</Alert>}
      {!canWrite && !archived && <Alert>Seu perfil pode consultar documentos, mas não pode enviar ou remover arquivos.</Alert>}
      <Alert tone="info">Documentos válidos são processados em segundo plano. O conteúdo fica disponível no acervo após a conclusão da extração e indexação.</Alert>
      {notice && <Alert tone="success">{notice}</Alert>}
      {selectionError && <Alert tone="danger" title="Arquivo não aceito">{selectionError}</Alert>}
      {uploadError && <Alert tone="danger" title="Falha no envio">{uploadError}</Alert>}
      {processingError && <Alert tone="danger" title="Falha no reprocessamento">{processingError}</Alert>}
      {loadError && (
        <Alert tone="danger" role="alert">
          {loadError}{" "}
          <Button variant="secondary" size="sm" disabled={loading || refreshing} onClick={() => void refresh(items.length > 0)}>Tentar novamente</Button>
        </Alert>
      )}

      {canWrite && !archived && limits && (
        <div className="glass-panel documents-upload">
          <div
            className="documents-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}
          >
            <h2>Enviar documento</h2>
            <p>Arraste o arquivo até aqui ou escolha no computador.</p>
            <p className="ds-help">Formatos aceitos: {formatExtensions(limits)} · Máximo {formatBytes(limits.max_bytes)}</p>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              aria-label="Selecionar documento"
              accept={limits.extensoes_permitidas.join(",")}
              disabled={uploading}
              onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
            />
            <Button variant="secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>Escolher arquivo</Button>
          </div>
          {selection && (
            <div className="documents-selection">
              <div className="documents-selection-info">
                <strong>{selection.name}</strong>
                <span>{formatBytes(selection.size)}</span>
              </div>
              <div className="documents-selection-actions">
                <Button disabled={uploading} onClick={() => void submitUpload()}>{uploading ? "Enviando…" : "Enviar documento"}</Button>
                <Button variant="ghost" disabled={uploading} onClick={clearSelection}>Limpar seleção</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="glass-panel projects-state" role="status">Carregando documentos…</div>
      ) : !loadError && items.length === 0 ? (
        <div className="glass-panel documents-list">
          <EmptyState
            title="Nenhum documento neste projeto"
            description={canWrite && !archived
              ? `Envie o primeiro arquivo (${limits ? formatExtensions(limits) : "PDF, DOCX, MD ou TXT"}) para formar o acervo deste projeto.`
              : "Ainda não há documentos enviados para este projeto."}
          />
        </div>
      ) : items.length > 0 ? (
        <div className="glass-panel documents-list">
          <div className="documents-list-header">
            <h2 ref={heading} tabIndex={-1}>Documentos ({items.length})</h2>
          </div>
          <table className="documents-table">
            <caption className="sr-only">Documentos do projeto</caption>
            <thead>
              <tr>
                <th scope="col">Documento</th>
                <th scope="col">Tipo</th>
                <th scope="col">Tamanho</th>
                <th scope="col">Enviado por</th>
                <th scope="col">Data</th>
                <th scope="col">Status</th>
                {canWrite && !archived && <th scope="col"><span className="sr-only">Ações</span></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = STATUS_VIEW[item.status_processamento];
                return (
                  <tr key={item.id}>
                    <td data-label="Documento" className="documents-name">{item.nome}</td>
                    <td data-label="Tipo">{item.extensao?.slice(1).toUpperCase() ?? "—"}</td>
                    <td data-label="Tamanho">{item.tamanho_bytes === null ? "—" : formatBytes(item.tamanho_bytes)}</td>
                    <td data-label="Enviado por">{item.autor_nome ?? "Não informado"}</td>
                    <td data-label="Data"><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></td>
                    <td data-label="Status">
                      {item.armazenamento_pendente
                        ? <Badge tone="warning">Finalizando armazenamento</Badge>
                        : <Badge tone={status.tone}>{status.label}</Badge>}
                      {item.processamento_erro && <p className="ds-help" role="note">{item.processamento_erro}</p>}
                    </td>
                    {canWrite && !archived && (
                      <td data-label="Ações">
                        {item.status_processamento === "falha" && <Button variant="secondary" size="sm" disabled={retryingId !== null} onClick={() => void retryProcessing(item)}>{retryingId === item.id ? "Agendando…" : "Tentar novamente"}</Button>}
                        <Button variant="danger" size="sm" aria-label={`Remover ${item.nome}`} onClick={() => { setNotice(""); setTarget(item); }}>Remover</Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {moreError && <Alert tone="danger" role="alert">{moreError}</Alert>}
          {nextCursor && <Button variant="secondary" disabled={loadingMore || refreshing} onClick={() => void loadMore()}>{loadingMore ? "Carregando…" : "Carregar mais"}</Button>}
        </div>
      ) : null}

      <dialog
        className="archive-dialog"
        ref={dialog}
        aria-labelledby="remove-document-title"
        onCancel={(event) => { if (removing) event.preventDefault(); else setTarget(null); }}
      >
        {target && (
          <>
            <h2 id="remove-document-title">Remover “{target.nome}”?</h2>
            <p>O arquivo, seus metadados e trechos indexados deste projeto serão removidos. Essa ação não pode ser desfeita.</p>
            {removalError && <Alert tone="danger" role="alert">{removalError}</Alert>}
            <div className="project-actions">
              <Button variant="secondary" autoFocus disabled={removing} onClick={closeDialog}>Cancelar</Button>
              <Button variant="danger" disabled={removing} onClick={() => void confirmRemoval()}>{removing ? "Removendo…" : "Confirmar remoção"}</Button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
