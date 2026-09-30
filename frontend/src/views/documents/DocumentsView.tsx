import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeRemovalError,
  describeUploadError,
  formatBytes,
  listDocuments,
  removeDocument,
  reprocessDocument,
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

type DocumentsProps = {
  projectId?: string;
  projectName?: string;
  canWrite?: boolean;
  archived?: boolean;
  embedded?: boolean;
};

export function DocumentsView(props: DocumentsProps) {
  return <ProjectDocuments key={props.projectId ?? "no-project"} {...props} />;
}

function ProjectDocuments({
  projectId,
  projectName,
  canWrite = false,
  archived = false,
  embedded = false,
}: DocumentsProps) {
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
  const [removalError, setRemovalError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [target, setTarget] = useState<ProjectDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const uploadLock = useRef(false);
  const removalLock = useRef(false);
  const scope = useRef(new AbortController());
  const pages = useRef(1);
  const listLock = useRef(false);
  const refreshPending = useRef(false);
  const mutationRevision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    return () => controller.abort();
  }, []);
  const requestSignal = (timeout = 15_000) => AbortSignal.any([scope.current.signal, AbortSignal.timeout(timeout)]);

  const refresh = useCallback(async (quiet = false) => {
    if (!projectId || scope.current.signal.aborted) return;
    if (listLock.current) { refreshPending.current = true; return; }
    refreshPending.current = false;
    listLock.current = true;
    const signal = requestSignal();
    const revision = mutationRevision.current;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      let cursor: string | undefined;
      const loaded = new Map<string, ProjectDocument>();
      let response;
      for (let page = 0; page < pages.current; page++) {
        response = await listDocuments(projectId, { cursor, signal });
        if (signal.aborted) return;
        for (const item of response.items) loaded.set(item.id, item);
        cursor = response.next_cursor ?? undefined;
        if (!cursor) break;
      }
      if (!response || revision !== mutationRevision.current) return;
      setItems([...loaded.values()]);
      setLimits(response.limites);
      setNextCursor(response.next_cursor);
    } catch {
      if (scope.current.signal.aborted) return;
      setLoadError("Não foi possível carregar os documentos. Tente novamente.");
    } finally {
      listLock.current = false;
      if (scope.current.signal.aborted) return;
      setLoading(false);
      setRefreshing(false);
      if (refreshPending.current) void refresh(true);
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    if (!projectId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void listDocuments(projectId, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then((response) => {
        if (!active) return;
        setItems(response.items);
        setLimits(response.limites);
        setNextCursor(response.next_cursor);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setLoadError("Não foi possível carregar os documentos. Tente novamente.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [projectId]);

  const reprocess = async (id: string) => {
    if (!projectId || reprocessing || archived || !canWrite) return;
    setReprocessing(id);
    const signal = requestSignal();
    try {
      await reprocessDocument(projectId, id, signal);
      if (signal.aborted) return;
      mutationRevision.current += 1;
      setNotice("Documento enviado para reprocessamento."); await refresh(true);
    }
    catch { if (!scope.current.signal.aborted) setNotice("Não foi possível reprocessar o documento. Tente novamente."); }
    finally { if (!scope.current.signal.aborted) setReprocessing(null); }
  };

  const hasProcessing = items.some((item) => item.nova_tentativa_pendente || ["pendente", "processando"].includes(item.status_processamento));
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
    if (!projectId || !nextCursor || loadingMore || listLock.current) return;
    listLock.current = true;
    const signal = requestSignal();
    setLoadingMore(true);
    setMoreError("");
    try {
      const response = await listDocuments(projectId, { cursor: nextCursor, signal });
      if (signal.aborted) return;
      pages.current += 1;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...response.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(response.next_cursor);
    } catch {
      if (scope.current.signal.aborted) return;
      setMoreError("Não foi possível carregar mais documentos.");
    } finally {
      listLock.current = false;
      if (scope.current.signal.aborted) return;
      setLoadingMore(false);
      if (refreshPending.current) void refresh(true);
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
    const signal = requestSignal(120_000);
    try {
      const created = await uploadDocument(projectId, selection, signal);
      if (signal.aborted) return;
      mutationRevision.current += 1;
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setNotice(created.armazenamento_pendente
        ? `O documento “${created.nome}” foi recebido. O armazenamento está sendo finalizado e a indexação depende da integração da S2-01.`
        : `O documento “${created.nome}” foi armazenado. A indexação do acervo depende da integração da S2-01.`);
      clearSelection();
    } catch (error) {
      if (scope.current.signal.aborted) return;
      setUploadError(describeUploadError(error));
    } finally {
      if (scope.current.signal.aborted) return;
      uploadLock.current = false;
      setUploading(false);
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
    const signal = requestSignal();
    try {
      await removeDocument(projectId, target.id, signal);
      if (signal.aborted) return;
      mutationRevision.current += 1;
      setItems((current) => current.filter((item) => item.id !== target.id));
      setNotice(`O documento “${target.nome}” foi removido deste projeto.`);
      closeDialog();
      heading.current?.focus();
    } catch (error) {
      if (scope.current.signal.aborted) return;
      setRemovalError(describeRemovalError(error));
    } finally {
      if (scope.current.signal.aborted) return;
      removalLock.current = false;
      setRemoving(false);
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
      <Alert tone="info">A ingestão e indexação dos documentos depende da S2-01. Enquanto isso, o status permanece como pendente e o conteúdo ainda não aparece nas buscas.</Alert>
      {notice && <Alert tone="success">{notice}</Alert>}
      {selectionError && <Alert tone="danger" title="Arquivo não aceito">{selectionError}</Alert>}
      {uploadError && <Alert tone="danger" title="Falha no envio">{uploadError}</Alert>}
      {loadError && (
        <Alert tone="danger" role="alert">
          {loadError}{" "}
          <Button variant="secondary" size="sm" disabled={loading || refreshing} onClick={() => void refresh(items.length > 0)}>Tentar novamente</Button>
        </Alert>
      )}

      {canWrite && !archived && limits && (
        <div className="ds-card ds-card--glass documents-upload">
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
        <div className="ds-card ds-card--glass projects-state" role="status">Carregando documentos…</div>
      ) : !loadError && items.length === 0 ? (
        <div className="ds-card ds-card--glass documents-list">
          <EmptyState
            title="Nenhum documento neste projeto"
            description={canWrite && !archived
              ? `Envie o primeiro arquivo (${limits ? formatExtensions(limits) : "PDF, DOCX, MD ou TXT"}) para formar o acervo deste projeto.`
              : "Ainda não há documentos enviados para este projeto."}
          />
        </div>
      ) : items.length > 0 ? (
        <div className="ds-card ds-card--glass documents-list">
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
                const status = item.status_processamento === "falha" && item.nova_tentativa_pendente
                  ? { label: "Aguardando nova tentativa", tone: "warning" as const }
                  : STATUS_VIEW[item.status_processamento];
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
                    </td>
                    {canWrite && !archived && (
                      <td data-label="Ações">
                        {item.status_processamento === "falha" && <Button variant="secondary" size="sm" disabled={Boolean(reprocessing)} onClick={() => void reprocess(item.id)}>Reprocessar</Button>}
                        <Button variant="danger" size="sm" aria-label={`Remover ${item.nome}`} onClick={() => { setNotice(""); setTarget(item); }}>Remover</Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {moreError && <Alert tone="danger" role="alert">{moreError}</Alert>}
          {nextCursor && <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Carregando…" : "Carregar mais"}</Button>}
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
