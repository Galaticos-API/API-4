import { ReadOnlyContext } from "../../models/ReadOnlyContext";
import { ItemArchiveView } from "./ItemArchiveView";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../api/api_auth";
import { navigate } from "../../models/navigation";
import { createEpic, completeEpic, updateEpic, getEpic, listEpics, camposFaltantesDe, type Epic, type EpicInput } from "../../api/api_backlog";
import { descreverCamposFaltantes } from "../../models/fields";
import { useUnsavedChangesGuard } from "../../viewmodels/useUnsavedChangesGuard";
import { usePbiQualityConfiguration } from "../../viewmodels/usePbiQualityConfiguration";
import { CriteriaEditor } from "./CriteriaView";
import { BacklogBreadcrumb } from "./BacklogBreadcrumb";
import { BacklogTechnologySelector } from "./BacklogTechnologySelector";
import "../../assets/styles/projects.css";

type ListResult = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; epics: Epic[] };
const emptyInput: EpicInput = { projeto_id: "", titulo: "", descricao: "", objetivo: "", escopo_macro: "", resultado_esperado: "", tecnologias_ids: [] };

export function EpicList({ projetoId, canCreate: allowedToCreate }: { projetoId: string; canCreate: boolean }) {
  const inheritedReadOnly = useContext(ReadOnlyContext);
  const canCreate = allowedToCreate && !inheritedReadOnly;
  const [result, setResult] = useState<ListResult>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    listEpics(projetoId, controller.signal, status)
      .then((epics) => { if (!controller.signal.aborted) setResult({ state: "ready", epics }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 401 ? "É necessário entrar para acessar os épicos." : "Não foi possível carregar os épicos." });
      });
    return () => controller.abort();
  }, [projetoId, attempt, status]);

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div><p className="projects-eyebrow">Épicos do projeto</p><h3>Épicos</h3></div>
        {canCreate && <button className="btn-primary" onClick={() => navigate(`/projects/${projetoId}/epics/new`)}>Novo épico</button>}
      </div>
      <label>Exibir itens <select value={status} onChange={event => setStatus(event.target.value)}><option value="">Não arquivados</option><option value="arquivado">Arquivados</option><option value="todos">Todos</option></select></label>
      {result.state === "loading" && <div className="glass-panel projects-state" role="status">Carregando épicos…</div>}
      {result.state === "error" && <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
        <button className="btn-secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</button></div>}
      {result.state === "ready" && (result.epics.length === 0
        ? <div className="glass-panel projects-state"><h4>Nenhum épico cadastrado</h4><p>Crie o primeiro épico para começar a especificar este projeto.</p>
          {canCreate && <button className="btn-primary" onClick={() => navigate(`/projects/${projetoId}/epics/new`)}>Criar primeiro épico</button>}</div>
        : <div className="projects-grid">{result.epics.map((epic) => (
          <article className="glass-panel project-card" key={epic.id}>
            <span className={`badge ${epic.status === "concluido" ? "badge-success" : "badge-warning"}`}>{epic.status}</span>
            <h4>{epic.titulo}</h4>
            <p className="project-excerpt">{epic.objetivo || "Sem objetivo registrado."}</p>
            <button className="btn-secondary" onClick={() => navigate(`/projects/${projetoId}/epics/${epic.id}`)}>Ver épico</button>
          </article>
        ))}</div>)}
    </section>
  );
}

export function EpicForm({ projetoId }: { projetoId: string }) {
  const [values, setValues] = useState<EpicInput>({ ...emptyInput, projeto_id: projetoId });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isDirty = [values.titulo, values.descricao, values.objetivo, values.escopo_macro, values.resultado_esperado].some((value) => value.trim().length > 0) || (values.tecnologias_ids?.length ?? 0) > 0;
  const { confirmLeave } = useUnsavedChangesGuard(isDirty);

  return (
    <section className="projects-page">
      <div className="projects-heading"><div><p className="projects-eyebrow">Épicos / Novo épico</p><h2>Criar épico</h2>
        <p>Apenas o título é obrigatório para salvar como rascunho. Os demais campos do guia são exigidos para concluir.</p></div></div>
      <form className="glass-panel project-form" noValidate aria-busy={busy} onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current) return;
        if (!values.titulo.trim()) { setMessage("Informe o título do épico."); return; }
        submitting.current = true; setBusy(true); setMessage("");
        try {
          const epic = await createEpic({ ...values, projeto_id: projetoId });
          if (mounted.current) navigate(`/projects/${projetoId}/epics/${epic.id}`);
        } catch (error) {
          if (!mounted.current) return;
          setMessage(error instanceof ApiError && error.status === 404 ? "Projeto não encontrado." : "Não foi possível criar o épico. Tente novamente.");
        } finally {
          submitting.current = false;
          if (mounted.current) setBusy(false);
        }
      }}>
        {([
          ["titulo", "Título", "input"], ["objetivo", "Objetivo", "textarea"], ["descricao", "Descrição", "textarea"],
          ["escopo_macro", "Escopo macro", "textarea"], ["resultado_esperado", "Resultado esperado", "textarea"],
        ] as const).map(([field, label, kind]) => (
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
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Criando…" : "Criar épico"}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => { if (confirmLeave()) navigate(`/projects/${projetoId}`); }}>Voltar ao projeto</button>
        </div>
      </form>
    </section>
  );
}

import { ItemHistoryView } from "./ItemHistoryView";
import { DecisionsPanel } from "./DecisionsPanel";

type EpicFields = Pick<EpicInput, "titulo" | "descricao" | "objetivo" | "escopo_macro" | "resultado_esperado" | "tecnologias_ids"> & { justificativa?: string };

function toFields(epic: Epic): EpicFields {
  return { titulo: epic.titulo, descricao: epic.descricao, objetivo: epic.objetivo, escopo_macro: epic.escopo_macro, resultado_esperado: epic.resultado_esperado, tecnologias_ids: [...(epic.tecnologias_ids ?? [])], justificativa: "" };
}

export function EpicDetail({ projectId, epicId, canEdit, children }: { projectId: string; epicId: string; canEdit: boolean; children?: ReactNode }) {
  const [result, setResult] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; epic: Epic }>({ state: "loading" });
  const [completing, setCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<EpicFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    getEpic(epicId, controller.signal)
      .then((epic) => { if (!controller.signal.aborted) setResult({ state: "ready", epic }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 404 ? "Épico não encontrado." : "Não foi possível carregar o épico." });
      });
    return () => controller.abort();
  }, [epicId, attempt]);

  const epic = result.state === "ready" ? result.epic : null;
  const justificationPolicy = usePbiQualityConfiguration(
    epic?.status === "concluido",
  );
  const isDirty = editing && epic !== null && formValues !== null && JSON.stringify(formValues) !== JSON.stringify(toFields(epic));
  const { confirmLeave } = useUnsavedChangesGuard(isDirty);

  if (result.state === "loading") return <div className="glass-panel projects-state" role="status">Carregando épico…</div>;
  if (result.state === "error") return <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
    <button className="btn-secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</button></div>;
  if (!epic) return null;

  const epicoArquivado = epic.status === "arquivado";
  const projetoArquivado = epic.projeto_status === "arquivado";
  const readOnly = epicoArquivado || projetoArquivado;
  const canWrite = canEdit && !readOnly;
  const justificationRequired = epic.status === "concluido"
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
            path: `/projects/${projectId}/epics/${epicId}`,
          },
        ]}
        onNavigate={(path) => {
          if (confirmLeave()) navigate(path);
        }}
      />
      <div className="projects-heading">
        <div><p className="projects-eyebrow">Épico</p><h2>{epic.titulo}</h2></div>
        <button className="btn-secondary" onClick={() => { if (confirmLeave()) navigate(`/projects/${projectId}`); }}>Voltar ao projeto</button>
      </div>
      {readOnly && (
        <div className="glass-panel projects-state">
          <p role="status">
            {epicoArquivado
              ? "Este épico está arquivado e está disponível apenas para leitura."
              : "Este épico pertence a um projeto arquivado e está disponível apenas para leitura."}
          </p>
        </div>
      )}
      <article className="glass-panel project-card">
        <span className={`badge ${epic.status === "concluido" ? "badge-success" : "badge-warning"}`}>{epic.status}</span>
        {editing && formValues ? (
          <>
            {([
              ["titulo", "Título", "input"], ["objetivo", "Objetivo", "textarea"], ["descricao", "Descrição", "textarea"],
              ["escopo_macro", "Escopo macro", "textarea"], ["resultado_esperado", "Resultado esperado", "textarea"],
            ] as const).map(([field, label, kind]) => (
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
                  placeholder="Descreva a justificativa para alterar este épico já concluído"
                  value={formValues.justificativa ?? ""}
                  onChange={(e) => setFormValues((v) => v && { ...v, justificativa: e.target.value })}
                />
              </div>
            )}
            {editMessage && <p role="alert">{editMessage}</p>}
            <div className="project-actions">
              <button className="btn-primary" disabled={saving} onClick={async () => {
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
                  const updated = await updateEpic(epic.id, payload);
                  setResult({ state: "ready", epic: updated });
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
              }}>{saving ? "Salvando…" : "Salvar alterações"}</button>
              <button className="btn-secondary" disabled={saving} onClick={() => { if (confirmLeave()) { setEditing(false); setEditMessage(""); } }}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <dl>
              <dt>Objetivo</dt><dd>{epic.objetivo || "Não informado."}</dd>
              <dt>Descrição</dt><dd className="project-description">{epic.descricao || "Não informada."}</dd>
              <dt>Escopo macro</dt><dd>{epic.escopo_macro || "Não informado."}</dd>
              <dt>Resultado esperado</dt><dd>{epic.resultado_esperado || "Não informado."}</dd>
              <dt>Critérios de aceitação registrados</dt><dd>{epic.criterios_count}</dd>
            </dl>
            {canWrite && (
              <div className="project-actions">
                <button className="btn-secondary" onClick={() => { setFormValues(toFields(epic)); setEditing(true); }}>Editar</button>
                {(epic.status === "rascunho" || epic.status === "ativo") && (
                  <button className="btn-primary" disabled={completing} onClick={async () => {
                    setCompleting(true); setCompletionMessage("");
                    try {
                      const completed = await completeEpic(epic.id);
                      setResult({ state: "ready", epic: completed });
                      setAttempt((v) => v + 1);
                    } catch (error) {
                      const campos = camposFaltantesDe(error);
                      setCompletionMessage(campos ? `Faltam preencher: ${descreverCamposFaltantes(campos)}.` : "Não foi possível concluir o épico.");
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
      {epic.status === "arquivado" && <p>Arquivado em: {epic.archived_at ? new Date(epic.archived_at!).toLocaleString("pt-BR") : "data não registrada"}</p>}
      <ItemArchiveView project={epic} kind="epics" canWrite={canEdit && !readOnly && !editing && !saving && !completing} onArchived={() => setAttempt(v => v + 1)} />
      <CriteriaEditor entidadeTipo="epico" entidadeId={epic.id} canEdit={canWrite} titulo="Critérios do épico"
        itemConcluido={epic.status === "concluido"} justificativaObrigatoria={justificationRequired} />
      <DecisionsPanel kind="epico" id={epic.id} canWrite={canWrite} readOnlyNote={readOnly ? "Item ou projeto arquivado: as decisões ficam disponíveis somente para consulta." : undefined} />
      <ItemHistoryView entidadeTipo="epico" entidadeId={epic.id} refreshTrigger={attempt} />
      <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>
    </section>
  );
}
