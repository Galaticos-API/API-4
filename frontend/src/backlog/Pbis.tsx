import { useEffect, useRef, useState } from "react";
import { ApiError } from "../auth/api";
import { navigate } from "./navigation";
import { createPbi, completePbi, updatePbi, getPbi, listPbis, getPbiCompleteness, hasCompletudeIndicator, camposFaltantesDe, type Pbi, type PbiInput, type QualityReport } from "./api";
import { descreverCamposFaltantes } from "./fields";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import { CriteriaEditor } from "./Criteria";
import "../projects/projects.css";

type ListResult = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; pbis: Pbi[] };
const emptyInput: PbiInput = { feature_id: "", titulo: "", historia_como_um: "", historia_eu_quero: "", historia_para_que: "", requer_interface: false };

export function PbiList({ projectId, epicoId, featureId, canCreate }: { projectId: string; epicoId: string; featureId: string; canCreate: boolean }) {
  const [result, setResult] = useState<ListResult>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    listPbis(featureId, controller.signal)
      .then((pbis) => { if (!controller.signal.aborted) setResult({ state: "ready", pbis }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 401 ? "É necessário entrar para acessar os PBIs." : "Não foi possível carregar os PBIs." });
      });
    return () => controller.abort();
  }, [featureId, attempt]);

  const newPath = `/projects/${projectId}/epics/${epicoId}/features/${featureId}/pbis/new`;
  const getCompletudeColor = (score: number) => score >= 80 ? "badge-success" : score >= 50 ? "badge-warning" : "badge-error";

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div><p className="projects-eyebrow">PBIs da feature</p><h3>Product Backlog Items</h3></div>
        {canCreate && <button className="btn-primary" onClick={() => navigate(newPath)}>Novo PBI</button>}
      </div>
      {result.state === "loading" && <div className="glass-panel projects-state" role="status">Carregando PBIs…</div>}
      {result.state === "error" && <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
        <button className="btn-secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</button></div>}
      {result.state === "ready" && (result.pbis.length === 0
        ? <div className="glass-panel projects-state"><h4>Nenhum PBI cadastrado</h4><p>Cadastre o primeiro comportamento testável desta feature.</p>
          {canCreate && <button className="btn-primary" onClick={() => navigate(newPath)}>Criar primeiro PBI</button>}</div>
        : <div className="projects-grid">{result.pbis.map((pbi) => (
          <article className="glass-panel project-card" key={pbi.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
              <span className={`badge ${pbi.status === "concluido" ? "badge-success" : "badge-warning"}`}>{pbi.status}</span>
              {hasCompletudeIndicator(pbi.score_completude) && <span className={`badge ${getCompletudeColor(pbi.score_completude ?? 0)}`}>{pbi.score_completude}% completo</span>}
            </div>
            <h4>{pbi.codigo} — {pbi.titulo}</h4>
            <p className="project-excerpt">{pbi.historia_eu_quero || "Sem intenção registrada."}</p>
            <button className="btn-secondary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/${featureId}/pbis/${pbi.id}`)}>Ver PBI</button>
          </article>
        ))}</div>)}
    </section>
  );
}

export function PbiForm({ projectId, epicoId, featureId }: { projectId: string; epicoId: string; featureId: string }) {
  const [values, setValues] = useState<PbiInput>({ ...emptyInput, feature_id: featureId });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isDirty = values.requer_interface || [values.titulo, values.historia_como_um, values.historia_eu_quero, values.historia_para_que].some((value) => value.trim().length > 0);
  const { confirmLeave } = useUnsavedChangesGuard(isDirty);

  const featurePath = `/projects/${projectId}/epics/${epicoId}/features/${featureId}`;

  return (
    <section className="projects-page">
      <div className="projects-heading"><div><p className="projects-eyebrow">PBIs / Novo PBI</p><h2>Criar PBI</h2>
        <p>O título e os três blocos da história são obrigatórios. O código é gerado automaticamente.</p></div></div>
      <form className="glass-panel project-form" noValidate aria-busy={busy} onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current) return;
        const faltando = (["titulo", "historia_como_um", "historia_eu_quero", "historia_para_que"] as const).find((field) => !values[field].trim());
        if (faltando) { setMessage("Preencha o título e os três blocos da história antes de confirmar."); return; }
        submitting.current = true; setBusy(true); setMessage("");
        try {
          const pbi = await createPbi({ ...values, feature_id: featureId });
          if (mounted.current) navigate(`${featurePath}/pbis/${pbi.id}`);
        } catch (error) {
          if (!mounted.current) return;
          setMessage(error instanceof ApiError && error.status === 404 ? "Feature não encontrada." : "Não foi possível criar o PBI. Tente novamente.");
        } finally {
          submitting.current = false;
          if (mounted.current) setBusy(false);
        }
      }}>
        <div className="project-field">
          <label htmlFor="titulo">Título (obrigatório, verbo no infinitivo)</label>
          <input id="titulo" name="titulo" type="text" disabled={busy} value={values.titulo} onChange={(e) => setValues((v) => ({ ...v, titulo: e.target.value }))} />
        </div>
        <div className="project-field">
          <label htmlFor="historia_como_um">COMO UM (obrigatório)</label>
          <input id="historia_como_um" name="historia_como_um" type="text" disabled={busy} value={values.historia_como_um} onChange={(e) => setValues((v) => ({ ...v, historia_como_um: e.target.value }))} />
        </div>
        <div className="project-field">
          <label htmlFor="historia_eu_quero">EU QUERO (obrigatório)</label>
          <input id="historia_eu_quero" name="historia_eu_quero" type="text" disabled={busy} value={values.historia_eu_quero} onChange={(e) => setValues((v) => ({ ...v, historia_eu_quero: e.target.value }))} />
        </div>
        <div className="project-field">
          <label htmlFor="historia_para_que">PARA QUE (obrigatório)</label>
          <input id="historia_para_que" name="historia_para_que" type="text" disabled={busy} value={values.historia_para_que} onChange={(e) => setValues((v) => ({ ...v, historia_para_que: e.target.value }))} />
        </div>
        <div className="project-field">
          <label><input type="checkbox" checked={values.requer_interface} disabled={busy} onChange={(e) => setValues((v) => ({ ...v, requer_interface: e.target.checked }))} /> Este PBI exige interface ou protótipo visual</label>
        </div>
        {message && <p role="alert">{message}</p>}
        <div className="project-actions">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Criando…" : "Criar PBI"}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => { if (confirmLeave()) navigate(featurePath); }}>Voltar à feature</button>
        </div>
      </form>
    </section>
  );
}

type PbiFields = Pick<PbiInput, "titulo" | "historia_como_um" | "historia_eu_quero" | "historia_para_que" | "requer_interface">;

function toFields(pbi: Pbi): PbiFields {
  return { titulo: pbi.titulo, historia_como_um: pbi.historia_como_um, historia_eu_quero: pbi.historia_eu_quero, historia_para_que: pbi.historia_para_que, requer_interface: pbi.requer_interface };
}

export function PbiDetail({ projectId, epicoId, featureId, pbiId, canEdit }: { projectId: string; epicoId: string; featureId: string; pbiId: string; canEdit: boolean }) {
  const [result, setResult] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; pbi: Pbi }>({ state: "loading" });
  const [completing, setCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<PbiFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [qualityResult, setQualityResult] = useState<{ state: "loading" } | { state: "error" } | { state: "ready"; quality: QualityReport }>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    getPbi(pbiId, controller.signal)
      .then((pbi) => { if (!controller.signal.aborted) setResult({ state: "ready", pbi }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 404 ? "PBI não encontrado." : "Não foi possível carregar o PBI." });
      });
    return () => controller.abort();
  }, [pbiId, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    setQualityResult({ state: "loading" });
    getPbiCompleteness(pbiId, controller.signal)
      .then((quality) => { if (!controller.signal.aborted) setQualityResult({ state: "ready", quality }); })
      .catch(() => { if (!controller.signal.aborted) setQualityResult({ state: "error" }); });
    return () => controller.abort();
  }, [pbiId, attempt]);

  const pbi = result.state === "ready" ? result.pbi : null;
  const isDirty = editing && pbi !== null && formValues !== null && JSON.stringify(formValues) !== JSON.stringify(toFields(pbi));
  const { confirmLeave } = useUnsavedChangesGuard(isDirty);

  if (result.state === "loading") return <div className="glass-panel projects-state" role="status">Carregando PBI…</div>;
  if (result.state === "error") return <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
    <button className="btn-secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</button></div>;

  const readOnly = pbi!.projeto_status === "arquivado";

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div><p className="projects-eyebrow">Feature: {pbi!.feature_titulo}</p><h2>{pbi!.codigo} — {pbi!.titulo}</h2></div>
        <button className="btn-secondary" onClick={() => { if (confirmLeave()) navigate(`/projects/${projectId}/epics/${epicoId}/features/${featureId}`); }}>Voltar à feature de origem</button>
      </div>
      {readOnly && <div className="glass-panel projects-state"><p role="status">Este PBI pertence a um projeto arquivado e está disponível apenas para leitura.</p></div>}
      <article className="glass-panel project-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "16px" }}>
          <span className={`badge ${pbi!.status === "concluido" ? "badge-success" : "badge-warning"}`}>{pbi!.status}</span>
          {hasCompletudeIndicator(pbi!.score_completude) && <span className={`badge ${pbi!.score_completude! >= 80 ? "badge-success" : pbi!.score_completude! >= 50 ? "badge-warning" : "badge-error"}`}>{pbi!.score_completude}% completo</span>}
        </div>
        {editing && formValues ? (
          <>
            <div className="project-field"><label htmlFor="edit-titulo">Título</label>
              <input id="edit-titulo" type="text" disabled={saving} value={formValues.titulo} onChange={(e) => setFormValues((v) => v && { ...v, titulo: e.target.value })} /></div>
            <div className="project-field"><label htmlFor="edit-como-um">COMO UM</label>
              <input id="edit-como-um" type="text" disabled={saving} value={formValues.historia_como_um} onChange={(e) => setFormValues((v) => v && { ...v, historia_como_um: e.target.value })} /></div>
            <div className="project-field"><label htmlFor="edit-eu-quero">EU QUERO</label>
              <input id="edit-eu-quero" type="text" disabled={saving} value={formValues.historia_eu_quero} onChange={(e) => setFormValues((v) => v && { ...v, historia_eu_quero: e.target.value })} /></div>
            <div className="project-field"><label htmlFor="edit-para-que">PARA QUE</label>
              <input id="edit-para-que" type="text" disabled={saving} value={formValues.historia_para_que} onChange={(e) => setFormValues((v) => v && { ...v, historia_para_que: e.target.value })} /></div>
            <div className="project-field"><label><input type="checkbox" checked={formValues.requer_interface} disabled={saving} onChange={(e) => setFormValues((v) => v && { ...v, requer_interface: e.target.checked })} /> Este PBI exige interface ou protótipo visual</label></div>
            {editMessage && <p role="alert">{editMessage}</p>}
            <div className="project-actions">
              <button className="btn-primary" disabled={saving} onClick={async () => {
                if ([formValues.titulo, formValues.historia_como_um, formValues.historia_eu_quero, formValues.historia_para_que].some((v) => !v.trim())) { setEditMessage("Nenhum campo pode ficar vazio."); return; }
                setSaving(true); setEditMessage("");
                try {
                  const updated = await updatePbi(pbi!.id, formValues);
                  setResult({ state: "ready", pbi: updated });
                  setEditing(false);
                  setAttempt((value) => value + 1);
                } catch {
                  setEditMessage("Não foi possível salvar as alterações. Tente novamente.");
                } finally {
                  setSaving(false);
                }
              }}>{saving ? "Salvando…" : "Salvar alterações"}</button>
              <button className="btn-secondary" disabled={saving} onClick={() => { if (confirmLeave()) { setEditing(false); setEditMessage(""); } }}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <dl>
              <dt>COMO UM</dt><dd>{pbi!.historia_como_um}</dd>
              <dt>EU QUERO</dt><dd>{pbi!.historia_eu_quero}</dd>
              <dt>PARA QUE</dt><dd>{pbi!.historia_para_que}</dd>
              <dt>Exige interface/protótipo</dt><dd>{pbi!.requer_interface ? "Sim" : "Não"}</dd>
              <dt>Cenários de aceitação registrados</dt><dd>{pbi!.criterios_count}</dd>
            </dl>
            {qualityResult.state === "ready" && qualityResult.quality.score_completude !== null && (
              <section aria-label="Relatório de qualidade" style={{ marginTop: "20px" }}>
                <h4>Relatório de qualidade</h4>
                <ul>
                  {qualityResult.quality.checks.map((check) => <li key={check.check_id}>
                    {check.passed ? "✓" : "✗"} {check.check_name}: {check.message}
                  </li>)}
                </ul>
              </section>
            )}
            {!readOnly && canEdit && (
              <div className="project-actions">
                <button className="btn-secondary" onClick={() => { setFormValues(toFields(pbi!)); setEditing(true); }}>Editar</button>
                {pbi!.status === "rascunho" && (
                  <button className="btn-primary" disabled={completing} onClick={async () => {
                    setCompleting(true); setCompletionMessage("");
                    try {
                      const completed = await completePbi(pbi!.id);
                      setResult({ state: "ready", pbi: completed });
                      setAttempt((value) => value + 1);
                    } catch (error) {
                      const campos = camposFaltantesDe(error);
                      setCompletionMessage(campos ? `Faltam preencher: ${descreverCamposFaltantes(campos)}.` : "Não foi possível concluir o PBI.");
                    } finally {
                      setCompleting(false);
                    }
                  }}>{completing ? "Concluindo…" : "Marcar como concluído"}</button>
                )}
              </div>
            )}
            {completionMessage && <p role="alert">{completionMessage}</p>}
          </>
        )}
      </article>
      <CriteriaEditor entidadeTipo="pbi" entidadeId={pbi!.id} canEdit={canEdit && !readOnly} titulo="Cenários do PBI" />
      <CriteriaEditor entidadeTipo="feature" entidadeId={featureId} canEdit={false} titulo="Critérios da feature (consulta)" />
    </section>
  );
}
