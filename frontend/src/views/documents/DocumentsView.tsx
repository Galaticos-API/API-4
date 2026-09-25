import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeRemovalError,
  describeUploadError,
  formatBytes,
  listDocuments,
  removeDocument,
  uploadDocument,
  validateSelection,
  type DocumentLimits,
  type ProjectDocument,
} from "../../api/api_documents";
import { Alert, Badge, Button, EmptyState } from "../common/ui";
import "../../projects/documents.css";

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
}: {
  projectId?: string;
  projectName?: string;
  canWrite?: boolean;
  archived?: boolean;
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
  const [removalError, setRemovalError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [target, setTarget] = useState<ProjectDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const uploadLock = useRef(false);
  const removalLock = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!projectId) return;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      const response = await listDocuments(projectId, { signal: AbortSignal.timeout(15_000) });
      setItems(response.items);
      setLimits(response.limites);
      setNextCursor(response.next_cursor);
    } catch {
      setLoadError("Não foi possível carregar os documentos. Tente novamente.");
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const hasProcessing = items.some((item) => item.status_processamento === "processando");
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
    if (!projectId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const response = await listDocuments(projectId, { cursor: nextCursor, signal: AbortSignal.timeout(15_000) });
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...response.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(response.next_cursor);
    } catch {
      setMoreError("Não foi possível carregar mais documentos.");
    } finally {
      setLoadingMore(false);
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
    try {
      const created = await uploadDocument(projectId, selection);
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setNotice(created.armazenamento_pendente
        ? `O documento “${created.nome}” foi recebido. O armazenamento está sendo finalizado e a indexação depende da integração da S2-01.`
        : `O documento “${created.nome}” foi armazenado. A indexação do acervo depende da integração da S2-01.`);
      clearSelection();
    } catch (error) {
      setUploadError(describeUploadError(error));
    } finally {
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
    try {
      await removeDocument(projectId, target.id);
      setItems((current) => current.filter((item) => item.id !== target.id));
      setNotice(`O documento “${target.nome}” foi removido deste projeto.`);
      closeDialog();
      heading.current?.focus();
    } catch (error) {
      setRemovalError(describeRemovalError(error));
    } finally {
      removalLock.current = false;
      setRemoving(false);
    }
  };

  if (!projectId) {
    return (
      <section className="page-container">
        <EmptyState title="Escolha um projeto" description="Abra um projeto para consultar, enviar ou remover documentos com o escopo correto." />
      </section>
    );
  }

  return (
    <section className="page-container documents-tab" aria-label={`Documentos do projeto ${projectName ?? ""}`}>
      <header className="head-section">
        <div>
          <div className="eyebrow">ACERVO TÉCNICO</div>
          <h1>Documentos{projectName ? ` · ${projectName}` : " do projeto"}</h1>
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
      {loadError && <Alert tone="danger" role="alert">{loadError}</Alert>}

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
                    </td>
                    {canWrite && !archived && (
                      <td data-label="Ações">
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
