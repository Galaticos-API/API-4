import { useEffect, useRef, useState } from "react";
import { archiveProject, getArchiveImpact, type ArchiveImpact, type Project } from "../../api/api_projects";
import { ApiError } from "../../api/api_auth";

export function ProjectArchiveView({ project, canWrite, onArchived }: { project: Project; canWrite: boolean; onArchived: (project: Project) => void }) {
  const [impact, setImpact] = useState<ArchiveImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (impact) dialog.current?.showModal(); }, [impact]);
  if (!canWrite || project.status === "arquivado") return null;
  async function preview() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const value = await getArchiveImpact(project.id); if (mounted.current) setImpact(value); }
    catch { if (mounted.current) setError("Não foi possível consultar o impacto. Tente novamente."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  function close() { dialog.current?.close(); setImpact(null); }
  async function confirm() {
    if (!impact || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const saved = await archiveProject(project.id, impact);
      if (mounted.current) { close(); onArchived(saved); }
    } catch (failure) {
      if (!mounted.current) return;
      close();
      setError(failure instanceof ApiError && failure.status === 409
        ? "O impacto mudou. Consulte a prévia novamente antes de confirmar."
        : "Não foi possível confirmar o arquivamento. Consulte o projeto antes de tentar novamente.");
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className="project-actions">
    <button className="btn-secondary" disabled={busy} onClick={preview}>{busy ? "Processando…" : "Arquivar projeto"}</button>
    {error && <p role="alert">{error}</p>}
    <dialog className="archive-dialog" ref={dialog} aria-labelledby="archive-title" onCancel={event => { if (busy) event.preventDefault(); else setImpact(null); }}>
      <h2 id="archive-title">Arquivar {project.nome}?</h2>
      {impact && <><p>Serão arquivados {impact.projeto} projeto, {impact.epicos} épico(s), {impact.features} feature(s) e {impact.pbis} PBI(s).</p>
        <p>Os registros serão preservados para consulta. Os itens já arquivados manterão suas datas.</p></>}
      {busy && <p role="status">Arquivando…</p>}
      <div className="project-actions"><button className="btn-secondary" autoFocus disabled={busy} onClick={close}>Cancelar</button>
        <button className="btn-primary" disabled={busy || !impact} onClick={confirm}>Confirmar arquivamento</button></div>
    </dialog>
  </div>;
}
