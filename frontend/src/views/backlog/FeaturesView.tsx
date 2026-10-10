import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../api/api_auth";
import { camposFaltantesDe, completeFeature, createFeature, getFeature, listFeatures, updateFeature, type Feature, type FeatureInput } from "../../api/api_backlog";
import "../../assets/styles/projects.css";
import { descreverCamposFaltantes } from "../../models/fields";
import { navigate } from "../../models/navigation";
import { ReadOnlyContext } from "../../models/ReadOnlyContext";
import { usePbiQualityConfiguration } from "../../viewmodels/usePbiQualityConfiguration";
import { useUnsavedChangesGuard } from "../../viewmodels/useUnsavedChangesGuard";
import { Button } from "../common/ui";
import { BacklogBreadcrumb } from "./BacklogBreadcrumb";
import { BacklogTechnologySelector } from "./BacklogTechnologySelector";
import { CriteriaEditor } from "./CriteriaView";
import { ItemArchiveView } from "./ItemArchiveView";

type ListResult = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; features: Feature[] };
const emptyInput: FeatureInput = { epico_id: "", titulo: "", descricao: "", objetivo: "", tecnologias_ids: [] };

export function FeatureList({ projectId, epicoId, canCreate: allowedToCreate }: { projectId: string; epicoId: string; canCreate: boolean }) {
  const inheritedReadOnly = useContext(ReadOnlyContext);
  const canCreate = allowedToCreate && !inheritedReadOnly;
  const [result, setResult] = useState<ListResult>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    listFeatures(epicoId, controller.signal, status)
      .then((features) => { if (!controller.signal.aborted) setResult({ state: "ready", features }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 401 ? "É necessário entrar para acessar as features." : "Não foi possível carregar as features." });
      });
    return () => controller.abort();
  }, [epicoId, attempt, status]);

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div><p className="projects-eyebrow">Features do épico</p><h3>Features</h3></div>
        {canCreate && <Button variant="primary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/new`)}>Nova feature</Button>}
      </div>
      <label>Exibir itens <select value={status} onChange={event => setStatus(event.target.value)}><option value="">Não arquivados</option><option value="arquivado">Arquivados</option><option value="todos">Todos</option></select></label>
      {result.state === "loading" && <div className="ds-card ds-card--glass projects-state" role="status">Carregando features…</div>}
      {result.state === "error" && <div className="ds-card ds-card--glass projects-state"><p role="alert">{result.message}</p>
        <Button variant="secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</Button></div>}
      {result.state === "ready" && (result.features.length === 0
        ? <div className="ds-card ds-card--glass projects-state"><h4>Nenhuma feature cadastrada</h4><p>Crie a primeira feature para detalhar este épico.</p>
          {canCreate && <Button variant="primary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/new`)}>Criar primeira feature</Button>}</div>
        : <div className="projects-grid">{result.features.map((feature) => (
          <article className="ds-card ds-card--glass project-card" key={feature.id}>
            <span className={`ds-badge ${feature.status === "concluido" ? "ds-badge--success" : "ds-badge--warning"}`}>{feature.status}</span>
            <h4>{feature.titulo}</h4>
            <p className="project-excerpt">{feature.objetivo || "Sem objetivo registrado."}</p>
            <Button variant="secondary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/${feature.id}`)}>Ver feature</Button>
          </article>
        ))}</div>)}
    </section>
  );
}

export function FeatureForm({ projectId, epicoId }: { projectId: string; epicoId: string }) {
  const [values, setValues] = useState<FeatureInput>({ ...emptyInput, epico_id: epicoId });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isDirty = [values.titulo, values.descricao, values.objetivo].some((value) => value.trim().length > 0) || (values.tecnologias_ids?.length ?? 0) > 0;
  const { confirmLeave } = useUnsavedChangesGuard(isDirty);

  return (
    <section className="projects-page">
      <div className="projects-heading"><div><p className="projects-eyebrow">Features / Nova feature</p><h2>Criar feature</h2>
        <p>Apenas o título é obrigatório para salvar como rascunho.</p></div></div>
      <form className="ds-card ds-card--glass project-form" noValidate aria-busy={busy} onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current) return;
        if (!values.titulo.trim()) { setMessage("Informe o título da feature."); return; }
        submitting.current = true; setBusy(true); setMessage("");
        try {
          const feature = await createFeature({ ...values, epico_id: epicoId });
          if (mounted.current) navigate(`/projects/${projectId}/epics/${epicoId}/features/${feature.id}`);
        } catch (error) {
          if (!mounted.current) return;
          setMessage(error instanceof ApiError && error.status === 404 ? "Épico não encontrado." : "Não foi possível criar a feature. Tente novamente.");
        } finally {
          submitting.current = false;
          if (mounted.current) setBusy(false);
        }
      }}>
        {([["titulo", "Título", "input"], ["objetivo", "Objetivo", "textarea"], ["descricao", "Descrição", "textarea"]] as const).map(([field, label, kind]) => (
          <div className="project-field" key={field}>
            <label htmlFor={field}>{label}{field === "titulo" && " (obrigatório)"}</label>
            {kind === "textarea"
              ? <textarea id={field} name={field} rows={3} disabled={busy} value={values[field]} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))} />
              : <input id={field} name={field} type="text" disabled={busy} value={values[field]} onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))} />}
          </div>
        ))}
        <BacklogTechnologySelector
          value={values.tecnologias_ids ?? []}
          onChange={(tecnologias_ids) => setValues((current) => ({ ...current, tecnologias_ids }))}
          disabled={busy}
        />
        {message && <p role="alert">{message}</p>}
        <div className="project-actions">
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Criando…" : "Criar feature"}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { if (confirmLeave()) navigate(`/projects/${projectId}/epics/${epicoId}`); }}>Voltar ao épico</Button>
        </div>
      </form>
    </section>
  );
}

import { DecisionsPanel } from "./DecisionsPanel";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ItemHistoryView } from "./ItemHistoryView";

type FeatureFields = Pick<FeatureInput, "titulo" | "descricao" | "objetivo" | "tecnologias_ids"> & { justificativa?: string };

function toFields(feature: Feature): FeatureFields {
  return { titulo: feature.titulo, descricao: feature.descricao, objetivo: feature.objetivo, tecnologias_ids: [...(feature.tecnologias_ids ?? [])], justificativa: "" };
}

export function FeatureDetail({ projectId, epicoId, featureId, canEdit, children }: { projectId: string; epicoId: string; featureId: string; canEdit: boolean; children?: ReactNode }) {
  const [result, setResult] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; feature: Feature }>({ state: "loading" });
  const [completing, setCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<FeatureFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    getFeature(featureId, controller.signal)
      .then((feature) => { if (!controller.signal.aborted) setResult({ state: "ready", feature }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 404 ? "Feature não encontrada." : "Não foi possível carregar a feature." });
      });
    return () => controller.abort();
  }, [featureId, attempt]);

  const feature = result.state === "ready" ? result.feature : null;
  const justificationPolicy = usePbiQualityConfiguration(
    feature?.status === "concluido",
  );
  const isDirty = editing && feature !== null && formValues !== null && JSON.stringify(formValues) !== JSON.stringify(toFields(feature));
  const { confirmLeave } = useUnsavedChangesGuard(isDirty);

  if (result.state === "loading") return <div className="ds-card ds-card--glass projects-state" role="status">Carregando feature…</div>;
  if (result.state === "error") return <div className="ds-card ds-card--glass projects-state"><p role="alert">{result.message}</p>
    <Button variant="secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</Button></div>;

  const readOnly = feature!.status === "arquivado" || feature!.projeto_status === "arquivado";
  const justificationRequired = feature!.status === "concluido"
    && (justificationPolicy.result.state !== "ready"
      || justificationPolicy.result.config.exigir_justificativa_item_concluido);

  return (
    <section className="projects-page">
      <BacklogBreadcrumb
        segments={[
          {
            label: "Projeto",
            path: `/projects/${projectId}#backlog`,
          },
          {
            label: "Épico",
            path: `/projects/${projectId}/epics/${epicoId}`,
          },
          {
            label: "Feature",
            path: `/projects/${projectId}/epics/${epicoId}/features/${featureId}`,
          },
        ]}
        onNavigate={(path) => {
          if (confirmLeave()) navigate(path);
        }}
      />
      <div className="projects-heading">
        <div><p className="projects-eyebrow">Épico: {feature!.epico_titulo}</p><h2>{feature!.titulo} <ProvenanceBadge provenance={feature!.provenance_json} field="titulo" /></h2></div>
        <Button variant="secondary" onClick={() => { if (confirmLeave()) navigate(`/projects/${projectId}/epics/${epicoId}`); }}>Voltar ao épico de origem</Button>
      </div>
      {readOnly && <div className="ds-card ds-card--glass projects-state"><p role="status">Esta feature pertence a um projeto arquivado e está disponível apenas para leitura.</p></div>}
      <article className="ds-card ds-card--glass project-card">
        <span className={`ds-badge ${feature!.status === "concluido" ? "ds-badge--success" : "ds-badge--warning"}`}>{feature!.status}</span>
        {editing && formValues ? (
          <>
            {([["titulo", "Título", "input"], ["objetivo", "Objetivo", "textarea"], ["descricao", "Descrição", "textarea"]] as const).map(([field, label, kind]) => (
              <div className="project-field" key={field}>
                <label htmlFor={`edit-${field}`}>{label}</label>
                {kind === "textarea"
                  ? <textarea id={`edit-${field}`} rows={3} disabled={saving} value={formValues[field] ?? ""} onChange={(e) => setFormValues((v) => v && { ...v, [field]: e.target.value })} />
                  : <input id={`edit-${field}`} type="text" disabled={saving} value={formValues[field] ?? ""} onChange={(e) => setFormValues((v) => v && { ...v, [field]: e.target.value })} />}
              </div>
            ))}
            <BacklogTechnologySelector
              value={formValues.tecnologias_ids ?? []}
              onChange={(tecnologias_ids) => setFormValues((current) => current && { ...current, tecnologias_ids })}
              disabled={saving}
            />
            {justificationRequired && (
              <div className="project-field" key="justificativa">
                <label htmlFor="edit-justificativa">Justificativa da alteração (obrigatória)</label>
                <textarea
                  id="edit-justificativa"
                  rows={2}
                  disabled={saving}
                  placeholder="Descreva a justificativa para alterar esta feature já concluída"
                  value={formValues.justificativa ?? ""}
                  onChange={(e) => setFormValues((v) => v && { ...v, justificativa: e.target.value })}
                />
              </div>
            )}
            {editMessage && <p role="alert">{editMessage}</p>}
            <div className="project-actions">
              <Button variant="primary" disabled={saving} onClick={async () => {
                if (!formValues?.titulo.trim()) { setEditMessage("O título não pode ficar vazio."); return; }
                if (justificationRequired && !formValues?.justificativa?.trim()) {
                  setEditMessage("A justificativa é obrigatória ao alterar um item concluído.");
                  document.getElementById("edit-justificativa")?.focus();
                  return;
                }
                setSaving(true); setEditMessage("");
                try {
                  const payload = { ...formValues };
                  if (!justificationRequired) delete payload.justificativa;
                  const updated = await updateFeature(feature!.id, payload);
                  setResult({ state: "ready", feature: updated });
                  setEditing(false);
                  setAttempt((v) => v + 1);
                } catch (error: any) {
                  const msg = error?.message || "Não foi possível salvar as alterações. Tente novamente.";
                  setEditMessage(msg);
                  if (msg.includes("justificativa")) {
                    document.getElementById("edit-justificativa")?.focus();
                  }
                } finally {
                  setSaving(false);
                }
              }}>{saving ? "Salvando…" : "Salvar alterações"}</Button>
              <Button variant="secondary" disabled={saving} onClick={() => { if (confirmLeave()) { setEditing(false); setEditMessage(""); } }}>Cancelar</Button>
            </div>
          </>
        ) : (
          <>
            <dl>
              <dt>Objetivo <ProvenanceBadge provenance={feature!.provenance_json} field="objetivo" /></dt><dd>{feature!.objetivo || "Não informado."}</dd>
              <dt>Descrição <ProvenanceBadge provenance={feature!.provenance_json} field="descricao" /></dt><dd className="project-description">{feature!.descricao || "Não informada."}</dd>
              <dt>Critérios de aceitação registrados</dt><dd>{feature!.criterios_count}</dd>
            </dl>
            {!readOnly && canEdit && (
              <div className="project-actions">
                <Button variant="secondary" onClick={() => { setFormValues(toFields(feature!)); setEditing(true); }}>Editar</Button>
                {feature!.status === "rascunho" && (
                  <Button variant="primary" disabled={completing} onClick={async () => {
                    setCompleting(true); setCompletionMessage("");
                    try {
                      const completed = await completeFeature(feature!.id);
                      setResult({ state: "ready", feature: completed });
                      setAttempt((v) => v + 1);
                    } catch (error) {
                      const campos = camposFaltantesDe(error);
                      setCompletionMessage(campos ? `Faltam preencher: ${descreverCamposFaltantes(campos)}.` : "Não foi possível concluir a feature.");
                    } finally {
                      setCompleting(false);
                    }
                  }}>{completing ? "Concluindo…" : "Marcar como concluída"}</Button>
                )}
              </div>
            )}
            {completionMessage && <p role="alert">{completionMessage}</p>}
          </>
        )}
      </article>
      {feature!.status === "arquivado" && <p>Arquivado em: {feature!.archived_at ? new Date(feature!.archived_at!).toLocaleString("pt-BR") : "data não registrada"}</p>}
      <ItemArchiveView project={feature!} kind="features" canWrite={canEdit && !readOnly && !editing && !saving && !completing} onArchived={() => setAttempt(v => v + 1)} />
      <CriteriaEditor entidadeTipo="feature" entidadeId={feature!.id} canEdit={canEdit && !readOnly} titulo="Critérios da feature"
        itemConcluido={feature!.status === "concluido"} justificativaObrigatoria={justificationRequired} />
      <SuggestionsPanel kind="feature" id={feature!.id} canWrite={canEdit && !readOnly} readOnlyNote={readOnly ? "Item ou ancestral arquivado: as sugestões ficam disponíveis somente para consulta." : undefined} />
      <DecisionsPanel kind="feature" id={feature!.id} canWrite={canEdit && !readOnly} readOnlyNote={readOnly ? "Item ou ancestral arquivado: as decisões ficam disponíveis somente para consulta." : undefined} />
      <ItemHistoryView entidadeTipo="feature" entidadeId={feature!.id} refreshTrigger={attempt} />
      <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>
    </section>
  );
}
