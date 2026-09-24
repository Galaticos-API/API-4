import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/api_auth";
import {
  describeRemovalError,
  describeUploadError,
  formatBytes,
  listDocuments,
  removeDocument,
  uploadDocument,
  validateSelection,
  type DocumentLimits,
  type DocumentStatus,
  type ProjectDocument,
} from "../api/api_documents";
import { Alert, Badge, Button, EmptyState, type BadgeTone } from "../components/ui";
import "./documents.css";

const POLL_INTERVAL_MS = 5000;

const STATUS_VIEW: Record<DocumentStatus, { label: string; tone: BadgeTone }> = {
  pendente: { label: "Pendente", tone: "info" },
  processando: { label: "Processando", tone: "brand" },
  processado: { label: "Processado", tone: "success" },
  falha: { label: "Falha", tone: "danger" },
};

type LoadState = { state: "loading" } | { state: "error"; message: string } | { state: "ready" };

function describeLoadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "É necessário entrar para consultar os documentos.";
  if (error instanceof ApiError && error.status === 403) return "Você não tem permissão para consultar os documentos deste projeto.";
  if (error instanceof ApiError && error.status === 404) return "Projeto não encontrado.";
  return "Não foi possível carregar os documentos. Tente novamente.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatList(limits: DocumentLimits): string {
  const names = limits.extensoes_permitidas.map(item => item.slice(1).toUpperCase());
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export function DocumentsTab({ projectId, canWrite, readOnlyNote }: { projectId: string; canWrite: boolean; readOnlyNote?: string }) {
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const [items, setItems] = useState<ProjectDocument[]>([]);
  const [limits, setLimits] = useState<DocumentLimits | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<ProjectDocument | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const uploadingRef = useRef(false);
  const removingRef = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async (silent: boolean) => {
    const current = ++requestId.current;
    if (silent) setRefreshing(true);
    else setLoad({ state: "loading" });
    try {
      const data = await listDocuments(projectId);
      if (!mounted.current || current !== requestId.current) return;
      setItems(data.items);
      setLimits(data.limites);
      setRefreshFailed(false);
      setLoad({ state: "ready" });
    } catch (error) {
      if (!mounted.current || current !== requestId.current) return;
      if (silent) setRefreshFailed(true);
      else setLoad({ state: "error", message: describeLoadError(error) });
    } finally {
      if (mounted.current && current === requestId.current) setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const hasProcessing = items.some(item => item.status_processamento === "processando");

  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(() => { void refresh(true); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasProcessing, refresh]);

  useEffect(() => {
    const element = dialog.current;
    if (!target || !element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }, [target]);

  function chooseFile(file: File | undefined) {
    setNotice("");
    setUploadError("");
    if (!file) return;
    const problem = limits ? validateSelection(file, limits) : null;
    if (problem) {
      setSelected(null);
      setSelectionError(problem);
      if (input.current) input.current.value = "";
      return;
    }
    setSelectionError("");
    setSelected(file);
  }

  function clearSelection() {
    setSelected(null);
    setSelectionError("");
    setUploadError("");
    if (input.current) input.current.value = "";
  }

  async function handleUpload() {
    if (!selected || uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setUploadError("");
    setNotice("");
    try {
      const created = await uploadDocument(projectId, selected);
      if (!mounted.current) return;
      setItems(previous => [created, ...previous.filter(item => item.id !== created.id)]);
      setNotice(`Documento "${created.nome}" enviado com sucesso. O processamento começará em seguida.`);
      clearSelection();
    } catch (error) {
      if (mounted.current) setUploadError(describeUploadError(error));
    } finally {
      uploadingRef.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  function closeDialog() {
    dialog.current?.close();
    setTarget(null);
    setRemoveError("");
  }

  async function confirmRemoval() {
    if (!target || removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    setRemoveError("");
    try {
      await removeDocument(projectId, target.id);
      if (!mounted.current) return;
      const name = target.nome;
      setItems(previous => previous.filter(item => item.id !== target.id));
      setNotice(`Documento "${name}" removido.`);
      closeDialog();
      heading.current?.focus();
    } catch (error) {
      if (mounted.current) setRemoveError(describeRemovalError(error));
    } finally {
      removingRef.current = false;
      if (mounted.current) setRemoving(false);
    }
  }

  return (
    <section className="documents-tab" aria-label="Documentos do projeto">
      {!canWrite && (
        <Alert>{readOnlyNote ?? "Seu perfil permite apenas consultar os documentos deste projeto."}</Alert>
      )}

      {load.state === "loading" && <div className="glass-panel projects-state" role="status">Carregando documentos…</div>}

      {load.state === "error" && (
        <div className="glass-panel projects-state">
          <p role="alert">{load.message}</p>
          <Button variant="secondary" onClick={() => void refresh(false)}>Tentar novamente</Button>
        </div>
      )}

      {load.state === "ready" && limits && (
        <>
          {canWrite && (
            <div className="glass-panel documents-upload">
              <div
                className={`documents-dropzone${dragging ? " is-dragging" : ""}`}
                onDragOver={event => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}
              >
                <h3>Enviar documento</h3>
                <p>Arraste um arquivo até aqui ou escolha no computador.</p>
                <p className="ds-help">Formatos aceitos: {formatList(limits)} · Tamanho máximo: {formatBytes(limits.max_bytes)}</p>
                <input
                  ref={input}
                  className="sr-only"
                  type="file"
                  tabIndex={-1}
                  aria-label="Selecionar documento"
                  accept={limits.extensoes_permitidas.join(",")}
                  disabled={uploading}
                  onChange={event => chooseFile(event.target.files?.[0])}
                />
                <Button variant="secondary" disabled={uploading} onClick={() => input.current?.click()}>Escolher arquivo</Button>
              </div>

              {selectionError && <Alert tone="danger" role="alert" title="Arquivo não aceito">{selectionError}</Alert>}

              {selected && (
                <div className="documents-selection">
                  <div className="documents-selection-info">
                    <strong>{selected.name}</strong>
                    <span>{formatBytes(selected.size)}</span>
                  </div>
                  <div className="documents-selection-actions">
                    <Button disabled={uploading} onClick={() => void handleUpload()}>
                      {uploading ? "Enviando…" : uploadError ? "Tentar novamente" : "Enviar documento"}
                    </Button>
                    <Button variant="ghost" disabled={uploading} onClick={clearSelection}>Remover seleção</Button>
                  </div>
                </div>
              )}

              {uploadError && <Alert tone="danger" role="alert" title="Não foi possível enviar">{uploadError}</Alert>}
            </div>
          )}

          {notice && <Alert tone="success">{notice}</Alert>}

          <div className="glass-panel documents-list">
            <div className="documents-list-header">
              <h3 ref={heading} tabIndex={-1}>Documentos{items.length > 0 ? ` (${items.length})` : ""}</h3>
              <Button variant="ghost" size="sm" disabled={refreshing} aria-busy={refreshing} onClick={() => void refresh(true)}>
                {refreshing ? "Atualizando…" : "Atualizar"}
              </Button>
            </div>

            {refreshFailed && (
              <Alert tone="warning">Não foi possível atualizar a lista. Os documentos exibidos podem estar desatualizados.</Alert>
            )}

            {items.length === 0 ? (
              <EmptyState
                title="Nenhum documento neste projeto"
                description={canWrite
                  ? `Envie o primeiro arquivo (${formatList(limits)}) para começar a formar a base de conhecimento deste projeto.`
                  : "Ainda não há documentos enviados para este projeto."}
              >
                {canWrite && <Button onClick={() => input.current?.click()}>Escolher primeiro arquivo</Button>}
              </EmptyState>
            ) : (
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
                    {canWrite && <th scope="col"><span className="sr-only">Ações</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const view = STATUS_VIEW[item.status_processamento];
                    return (
                      <tr key={item.id}>
                        <td data-label="Documento" className="documents-name">{item.nome}</td>
                        <td data-label="Tipo">{item.extensao ? item.extensao.slice(1).toUpperCase() : "—"}</td>
                        <td data-label="Tamanho">{item.tamanho_bytes === null ? "—" : formatBytes(item.tamanho_bytes)}</td>
                        <td data-label="Enviado por">{item.autor_nome ?? "Não informado"}</td>
                        <td data-label="Data"><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></td>
                        <td data-label="Status"><Badge tone={view.tone}>{view.label}</Badge></td>
                        {canWrite && (
                          <td data-label="Ações">
                            <Button variant="danger" size="sm" aria-label={`Remover ${item.nome}`} onClick={() => { setNotice(""); setTarget(item); }}>Remover</Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <dialog
        className="archive-dialog"
        ref={dialog}
        aria-labelledby="remove-document-title"
        onCancel={event => { if (removing) event.preventDefault(); else setTarget(null); }}
      >
        {target && (
          <>
            <h2 id="remove-document-title">Remover {target.nome}?</h2>
            <p>O arquivo e seus metadados serão apagados deste projeto. Se o conteúdo já foi indexado, ele também deixará de aparecer nas consultas. Esta ação não pode ser desfeita.</p>
            {removeError && <Alert tone="danger" role="alert">{removeError}</Alert>}
            <div className="project-actions">
              <Button variant="secondary" autoFocus disabled={removing} onClick={closeDialog}>Cancelar</Button>
              <Button variant="danger" disabled={removing} onClick={() => void confirmRemoval()}>
                {removing ? "Removendo…" : removeError ? "Tentar novamente" : "Confirmar remoção"}
              </Button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
