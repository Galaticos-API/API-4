import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../auth/api";
import { navigate } from "./navigation";
import { createFeature, completeFeature, getFeature, listFeatures, camposFaltantesDe, type Feature, type FeatureInput } from "./api";
import { descreverCamposFaltantes } from "./fields";
import "../projects/projects.css";

type ListResult = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; features: Feature[] };
const emptyInput: FeatureInput = { epico_id: "", titulo: "", descricao: "", objetivo: "" };

export function FeatureList({ projectId, epicoId, canCreate }: { projectId: string; epicoId: string; canCreate: boolean }) {
  const [result, setResult] = useState<ListResult>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    listFeatures(epicoId, controller.signal)
      .then((features) => { if (!controller.signal.aborted) setResult({ state: "ready", features }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 401 ? "É necessário entrar para acessar as features." : "Não foi possível carregar as features." });
      });
    return () => controller.abort();
  }, [epicoId, attempt]);

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div><p className="projects-eyebrow">Features do épico</p><h3>Features</h3></div>
        {canCreate && <button className="btn-primary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/new`)}>Nova feature</button>}
      </div>
      {result.state === "loading" && <div className="glass-panel projects-state" role="status">Carregando features…</div>}
      {result.state === "error" && <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
        <button className="btn-secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</button></div>}
      {result.state === "ready" && (result.features.length === 0
        ? <div className="glass-panel projects-state"><h4>Nenhuma feature cadastrada</h4><p>Crie a primeira feature para detalhar este épico.</p>
          {canCreate && <button className="btn-primary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/new`)}>Criar primeira feature</button>}</div>
        : <div className="projects-grid">{result.features.map((feature) => (
          <article className="glass-panel project-card" key={feature.id}>
            <span className={`badge ${feature.status === "concluido" ? "badge-success" : "badge-warning"}`}>{feature.status}</span>
            <h4>{feature.titulo}</h4>
            <p className="project-excerpt">{feature.objetivo || "Sem objetivo registrado."}</p>
            <button className="btn-secondary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/${feature.id}`)}>Ver feature</button>
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

  return (
    <section className="projects-page">
      <div className="projects-heading"><div><p className="projects-eyebrow">Features / Nova feature</p><h2>Criar feature</h2>
        <p>Apenas o título é obrigatório para salvar como rascunho.</p></div></div>
      <form className="glass-panel project-form" noValidate aria-busy={busy} onSubmit={async (event) => {
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
        {message && <p role="alert">{message}</p>}
        <div className="project-actions">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Criando…" : "Criar feature"}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}`)}>Voltar ao épico</button>
        </div>
      </form>
    </section>
  );
}

export function FeatureDetail({ projectId, epicoId, featureId, children }: { projectId: string; epicoId: string; featureId: string; children?: ReactNode }) {
  const [result, setResult] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; feature: Feature }>({ state: "loading" });
  const [completing, setCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

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

  if (result.state === "loading") return <div className="glass-panel projects-state" role="status">Carregando feature…</div>;
  if (result.state === "error") return <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
    <button className="btn-secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</button></div>;

  const { feature } = result;

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div><p className="projects-eyebrow">Épico: {feature.epico_titulo}</p><h2>{feature.titulo}</h2></div>
        <button className="btn-secondary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}`)}>Voltar ao épico de origem</button>
      </div>
      <article className="glass-panel project-card">
        <span className={`badge ${feature.status === "concluido" ? "badge-success" : "badge-warning"}`}>{feature.status}</span>
        <dl>
          <dt>Objetivo</dt><dd>{feature.objetivo || "Não informado."}</dd>
          <dt>Descrição</dt><dd className="project-description">{feature.descricao || "Não informada."}</dd>
          <dt>Critérios de aceitação registrados</dt><dd>{feature.criterios_count}</dd>
        </dl>
        {feature.status === "rascunho" && (
          <div className="project-actions">
            <button className="btn-primary" disabled={completing} onClick={async () => {
              setCompleting(true); setCompletionMessage("");
              try {
                const completed = await completeFeature(feature.id);
                setResult({ state: "ready", feature: completed });
              } catch (error) {
                const campos = camposFaltantesDe(error);
                setCompletionMessage(campos ? `Faltam preencher: ${descreverCamposFaltantes(campos)}.` : "Não foi possível concluir a feature.");
              } finally {
                setCompleting(false);
              }
            }}>{completing ? "Concluindo…" : "Marcar como concluída"}</button>
          </div>
        )}
        {completionMessage && <p role="alert">{completionMessage}</p>}
      </article>
      {children}
    </section>
  );
}
